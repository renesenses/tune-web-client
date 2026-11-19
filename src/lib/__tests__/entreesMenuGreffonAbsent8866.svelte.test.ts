// @vitest-environment jsdom
//
// tune-server-rust#8866 (P1, testeur Premium, Docker QNAP, rc12, 16/11/2026) —
// Réglages › Général : « Tune Circle » et « Ma collection physique » sont
// cochées, interrupteur vert, et n'apparaissent pas dans la barre latérale :
// leur greffon n'est pas installé. La ligne doit le dire (« Greffon non
// installé ») et proposer « Installer le greffon », qui mène à la fiche du
// greffon dans Réglages › Extensions, au lieu d'un interrupteur sans effet.
// Même traitement pour toutes les entrées portées par un greffon.
//
// Ce que ce témoin prouve, dans le DOM de composants réellement montés :
//   - un greffon non installé (ou désactivé) : mention + geste, plus
//     d'interrupteur ; la barre, avec la MÊME réponse de `GET /plugins`,
//     n'affiche pas l'entrée (les deux disent la même chose) ;
//   - contre-épreuve : greffon actif, la ligne est celle d'avant et la barre
//     montre l'entrée ;
//   - Concerts garde son interrupteur (son entrée reste visible et son écran
//     explique l'installation) ;
//   - le geste ouvre Réglages › Extensions sur la fiche du greffon, qui passe
//     au Catalogue quand le greffon n'est pas installé, et s'éclaire ;
//   - les sept libellés existent dans les quinze langues.
//
// Ce qu'il ne prouve pas : jsdom ne fait ni mise en page ni défilement réel.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import { get } from 'svelte/store';

import { preferences } from '../stores/preferences';
import { activeView } from '../stores/navigation';
import { activeStreamingService, streamingServices } from '../stores/streaming';
import { shortcuts } from '../stores/shortcuts';
import { etatGreffons } from '../stores/greffonsStudio';
import { presenceCrossfeedPro } from '../stores/crossfeedPro';
import { presenceCrosstalk } from '../stores/crosstalk';
import { v2SettingsTarget } from '../stores/v2SettingsNav';
import { locale } from '../i18n';
import {
  etatGreffonDeLEntree, interrupteurSansEffet, ficheGreffonAOuvrir, GREFFONS_DES_ENTREES,
} from '../greffonsDuMenu';
import Sidebar from '../../components/v2/Sidebar.svelte';
import OrdreBarreLateraleV2 from '../../components/v2/OrdreBarreLateraleV2.svelte';
import PluginsV2 from '../../components/v2/PluginsV2.svelte';
import { dictionnaire, ONZE_LANGUES } from './onzeDictionnaires';

vi.setConfig({ testTimeout: 60_000 });

const fr = dictionnaire('fr');

function reponse(corps: unknown) {
  return {
    ok: true, status: 200, statusText: 'OK',
    headers: new Map([['content-type', 'application/json']]),
    json: async () => corps,
    text: async () => JSON.stringify(corps),
  } as unknown as Response;
}
class ObservateurInerte { observe() {} unobserve() {} disconnect() {} }

const fiche = (name: string, o: Record<string, unknown>) => ({
  name, display_name: name, description: '', version: '1.0.0', type: 'sdk', compatible: true, ...o,
});
/** Ce que rend `GET /plugins` d'un Docker neuf : Circle et la collection
 *  physique dormants (opt-in pas installés), l'égaliseur désactivé. */
const DOCKER_NEUF = [
  fiche('circle', { installed: false, enabled: false, loaded: false, restart_required: false }),
  fiche('collection-physique', { installed: false, enabled: false, loaded: false, restart_required: false }),
  fiche('concerts', { installed: false, enabled: false, loaded: false, restart_required: false }),
  fiche('equalizer', { installed: true, enabled: false, loaded: false, restart_required: true }),
  fiche('crossfeed', { installed: true, enabled: true }),
];
const TOUT_ACTIF = [
  fiche('circle', { installed: true, enabled: true }),
  fiche('collection-physique', { installed: true, enabled: true }),
  fiche('concerts', { installed: true, enabled: true }),
  fiche('equalizer', { installed: true, enabled: true }),
  fiche('crossfeed', { installed: true, enabled: true }),
];

let greffonsServis: unknown[] = DOCKER_NEUF;
let hote: HTMLDivElement | null = null;
let monte: Record<string, any> | null = null;

async function laisserTourner(n = 30) {
  for (let i = 0; i < n; i++) {
    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));
    flushSync();
  }
}
async function monter(composant: any) {
  monte = mount(composant, { target: hote! });
  await laisserTourner();
}
const ligne = (vue: string) => hote!.querySelector<HTMLElement>(`[data-ordre-barre] li[data-vue="${vue}"]`)!;
const vuesDeLaBarre = () =>
  Array.from(hote!.querySelectorAll<HTMLElement>('button.nav[data-vue]')).map((b) => b.dataset.vue!);

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', ObservateurInerte as any);
  if (!('IntersectionObserver' in globalThis)) vi.stubGlobal('IntersectionObserver', ObservateurInerte as any);
  vi.stubGlobal('fetch', vi.fn(async (url: any) => {
    const u = String(url);
    if (/\/plugins(\?|$)/.test(u)) return reponse(greffonsServis);
    if (/\/marketplace\/plugins/.test(u)) return reponse({ plugins: [], count: 0 });
    if (/\/audio-plugins\/?$/.test(u)) return reponse({ plugins: [] });
    if (/\/plugins\/docs/.test(u)) return reponse({});
    if (/\/streaming\/services/.test(u)) return reponse({});
    if (/\/config/.test(u)) return reponse({});
    return reponse([]);
  }));
  Object.defineProperty(window, 'innerWidth', { value: 1400, configurable: true, writable: true });
  hote = document.createElement('div');
  document.body.appendChild(hote);
  shortcuts.set([]);
  activeStreamingService.set(null);
  streamingServices.set({});
  activeView.set('home');
  etatGreffons.set(null);
  presenceCrossfeedPro.set('inconnue');
  presenceCrosstalk.set('inconnue');
  v2SettingsTarget.set(null);
  ficheGreffonAOuvrir.set(null);
  locale.set('fr');
  // Le niveau du testeur était « Avancé » ; Expert ici pour voir aussi le Studio.
  preferences.update((p) => ({ ...p, settingsLevel: 'expert', barreLaterale: null as any, barreGroupesReplies: [] }));
  greffonsServis = DOCKER_NEUF;
});

afterEach(() => {
  if (monte) { try { unmount(monte); } catch { /* sans objet */ } monte = null; }
  hote?.remove();
  hote = null;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('#8866 — l’état du greffon, entrée par entrée', () => {
  const index = (l: any[]) => Object.fromEntries(l.map((p) => [p.name, p]));
  const sans = { crossfeedpro: 'inconnue', crosstalk: 'inconnue' } as const;

  it('greffon dormant ⇒ non installé, interrupteur sans effet ; actif ⇒ rien à dire', () => {
    expect(etatGreffonDeLEntree('circle', index(DOCKER_NEUF), sans)).toBe('non_installe');
    expect(interrupteurSansEffet('circle', 'non_installe')).toBe(true);
    expect(etatGreffonDeLEntree('collectionphysique', index(DOCKER_NEUF), sans)).toBe('non_installe');
    expect(etatGreffonDeLEntree('equalizer', index(DOCKER_NEUF), sans)).toBe('inactif');
    expect(etatGreffonDeLEntree('circle', index(TOUT_ACTIF), sans)).toBe('actif');
    expect(interrupteurSansEffet('circle', 'actif')).toBe(false);
    // Pas une entrée de greffon, et état pas encore lu : rien ne change.
    expect(etatGreffonDeLEntree('home', index(DOCKER_NEUF), sans)).toBe('sans');
    expect(etatGreffonDeLEntree('circle', null, sans)).toBe('inconnu');
  });

  it('installé, voulu actif, pas encore monté ⇒ à redémarrer ; absent du serveur ⇒ indisponible', () => {
    const l = index([fiche('circle', { installed: true, enabled: true, loaded: false, restart_required: true })]);
    expect(etatGreffonDeLEntree('circle', l, sans)).toBe('a_redemarrer');
    expect(etatGreffonDeLEntree('collectionphysique', l, sans)).toBe('indisponible');
    // Un outil Studio absent de la liste : la barre le montre (serveur
    // d'avant les greffons audio), la ligne ne dit donc rien.
    expect(etatGreffonDeLEntree('declick', l, sans)).toBe('inconnu');
  });

  it('greffons natifs tiers : la sonde de la barre décide', () => {
    expect(etatGreffonDeLEntree('crossfeedpro', {}, { crossfeedpro: 'absent', crosstalk: 'actif' })).toBe('non_installe');
    expect(etatGreffonDeLEntree('crosstalk', {}, { crossfeedpro: 'absent', crosstalk: 'actif' })).toBe('actif');
    expect(etatGreffonDeLEntree('crosstalk', {}, { crossfeedpro: 'absent', crosstalk: 'inactif' })).toBe('inactif');
  });

  it('Concerts garde son interrupteur : son entrée reste visible tant que le serveur l’embarque', () => {
    expect(interrupteurSansEffet('concerts', 'non_installe')).toBe(false);
    expect(interrupteurSansEffet('concerts', 'indisponible')).toBe(true);
  });
});

describe('#8866 — Réglages › Général, entrées du menu', () => {
  it('🔴 Docker neuf : Circle et la collection physique disent « Greffon non installé » et proposent de l’installer, sans interrupteur', async () => {
    await monter(OrdreBarreLateraleV2);
    for (const vue of ['circle', 'collectionphysique']) {
      const li = ligne(vue);
      expect(li.querySelector('[data-etat-greffon]')?.textContent?.trim()).toBe(fr['settings.sidebarPluginNotInstalled']);
      expect(li.querySelector('[data-ouvrir-greffon]')?.textContent?.trim()).toBe(fr['settings.sidebarPluginInstall']);
      expect(li.querySelector(`input[data-visible="${vue}"]`)).toBeNull();
    }
    // L'égaliseur désactivé : la ligne le dit et propose de l'activer.
    const eq = ligne('equalizer');
    expect(eq.querySelector('[data-etat-greffon]')?.textContent?.trim()).toBe(fr['settings.sidebarPluginDisabled']);
    expect(eq.querySelector('[data-ouvrir-greffon]')?.textContent?.trim()).toBe(fr['settings.sidebarPluginEnable']);
    expect(eq.querySelector('input[data-visible="equalizer"]')).toBeNull();
    // Concerts non installé : mention et geste, interrupteur conservé.
    const co = ligne('concerts');
    expect(co.querySelector('[data-etat-greffon]')?.textContent?.trim()).toBe(fr['settings.sidebarPluginNotInstalled']);
    expect(co.querySelector('input[data-visible="concerts"]')).not.toBeNull();
    // Une entrée sans greffon, et un greffon actif : la ligne d'avant.
    for (const vue of ['library', 'crossfeed']) {
      expect(ligne(vue).querySelector('[data-etat-greffon]')).toBeNull();
      expect(ligne(vue).querySelector<HTMLInputElement>(`input[data-visible="${vue}"]`)?.checked).toBe(true);
    }
  });

  it('la barre, avec la même réponse, n’affiche ni Circle ni la collection physique (la ligne dit vrai)', async () => {
    await monter(Sidebar);
    const vues = vuesDeLaBarre();
    expect(vues).not.toContain('circle');
    expect(vues).not.toContain('collectionphysique');
    expect(vues).not.toContain('equalizer');
    expect(vues).toContain('crossfeed');
  });

  it('contre-épreuve : greffons actifs, aucune mention, interrupteurs verts, entrées dans la barre', async () => {
    greffonsServis = TOUT_ACTIF;
    await monter(OrdreBarreLateraleV2);
    for (const vue of ['circle', 'collectionphysique', 'concerts', 'equalizer']) {
      expect(ligne(vue).querySelector('[data-etat-greffon]')).toBeNull();
      expect(ligne(vue).querySelector('[data-ouvrir-greffon]')).toBeNull();
      expect(ligne(vue).querySelector<HTMLInputElement>(`input[data-visible="${vue}"]`)?.checked).toBe(true);
    }
    unmount(monte!); monte = null;
    await monter(Sidebar);
    expect(vuesDeLaBarre()).toEqual(expect.arrayContaining(['circle', 'collectionphysique', 'equalizer']));
  });

  it('« Installer le greffon » ouvre Réglages › Extensions sur la fiche du greffon', async () => {
    await monter(OrdreBarreLateraleV2);
    ligne('circle').querySelector<HTMLButtonElement>('[data-ouvrir-greffon]')!.click();
    flushSync();
    expect(get(ficheGreffonAOuvrir)).toBe('sdk:circle');
    // `reglage` : l'onglet Extensions (Expert) s'ouvre même au niveau Avancé.
    expect(get(v2SettingsTarget)).toEqual({ tab: 'extensions', section: 'plugins', reglage: 'extensions' });
  });

  it('les entrées portées par un greffon sont toutes connues de la table', () => {
    expect(Object.keys(GREFFONS_DES_ENTREES).sort()).toEqual(
      ['circle', 'collectionphysique', 'concerts', 'converter', 'crossfeed', 'crossfeedpro', 'crosstalk', 'declick', 'equalizer'],
    );
  });
});

describe('#8866 — Réglages › Extensions, la fiche visée', () => {
  it('🔴 un greffon non installé : l’écran passe au Catalogue, la fiche est rendue et éclairée', async () => {
    ficheGreffonAOuvrir.set('sdk:circle');
    await monter(PluginsV2);
    const carte = hote!.querySelector<HTMLElement>('article[data-plugin="circle"]');
    expect(carte).not.toBeNull();
    expect(carte!.classList.contains('fiche-visee')).toBe(true);
    expect(get(ficheGreffonAOuvrir)).toBeNull();
  });

  it('contre-épreuve : sans cible, l’onglet « Installées » ne montre pas Circle', async () => {
    await monter(PluginsV2);
    expect(hote!.querySelector('article[data-plugin="circle"]')).toBeNull();
    expect(hote!.querySelector('article[data-plugin="crossfeed"]')).not.toBeNull();
  });
});

describe('#8866 — les libellés dans les quinze langues', () => {
  const CLES = ['NotInstalled', 'Disabled', 'Restart', 'Unavailable', 'Install', 'Enable', 'Open']
    .map((k) => `settings.sidebarPlugin${k}`);
  it.each([...ONZE_LANGUES])('%s', (lg) => {
    const d = dictionnaire(lg);
    for (const cle of CLES) {
      expect(typeof d[cle], `${lg} ${cle}`).toBe('string');
      expect(d[cle].trim().length, `${lg} ${cle}`).toBeGreaterThan(0);
    }
    if (lg !== 'fr') expect(d['settings.sidebarPluginInstall']).not.toBe(fr['settings.sidebarPluginInstall']);
  });
});
