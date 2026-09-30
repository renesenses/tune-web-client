// @vitest-environment jsdom
//
// web#1784 — Didier (fil 2036, 29/09/2026) : l'entrée « Lecture en cours »
// devrait ouvrir la page de l'album qui joue ; FabienM : celle de la PLAYLIST
// quand la lecture en vient. Go de Bertrand du 29/09/2026 : derrière un
// réglage DÉCOCHÉ par défaut ; décoché, rien ne change.
//
// Ce banc MONTE la barre latérale, clique l'entrée réellement peinte et lit
// où l'on arrive (`activeView`, `pendingLibraryAlbum`, l'événement de
// réouverture de l'écran Playlists) et quelles requêtes sont parties. Il ne
// cherche aucune chaîne dans les sources.
//
// CONTRE-ÉPREUVES (jouées sur Shrek le 29/09/2026) :
//   - sans le branchement de `go()` dans `Sidebar.svelte`, les témoins
//     « réglage coché » rougissent (on arrive sur l'écran dédié) ;
//   - sans la condition sur le réglage, les deux témoins « décoché »
//     rougissent (on arrive sur la playlist, ou sur l'album).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import { get } from 'svelte/store';
import SidebarV2 from '../../components/v2/Sidebar.svelte';
import { activeView, gestesNavigationService, pendingLibraryAlbum } from '../stores/navigation';
import { zones, currentZoneId } from '../stores/zones';
import { preferences } from '../stores/preferences';
import { tiroirOuvert } from '../largeurEcran';
import { locale } from '../i18n';
import { destinationLienLecture } from '../lienLectureEnCours';
import lFr from '../locales/fr';
import lEn from '../locales/en';
import lDe from '../locales/de';
import lEs from '../locales/es';
import lIt from '../locales/it';
import lHu from '../locales/hu';
import lJa from '../locales/ja';
import lKo from '../locales/ko';
import lRo from '../locales/ro';
import lSv from '../locales/sv';
import lZh from '../locales/zh';

const fr = lFr as unknown as Record<string, string>;
const DICTIONNAIRES = {
  fr: lFr, en: lEn, de: lDe, es: lEs, it: lIt, hu: lHu, ja: lJa, ko: lKo, ro: lRo, sv: lSv, zh: lZh,
} as unknown as Record<string, Record<string, string>>;

const PISTE_LOCALE = {
  track_id: 77, album_id: 5, artist_id: 3,
  title: 'Video Games', artist_name: 'Lana Del Rey', album_title: 'Born To Die',
  source: 'local', duration_ms: 281000,
};
const PISTE_QOBUZ = {
  title: 'So What', artist_name: 'Miles Davis', album_title: 'Kind of Blue',
  source: 'qobuz', source_id: 'q-trk-1', cover_path: 'https://img/kob.jpg', duration_ms: 545000,
};
const RADIO = { title: 'FIP', source: 'radio', source_id: 'fip-hifi' };

type Contexte = { type: string | null; id: string | null; source: string | null };

/** La zone telle que la rend `GET /zones/1` — contexte de session compris. */
let zoneServeur: Record<string, unknown> = {};
/** Réponses particulières, par motif d'URL. */
let routes: Array<[RegExp, number, unknown]> = [];
let appels: string[] = [];
let evenements: any[] = [];
const ecouter = (ev: Event) => evenements.push((ev as CustomEvent).detail?.target);

let hote: HTMLDivElement | null = null;
let monte: Record<string, any> | null = null;

function reponse(status: number, corps: unknown): Response {
  return {
    ok: status >= 200 && status < 300, status, statusText: String(status),
    headers: new Map([['content-type', 'application/json']]),
    json: async () => corps, text: async () => JSON.stringify(corps),
  } as unknown as Response;
}

function repondre(url: string): Response {
  appels.push(url);
  for (const [motif, status, corps] of routes) if (motif.test(url)) return reponse(status, corps);
  if (/\/zones\/1(\?|$)/.test(url)) return reponse(200, zoneServeur);
  if (/\/(zones|profiles|devices|playlists|shortcuts|plugins|sources)(\?|$)/.test(url)) return reponse(200, []);
  return reponse(200, {});
}

function poserZone(piste: unknown, ctx: Contexte | null): void {
  const z = {
    id: 1, name: 'Salon', state: 'playing', current_track: piste, position_ms: 1000,
    ...(ctx ? {
      session_context_type: ctx.type, session_context_id: ctx.id, session_context_source: ctx.source,
    } : {}),
  };
  zoneServeur = z;
  // Le MAGASIN ne porte pas le contexte : il n'arrive pas par les événements
  // de lecture. Le module doit relire la zone, pas se fier à ce qu'il a.
  zones.set([{ ...z, session_context_type: undefined, session_context_id: undefined, session_context_source: undefined }] as any);
  currentZoneId.set(1);
}

const respirer = (ms = 30) => new Promise((r) => setTimeout(r, ms));

function entreeLectureEnCours(): HTMLButtonElement {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(SidebarV2, { target: hote });
  flushSync();
  const b = [...hote.querySelectorAll<HTMLButtonElement>('button.nav')]
    .find((x) => x.textContent?.trim() === fr['nav.nowplaying']);
  expect(b, 'l’entrée « Lecture en cours » n’est pas peinte — témoin sans objet').toBeTruthy();
  return b!;
}

async function cliquer(b: HTMLButtonElement): Promise<void> {
  b.click();
  flushSync();
  await respirer();
  flushSync();
}

const reglage = (on: boolean) => preferences.update((p) => ({ ...p, lienLectureVersSource: on }));

beforeEach(() => {
  locale.set('fr');
  appels = [];
  evenements = [];
  routes = [];
  vi.stubGlobal('fetch', vi.fn(async (e: unknown) =>
    repondre(String(typeof e === 'string' ? e : (e as Request)?.url ?? e))));
  vi.stubGlobal('ResizeObserver', class { observe(){} unobserve(){} disconnect(){} } as any);
  window.addEventListener('tune:shortcut-restore', ecouter);
  activeView.set('home');
  pendingLibraryAlbum.set(null);
});

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  hote?.remove();
  hote = null;
  window.removeEventListener('tune:shortcut-restore', ecouter);
  zones.set([]);
  currentZoneId.set(null as any);
  gestesNavigationService.set(null);
  pendingLibraryAlbum.set(null);
  tiroirOuvert.set(false);
  activeView.set('home');
  reglage(false);
  vi.unstubAllGlobals();
});

describe('web#1784 — le réglage existe, DÉCOCHÉ par défaut', () => {
  it('une installation neuve ne l’a pas coché', async () => {
    vi.resetModules();
    const neuf = await import('../stores/preferences');
    expect(get(neuf.preferences).lienLectureVersSource).toBe(false);
  });

  it('il est traduit dans les onze langues', () => {
    for (const [l, d] of Object.entries(DICTIONNAIRES)) {
      expect(d['settings.nowPlayingLinkToSource'], `${l} : libellé absent`).toBeTruthy();
      expect(d['settings.nowPlayingLinkToSourceHint'], `${l} : aide absente`).toBeTruthy();
    }
  });
});

describe('web#1784 — réglage DÉCOCHÉ : le geste d’avant, à l’identique', () => {
  it('🔴 une lecture de playlist mène quand même à l’écran Lecture en cours, sans requête', async () => {
    reglage(false);
    poserZone(PISTE_LOCALE, { type: 'playlist', id: '12', source: 'local' });
    const b = entreeLectureEnCours();
    appels = [];
    await cliquer(b);
    expect(get(activeView)).toBe('nowplaying');
    expect(evenements, 'une playlist a été rouverte alors que le réglage est décoché').toEqual([]);
    expect(appels.filter((u) => /\/zones\/1(\/|\?|$)|\/playlists\/12/.test(u)),
      'décoché, le clic ne doit interroger ni la zone ni la playlist').toEqual([]);
  });

  it('une lecture d’album aussi', async () => {
    reglage(false);
    poserZone(PISTE_LOCALE, { type: 'album', id: '5', source: 'local' });
    // Le serveur SAIT l'album : c'est le réglage seul qui empêche d'y aller.
    routes.push([/\/zones\/1\/album-en-cours/, 200,
      { zone_id: 1, kind: 'library', service: 'local', album_id: '5', artist_id: '3', path: '/albums/5', origin: 'session_context' }]);
    await cliquer(entreeLectureEnCours());
    expect(get(activeView)).toBe('nowplaying');
    expect(get(pendingLibraryAlbum)).toBeNull();
  });
});

describe('web#1784 — réglage COCHÉ : la page de ce qui joue', () => {
  it('🔴 lecture lancée depuis une playlist LOCALE → la fiche de la playlist', async () => {
    reglage(true);
    poserZone(PISTE_LOCALE, { type: 'playlist', id: '12', source: 'local' });
    routes.push([/\/playlists\/12(\?|$)/, 200, { id: 12, name: 'Du soir', track_count: 9 }]);
    await cliquer(entreeLectureEnCours());
    expect(get(activeView)).toBe('playlists');
    expect(evenements.map((e) => e?.key)).toEqual(['playlists:12']);
    expect(get(pendingLibraryAlbum), 'la playlist prime sur l’album de la piste').toBeNull();
  });

  it('lecture lancée depuis une playlist de SERVICE → la fiche de cette playlist', async () => {
    reglage(true);
    poserZone(PISTE_QOBUZ, { type: 'playlist', id: 'pl-88', source: 'qobuz' });
    routes.push([/\/streaming\/qobuz\/playlists\/pl-88(\?|$)/, 200,
      { name: 'Jazz du dimanche', source_id: 'pl-88', cover_path: 'https://img/pl.jpg' }]);
    await cliquer(entreeLectureEnCours());
    expect(get(activeView)).toBe('playlists');
    expect(evenements).toHaveLength(1);
    expect(evenements[0].key).toBe('streamingplaylists:qobuz:pl-88');
    expect(evenements[0].restore).toMatchObject({
      kind: 'streaming', service: 'qobuz', pl: { source_id: 'pl-88', name: 'Jazz du dimanche' },
    });
  });

  it('🔴 lecture d’un album de la bibliothèque → la fiche de l’album', async () => {
    reglage(true);
    poserZone(PISTE_LOCALE, { type: 'album', id: '5', source: 'local' });
    routes.push([/\/zones\/1\/album-en-cours/, 200,
      { zone_id: 1, kind: 'library', service: 'local', album_id: '5', artist_id: '3', path: '/albums/5', origin: 'session_context' }]);
    await cliquer(entreeLectureEnCours());
    expect(get(activeView)).toBe('library');
    expect(get(pendingLibraryAlbum)).toBe(5);
    expect(evenements).toEqual([]);
  });

  it('album d’un service → la fiche d’album du service', async () => {
    reglage(true);
    const ouvrirAlbum = vi.fn();
    gestesNavigationService.set({ ouvrirAlbum, ouvrirArtiste: vi.fn() });
    poserZone(PISTE_QOBUZ, { type: 'track', id: 'q-trk-1', source: 'qobuz' });
    routes.push([/\/zones\/1\/album-en-cours/, 200,
      { zone_id: 1, kind: 'streaming', service: 'qobuz', album_id: 'q-alb-7', artist_id: 'q-art-2', path: '/streaming/qobuz/albums/q-alb-7', origin: 'service_lookup' }]);
    await cliquer(entreeLectureEnCours());
    expect(ouvrirAlbum).toHaveBeenCalledTimes(1);
    expect(ouvrirAlbum.mock.calls[0][0]).toMatchObject({
      service: 'qobuz', albumId: 'q-alb-7', titre: 'Kind of Blue', artiste: 'Miles Davis', artisteId: 'q-art-2',
    });
  });

  it('repli : une RADIO mène à l’écran Lecture en cours, sans requête', async () => {
    reglage(true);
    poserZone(RADIO, null);
    const b = entreeLectureEnCours();
    appels = [];
    await cliquer(b);
    expect(get(activeView)).toBe('nowplaying');
    expect(appels.filter((u) => /\/zones\/1(\/|\?|$)/.test(u))).toEqual([]);
  });

  it('repli : aucun album connu (404) → l’écran Lecture en cours', async () => {
    reglage(true);
    poserZone(PISTE_QOBUZ, null);
    routes.push([/\/zones\/1\/album-en-cours/, 404, { reason: 'no_album' }]);
    await cliquer(entreeLectureEnCours());
    expect(get(activeView)).toBe('nowplaying');
  });

  it('repli : playlist supprimée depuis → l’album de la piste', async () => {
    reglage(true);
    poserZone(PISTE_LOCALE, { type: 'playlist', id: '12', source: 'local' });
    routes.push([/\/playlists\/12(\?|$)/, 404, { error: 'not found' }]);
    routes.push([/\/zones\/1\/album-en-cours/, 200,
      { zone_id: 1, kind: 'library', service: 'local', album_id: '5', artist_id: '3', path: '/albums/5', origin: 'current_track' }]);
    await cliquer(entreeLectureEnCours());
    expect(get(activeView)).toBe('library');
    expect(get(pendingLibraryAlbum)).toBe(5);
  });

  it('rien ne joue → l’écran Lecture en cours', async () => {
    reglage(true);
    zones.set([{ id: 1, name: 'Salon', state: 'stopped', current_track: null }] as any);
    currentZoneId.set(1);
    await cliquer(entreeLectureEnCours());
    expect(get(activeView)).toBe('nowplaying');
  });
});

describe('web#1784 — la décision seule', () => {
  it('lit le contexte de session, pas la piste', () => {
    const z = (ctx: Partial<Contexte>, piste: unknown = PISTE_LOCALE) => ({
      id: 1, name: 'z', current_track: piste,
      session_context_type: ctx.type ?? null, session_context_id: ctx.id ?? null,
      session_context_source: ctx.source ?? null,
    }) as any;
    expect(destinationLienLecture(z({ type: 'playlist', id: '4', source: 'local' }))).toEqual({ type: 'playlist', id: 4 });
    expect(destinationLienLecture(z({ type: 'playlist', id: 'x9', source: 'tidal' })))
      .toEqual({ type: 'playlistService', service: 'tidal', id: 'x9' });
    expect(destinationLienLecture(z({ type: 'album', id: '5', source: 'local' }))).toEqual({ type: 'album' });
    expect(destinationLienLecture(z({}))).toEqual({ type: 'album' });
    expect(destinationLienLecture(z({ type: 'playlist', id: '4', source: 'local' }, RADIO))).toEqual({ type: 'ecran' });
    expect(destinationLienLecture(null)).toEqual({ type: 'ecran' });
  });
});
