// @vitest-environment jsdom
//
// Fil forum 2941 (Régis), go de Bertrand du 19/11/2026 (rc13) — en VUE
// POCHETTES d'une playlist (`PlaylistDetailV2`), un clic sur la pochette ouvre
// l'ALBUM : la légende nomme donc l'album (en gras), puis l'artiste de l'album
// — ou le compositeur d'un album classique —, et plus le nom de la piste.
//
// Contre-épreuve : avec le composant de `main` (avant ce correctif), les cas
// 🔴 échouent — la première ligne est le titre de la piste (« Adagio »), le
// compositeur n'apparaît jamais, et l'aria-label de la pochette est la piste.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import PlaylistDetailV2 from '../../components/v2/PlaylistDetailV2.svelte';
import { locale } from '../i18n';
import { activeView } from '../stores/navigation';
import { currentZoneId } from '../stores/zones';
import { estAlbumClassique, legendePochette } from '../legendePochettePlaylist';

vi.setConfig({ testTimeout: 60_000 });

const PISTES = [
  { id: 1, title: 'So What', artist_name: 'Miles Davis', album_artist: 'Miles Davis', album_id: 10, album_title: 'Kind of Blue',
    cover_path: 'c1', source: 'local', genre: 'Jazz', composer: 'Miles Davis', duration_ms: 1000 },
  { id: 2, title: 'Adagio', artist_name: 'Berliner Philharmoniker', album_artist: 'Herbert von Karajan', album_id: 11,
    album_title: 'Symphonie n° 9', cover_path: 'c2', source: 'local', genre: 'Classique', composer: 'Ludwig van Beethoven', duration_ms: 1000 },
  // Album classique sans compositeur renseigné : l'artiste de l'album.
  { id: 3, title: 'Allegro', artist_name: 'Quatuor Ébène', album_id: 12, album_title: 'Quatuors', cover_path: 'c3',
    source: 'local', genre: 'Classical', duration_ms: 1000 },
];

class Inerte { observe() {} unobserve() {} disconnect() {} }
let hote: HTMLDivElement | null = null;
let monte: Record<string, unknown> | null = null;

beforeEach(() => {
  localStorage.clear();
  locale.set('fr');
  currentZoneId.set(1);
  activeView.set('playlists');
  vi.stubGlobal('ResizeObserver', Inerte);
  vi.stubGlobal('IntersectionObserver', Inerte);
  vi.stubGlobal('WebSocket', class { close() {} addEventListener() {} removeEventListener() {} send() {} } as any);
  vi.stubGlobal('fetch', vi.fn(async (url: any) => {
    const u = String(typeof url === 'string' ? url : url?.url ?? '');
    const c = /\/playlists\/\d+\/tracks/.test(u) ? PISTES : [];
    return {
      ok: true, status: 200, statusText: 'OK', headers: new Map([['content-type', 'application/json']]),
      json: async () => c, text: async () => JSON.stringify(c),
    } as unknown as Response;
  }));
});
afterEach(() => {
  if (monte) unmount(monte);
  monte = null; hote?.remove(); hote = null;
  localStorage.clear();
  vi.unstubAllGlobals();
});

async function tourner(n = 8) { for (let i = 0; i < n; i++) { await new Promise((r) => setTimeout(r, 0)); flushSync(); } }
async function monter(vue: 'pochettes' | 'liste'): Promise<HTMLDivElement> {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(PlaylistDetailV2, {
    target: hote,
    props: { item: { kind: 'local', pl: { id: 31, name: 'Légendes', track_count: PISTES.length } }, onClose: () => {} } as any,
  });
  flushSync();
  await tourner();
  (hote.querySelector(`[data-vue="${vue}"]`) as HTMLElement).click();
  flushSync();
  return hote;
}
const cartes = (h: HTMLElement) => [...h.querySelectorAll<HTMLElement>('[data-pgrille] .pcarte')];
const premiere = (c: HTMLElement) => c.querySelector<HTMLElement>('.pnom');
const signataire = (c: HTMLElement) => c.querySelector<HTMLElement>('[data-psignataire]')?.textContent ?? null;

describe('fil 2941 — légende des pochettes d’une playlist', () => {
  it('🔴 la légende : le nom de l’album en premier, en gras, puis l’artiste de l’album', async () => {
    const h = await monter('pochettes');
    const c = cartes(h)[0];
    expect(premiere(c)?.textContent).toBe('Kind of Blue');
    expect(c.querySelector('[data-pvig]')?.nextElementSibling, 'l’album suit directement la vignette').toBe(premiere(c));
    expect(signataire(c)).toBe('Miles Davis');
  });

  it('🔴 album classique : le compositeur, pas l’interprète', async () => {
    const h = await monter('pochettes');
    const c = cartes(h)[1];
    expect(premiere(c)?.textContent).toBe('Symphonie n° 9');
    expect(signataire(c)).toBe('Ludwig van Beethoven');
    expect(c.textContent).not.toContain('Karajan');
  });

  it('album classique sans compositeur : l’artiste', async () => {
    const h = await monter('pochettes');
    expect(signataire(cartes(h)[2])).toBe('Quatuor Ébène');
  });

  it('🔴 le nom de la piste n’apparaît plus dans la légende', async () => {
    const h = await monter('pochettes');
    const [a, b, c] = cartes(h);
    expect(a.textContent).not.toContain('So What');
    expect(b.textContent).not.toContain('Adagio');
    expect(c.textContent).not.toContain('Allegro');
  });

  it('🔴 aria-label de la pochette = album + artiste/compositeur', async () => {
    const h = await monter('pochettes');
    const ouvrir = cartes(h).map((c) => c.querySelector('.pa > button.ouvrir')?.getAttribute('aria-label'));
    expect(ouvrir).toEqual(['Kind of Blue — Miles Davis', 'Symphonie n° 9 — Ludwig van Beethoven', 'Quatuors — Quatuor Ébène']);
    expect(cartes(h)[1].getAttribute('aria-label')).toBe('Symphonie n° 9 — Ludwig van Beethoven');
  });

  it('CONTRE-ÉPREUVE : l’ordre des pochettes reste celui de la liste', async () => {
    const h = await monter('pochettes');
    expect(cartes(h).map((c) => premiere(c)?.textContent)).toEqual(['Kind of Blue', 'Symphonie n° 9', 'Quatuors']);
  });

  it('CONTRE-ÉPREUVE : la vue en liste garde le nom des pistes', async () => {
    const h = await monter('liste');
    expect(h.querySelector('[data-pgrille]')).toBeNull();
    expect(h.textContent).toContain('So What');
    expect(h.textContent).toContain('Adagio');
  });
});

describe('legendePochette — règle pure', () => {
  it('genres classiques reconnus, « Classic Rock » non', () => {
    expect(estAlbumClassique({ genre: 'Classical' } as any)).toBe(true);
    expect(estAlbumClassique({ genre: 'Opéra' } as any)).toBe(true);
    expect(estAlbumClassique({ genres: 'Baroque; Vocal' } as any)).toBe(true);
    expect(estAlbumClassique({ work: 'Messe en si' } as any)).toBe(true);
    expect(estAlbumClassique({ genre: 'Classic Rock' } as any)).toBe(false);
    expect(estAlbumClassique({ genre: 'Jazz' } as any)).toBe(false);
  });

  it('compositeur hors classique ignoré ; sans album, le nom de la ligne', () => {
    expect(legendePochette({ title: 'T', album_title: 'A', artist_name: 'X', composer: 'C', genre: 'Pop' } as any).signataire).toBe('X');
    expect(legendePochette({ title: 'Station', artist_name: null, radio: true } as any)).toEqual({ titre: 'Station', signataire: '', libelle: 'Station' });
  });
});
