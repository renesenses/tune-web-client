// @vitest-environment jsdom
//
// Fil forum 2143 (FabienM), point 8 — « Aller à l'album » absent du menu d'un
// titre de la FILE D'ATTENTE.
//
// Le menu n'offre l'entrée que si la piste désigne son album (règle « absent,
// pas grisé », `lib/menuPiste`) : `album_id` entier pour une piste locale,
// `album_id_service` (ou `album_id` chaîne) pour une piste de service
// (`routageAlbum.albumDeServiceDe`). Or les lignes de `GET /zones/{id}/queue`
// ne portaient ni l'un ni l'autre : la ligne de file d'une rc2 n'a que
// `track_id`, `source`, `source_id`, les titres…
//
// Le correctif est côté SERVEUR (tune-server-rust, lot feat-rc3, « Refs
// #5758 ») : chaque ligne gagne `album_id` (entier de bibliothèque, ligne
// locale) et `album_id_service` (identifiant chez le service, ligne de
// service). Le client n'a rien à changer pour les lire ; ce témoin cloue
// qu'une ligne de file, passée par `pisteDeFile` comme dans `QueueV2`, ouvre
// bien l'album — et qu'une ligne de rc2 garde le menu sans l'entrée.
//
// 🔴 Contre-épreuve intégrée : les lignes « rc2 » (sans les deux clefs) n'ont
// PAS l'entrée. Le témoin rougit donc dès que le serveur cesse de les envoyer.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import { get } from 'svelte/store';
import PisteActions from '../../components/v2/PisteActions.svelte';
import { locale } from '../i18n';
import { pisteDeFile } from '../pisteDeFile';
import { activeView, gestesNavigationService, pendingLibraryAlbum } from '../stores/navigation';
import lFr from '../locales/fr';
import type { Track } from '../types';

vi.setConfig({ testTimeout: 30_000 });
const fr = lFr as unknown as Record<string, string>;
const PAGE = 'https://framewerk.bandcamp.com/album/love-parade';

class ObservateurInerte { observe() {} unobserve() {} disconnect() {} }
async function souffler(n = 10) {
  for (let i = 0; i < n; i++) { await new Promise((r) => setTimeout(r, 0)); flushSync(); }
}
let hote: HTMLDivElement | null = null;
let monte: Record<string, unknown> | null = null;
let ouvertures: any[] = [];

/** Une ligne LOCALE telle que la rc2 la rend : `id` = rang en file, `track_id`. */
const LOCALE_RC2 = {
  id: 26070, zone_id: 1, track_id: 32764, position: 0, is_current: true, source: 'local',
  source_id: null, title: 'So What', artist_name: 'Miles Davis', album_title: 'Kind of Blue',
  duration_ms: 240000, file_path: '/musique/so-what.flac', cover_path: null, format: 'flac',
  banned: false, gapless_next: false,
};
/** Une ligne BANDCAMP telle que la rc2 la rend : aucun identifiant d'album. */
const BANDCAMP_RC2 = {
  id: 26071, zone_id: 1, track_id: null, position: 1, is_current: false, source: 'bandcamp',
  source_id: 'https://t4.bcbits.com/stream/abc/mp3-128/111', title: 'Meet Her At The Love Parade',
  artist_name: 'Framewerk', album_title: 'Love Parade', duration_ms: 300000, file_path: null,
  cover_path: 'https://f4.bcbits.com/img/a1_10.jpg', format: null, banned: false, gapless_next: false,
};
/** Les mêmes lignes, servies par le serveur corrigé (clefs additives). */
const LOCALE = { ...LOCALE_RC2, album_id: 911, album_id_service: null };
const BANDCAMP = { ...BANDCAMP_RC2, album_id: null, album_id_service: PAGE };

beforeEach(() => {
  ouvertures = [];
  locale.set('fr');
  vi.stubGlobal('ResizeObserver', ObservateurInerte);
  vi.stubGlobal('IntersectionObserver', ObservateurInerte);
  vi.stubGlobal('fetch', vi.fn(async () => ({
    ok: true, status: 200,
    headers: new Headers({ 'Content-Type': 'application/json' }),
    text: async () => '{}', json: async () => ({}),
  } as unknown as Response)));
  gestesNavigationService.set({ ouvrirAlbum: (c: any) => ouvertures.push(c), ouvrirArtiste: () => {} } as any);
  pendingLibraryAlbum.set(null as any);
  activeView.set('queue' as any);
  hote = document.createElement('div');
  document.body.appendChild(hote);
});
afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  hote?.remove();
  hote = null;
  gestesNavigationService.set(null);
  vi.unstubAllGlobals();
});

const items = () => [...document.querySelectorAll<HTMLButtonElement>('button[role="menuitem"]')];
const allerAlbum = () => items().find((b) => (b.textContent ?? '').includes(fr['library.goToAlbum']));
/** Monte le menu d'une ligne de file comme `QueueV2` : par `pisteDeFile`. */
async function ouvrirMenu(ligne: object) {
  const piste = pisteDeFile(ligne as unknown as Track);
  monte = mount(PisteActions, { target: hote!, props: { piste, onLireDepuis: () => {} } });
  await souffler();
  hote!.querySelector<HTMLButtonElement>('button[aria-haspopup="menu"]')!.click();
  await souffler();
}

describe("fil 2143, point 8 — « Aller à l'album » sur un titre de la file", () => {
  it('🔴 une ligne LOCALE qui porte `album_id` ouvre son album de bibliothèque', async () => {
    await ouvrirMenu(LOCALE);
    const e = allerAlbum();
    expect(e, "« Aller à l'album » absent du menu d'une ligne locale de la file").toBeTruthy();
    e!.click();
    await souffler();
    expect(get(pendingLibraryAlbum)).toBe(911);
    expect(get(activeView)).toBe('library');
    expect(ouvertures, 'jamais la fiche de service pour une piste locale').toEqual([]);
  });

  it('🔴 une ligne BANDCAMP qui porte `album_id_service` ouvre la page de son album', async () => {
    await ouvrirMenu(BANDCAMP);
    const e = allerAlbum();
    expect(e, "« Aller à l'album » absent du menu d'une ligne Bandcamp de la file").toBeTruthy();
    e!.click();
    await souffler();
    expect(ouvertures.length).toBe(1);
    expect(ouvertures[0]).toMatchObject({ service: 'bandcamp', albumId: PAGE, titre: 'Love Parade' });
    expect(get(pendingLibraryAlbum), "jamais la Bibliothèque pour un album Bandcamp").toBe(null);
  });

  it('contre-épreuve : les lignes de la rc2, sans identifiant d’album, n’ont pas l’entrée', async () => {
    await ouvrirMenu(LOCALE_RC2);
    expect(items().length, 'le menu s’est bien ouvert').toBeGreaterThan(0);
    expect(allerAlbum()).toBeUndefined();
    unmount(monte!); monte = null;
    document.body.innerHTML = '';
    hote = document.createElement('div');
    document.body.appendChild(hote);
    await ouvrirMenu(BANDCAMP_RC2);
    expect(items().length).toBeGreaterThan(0);
    expect(allerAlbum()).toBeUndefined();
  });
});
