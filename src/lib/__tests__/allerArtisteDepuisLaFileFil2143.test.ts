// @vitest-environment jsdom
//
// Fil forum 2143 (FabienM), #5758 — « Aller à l'artiste » sur un titre de la
// FILE D'ATTENTE, le jumeau de « Aller à l'album » (point 8,
// `allerAlbumDepuisLaFileFil2143.test.ts`).
//
// Le menu n'offre l'entrée que si la piste désigne son artiste (règle « absent,
// pas grisé », `lib/menuPiste`). Une ligne LOCALE de `GET /zones/{id}/queue`
// ne portait aucun `artist_id` : l'entrée manquait. Le serveur (lot feat-rc3,
// « Refs #5758 ») pose désormais sur chaque ligne `artist_id` (entier de
// bibliothèque) et `artist_id_service` (artiste chez le service, `null` tant
// que la file ne le garde pas). Le client les lit par le même chemin que les
// autres écrans : `routageArtiste.destinationArtiste`.
//
// 🔴 Contre-épreuve intégrée : la ligne locale « rc2 » (sans `artist_id`) n'a
// PAS l'entrée.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import { get } from 'svelte/store';
import PisteActions from '../../components/v2/PisteActions.svelte';
import { locale } from '../i18n';
import { pisteDeFile } from '../pisteDeFile';
import { activeView, gestesNavigationService } from '../stores/navigation';
import { ficheArtisteService } from '../stores/streaming';
import lFr from '../locales/fr';
import type { Track } from '../types';

vi.setConfig({ testTimeout: 30_000 });
const fr = lFr as unknown as Record<string, string>;

class ObservateurInerte { observe() {} unobserve() {} disconnect() {} }
async function souffler(n = 10) {
  for (let i = 0; i < n; i++) { await new Promise((r) => setTimeout(r, 0)); flushSync(); }
}
let hote: HTMLDivElement | null = null;
let monte: Record<string, unknown> | null = null;
let ouvertures: any[] = [];

/** Une ligne LOCALE telle que la rc2 la rend : aucun identifiant d'artiste. */
const LOCALE_RC2 = {
  id: 26070, zone_id: 1, track_id: 32764, position: 0, is_current: true, source: 'local',
  source_id: null, title: 'So What', artist_name: 'Miles Davis', album_title: 'Kind of Blue',
  duration_ms: 240000, file_path: '/musique/so-what.flac', cover_path: null, format: 'flac',
  banned: false, gapless_next: false,
};
/** Une ligne QOBUZ telle que la rc2 la rend. */
const QOBUZ_RC2 = {
  id: 26071, zone_id: 1, track_id: null, position: 1, is_current: false, source: 'qobuz',
  source_id: 'q-1', title: 'Blue in Green', artist_name: 'Miles Davis', album_title: 'Kind of Blue',
  duration_ms: 300000, file_path: null, cover_path: null, format: null, banned: false,
  gapless_next: false,
};
/** Les mêmes lignes, servies par le serveur corrigé (clefs additives). */
const LOCALE = { ...LOCALE_RC2, artist_id: 994, artist_id_service: null };
const QOBUZ = { ...QOBUZ_RC2, artist_id: null, artist_id_service: '610403' };

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
  gestesNavigationService.set({ ouvrirAlbum: () => {}, ouvrirArtiste: (c: any) => ouvertures.push(c) } as any);
  ficheArtisteService.set(null as any);
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
const allerArtiste = () => items().find((b) => (b.textContent ?? '').includes(fr['library.goToArtist']));
/** Monte le menu d'une ligne de file comme `QueueV2` : par `pisteDeFile`. */
async function ouvrirMenu(ligne: object) {
  const piste = pisteDeFile(ligne as unknown as Track);
  monte = mount(PisteActions, { target: hote!, props: { piste, onLireDepuis: () => {} } });
  await souffler();
  hote!.querySelector<HTMLButtonElement>('button[aria-haspopup="menu"]')!.click();
  await souffler();
}

describe("fil 2143, #5758 — « Aller à l'artiste » sur un titre de la file", () => {
  it('🔴 une ligne LOCALE qui porte `artist_id` ouvre la page de son artiste', async () => {
    await ouvrirMenu(LOCALE);
    const e = allerArtiste();
    expect(e, "« Aller à l'artiste » absent du menu d'une ligne locale de la file").toBeTruthy();
    e!.click();
    await souffler();
    expect(get(ficheArtisteService)).toMatchObject({ service: null, id: '994', nom: 'Miles Davis' });
    expect(get(activeView)).toBe('streamingartist');
    expect(ouvertures, 'jamais la fiche de service pour une piste locale').toEqual([]);
  });

  it('🔴 une ligne de SERVICE qui porte `artist_id_service` ouvre la fiche de l’artiste chez son service', async () => {
    await ouvrirMenu(QOBUZ);
    const e = allerArtiste();
    expect(e, "« Aller à l'artiste » absent du menu d'une ligne Qobuz de la file").toBeTruthy();
    e!.click();
    await souffler();
    expect(ouvertures.length).toBe(1);
    expect(ouvertures[0]).toMatchObject({ service: 'qobuz', id: '610403', nom: 'Miles Davis' });
  });

  it('une ligne de service sans identifiant garde le repli par le nom (inchangé)', async () => {
    await ouvrirMenu(QOBUZ_RC2);
    allerArtiste()!.click();
    await souffler();
    expect(ouvertures.length).toBe(1);
    expect(ouvertures[0]).toEqual({ service: 'qobuz', nom: 'Miles Davis' });
  });

  it('contre-épreuve : la ligne locale de la rc2, sans `artist_id`, n’a pas l’entrée', async () => {
    await ouvrirMenu(LOCALE_RC2);
    expect(items().length, 'le menu s’est bien ouvert').toBeGreaterThan(0);
    expect(allerArtiste()).toBeUndefined();
  });
});
