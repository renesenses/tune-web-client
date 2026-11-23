// @vitest-environment jsdom
//
// web#3333 (fil forum 3000 ; accord de Bertrand du 22/11/2026, rc15) — MONTÉ
// sur la vraie fiche `PlaylistDetailV2` : le tri choisi pour une playlist
// n'est retenu que pour elle, une autre playlist reste sur son ordre, et les
// critères de tune-server-rust#9362 n'apparaissent que si le serveur envoie
// les champs. Rien n'est écrit au montage (#1650).
//
// CONTRE-ÉPREUVE (jouée sur Shrek) : `lireTriPlaylist(null)` à la place de
// `lireTriPlaylist(clePlaylistVue(…))` dans `PlaylistDetailV2.svelte` (le tri
// n'est plus relu par playlist) fait rougir le témoin 1 ; `CLES_TRI_PISTES` à
// la place de `criteresTri` dans la boucle des options fait rougir le
// témoin 3.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import PlaylistDetailV2 from '../../components/v2/PlaylistDetailV2.svelte';
import { locale } from '../i18n';

vi.setConfig({ testTimeout: 60_000 });

const AVEC_CHAMPS = [
  { id: 1, title: 'Gnossienne', artist_name: 'Satie', composer: 'Erik Satie', sample_rate: 44100, playlist_added_at: 300, duration_ms: 1000 },
  { id: 2, title: 'Clair de lune', artist_name: 'Debussy', composer: 'Claude Debussy', sample_rate: 96000, playlist_added_at: 100, duration_ms: 1000 },
  { id: 3, title: 'Pavane', artist_name: 'Fauré', composer: 'Gabriel Fauré', sample_rate: 48000, playlist_added_at: 200, duration_ms: 1000 },
];
const SANS_CHAMPS = AVEC_CHAMPS.map(({ composer: _c, sample_rate: _s, playlist_added_at: _a, ...reste }) => reste);
let pistes: unknown[] = AVEC_CHAMPS;

class Inerte { observe() {} unobserve() {} disconnect() {} }
let hote: HTMLDivElement | null = null;
let monte: Record<string, unknown> | null = null;

beforeEach(() => {
  localStorage.clear();
  locale.set('fr');
  pistes = AVEC_CHAMPS;
  vi.stubGlobal('ResizeObserver', Inerte);
  vi.stubGlobal('IntersectionObserver', Inerte);
  vi.stubGlobal('WebSocket', class { close() {} addEventListener() {} removeEventListener() {} send() {} } as any);
  vi.stubGlobal('fetch', vi.fn(async (url: any) => {
    const u = String(typeof url === 'string' ? url : url?.url ?? '');
    const c = /\/playlists\/\d+\/tracks/.test(u) ? pistes : [];
    return {
      ok: true, status: 200, statusText: 'OK',
      headers: new Map([['content-type', 'application/json']]),
      json: async () => c, text: async () => JSON.stringify(c),
    } as unknown as Response;
  }));
});
afterEach(() => {
  demonter();
  localStorage.clear();
  vi.unstubAllGlobals();
});

async function tourner(n = 8) {
  for (let i = 0; i < n; i++) { await new Promise((r) => setTimeout(r, 0)); flushSync(); }
}
function demonter() {
  if (monte) unmount(monte);
  monte = null; hote?.remove(); hote = null;
}
async function monter(id: number): Promise<HTMLDivElement> {
  demonter();
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(PlaylistDetailV2, {
    target: hote,
    props: { item: { kind: 'local', pl: { id, name: `Playlist ${id}`, track_count: 3 } }, onClose: () => {} } as any,
  });
  flushSync();
  await tourner();
  return hote;
}
const select = (h: HTMLElement) => h.querySelector('select[data-tri-pistes]') as HTMLSelectElement;
const options = (h: HTMLElement) => [...select(h).options].map((o) => o.value);
function choisir(h: HTMLElement, cle: string) {
  const s = select(h);
  s.value = cle;
  s.dispatchEvent(new Event('change', { bubbles: true }));
  flushSync();
}
/** Les titres dans l'ordre où l'écran les montre. */
function ordre(h: HTMLElement): string[] {
  const texte = h.textContent ?? '';
  return AVEC_CHAMPS.map((p) => p.title).sort((a, b) => texte.indexOf(a) - texte.indexOf(b));
}

describe('web#3333 — tri retenu par playlist, à l\'écran', () => {
  it('1. le tri d\'une playlist ne change pas les autres, et revient avec elle', async () => {
    let h = await monter(42);
    expect(select(h).value).toBe('ordre');
    expect(ordre(h)).toEqual(['Gnossienne', 'Clair de lune', 'Pavane']);
    choisir(h, 'composer');
    expect(ordre(h)).toEqual(['Clair de lune', 'Gnossienne', 'Pavane']);
    expect(localStorage.getItem('tune_v2_ecran_v2.playlist.pistes.tri.local:42')).toBe('composer');

    h = await monter(43);
    expect(select(h).value, 'une playlist jamais réglée reste sur son ordre').toBe('ordre');
    expect(ordre(h)).toEqual(['Gnossienne', 'Clair de lune', 'Pavane']);
    choisir(h, 'added');
    expect(ordre(h)).toEqual(['Clair de lune', 'Pavane', 'Gnossienne']);

    h = await monter(42);
    expect(select(h).value).toBe('composer');
    expect(ordre(h)).toEqual(['Clair de lune', 'Gnossienne', 'Pavane']);
  });

  it('2. rien n\'est écrit au montage', async () => {
    await monter(42);
    expect(Object.keys(localStorage).filter((k) => k.includes('pistes.'))).toEqual([]);
  });

  it('3. serveur sans les champs de #9362 : critères masqués, choix retenu sans effet', async () => {
    localStorage.setItem('tune_v2_ecran_v2.playlist.pistes.tri.local:42', 'composer');
    pistes = SANS_CHAMPS;
    let h = await monter(42);
    expect(options(h)).toEqual(['ordre', 'title', 'artist', 'album', 'year']);
    expect(select(h).value).toBe('ordre');
    expect(ordre(h)).toEqual(['Gnossienne', 'Clair de lune', 'Pavane']);
    // Le choix n'est pas effacé : il reprend quand le serveur porte le champ.
    expect(localStorage.getItem('tune_v2_ecran_v2.playlist.pistes.tri.local:42')).toBe('composer');
    pistes = AVEC_CHAMPS;
    h = await monter(42);
    expect(options(h)).toContain('composer');
    expect(options(h)).toContain('added');
    expect(options(h)).toContain('sample_rate');
    expect(select(h).value).toBe('composer');
  });

  it('4. le sens se retient avec le critère', async () => {
    let h = await monter(42);
    choisir(h, 'sample_rate');
    expect(ordre(h)).toEqual(['Gnossienne', 'Pavane', 'Clair de lune']);
    (h.querySelector('button[data-sens-pistes]') as HTMLButtonElement).click();
    flushSync();
    expect(ordre(h)).toEqual(['Clair de lune', 'Pavane', 'Gnossienne']);
    h = await monter(42);
    expect(ordre(h)).toEqual(['Clair de lune', 'Pavane', 'Gnossienne']);
  });
});
