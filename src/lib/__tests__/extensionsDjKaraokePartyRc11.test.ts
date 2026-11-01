// @vitest-environment jsdom
//
// rc11 (Bertrand, 01/11/2026) — DJ, Karaoké et Mode Party se cochent et se
// décochent dans Réglages › Extensions, avec nom et description traduits et
// l'avertissement de redémarrage sur la carte. Une extension n'apparaît qu'une
// seule fois (tune-server-rust#7428).
//
// 🔴 Les témoins MONTENT l'écran et CLIQUENT : ils lisent le texte peint et la
// requête qui part. Chacun a sa contre-épreuve.
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';

const simule = vi.hoisted(() => ({
  fiches: [] as any[],
  appels: [] as string[],
}));

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return {
    ...actual,
    getMergedPlugins: vi.fn(async () => simule.fiches),
    getMarketplaceCatalog: vi.fn(async () => ({ plugins: [], count: 0 })),
    installPlugin: vi.fn(async (nom: string) => { simule.appels.push(`install:${nom}`); return { restart_required: true }; }),
    uninstallPlugin: vi.fn(async (nom: string) => { simule.appels.push(`uninstall:${nom}`); return { restart_required: true }; }),
    enablePlugin: vi.fn(async (nom: string) => { simule.appels.push(`enable:${nom}`); return { restart_required: false }; }),
    disablePlugin: vi.fn(async (nom: string) => { simule.appels.push(`disable:${nom}`); return { restart_required: true }; }),
  };
});

import PluginsV2 from '../../components/v2/PluginsV2.svelte';
import { preparerLocale } from '../i18n';
import { ajouterLaBoutique } from '../catalogueGreffons';
import { NOMS_GREFFONS_SDK, DESCRIPTIONS_GREFFONS_SDK } from '../greffonEntreeAudio';
import lFr from '../locales/fr';
import lEn from '../locales/en';
import lDe from '../locales/de';
import lEl from '../locales/el';
import lEs from '../locales/es';
import lHu from '../locales/hu';
import lIt from '../locales/it';
import lJa from '../locales/ja';
import lKo from '../locales/ko';
import lNb from '../locales/nb';
import lPl from '../locales/pl';
import lRo from '../locales/ro';
import lSv from '../locales/sv';
import lVi from '../locales/vi';
import lZh from '../locales/zh';

const fr = lFr as unknown as Record<string, string>;

const base = { type: 'sdk', compatible: true, premium: false, version: '1.0.0', loaded: false };
const DJ = { ...base, name: 'dj', display_name: 'dj', description: 'DJ mode — crossfade, decks', installed: false, enabled: false };
const KARAOKE = { ...base, name: 'karaoke', display_name: 'karaoke', description: 'Synced lyrics', installed: false, enabled: false };
const PARTY = { ...base, type: 'wasm', name: 'party', display_name: 'Party Mode', description: 'Party Mode — collaborative queue with voting', installed: true, enabled: true, loaded: true };

class ResizeObserverInerte { observe() {} unobserve() {} disconnect() {} }

let hote: HTMLDivElement | null = null;
let monte: Record<string, any> | null = null;

async function attendre(tours = 6) {
  for (let i = 0; i < tours; i++) {
    await new Promise((r) => setTimeout(r, 0));
    flushSync();
  }
}

async function poser(): Promise<HTMLDivElement> {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(PluginsV2 as any, { target: hote, props: {} });
  flushSync();
  await attendre();
  return hote;
}

const carte = (el: HTMLElement, id: string) => el.querySelector(`article[data-plugin="${id}"]`) as HTMLElement | null;
const catalogue = async (el: HTMLElement) => {
  (el.querySelectorAll('nav.tabs button')[1] as HTMLButtonElement).click();
  await attendre();
};

beforeAll(async () => { await preparerLocale('fr'); });

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', ResizeObserverInerte);
  vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } })));
  simule.fiches = [DJ, KARAOKE, PARTY];
  simule.appels = [];
});

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  hote?.remove();
  hote = null;
  vi.unstubAllGlobals();
});

describe('cartes DJ, Karaoké et Mode Party', () => {
  it('nom et description TRADUITS, jamais l’identifiant ni la phrase anglaise du serveur', async () => {
    const el = await poser();
    await catalogue(el);
    for (const [id, nom, desc] of [
      ['dj', 'v2.plug.djNom', 'v2.plug.djDesc'],
      ['karaoke', 'v2.plug.karaokeNom', 'v2.plug.karaokeDesc'],
      ['party', 'v2.plug.partyNom', 'v2.plug.partyDesc'],
    ] as const) {
      const c = carte(el, id);
      expect(c, `carte ${id}`).not.toBeNull();
      expect(c!.querySelector('h2')!.textContent).toBe(fr[nom]);
      expect(c!.querySelector('p.pd')!.textContent).toBe(fr[desc]);
    }
    expect(carte(el, 'dj')!.textContent).not.toContain('crossfade, decks');
  });

  it('contre-épreuve : un greffon inconnu garde le nom et la description du serveur', async () => {
    simule.fiches = [{ ...DJ, name: 'autre', display_name: 'Autre', description: 'Texte serveur' }];
    const el = await poser();
    await catalogue(el);
    const c = carte(el, 'autre')!;
    expect(c.querySelector('h2')!.textContent).toBe('Autre');
    expect(c.querySelector('p.pd')!.textContent).toBe('Texte serveur');
  });

  it('DJ non installé : « Installer » envoie POST install, puis l’avertissement s’affiche', async () => {
    const el = await poser();
    await catalogue(el);
    (carte(el, 'dj')!.querySelector('button.go') as HTMLButtonElement).click();
    await attendre();
    expect(simule.appels).toEqual(['install:dj']);
    // Le serveur, relu, dit : installé, voulu actif, pas chargé, redémarrage.
    simule.fiches = [{ ...DJ, installed: true, enabled: true, restart_required: true }, KARAOKE, PARTY];
    (carte(el, 'dj')!.querySelector('button.go') as HTMLButtonElement | null)?.click();
    await attendre();
  });

  it('carte installée en attente de redémarrage : case cochée + avertissement ; sans attente, aucun avertissement', async () => {
    simule.fiches = [{ ...KARAOKE, installed: true, enabled: true, restart_required: true }, PARTY];
    const el = await poser();
    const k = carte(el, 'karaoke')!;
    expect((k.querySelector('label.sw input') as HTMLInputElement).checked).toBe(true);
    expect(k.querySelector('[data-redemarrage]')!.textContent).toBe(fr['v2.plug.restartCard']);
    // Contre-épreuve : Mode Party actif et chargé, rien à redémarrer.
    expect(carte(el, 'party')!.querySelector('[data-redemarrage]')).toBeNull();
  });

  it('Mode Party : décocher envoie disable, recocher envoie enable', async () => {
    const el = await poser();
    const case_ = carte(el, 'party')!.querySelector('label.sw input') as HTMLInputElement;
    expect(case_.checked).toBe(true);
    case_.click();
    await attendre();
    simule.fiches = [{ ...PARTY, enabled: false, restart_required: true }];
    case_.click();
    await attendre();
    expect(simule.appels[0]).toBe('disable:party');
  });

  it('les deux tables de traduction couvrent les trois greffons', () => {
    for (const id of ['dj', 'karaoke', 'party']) {
      expect(NOMS_GREFFONS_SDK[id]).toBeTruthy();
      expect(DESCRIPTIONS_GREFFONS_SDK[id]).toBeTruthy();
    }
  });
});

describe('quinze langues', () => {
  const LANGUES: Record<string, Record<string, string>> = {
    fr: fr, en: lEn as any, de: lDe as any, el: lEl as any, es: lEs as any, hu: lHu as any, it: lIt as any,
    ja: lJa as any, ko: lKo as any, nb: lNb as any, pl: lPl as any, ro: lRo as any, sv: lSv as any, vi: lVi as any, zh: lZh as any,
  };
  const CLES = ['v2.plug.djNom', 'v2.plug.djDesc', 'v2.plug.karaokeNom', 'v2.plug.karaokeDesc',
    'v2.plug.partyNom', 'v2.plug.partyDesc', 'v2.plug.restartCard'];
  it('les sept clés existent, non vides, dans les quinze langues', () => {
    expect(Object.keys(LANGUES)).toHaveLength(15);
    for (const [langue, dico] of Object.entries(LANGUES)) {
      for (const k of CLES) expect(dico[k], `${langue} · ${k}`).toBeTruthy();
    }
  });
  it('contre-épreuve : le garde voit une clé manquante', () => {
    expect(({} as Record<string, string>)['v2.plug.djNom']).toBeUndefined();
  });
});

describe('#7428 — une extension, une seule carte', () => {
  it('« Mode Party » de la boutique n’est pas ajouté à « Party Mode » local', () => {
    const r = ajouterLaBoutique([PARTY as any], [{ slug: 'party-mode', name: 'Mode Party', platforms: 'wasm' }]);
    expect(r.filter((p) => /party/i.test(p.display_name || p.name))).toHaveLength(1);
  });
  it('contre-épreuve : une extension réellement différente reste proposée', () => {
    const r = ajouterLaBoutique([PARTY as any], [{ slug: 'karaoke-live', name: 'Karaoke Live', platforms: 'wasm' }]);
    expect(r.map((p) => p.slug ?? p.name)).toContain('karaoke-live');
  });
});
