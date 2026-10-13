// @vitest-environment jsdom
//
// #1470 — « # écoutes » et « Dernière écoute » TRIABLES depuis l'en-tête du
// tableau des Titres. Ces témoins lisent les requêtes émises (fetch simulé)
// et le DOM rendu, comme ceux de #1716.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import LibraryV2 from '../../components/v2/LibraryV2.svelte';
import { activeView } from '../stores/navigation';
import { albums as albumsStore, libraryFolderScope } from '../stores/library';
import { _remiseAZeroPourTests as remiseAlbums } from '../stores/albumsPagines';
import { _remiseAZeroPourTests as remisePistes } from '../stores/pistesEntieres';
import {
  _remiseAZeroPourTests as remisePagination, trierPistes, colonnesTriablesServeur, refusDuTriDesEcoutes,
  COLONNES_TRIABLES_NAVIGATEUR,
} from '../pistesPaginees';
import type { Album, Track } from '../types';
import lFr from '../locales/fr';

const fr = lFr as unknown as Record<string, string>;
vi.setConfig({ testTimeout: 30_000 });
const respirer = () => new Promise((r) => setTimeout(r, 0));

/** `nouveau` : le serveur pagine. `ecoutes` : il sait trier par écoutes. */
let nouveau = true;
let ecoutes = false;
let urls: string[] = [];
const N = 12;

// Piste k : écoutée (N - k) % 5 fois ; la dernière écoute suit k, sauf les
// pistes jamais écoutées.
const piste = (k: number): Track => {
  const n = (N - k) % 5;
  return {
    id: k + 1, title: `Piste ${String(k + 1).padStart(2, '0')}`, album_id: 1, artist_id: 1, artist_name: 'A',
    source: 'local', play_count: n,
    last_played_at: n ? new Date(Date.UTC(2026, 0, 1 + k)).toISOString() : null,
  } as unknown as Track;
};

function reponse(status: number, corps: unknown): Response {
  return { ok: status < 400, status, statusText: String(status), headers: new Map([['content-type', 'application/json']]),
    json: async () => corps, text: async () => JSON.stringify(corps), clone() { return this; } } as unknown as Response;
}

function repondre(u: string): Response {
  if (/\/library\/tracks\?/.test(u)) {
    const p = new URL(u, 'http://x').searchParams;
    const limit = Number(p.get('limit') ?? 50);
    const offset = Number(p.get('offset') ?? 0);
    let toutes = Array.from({ length: N }, (_, k) => piste(k));
    if (!nouveau) return reponse(200, { items: toutes.slice(offset, offset + limit), total: N, limit, offset });
    const sort = p.get('sort');
    if (sort === 'plays' || sort === 'lastPlayed') {
      if (!ecoutes) return reponse(400, { error: `parametre \`sort\` : colonne inconnue \`${sort}\`` });
      toutes = trierPistes(toutes, { cle: sort, sens: (p.get('order') as 'asc' | 'desc') ?? 'asc' }) as Track[];
    }
    return reponse(200, { items: toutes.slice(offset, offset + limit), total: N, limit, offset, sort, order: p.get('order') ?? 'asc' });
  }
  if (/\/library\/albums\?/.test(u)) return reponse(200, { items: [], total: 0 });
  if (/\/library\/artists/.test(u)) return reponse(200, []);
  if (/\/library\/stats/.test(u)) return reponse(200, { tracks: N });
  if (/\/zones|\/playlists/.test(u)) return reponse(200, []);
  return reponse(200, {});
}

beforeEach(() => {
  nouveau = true; ecoutes = false; urls = [];
  remiseAlbums(); remisePistes(); remisePagination();
  activeView.set('home');
  libraryFolderScope.set(null);
  localStorage.clear();
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal('WebSocket', class { close() {} addEventListener() {} removeEventListener() {} send() {} } as unknown as typeof WebSocket);
  vi.stubGlobal('fetch', vi.fn(async (url: any) => {
    const u = String(url);
    urls.push(u);
    for (let i = 0; i < 3; i++) await Promise.resolve();
    return repondre(u);
  }));
});

afterEach(() => {
  albumsStore.set([]);
  activeView.set('home');
  vi.unstubAllGlobals();
});

const requetesPistes = () => urls.filter((u) => /\/library\/tracks\?/.test(u)).map((u) => new URL(u, 'http://x').searchParams);
const titres = (l: readonly Track[]) => l.map((t) => t.title);

describe('#1470 — le tri des écoutes dans le navigateur', () => {
  it('# écoutes : 0 est un compte ; croissant puis décroissant, stable', () => {
    const l = Array.from({ length: N }, (_, k) => piste(k));
    const asc = trierPistes(l, { cle: 'plays', sens: 'asc' }).map((t) => (t as any).play_count);
    expect(asc).toEqual([...asc].sort((a, b) => a - b));
    expect(asc[0], 'les pistes jamais écoutées comptent 0 et viennent en tête du croissant').toBe(0);
    const desc = trierPistes(l, { cle: 'plays', sens: 'desc' }).map((t) => (t as any).play_count);
    expect(desc[0]).toBe(4);
    expect(desc.at(-1)).toBe(0);
  });

  it('Dernière écoute : par date, les jamais-écoutées en fin dans les deux sens', () => {
    const l = Array.from({ length: N }, (_, k) => piste(k));
    const jamais = l.filter((t) => !(t as any).last_played_at).map((t) => t.title);
    expect(jamais.length).toBeGreaterThan(0);
    for (const sens of ['asc', 'desc'] as const) {
      const r = titres(trierPistes(l, { cle: 'lastPlayed', sens }));
      expect(r.slice(-jamais.length).sort(), `vides en fin (${sens})`).toEqual([...jamais].sort());
    }
    const asc = trierPistes(l, { cle: 'lastPlayed', sens: 'asc' }).filter((t) => (t as any).last_played_at);
    const dates = asc.map((t) => Date.parse((t as any).last_played_at));
    expect(dates).toEqual([...dates].sort((a, b) => a - b));
  });

  it('un refus 400 d’un tri par écoutes est retenu ; tout autre échec non', () => {
    expect(colonnesTriablesServeur().has('plays')).toBe(true);
    expect(refusDuTriDesEcoutes({ status: 500 }, { cle: 'plays', sens: 'asc' })).toBe(false);
    expect(refusDuTriDesEcoutes({ status: 400 }, { cle: 'title', sens: 'asc' })).toBe(false);
    expect(colonnesTriablesServeur().has('plays')).toBe(true);
    expect(refusDuTriDesEcoutes({ status: 400 }, { cle: 'lastPlayed', sens: 'desc' })).toBe(true);
    expect(colonnesTriablesServeur().has('plays')).toBe(false);
    expect(colonnesTriablesServeur().has('title')).toBe(true);
    expect(COLONNES_TRIABLES_NAVIGATEUR.has('plays'), 'le navigateur, lui, sait toujours').toBe(true);
  });
});

describe('#1470 — l’onglet Titres, écran MONTÉ', () => {
  async function attendre(n = 20) { for (let i = 0; i < n; i++) { await respirer(); flushSync(); } }
  async function monter() {
    activeView.set('library');
    albumsStore.set([{ id: 1, title: 'Album', artist_id: 1, artist_name: 'A' }] as Album[]);
    const hote = document.createElement('div');
    document.body.appendChild(hote);
    const monte = mount(LibraryV2, { target: hote, props: {} as any });
    await attendre(10);
    const b = [...hote.querySelectorAll('button.tab')].find((x) => (x.textContent ?? '').trim() === fr['favorites.tracks']);
    expect(b, 'aucun onglet Titres').toBeTruthy();
    (b as HTMLElement).click();
    await attendre(30);
    return { hote, monte };
  }
  const bouton = (el: HTMLElement, cle: string) => el.querySelector<HTMLButtonElement>(`button.trier[data-tri="${cle}"]`);
  const premiere = (el: HTMLElement) => el.querySelector('.tracklist .trow')?.textContent ?? '';

  it('serveur qui sait : l’en-tête « # écoutes » trie par le serveur', async () => {
    ecoutes = true;
    const m = await monter();
    expect(bouton(m.hote, 'plays'), '« # écoutes » ne se trie pas').toBeTruthy();
    expect(bouton(m.hote, 'lastPlayed'), '« Dernière écoute » ne se trie pas').toBeTruthy();
    urls = [];
    bouton(m.hote, 'plays')!.click(); await attendre();
    bouton(m.hote, 'plays')!.click(); await attendre();
    const p = requetesPistes().at(-1)!;
    expect(p.get('sort')).toBe('plays');
    expect(p.get('order')).toBe('desc');
    // La plus écoutée (4 fois) est la piste 4 (k = 3), devant la 9 (stable).
    expect(premiere(m.hote)).toContain('Piste 04');
    unmount(m.monte); m.hote.remove();
  });

  it('serveur qui ne sait pas : le refus est dit, l’ordre par défaut revient, l’en-tête devient inerte', async () => {
    const m = await monter();
    urls = [];
    bouton(m.hote, 'plays')!.click();
    await attendre(40);
    const req = requetesPistes();
    expect(req[0]?.get('sort')).toBe('plays');
    expect(req.at(-1)?.get('sort'), 'l’ordre par défaut n’a pas été redemandé').toBeNull();
    expect(bouton(m.hote, 'plays'), 'l’en-tête propose encore un tri refusé').toBeNull();
    expect(bouton(m.hote, 'title'), 'les autres colonnes restent triables').toBeTruthy();
    expect(premiere(m.hote)).toContain('Piste 01');
    expect(m.hote.querySelector('.tracklist .state')?.textContent ?? '', 'l’échec ne doit pas rester affiché').not.toMatch(/inconnue|400/);
    unmount(m.monte); m.hote.remove();
  });

  it('serveur ancien (liste entière) : le navigateur trie par écoutes', async () => {
    nouveau = false;
    const m = await monter();
    bouton(m.hote, 'plays')!.click(); await attendre();
    bouton(m.hote, 'plays')!.click(); await attendre();
    expect(premiere(m.hote)).toContain('Piste 04');
    unmount(m.monte); m.hote.remove();
  });
});
