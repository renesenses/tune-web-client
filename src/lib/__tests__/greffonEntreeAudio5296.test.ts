// @vitest-environment jsdom
//
// Le greffon « Entrée audio » — renesenses/tune-server-rust#5296, suite de la
// PR serveur #5795 qui l'a mis au catalogue.
//
//  (a) Sa carte dans Réglages › Extensions porte un nom TRADUIT, « Entrée
//      audio », et non l'identifiant technique `entree-audio`.
//  (b) Dans Réglages › Affichage, « Entrée audio » ou « Entrée virtuelle »
//      cochée sans le greffon : les Réglages proposent de l'installer, par la
//      route d'installation existante, et rappellent le redémarrage.
//
// 🔴 Ces témoins MONTENT les écrans et CLIQUENT : ils vérifient le texte peint
// et la requête qui part, pas la présence d'un nom dans un fichier.
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';

const simule = vi.hoisted(() => ({
  fiches: [] as unknown[],
  installations: [] as string[],
  reponseInstallation: { success: true, message: '', restart_required: true } as unknown,
}));

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return {
    ...actual,
    getConfig: vi.fn(async () => ({ music_dirs: [], quality_split: true })),
    getScanSchedule: vi.fn(async () => ({ enabled: false, time: '03:00' })),
    getScanStatus: vi.fn(async () => ({ scanning: false })),
    getScanReport: vi.fn(async () => null),
    getStats: vi.fn(async () => ({})),
    getInstalledPlugins: vi.fn(async () => simule.fiches),
    getMergedPlugins: vi.fn(async () => simule.fiches),
    getMarketplaceCatalog: vi.fn(async () => ({ plugins: [], count: 0 })),
    installPlugin: vi.fn(async (slug: string) => {
      simule.installations.push(slug);
      return simule.reponseInstallation;
    }),
  };
});

import SettingsV2 from '../../components/v2/SettingsV2.svelte';
import PluginsV2 from '../../components/v2/PluginsV2.svelte';
import { preferences } from '../stores/preferences';
import { sources } from '../sources';
import { preparerLocale } from '../i18n';
import {
  etatGreffonEntreeAudio,
  propositionEntreeAudioVisible,
  NOMS_GREFFONS_SDK,
  ID_GREFFON_ENTREE_AUDIO,
} from '../greffonEntreeAudio';
import lFr from '../locales/fr';

const fr = lFr as unknown as Record<string, string>;

/** La fiche de `GET /plugins` d'un greffon opt-in proposé, pas installé. */
const PROPOSE = {
  name: 'entree-audio', display_name: 'entree-audio', type: 'sdk', installed: false, enabled: false,
  loaded: false, compatible: true, premium: false, version: '1.0.0',
  description: 'Capter une entrée audio (USB, S/PDIF, optique) et la diffuser en direct vers une zone',
};
const ACTIF = { ...PROPOSE, installed: true, enabled: true, loaded: undefined };

class ResizeObserverInerte {
  observe() {}
  unobserve() {}
  disconnect() {}
}

let hote: HTMLDivElement | null = null;
let monte: Record<string, any> | null = null;

async function attendre(tours = 6) {
  for (let i = 0; i < tours; i++) {
    await new Promise((r) => setTimeout(r, 0));
    flushSync();
  }
}

async function poser(Vue: typeof SettingsV2 | typeof PluginsV2): Promise<HTMLDivElement> {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(Vue as any, { target: hote, props: {} });
  flushSync();
  await attendre();
  return hote;
}

function cocher(types: { entree?: boolean; virtuelle?: boolean }) {
  preferences.update((p) => ({
    ...p,
    settingsLevel: 'beginner',
    sourcesBarre: { cd: false, hdmi: false, entree: false, virtuelle: false, ...types },
  }));
}

async function ecranAffichage(): Promise<HTMLElement> {
  const el = await poser(SettingsV2);
  const onglet = [...el.querySelectorAll('button')].find(
    (b) => (b.textContent ?? '').trim() === fr['settings.tabDisplay'],
  );
  expect(onglet, 'onglet Affichage introuvable à l’écran').toBeDefined();
  (onglet as HTMLButtonElement).click();
  await attendre();
  return el;
}

const proposition = (el: HTMLElement) => el.querySelector('[data-greffon-entree-audio]') as HTMLElement | null;
const boutonInstaller = (el: HTMLElement) => el.querySelector('button.installer-entree-audio') as HTMLButtonElement | null;

beforeAll(async () => { await preparerLocale('fr'); });

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', ResizeObserverInerte);
  vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', {
    status: 200, headers: { 'Content-Type': 'application/json' },
  })));
  simule.fiches = [PROPOSE];
  simule.installations = [];
  simule.reponseInstallation = { success: true, message: '', restart_required: true };
  sources.set([]);
});

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  hote?.remove();
  hote = null;
  vi.unstubAllGlobals();
});

describe('l’état du greffon, lu dans GET /plugins', () => {
  it('proposé, pas installé → à installer', () => {
    expect(etatGreffonEntreeAudio([PROPOSE])).toBe('a_installer');
  });
  it('installé, pas encore chargé → à redémarrer', () => {
    expect(etatGreffonEntreeAudio([{ ...PROPOSE, installed: true }])).toBe('a_redemarrer');
  });
  it('chargé → actif ; en erreur de démarrage → pas « manquant » non plus', () => {
    expect(etatGreffonEntreeAudio([ACTIF])).toBe('actif');
    expect(etatGreffonEntreeAudio([{ ...PROPOSE, installed: true, loaded: false, status: 'error' }])).toBe('actif');
  });
  it('🔴 absent de la liste (serveur ancien) → absent : on ne propose pas une installation vouée à l’échec', () => {
    expect(etatGreffonEntreeAudio([{ name: 'cd', installed: true }])).toBe('absent');
    expect(propositionEntreeAudioVisible({ entree: true, virtuelle: true }, 'absent')).toBe(false);
  });
  it('pas de réponse → inconnu, rien proposé', () => {
    expect(etatGreffonEntreeAudio(null)).toBe('inconnu');
    expect(propositionEntreeAudioVisible({ entree: true, virtuelle: false }, 'inconnu')).toBe(false);
  });
  it('aucune des deux cases cochée → rien proposé', () => {
    expect(propositionEntreeAudioVisible({ entree: false, virtuelle: false }, 'a_installer')).toBe(false);
    expect(propositionEntreeAudioVisible({ entree: false, virtuelle: true }, 'a_installer')).toBe(true);
  });
});

describe('Réglages › Extensions : la carte porte un nom traduit (#5296 a)', () => {
  it('« Entrée audio », jamais l’identifiant « entree-audio »', async () => {
    expect(NOMS_GREFFONS_SDK[ID_GREFFON_ENTREE_AUDIO]).toBe('v2.plug.entreeAudioNom');
    const el = await poser(PluginsV2);
    // Onglet « Catalogue » : un greffon non installé n'est pas dans « Installés ».
    (el.querySelectorAll('nav.tabs button')[1] as HTMLButtonElement).click();
    flushSync();
    const titres = [...el.querySelectorAll('article.pl h2')].map((h) => h.textContent);
    expect(titres).toContain(fr['v2.plug.entreeAudioNom']);
    expect(titres).not.toContain('entree-audio');
  });
});

describe('Réglages › Affichage : proposer d’installer le greffon (#5296 b)', () => {
  it('« Entrée audio » cochée, greffon manquant : la proposition et le rappel du redémarrage', async () => {
    cocher({ entree: true });
    const el = await ecranAffichage();
    const rangee = proposition(el);
    expect(rangee, 'aucune proposition d’installation').not.toBeNull();
    expect(rangee!.textContent).toContain(fr['v2.sources.greffonManque']);
    expect(boutonInstaller(el)?.textContent?.trim()).toBe(fr['v2.sources.greffonInstaller']);
  });

  it('le bouton appelle la route d’installation existante, puis dit de redémarrer', async () => {
    cocher({ virtuelle: true });
    const el = await ecranAffichage();
    boutonInstaller(el)!.click();
    await attendre();
    expect(simule.installations).toEqual(['entree-audio']);
    expect(boutonInstaller(el), 'plus de bouton après l’installation').toBeNull();
    expect(proposition(el)?.textContent).toContain(fr['v2.sources.greffonRedemarrer']);
  });

  it('greffon installé mais serveur pas redémarré : le rappel, sans bouton', async () => {
    simule.fiches = [{ ...PROPOSE, installed: true }];
    cocher({ entree: true });
    const el = await ecranAffichage();
    expect(proposition(el)?.textContent).toContain(fr['v2.sources.greffonRedemarrer']);
    expect(boutonInstaller(el)).toBeNull();
  });

  it('greffon actif : rien n’est proposé', async () => {
    simule.fiches = [ACTIF];
    cocher({ entree: true, virtuelle: true });
    const el = await ecranAffichage();
    expect(proposition(el)).toBeNull();
  });

  it('aucune des deux cases cochée : rien n’est proposé', async () => {
    cocher({});
    const el = await ecranAffichage();
    expect(proposition(el)).toBeNull();
  });
});
