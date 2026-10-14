// @vitest-environment jsdom
//
// ══════════════════════════════════════════════════════════════════════════
// renesenses/tune-web-client#1534 — FabienM, fil 1906 point 3 (v0.9.163) :
// « Dans les titres provenant de source streaming (Qobuz, Bandcamp, Tidal,
// Youtube), il manque l'ensemble des actions d'un titre d'une bibliothèque
// (Plus comme ça, Autres versions, Tous les champs titres). » Sa capture :
// 6 entrées sur un titre Qobuz contre 10 sur un titre local.
//
// Les entrées ont été ajoutées une à une après le signalement, chacune avec
// son témoin (« Aller à l'album » #1536, « Tous les champs piste » f2d4b3a2,
// « Plus comme ça » Qobuz 2088e859 puis Tidal/Deezer avec
// tune-server-rust#5395, « Autres versions » par titre + artiste, « Voir les
// crédits » Qobuz #4993, « Bannir » #4806, « Écouter plus tard » #1653). Aucun
// témoin ne disait, service par service, ce que le menu rend AU TOTAL et ce
// qui le sépare encore d'un titre local. C'est ce que fait celui-ci.
//
// Il MONTE les deux menus (barre v2 `PisteActions`, client actuel
// `MenuPisteV1`) sur un titre de chaque service, la coquille ayant armé ses
// gestes de navigation (`gestesNavigationService`, comme `ShellV2`), ouvre le
// « … » et compare la liste rendue à celle d'un titre de bibliothèque.
//
// Les SEULS écarts tolérés sont ceux que le serveur impose — la route répond
// 501 au service, et l'entrée est absente plutôt que muette :
//   - « Plus comme ça » : Qobuz, Tidal, Deezer seulement
//     (`SERVICES_PLUS_COMME_CA`, similarité d'artiste du service) ;
//   - « Voir les crédits » : Qobuz seulement (`SERVICES_AVEC_CREDITS`).
// ══════════════════════════════════════════════════════════════════════════
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import PisteActions from '../../components/v2/PisteActions.svelte';
import MenuPisteV1 from '../../components/partages/MenuPisteV1.svelte';
import { currentZoneId } from '../stores/zones';
import { locale } from '../i18n';
import lFr from '../locales/fr';
import { gestesNavigationService } from '../stores/navigation';

vi.setConfig({ testTimeout: 30_000 });


const QOBUZ = {
  id: null, source: 'qobuz', source_id: '441078583', title: 'Second Song',
  artist_name: 'Neil Young', artist_id: '35865', album_title: 'Second Song',
  album_id: 'atua1kxxk4tis', duration_ms: 360000, track_number: 3, disc_number: 1,
  isrc: 'USRE11500123', format: 'flac', sample_rate: 96000, bit_depth: 24,
  cover_path: 'https://static.qobuz.com/images/covers/x_600.jpg',
};
const service = (source: string, source_id = 'x-42') => ({ ...QOBUZ, source, source_id });
const BIBLIO = {
  id: 2450, source: 'local', title: 'Harvest', artist_name: 'Neil Young',
  artist_id: 125, album_id: 259, album_title: 'Harvest', duration_ms: 200000,
};

/** Ce que le serveur rend pour `GET /streaming/qobuz/tracks/441078583`. */
const DETAIL_QOBUZ = {
  source_id: '441078583', title: 'Second Song', artist_name: 'Neil Young',
  album_title: 'Second Song', album_id: 'atua1kxxk4tis', duration_ms: 360000,
  track_number: 3, disc_number: 1, explicit: false, isrc: 'USRE11500123',
  composer: 'Neil Young',
  quality: { codec: 'FLAC', sample_rate: 96000, bit_depth: 24, bitrate: 4608, channels: 2 },
};

let appels: string[] = [];
let hote: HTMLDivElement | null = null;
let monte: Record<string, any> | null = null;

function poser(composant: any, props: Record<string, unknown>): HTMLDivElement {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(composant, { target: hote, props: props as any });
  flushSync();
  return hote;
}

/** Ouvre le « … » de la barre v2 et rend les libellés de son menu. */
function menuV2(piste: Record<string, unknown>): HTMLButtonElement[] {
  const el = poser(PisteActions, { piste });
  const plus = Array.from(el.querySelectorAll<HTMLButtonElement>('button.pa'))
    .find((b) => b.getAttribute('aria-haspopup') === 'menu');
  expect(plus, 'la barre n’a pas de « … »').toBeTruthy();
  plus!.click();
  flushSync();
  return Array.from(document.querySelectorAll<HTMLButtonElement>('.menu button.item'));
}

/** Même chose pour le « … » du client actuel (`MenuPisteV1` → `TrackContextMenu`). */
function menuV1(piste: Record<string, unknown>): HTMLButtonElement[] {
  const el = poser(MenuPisteV1, { piste });
  el.querySelector<HTMLButtonElement>('button.track-more-btn')!.click();
  flushSync();
  return Array.from(document.querySelectorAll<HTMLButtonElement>('.track-menu-item'));
}

const libelles = (items: HTMLButtonElement[]) => items.map((b) => (b.textContent ?? '').trim());

beforeEach(() => {
  locale.set('fr');
  gestesNavigationService.set({ ouvrirAlbum: () => {}, ouvrirArtiste: () => {} } as any);
  currentZoneId.set(1);
  appels = [];
  vi.stubGlobal('fetch', vi.fn(async (entree: unknown) => {
    const url = String(typeof entree === 'string' ? entree : (entree as Request)?.url ?? entree);
    appels.push(url);
    const corps = url.includes('/streaming/qobuz/tracks/441078583') ? DETAIL_QOBUZ : {};
    return {
      ok: true, status: 200, statusText: 'OK',
      headers: new Map([['content-type', 'application/json']]),
      json: async () => corps,
      text: async () => JSON.stringify(corps),
    } as unknown as Response;
  }));
});

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  hote?.remove();
  hote = null;
  document.body.innerHTML = '';
  currentZoneId.set(null);
  vi.unstubAllGlobals();
});



const fr: Record<string, string> = lFr as any;
/** Le menu d'un titre de BIBLIOTHÈQUE, dans l'ordre : la référence. */
const LOCAL_CLES = [
  'common.play', 'v2.pa.next', 'queue.addToQueue', 'library.playSimilar', 'library.otherVersions',
  'nowplaying.addToPlaylist', 'library.goToArtist', 'library.goToAlbum', 'v2.later.add', 'v2.cover.tags',
  'trackTags.title', 'credits.see', 'ban.ban',
];
/** Ce que le SERVEUR ne sait pas encore rendre pour ce service. */
const ABSENTS_PAR_SERVICE: Record<string, string[]> = {
  qobuz: [],
  tidal: ['credits.see'],
  deezer: ['credits.see'],
  spotify: ['library.playSimilar', 'credits.see'],
  youtube: ['library.playSimilar', 'credits.see'],
  bandcamp: ['library.playSimilar', 'credits.see'],
  amazon: ['library.playSimilar', 'credits.see'],
};
const attendu = (absents: string[]) => LOCAL_CLES.filter((c) => !absents.includes(c)).map((c) => fr[c]);
function nettoyer() {
  if (monte) unmount(monte);
  monte = null;
  hote?.remove();
  hote = null;
  document.body.innerHTML = '';
}

describe('#1534 — le menu d’un titre de service, service par service', () => {
  it('la référence : un titre de bibliothèque a ses treize entrées dans les deux menus', () => {
    expect(LOCAL_CLES.every((c) => typeof fr[c] === 'string' && fr[c].length > 0)).toBe(true);
    expect(libelles(menuV2(BIBLIO))).toEqual(attendu([]));
    nettoyer();
    expect(libelles(menuV1(BIBLIO))).toEqual(attendu([]));
  });

  for (const [s, absents] of Object.entries(ABSENTS_PAR_SERVICE)) {
    it(`🔴 titre ${s} : le menu local, moins ${absents.length ? absents.join(' et ') : 'rien'}`, () => {
      expect(libelles(menuV2(service(s))), 'barre v2').toEqual(attendu(absents));
      nettoyer();
      expect(libelles(menuV1(service(s))), 'client actuel').toEqual(attendu(absents));
    });
  }

  it('les trois entrées réclamées par le fil sont là sur un titre Qobuz, comme sa capture le montrait', () => {
    const rendus = libelles(menuV2(QOBUZ));
    for (const c of ['library.playSimilar', 'library.otherVersions', 'trackTags.title', 'library.goToAlbum']) {
      expect(rendus, c).toContain(fr[c]);
    }
  });
});
