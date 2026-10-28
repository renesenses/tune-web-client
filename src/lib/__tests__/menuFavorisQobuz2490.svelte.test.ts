// @vitest-environment jsdom
// #2490 : vrai écran Services/Qobuz/Favoris et vraie frontière API.
// Données synthétiques, aucun compte Qobuz ni lecture audio réelle.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';

vi.hoisted(() => {
  class AudioMuet {
    volume = 1; muted = false; src = ''; currentTime = 0;
    addEventListener() {} removeEventListener() {} load() {} pause() {}
    play() { return Promise.resolve(); }
  }
  (globalThis as any).Audio = AudioMuet;
});

import StreamingV2 from '../../components/v2/StreamingV2.svelte';
import { activeStreamingService } from '../stores/streaming';
import { activeView, gestesNavigationService } from '../stores/navigation';
import { detailOuvert, ongletCourant } from '../historiqueCoquille';
import { currentZoneId, zones } from '../stores/zones';
import { queuePosition } from '../stores/queue';
import { preferences } from '../stores/preferences';
import { locale } from '../i18n';
import { oublierCapaciteCurseur } from '../precedentsEnTete';
import fr from '../locales/fr';

const ZONE = { id: 37, name: 'Zone simulée', output_type: 'local', state: 'stopped', volume: 50 };
// StreamTrack omet la source implicite dans /streaming/qobuz ; id local absent.
const PISTES = ['avant', 'cible', 'apres'].map((nom, i) => ({
  source_id: `q-${nom}`, title: `Favori ${nom}`, artist_name: 'Artiste témoin',
  album_id: 'album-qobuz', album_title: 'Album témoin', duration_ms: 180000 + i,
  quality: { codec: 'FLAC', sample_rate: 96000, bit_depth: 24 },
}));
let hote: HTMLDivElement;
let composant: ReturnType<typeof mount> | undefined;
let requetes: { chemin: string; methode: string; corps: any }[];
const posts = () => requetes.filter((r) => r.methode === 'POST');
const reponse = (corps: unknown, status = 200) => new Response(JSON.stringify(corps), {
  status, headers: { 'Content-Type': 'application/json' },
});
const lignes = () => [...hote.querySelectorAll<HTMLElement>('#fav-titres [role="row"]')]
  .filter((r) => r.querySelector('button[aria-haspopup="menu"]'));
const libelle = (cle: keyof typeof fr) => fr[cle];
function ouvrirMenu(rang = 1) {
  const plus = lignes()[rang].querySelector<HTMLButtonElement>('button[aria-haspopup="menu"]');
  expect(plus, 'le favori doit proposer le menu commun').not.toBeNull();
  plus!.click(); flushSync();
  return [...document.querySelectorAll<HTMLButtonElement>('.menu button.item')];
}

beforeEach(async () => {
  requetes = []; localStorage.clear(); locale.set('fr'); oublierCapaciteCurseur();
  preferences.update((p) => ({ ...p, settingsLevel: 'expert' }));
  currentZoneId.set(37); zones.set([ZONE] as any); queuePosition.set(4);
  activeView.set('streaming'); activeStreamingService.set('qobuz');
  detailOuvert.set(null); ongletCourant.set(null);
  gestesNavigationService.set({ ouvrirAlbum() {}, ouvrirArtiste() {} } as any);
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const chemin = new URL(String(url), window.location.href).pathname;
    const methode = init?.method ?? 'GET';
    requetes.push({ chemin, methode, corps: init?.body ? JSON.parse(String(init.body)) : null });
    if (chemin.endsWith('/ext/bandcamp/tags')) return reponse({}, 404);
    if (chemin.endsWith('/streaming/services')) return reponse({ qobuz: { enabled: true, authenticated: true } });
    if (chemin.endsWith('/favorites/tracks')) return reponse({ tracks: structuredClone(PISTES) });
    if (chemin.endsWith('/favorites/albums')) return reponse({ albums: [] });
    if (chemin.endsWith('/favorites/artists')) return reponse({ artists: [] });
    if (chemin.endsWith('/zones/37/play') || chemin.endsWith('/zones/37')) return reponse(ZONE);
    if (chemin.endsWith('/queue/add')) return reponse({ queue_length: 3, queue_position: 0 });
    return reponse([]);
  }));
  hote = document.createElement('div'); document.body.append(hote);
  composant = mount(StreamingV2, { target: hote }); flushSync();
  await vi.waitFor(() => expect(hote.querySelector('.subs')).not.toBeNull());
  const favoris = [...hote.querySelectorAll<HTMLButtonElement>('.subs button')]
    .find((b) => b.textContent?.trim() === libelle('v2.nav.favorites'));
  expect(favoris).toBeDefined(); favoris!.click(); flushSync();
  await vi.waitFor(() => expect(lignes()).toHaveLength(3));
});

afterEach(async () => {
  if (composant) await unmount(composant);
  composant = undefined; hote?.remove();
  currentZoneId.set(null); zones.set([]); ongletCourant.set(null); detailOuvert.set(null);
  gestesNavigationService.set(null); oublierCapaciteCurseur(); vi.unstubAllGlobals();
});

describe('#2490 — menu des titres favoris du compte Qobuz', () => {
  it('rend les mêmes treize gestes que le menu commun Qobuz, depuis la réponse des favoris', () => {
    expect(ouvrirMenu().map((b) => b.textContent?.trim())).toEqual([
      'common.play', 'v2.pa.next', 'queue.addToQueue', 'library.playSimilar', 'library.otherVersions',
      'nowplaying.addToPlaylist', 'library.goToArtist', 'library.goToAlbum', 'v2.later.add',
      'v2.cover.tags', 'trackTags.title', 'credits.see', 'ban.ban',
    ].map((c) => libelle(c as keyof typeof fr)));
    expect(posts()).toEqual([]);
    expect(requetes.some((r) => r.chemin === '/api/v1/streaming/qobuz/favorites/tracks')).toBe(true);
  });

  it.each([
    { cle: 'common.play', route: '/play', position: undefined },
    { cle: 'v2.pa.next', route: '/queue/add', position: 5 },
    { cle: 'queue.addToQueue', route: '/queue/add', position: undefined },
  ] as const)('$cle désigne le titre Qobuz choisi, dans la zone choisie', async ({ cle, route, position }) => {
    const entree = ouvrirMenu().find((b) => b.textContent?.trim() === libelle(cle));
    expect(entree).toBeDefined(); entree!.click(); flushSync();
    await vi.waitFor(() => expect(posts()).toHaveLength(1));
    expect(posts()[0].chemin).toBe(`/api/v1/zones/37${route}`);
    const c = posts()[0].corps;
    expect(route === '/play' ? c : c.tracks).toMatchObject(route === '/play'
      ? { source: 'qobuz', source_id: 'q-cible', title: 'Favori cible' }
      : [{ source: 'qobuz', source_id: 'q-cible', title: 'Favori cible' }]);
    expect(c.position).toBe(position);
    for (const champ of ['track_id', 'album_id', 'streaming_album_id', 'streaming_playlist_id']) expect(c).not.toHaveProperty(champ);
  });

  it('Lire à partir d’ici joue le rang choisi, enfile la suite puis remet les précédents', async () => {
    const depuis = lignes()[1].querySelector<HTMLButtonElement>('button[data-depuis]');
    expect(depuis).not.toBeNull(); depuis!.click(); flushSync();
    await vi.waitFor(() => expect(posts()).toHaveLength(3));
    expect(posts().map((r) => r.chemin)).toEqual([
      '/api/v1/zones/37/play', '/api/v1/zones/37/queue/add', '/api/v1/zones/37/queue/add',
    ]);
    expect(posts()[0].corps).toMatchObject({ source: 'qobuz', source_id: 'q-cible', queue_follows: true });
    expect(posts()[1].corps.tracks.map((p: any) => p.source_id)).toEqual(['q-apres']);
    expect(posts()[2].corps).toMatchObject({ position: 0, tracks: [{ source: 'qobuz', source_id: 'q-avant' }] });
  });
});
