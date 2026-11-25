// @vitest-environment jsdom
/**
 * rc14 (rc13.91) — retours de Rémi, go de Bertrand du 25/11/2026, et
 * relecture de web#3424. Tests de MONTAGE : les écrans réels, pas leur texte.
 *
 *   1. flèches Précédent / Suivant EN HAUT À GAUCHE, 40 px, loin de la loupe ;
 *      masquées sous une fiche à bouton Retour (téléphone) ; dans la grappe
 *      en mode sans distraction ;
 *   2. pochette agrandie à la TAILLE MAXIMALE, ratio conservé ; au doigt,
 *      toucher l'image la referme ;
 *   3. « Lecture en cours » : l'icône TESS remplace EQ / Crossfeed ;
 *   4. menu d'une zone : plus de « Correction de pièce » avec TESS ;
 *   5. fenêtre de la zone : lecture groupée à part ; mono et correction dans
 *      TESS ; le mode DSD RESTE (lecture des sources, hors TESS) ; « titres
 *      similaires » dans la file.
 *
 * Un serveur SANS TESS ne perd rien (`dspRegroupeDansTess`).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount, tick } from 'svelte';
import { get } from 'svelte/store';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Zone } from '../types';
import {
  flechesDansLaBarre, flechesDansLeCoin, flechesDansLaGrappe, CIBLE_FLECHE_PX, fichesAvecRetour,
} from '../placementFlechesNavigation';
import { ratioPochette, taillePleinCadre, fermeAuToucher } from '../pochettePleinCadre';
import { dspRegroupeDansTess } from '../dspDansTess';
import { entreesMenuZone, type GestesZone } from '../menuZone';
import { capaciteTess } from '../stores/tess';
import { activeView, focusMode, pendingLibraryAlbum, vueDeRetour } from '../stores/navigation';
import { greffonTessDemande } from '../stores/tessOuverture';
import { zones, currentZoneId } from '../stores/zones';
import { queueTracks } from '../stores/queue';
import { detailOuvert } from '../historiqueCoquille';
import { _reinitialiserMemoire, _reinitialiserRangs } from '../memoireNavigation';
import { locale } from '../i18n';
import ShellV2 from '../../components/v2/ShellV2.svelte';
import AlbumDetailV2 from '../../components/v2/AlbumDetailV2.svelte';
import NowPlaying from '../../components/partages/NowPlaying.svelte';
import QueueV2 from '../../components/v2/QueueV2.svelte';
import MenuZone from '../../components/v2/MenuZone.svelte';
import ZoneConfigModal from '../../components/partages/ZoneConfigModal.svelte';
import loc_de from '../locales/de';
import loc_el from '../locales/el';
import loc_en from '../locales/en';
import loc_es from '../locales/es';
import loc_fr from '../locales/fr';
import loc_hu from '../locales/hu';
import loc_it from '../locales/it';
import loc_ja from '../locales/ja';
import loc_ko from '../locales/ko';
import loc_nb from '../locales/nb';
import loc_nl from '../locales/nl';
import loc_pl from '../locales/pl';
import loc_ro from '../locales/ro';
import loc_ru from '../locales/ru';
import loc_sv from '../locales/sv';
import loc_tr from '../locales/tr';
import loc_uk from '../locales/uk';
import loc_vi from '../locales/vi';
import loc_zh from '../locales/zh';
import loc_zhHant from '../locales/zh-Hant';

vi.setConfig({ testTimeout: 120_000 });

const LANGUES: Record<string, Record<string, string>> = {
  de: loc_de, el: loc_el, en: loc_en, es: loc_es, fr: loc_fr, hu: loc_hu, it: loc_it, ja: loc_ja, ko: loc_ko,
  nb: loc_nb, nl: loc_nl, pl: loc_pl, ro: loc_ro, ru: loc_ru, sv: loc_sv, tr: loc_tr, uk: loc_uk, vi: loc_vi,
  zh: loc_zh, 'zh-Hant': loc_zhHant,
} as any;

const COLLECTIONS =
  /\/(profiles|zones|playlists|devices|shortcuts|collections|tags|favorites|history|radios|podcasts|artists|albums|tracks|top-artists|recent|genres|credits|plays|search)(\?|\/|$)/;
let appels: { url: string; init?: RequestInit }[] = [];
function reponse(url: string): Response {
  const chemin = new URL(url, 'http://localhost').pathname;
  let corps: unknown = COLLECTIONS.test(chemin) ? [] : {};
  if (/\/queue$/.test(chemin)) corps = { tracks: [], position: 0, length: 0 };
  if (/\/zones\/7$/.test(chemin)) corps = { id: 7, name: 'Salon', autoplay_enabled: false };
  return {
    ok: true, status: 200, statusText: 'OK',
    headers: new Map([['content-type', 'application/json']]),
    json: async () => corps, text: async () => JSON.stringify(corps),
  } as unknown as Response;
}

let hote: HTMLElement;
const montes: Record<string, any>[] = [];
function monter(c: any, props: Record<string, any> = {}, cible: HTMLElement = hote) {
  const m = mount(c, { target: cible, props: props as any });
  montes.push(m);
  flushSync();
  return m;
}
async function laisserPasser(tours = 8) {
  for (let i = 0; i < tours; i++) { await Promise.resolve(); await tick(); await new Promise((r) => setTimeout(r, 0)); }
  flushSync();
}
function largeur(px: number) {
  Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: px });
  window.dispatchEvent(new Event('resize'));
}

beforeEach(() => {
  locale.set('fr');
  appels = [];
  hote = document.createElement('div');
  document.body.appendChild(hote);
  vi.stubGlobal('fetch', vi.fn(async (u: unknown, init?: RequestInit) => {
    const url = typeof u === 'string' ? u : String((u as Request)?.url ?? u);
    appels.push({ url, init });
    return reponse(url);
  }));
  vi.stubGlobal('WebSocket', class { close() {} addEventListener() {} removeEventListener() {} send() {} } as any);
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} } as any);
});
afterEach(() => {
  while (montes.length) unmount(montes.pop()!);
  hote.remove();
  capaciteTess.set('inconnue');
  focusMode.set(false);
  zones.set([]);
  largeur(1024);
  vi.unstubAllGlobals();
});

// ─── 1. Flèches ────────────────────────────────────────────────────────────
describe('1 — flèches de navigation en haut à gauche', () => {
  it('la règle de placement', () => {
    expect(flechesDansLaBarre('large')).toBe(true);
    expect(flechesDansLaBarre('etroit')).toBe(true);
    expect(flechesDansLaBarre('tiroir')).toBe(false);
    const o = { vueMini: false, focus: false, vue: 'library' };
    expect(flechesDansLeCoin('tiroir', o)).toBe(true);
    expect(flechesDansLeCoin('large', o)).toBe(false);
    expect(flechesDansLeCoin('tiroir', { ...o, vue: 'nowplaying' })).toBe(false);
    expect(flechesDansLeCoin('tiroir', { ...o, ficheAvecRetour: true })).toBe(false);
    expect(flechesDansLeCoin('tiroir', { ...o, vueMini: true })).toBe(false);
    expect(flechesDansLaGrappe({ vueMini: false, focus: true })).toBe(true);
    expect(flechesDansLaGrappe({ vueMini: false, focus: false })).toBe(false);
  });

  function preparerCoquille() {
    _reinitialiserMemoire();
    _reinitialiserRangs();
    activeView.set('library');
    pendingLibraryAlbum.set(null);
    vueDeRetour.set(null);
    detailOuvert.set(null);
    history.replaceState(null, '', '/');
  }

  it('bureau : en tête de la barre latérale, côte à côte, et plus dans la grappe de la loupe', async () => {
    largeur(1400);
    preparerCoquille();
    monter(ShellV2);
    await laisserPasser();
    const barre = hote.querySelector('[data-fleches-barre] .fleches-nav');
    expect(barre, 'flèches absentes de la barre latérale').not.toBeNull();
    expect(barre!.getAttribute('data-disposition')).toBe('ligne');
    expect(barre!.querySelectorAll('[data-fleche-nav]').length).toBe(2);
    expect(hote.querySelector('.av-tr [data-fleche-nav]'), 'encore à côté de la loupe').toBeNull();
    expect(hote.querySelector('.av-tl')).toBeNull();
    // Avant la marque : la première rangée de la barre.
    const aside = hote.querySelector('aside.v2-sidebar')!;
    const enfants = [...aside.children];
    expect(enfants.indexOf(hote.querySelector('[data-fleches-barre]')!)).toBeLessThan(enfants.indexOf(aside.querySelector('.brand')!));
  });

  it('tablette : empilées dans la barre en icônes', async () => {
    largeur(900);
    preparerCoquille();
    monter(ShellV2);
    await laisserPasser();
    expect(hote.querySelector('[data-fleches-barre] .fleches-nav')?.getAttribute('data-disposition')).toBe('colonne');
  });

  it('téléphone : Précédent dans le coin haut-gauche, masquée sous une fiche album à bouton Retour', async () => {
    largeur(390);
    preparerCoquille();
    monter(ShellV2);
    await laisserPasser();
    expect(hote.querySelector('[data-fleches-barre]')).toBeNull();
    expect(hote.querySelector('.av-tl [data-fleche-nav="reculer"]')).not.toBeNull();
    expect(hote.querySelector('.v2-shell')!.classList.contains('fleches-gauche')).toBe(true);
    // Une fiche d'album s'ouvre (en calque, comme depuis n'importe quel écran).
    const ailleurs = document.createElement('div');
    document.body.appendChild(ailleurs);
    const fiche = mount(AlbumDetailV2 as any, { target: ailleurs, props: { onClose: () => {}, album: { id: 959, title: 'Ultra', artist_name: 'Depeche Mode' } } as any });
    flushSync();
    expect(get(fichesAvecRetour)).toBe(1);
    expect(ailleurs.querySelector('[data-retour-album]')).not.toBeNull();
    expect(hote.querySelector('.av-tl'), 'la flèche couvrirait « Retour »').toBeNull();
    unmount(fiche);
    ailleurs.remove();
    flushSync();
    expect(get(fichesAvecRetour)).toBe(0);
    expect(hote.querySelector('.av-tl [data-fleche-nav="reculer"]')).not.toBeNull();
  });

  it('mode sans distraction sur grand écran : les flèches restent visibles, dans la grappe', async () => {
    largeur(1400);
    preparerCoquille();
    focusMode.set(true);
    monter(ShellV2);
    await laisserPasser();
    expect(hote.querySelector('aside.v2-sidebar')).toBeNull();
    expect(hote.querySelector('.av-tr [data-fleche-nav="reculer"]')).not.toBeNull();
    expect(hote.querySelector('.av-tr [data-fleche-nav="avancer"]')).not.toBeNull();
  });

  it(`une cible d'au moins ${CIBLE_FLECHE_PX} px (feuille de style du composant)`, () => {
    // jsdom ne calcule pas les styles scopés : seule vérification par le texte.
    const css = readFileSync(resolve(__dirname, '../../components/v2/FlechesNavigation.svelte'), 'utf-8');
    const m = css.match(/\.fleche\{width:(\d+)px; height:(\d+)px/)!;
    expect(Number(m[1])).toBeGreaterThanOrEqual(CIBLE_FLECHE_PX);
    expect(Number(m[2])).toBeGreaterThanOrEqual(CIBLE_FLECHE_PX);
  });
});

// ─── 2 et 3. « Lecture en cours » ─────────────────────────────────────────
const PISTE = {
  track_id: 77, album_id: 5, artist_id: 3, title: 'It’s No Good', artist_name: 'Depeche Mode',
  album_title: 'Ultra', cover_path: 'covers/ultra.jpg', source: 'local', duration_ms: 298000,
};
async function lectureEnCours(): Promise<HTMLElement> {
  zones.set([{ id: 1, name: 'Salon', state: 'playing', current_track: PISTE, position_ms: 12000, output_type: 'local' }] as any);
  currentZoneId.set(1);
  queueTracks.set([] as any);
  activeView.set('nowplaying');
  monter(NowPlaying);
  await vi.waitFor(() => { flushSync(); expect(hote.querySelector('[data-np-actions]')).not.toBeNull(); });
  return hote;
}

describe('2 — pochette plein cadre', () => {
  it('le calcul : une petite pochette est AGRANDIE à la fenêtre, ratio conservé', () => {
    expect(ratioPochette(600, 300)).toBe(2);
    expect(ratioPochette(0, 300)).toBe(1);
    const t = taillePleinCadre(1, 1920, 1080);
    expect(t.largeur).toBe(1080 - 170);
    const p = taillePleinCadre(16 / 9, 390, 844);
    expect(p.largeur).toBe(390 - 32);
    expect(p.largeur / p.hauteur).toBeCloseTo(16 / 9, 6);
  });

  it('montée : l’image prend le ratio lu au chargement ; la souris ne ferme pas, le doigt ferme', async () => {
    const racine = await lectureEnCours();
    (racine.querySelector('.artwork-clickable') as HTMLElement).click();
    await vi.waitFor(() => { flushSync(); expect(document.querySelector('[data-pochette-plein-cadre]')).not.toBeNull(); });
    const img = document.querySelector<HTMLImageElement>('[data-pochette-plein-cadre]')!;
    expect(img.style.getPropertyValue('--ratio-pochette')).toBe('1');
    Object.defineProperty(img, 'naturalWidth', { configurable: true, value: 300 });
    Object.defineProperty(img, 'naturalHeight', { configurable: true, value: 150 });
    img.dispatchEvent(new Event('load'));
    flushSync();
    expect(img.style.getPropertyValue('--ratio-pochette')).toBe('2');
    img.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    flushSync();
    expect(document.querySelector('[data-pochette-plein-cadre]'), 'la souris a refermé').not.toBeNull();
    const toucher = new MouseEvent('click', { bubbles: true });
    Object.defineProperty(toucher, 'pointerType', { value: 'touch' });
    img.dispatchEvent(toucher);
    flushSync();
    expect(document.querySelector('[data-pochette-plein-cadre]'), 'le doigt n’a pas refermé').toBeNull();
  });

  it('pointeur grossier (téléphone) : tout toucher referme', () => {
    expect(fermeAuToucher(new MouseEvent('click'), true)).toBe(true);
    expect(fermeAuToucher(new MouseEvent('click'), false)).toBe(false);
  });
});

describe('3 — « Lecture en cours » : l’icône TESS à la place des boutons DSP', () => {
  it('la règle : seulement quand le serveur annonce TESS', () => {
    expect(dspRegroupeDansTess('oui')).toBe(true);
    expect(dspRegroupeDansTess('non')).toBe(false);
    expect(dspRegroupeDansTess('inconnue')).toBe(false);
  });

  it('avec TESS : l’icône du lot 1 dans la rangée, ni EQ ni Crossfeed ; elle ouvre TESS', async () => {
    capaciteTess.set('oui');
    const racine = await lectureEnCours();
    const rangee = racine.querySelector('[data-np-actions]')!;
    const icone = rangee.querySelector<HTMLButtonElement>('[data-np-action="tess"] [data-pastille-tess]');
    expect(icone).not.toBeNull();
    expect(rangee.querySelector('[data-np-action="eq"]')).toBeNull();
    expect(rangee.querySelector('[data-np-action="crossfeed"]')).toBeNull();
    icone!.click();
    expect(get(activeView)).toBe('tess');
  });

  it('serveur sans TESS : les anciens boutons restent, pas d’icône', async () => {
    capaciteTess.set('non');
    const rangee = (await lectureEnCours()).querySelector('[data-np-actions]')!;
    expect(rangee.querySelector('[data-np-action="crossfeed"]')).not.toBeNull();
    expect(rangee.querySelector('[data-pastille-tess]')).toBeNull();
  });
});

// ─── 4. Menu d'une zone ────────────────────────────────────────────────────
function gestes(): GestesZone {
  return {
    renommer: vi.fn(), image: vi.fn(), reglages: vi.fn(), correction: vi.fn(), latence: vi.fn(),
    appairer: vi.fn(), fusionner: vi.fn(), supprimer: vi.fn(),
  };
}
function libellesDuMenu(tess: boolean | undefined): string[] {
  monter(MenuZone, { entrees: entreesMenuZone({ expert: false, appairable: false, jumelle: null, tess }, gestes()), nom: 'Salon' });
  (hote.querySelector('.mz-roue') as HTMLButtonElement).click();
  flushSync();
  return [...hote.querySelectorAll('.mz-item')].map((b) => b.textContent?.trim() ?? '');
}

describe('4 — menu d’une zone', () => {
  it('avec TESS : plus d’entrée « Correction de pièce »', () => {
    const l = libellesDuMenu(true);
    expect(l).toContain(loc_fr['v2.zone.openSettings']);
    expect(l).not.toContain('Correction de pièce');
  });
  it('serveur sans TESS : l’entrée reste (#1427)', () => {
    expect(libellesDuMenu(undefined)).toContain('Correction de pièce');
  });
});

// ─── 5. Fenêtre de la zone ─────────────────────────────────────────────────
function zone(over: Partial<Zone> = {}): Zone {
  return {
    id: 7, name: 'Salon', output_type: 'local', output_device_id: 'local:dac', volume: 1, state: 'stopped',
    dsd_mode: 'auto', mono_downmix: false, autoplay_enabled: true, ...over,
  } as Zone;
}
function ouvrir(props: Record<string, any> = {}) {
  const z = zone();
  const onClose = vi.fn();
  monter(ZoneConfigModal, {
    zone: z, allZones: [z, zone({ id: 8, name: 'Cuisine' })], groups: [],
    onClose, onDelete: () => {}, onGroupChanged: () => {}, onRenamed: () => {}, ...props,
  });
  return { onClose };
}
const titreFir = () => [...hote.querySelectorAll('h3.fir-tl')].find((h) => h.textContent?.trim() === loc_fr['zoneConfig.firTitle']);

describe('5 — fenêtre de la zone : la configuration de l’appareil seule', () => {
  it('avec TESS : mono et correction cèdent la place à « Régler dans TESS » ; le mode DSD RESTE', () => {
    capaciteTess.set('oui');
    activeView.set('home');
    const { onClose } = ouvrir();
    expect(hote.querySelector('[data-reglage-dsd] select'), 'le mode DSD est hors TESS : il reste').not.toBeNull();
    expect(hote.querySelector('[data-section="mono"]')).toBeNull();
    expect(titreFir()).toBeUndefined();
    expect(hote.querySelector('[data-renvoi-tess] .section-desc')?.textContent).toBe(loc_fr['zoneConfig.tessNote']);
    const lien = hote.querySelector<HTMLButtonElement>('[data-regler-dans-tess]')!;
    expect(lien.textContent?.trim()).toBe('Régler dans TESS');
    lien.click();
    expect(onClose).toHaveBeenCalled();
    expect(get(activeView)).toBe('tess');
    expect(get(greffonTessDemande)).toBeNull();
  });

  it('sans TESS : DSD, mono et CorrectionAcoustiqueZone sont rendus', () => {
    capaciteTess.set('non');
    ouvrir();
    expect(hote.querySelector('[data-reglage-dsd] select')).not.toBeNull();
    expect(hote.querySelector('[data-section="mono"]')).not.toBeNull();
    expect(titreFir(), 'CorrectionAcoustiqueZone absent').toBeDefined();
    expect(hote.querySelector('[data-regler-dans-tess]')).toBeNull();
  });

  it('la lecture groupée a sa fenêtre ; la configuration n’en garde qu’un lien', () => {
    ouvrir();
    expect(hote.querySelector('[data-section="groupe"]')).toBeNull();
    hote.querySelector<HTMLButtonElement>('[data-ouvrir-groupe]')!.click();
    flushSync();
    expect(hote.querySelector('[data-section="groupe"] .zone-check-item')).not.toBeNull();
    expect(hote.querySelector('[data-renvoi-groupe]')).toBeNull();
    expect(hote.querySelector('[data-reglage-dsd]')).toBeNull();
  });

  it('ouverte depuis le sélecteur de zone (« Lecture groupée… ») : le groupe seul', () => {
    ouvrir({ section: 'groupe' });
    expect(hote.querySelector('[data-section="groupe"]')).not.toBeNull();
    expect(hote.querySelector('[data-reglage-dsd]')).toBeNull();
  });

  it('« titres similaires » n’est plus dans la fenêtre', () => {
    ouvrir();
    expect(hote.querySelector('[data-radio-fin-de-file]')).toBeNull();
  });

  it('… mais dans la file d’attente : nommé, et le couper écrit `autoplay_enabled: false`', async () => {
    zones.set([zone()] as any);
    currentZoneId.set(7);
    queueTracks.set([] as any);
    monter(QueueV2);
    await laisserPasser();
    const b = hote.querySelector<HTMLButtonElement>('[data-radio-fin-de-file]')!;
    expect(b, 'option absente de la file').not.toBeNull();
    expect(b.getAttribute('aria-label')).toBe(loc_fr['zoneConfig.radioFinDeFileLabel']);
    expect(b.getAttribute('aria-pressed')).toBe('true');
    b.click();
    await vi.waitFor(() => {
      const patch = appels.find((a) => /\/zones\/7$/.test(new URL(a.url, 'http://localhost').pathname) && a.init?.method === 'PATCH');
      expect(patch).toBeTruthy();
      expect(JSON.parse(String(patch!.init!.body))).toEqual({ autoplay_enabled: false });
    });
  });
});

describe('les libellés, traduits dans les vingt langues', () => {
  it.each(['zoneConfig.reglerDansTess', 'zoneConfig.tessNote', 'zone.groupedPlaybackOpenTip'])('%s', (cle) => {
    expect(Object.keys(LANGUES)).toHaveLength(20);
    const vus = new Set<string>();
    for (const [l, d] of Object.entries(LANGUES)) {
      expect(d[cle], `${l} : ${cle}`).toBeTruthy();
      vus.add(d[cle]);
    }
    expect(vus.size, 'de vraies traductions').toBeGreaterThanOrEqual(19);
  });

  it('la note TESS ne cite plus le DSD (hors TESS), l’infobulle ne parle plus de « section »', () => {
    for (const [l, d] of Object.entries(LANGUES)) {
      expect(d['zoneConfig.tessNote'], l).not.toMatch(/DSD/);
      expect(d['zoneConfig.tessNote'], l).toContain('TESS');
    }
    expect(loc_fr['zone.groupedPlaybackOpenTip']).toMatch(/fenêtre/);
    expect(loc_fr['zone.groupedPlaybackOpenTip']).not.toMatch(/section/);
    expect(loc_en['zone.groupedPlaybackOpenTip']).toMatch(/window/);
    expect(loc_en['zone.groupedPlaybackOpenTip']).not.toMatch(/section/);
  });
});
