// @vitest-environment jsdom
//
// #1716, suite de web#2001 — l'onglet Titres PAR PAGES servies par le serveur.
//
// Après web#2001, l'onglet s'affichait en 6 s la première fois et 1,7 s au
// retour sur la base de mesure (37 700 pistes visibles) : le navigateur
// tenait la liste ENTIÈRE, la pliait à chaque frappe, la comptait par source
// et la coupait à 500 lignes. Ces témoins lisent les REQUÊTES émises (fetch
// simulé) et le DOM rendu ; aucun ne cherche une chaîne dans un fichier source.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import * as api from '../api';
import LibraryV2 from '../../components/v2/LibraryV2.svelte';
import { activeView } from '../stores/navigation';
import { albums as albumsStore, libraryFolderScope } from '../stores/library';
import { _remiseAZeroPourTests as remiseAlbums } from '../stores/albumsPagines';
import { _remiseAZeroPourTests as remisePistes } from '../stores/pistesEntieres';
import {
  FenetrePistes, _remiseAZeroPourTests as remisePagination, capaciteDuServeur, triSuivant, trierPistes,
  type ChargeurDePage,
} from '../pistesPaginees';
import type { Album, Track } from '../types';
import lFr from '../locales/fr';

const fr = lFr as unknown as Record<string, string>;
vi.setConfig({ testTimeout: 30_000 });

const respirer = () => new Promise((r) => setTimeout(r, 0));

// ── Le serveur simulé ─────────────────────────────────────────────────────
//
// `nouveau` : il sait paginer — il lit `sort`, `order`, `search`,
// `provenance`, `counts` et rend `order` dans la réponse. Sinon il les
// ignore, comme un serveur d'avant #1716.
let nouveau = true;
let nbPistes = 0;
let urls: string[] = [];
let enCours = 0;
let pic = 0;

const piste = (i: number): Track => ({
  id: i + 1,
  title: i % 10 === 0 ? `Azur ${i + 1}` : `Piste ${String(i + 1).padStart(6, '0')}`,
  album_id: 1, artist_id: 1, artist_name: 'A',
  source: i % 3 === 0 ? 'upnp' : 'local',
  source_id: i % 3 === 0 ? `uuid-x|${i}` : null,
} as unknown as Track);

function corpsPour(u: string): unknown {
  if (/\/library\/tracks\?/.test(u)) {
    const p = new URL(u, 'http://x').searchParams;
    const limit = Number(p.get('limit') ?? 50);
    const offset = Number(p.get('offset') ?? 0);
    let toutes = Array.from({ length: nbPistes }, (_, k) => piste(k));
    if (!nouveau) {
      return { items: toutes.slice(offset, offset + limit), total: nbPistes, limit, offset };
    }
    const search = (p.get('search') ?? '').toLowerCase();
    if (search) toutes = toutes.filter((t) => t.title.toLowerCase().includes(search));
    const avant = toutes;
    const prov = p.get('provenance');
    if (prov) toutes = toutes.filter((t) => (prov === 'upnp' ? t.source === 'upnp' : prov === 'local' ? t.source === 'local' : false));
    if (p.get('sort') === 'title') {
      toutes = [...toutes].sort((a, b) => (a.title < b.title ? -1 : 1));
      if (p.get('order') === 'desc') toutes.reverse();
    }
    const corps: Record<string, unknown> = {
      items: toutes.slice(offset, offset + limit), total: toutes.length, limit, offset,
      sort: p.get('sort'), order: p.get('order') ?? 'asc',
    };
    if (p.get('counts') === 'sources') {
      const upnp = avant.filter((t) => t.source === 'upnp').length;
      corps.source_counts = { local: avant.length - upnp, upnp, 'upnp:uuid-x': upnp };
      corps.total_all_sources = avant.length;
    }
    return corps;
  }
  if (/\/library\/albums\?/.test(u)) return { items: [], total: 0 };
  if (/\/library\/artists/.test(u)) return [];
  if (/\/library\/stats/.test(u)) return { tracks: nbPistes };
  if (/\/zones|\/playlists/.test(u)) return [];
  return {};
}

beforeEach(() => {
  nouveau = true; nbPistes = 0; urls = []; enCours = 0; pic = 0;
  remiseAlbums();
  remisePistes();
  remisePagination();
  activeView.set('home');
  libraryFolderScope.set(null);
  localStorage.clear();
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal('WebSocket', class { close() {} addEventListener() {} removeEventListener() {} send() {} } as unknown as typeof WebSocket);
  vi.stubGlobal('fetch', vi.fn(async (url: any, init?: RequestInit) => {
    const u = String(url);
    urls.push(u);
    const pistes = /\/library\/tracks\?/.test(u);
    if (pistes) { enCours++; pic = Math.max(pic, enCours); }
    try {
      for (let i = 0; i < 3; i++) await Promise.resolve();
      if (init?.signal?.aborted) { const e = new Error('Aborted'); e.name = 'AbortError'; throw e; }
      const corps = corpsPour(u);
      return { ok: true, status: 200, statusText: 'OK', headers: new Map([['content-type', 'application/json']]),
        json: async () => corps, text: async () => JSON.stringify(corps) } as unknown as Response;
    } finally {
      if (pistes) enCours--;
    }
  }));
});

afterEach(() => {
  albumsStore.set([]);
  libraryFolderScope.set(null);
  activeView.set('home');
  vi.unstubAllGlobals();
});

const requetesPistes = () => urls.filter((u) => /\/library\/tracks\?/.test(u)).map((u) => new URL(u, 'http://x').searchParams);

describe('#1716 — api.getPagePistes', () => {
  it('envoie tri, recherche, provenance et comptes, et lit la réponse', async () => {
    nbPistes = 30;
    const page = await api.getPagePistes({ search: ' azur ', provenance: 'local', sort: 'title', order: 'desc', limit: 5, offset: 0, counts: true });
    const p = requetesPistes()[0];
    expect(p.get('sort')).toBe('title');
    expect(p.get('order')).toBe('desc');
    expect(p.get('search'), 'la saisie part sans ses blancs').toBe('azur');
    expect(p.get('provenance')).toBe('local');
    expect(p.get('counts')).toBe('sources');
    expect(page?.total).toBe(2);
    expect(page?.comptes?.get('upnp')).toBe(1);
    expect(page?.totalToutesSources).toBe(3);
  });

  it('rend null face à un serveur qui ne pagine pas', async () => {
    nouveau = false;
    nbPistes = 30;
    expect(await api.getPagePistes({ sort: 'title', limit: 5, offset: 0 })).toBeNull();
  });
});

describe('#1716 — FenetrePistes', () => {
  function chargeur(total: number) {
    const appels: { offset: number; comptes: boolean }[] = [];
    let enVol = 0;
    let picVol = 0;
    const dénouer: (() => void)[] = [];
    const f: ChargeurDePage = async ({ offset, limit, comptes }) => {
      appels.push({ offset, comptes });
      enVol++; picVol = Math.max(picVol, enVol);
      await new Promise<void>((r) => dénouer.push(r));
      enVol--;
      const items = Array.from({ length: Math.max(0, Math.min(limit, total - offset)) }, (_, k) => piste(offset + k));
      return { items, total, comptes: comptes ? new Map([['local', total]]) : null, totalToutesSources: comptes ? total : null };
    };
    const toutDenouer = async () => { while (dénouer.length) { dénouer.shift()!(); await respirer(); } };
    return { f, appels, pic: () => picVol, toutDenouer };
  }

  it('la première page porte les comptes ; les suivantes, deux à la fois, seulement celles du cadre', async () => {
    const c = chargeur(10_000);
    const fen = new FenetrePistes(c.f, () => {}, 100);
    const d = fen.demarrer();
    await c.toutDenouer();
    expect(await d).toBe('serveur');
    expect(c.appels).toEqual([{ offset: 0, comptes: true }]);
    expect(fen.total).toBe(10_000);
    expect(capaciteDuServeur()).toBe('serveur');

    fen.assurer(5_000, 5_450);
    await respirer();
    expect(c.pic(), 'jamais plus de deux pages en vol').toBeLessThanOrEqual(2);
    await c.toutDenouer();
    expect(c.appels.slice(1).map((a) => a.offset), 'seulement les pages du cadre').toEqual([5_000, 5_100, 5_200, 5_300, 5_400]);
    expect(c.appels.slice(1).every((a) => !a.comptes), 'les comptes ne sont demandés qu’une fois').toBe(true);
    expect(fen.contigues(5_000, 5_450).map((t) => t.id)).toEqual(Array.from({ length: 450 }, (_, k) => 5_001 + k));
    // Une fenêtre qui a bougé oublie les pages qu'elle n'attend plus.
    fen.assurer(9_000, 9_050);
    fen.assurer(0, 50);
    await c.toutDenouer();
    expect(c.appels.slice(6).map((a) => a.offset)).toEqual([9_000]);
  });

  it('des comptes encore valables ne sont pas redemandés', async () => {
    const c = chargeur(300);
    const connus = { comptes: new Map([['local', 7]]), totalToutesSources: 7 };
    const fen = new FenetrePistes(c.f, () => {}, 100, 2, connus);
    const d = fen.demarrer();
    await c.toutDenouer();
    await d;
    expect(c.appels).toEqual([{ offset: 0, comptes: false }]);
    expect(fen.comptes?.get('local')).toBe(7);
    expect(fen.total).toBe(300);
  });

  it('s’arrête au premier trou et s’abandonne', async () => {
    const c = chargeur(1_000);
    const fen = new FenetrePistes(c.f, () => {}, 100);
    const d = fen.demarrer();
    await c.toutDenouer();
    await d;
    expect(fen.contigues(50, 250)).toHaveLength(50);
    fen.abandonner();
    fen.assurer(100, 300);
    await c.toutDenouer();
    expect(c.appels, 'abandonnée, la fenêtre ne demande plus rien').toHaveLength(1);
  });
});

describe('#1716 — le tri du repli suit la règle du serveur', () => {
  const p = (title: string, duration_ms: number | null) => ({ title, duration_ms }) as unknown as Track;
  it('texte plié, vide en fin de liste dans les deux sens, stable', () => {
    const l = [p('Zèbre', 3), p('été', null), p('Abri', 0), p('Éclat', 2), p('', 1)];
    expect(trierPistes(l, { cle: 'title', sens: 'asc' }).map((t) => t.title)).toEqual(['Abri', 'Éclat', 'été', 'Zèbre', '']);
    expect(trierPistes(l, { cle: 'title', sens: 'desc' }).map((t) => t.title)).toEqual(['Zèbre', 'été', 'Éclat', 'Abri', '']);
    // Durée : 0 et null sont des cellules vides.
    expect(trierPistes(l, { cle: 'time', sens: 'desc' }).map((t) => t.title)).toEqual(['Zèbre', 'Éclat', '', 'été', 'Abri']);
    expect(trierPistes(l, null)).toBe(l);
  });
  it('un clic croissant, un second décroissant, un troisième rend l’ordre par défaut', () => {
    const a = triSuivant(null, 'title');
    expect(a).toEqual({ cle: 'title', sens: 'asc' });
    const b = triSuivant(a, 'title');
    expect(b).toEqual({ cle: 'title', sens: 'desc' });
    expect(triSuivant(b, 'title')).toBeNull();
    expect(triSuivant(b, 'artist')).toEqual({ cle: 'artist', sens: 'asc' });
  });
});

describe('#1716 — l’onglet Titres paginé, écran MONTÉ', () => {
  async function monter() {
    activeView.set('library');
    albumsStore.set([{ id: 1, title: 'Album', artist_id: 1, artist_name: 'A' }] as Album[]);
    const hote = document.createElement('div');
    document.body.appendChild(hote);
    const monte = mount(LibraryV2, { target: hote, props: {} as any });
    for (let i = 0; i < 10; i++) await respirer();
    flushSync();
    return { hote, monte };
  }
  async function attendre(n = 20) {
    for (let i = 0; i < n; i++) { await respirer(); flushSync(); }
  }
  async function ouvrirTitres(el: HTMLElement) {
    const b = [...el.querySelectorAll('button.tab')].find((x) => (x.textContent ?? '').trim() === fr['favorites.tracks']);
    expect(b, 'aucun onglet Titres').toBeTruthy();
    (b as HTMLElement).click();
    await attendre(30);
  }
  const lignes = (el: HTMLElement) => el.querySelectorAll('.tracklist .trow');

  it('ne charge ni ne rend la liste entière, et l’ascenseur la mesure', async () => {
    nbPistes = 37_700;
    const m = await monter();
    await ouvrirTitres(m.hote);
    const req = requetesPistes();
    expect(req.length, 'quelques pages, pas la bibliothèque').toBeLessThanOrEqual(3);
    expect(req.every((p) => Number(p.get('limit')) <= 200)).toBe(true);
    expect(req.some((p) => Number(p.get('limit')) >= 5000), 'la liste entière a été demandée').toBe(false);
    const n = lignes(m.hote).length;
    expect(n).toBeGreaterThan(0);
    expect(n, 'seule la fenêtre est rendue').toBeLessThan(200);
    const apres = m.hote.querySelector<HTMLElement>('[data-espace="apres"]');
    expect(parseFloat(apres?.style.height ?? '0'), 'l’intercalaire porte les lignes non rendues').toBeGreaterThan(30_000 * 40);
    expect(m.hote.querySelector('.tracklist .state'), 'plus de « 500 sur 37 700 » : tout est atteignable').toBeNull();
    unmount(m.monte); m.hote.remove();
  });

  it('l’en-tête trie par le SERVEUR, dans un sens puis dans l’autre', async () => {
    nbPistes = 500;
    const m = await monter();
    await ouvrirTitres(m.hote);
    const bouton = () => m.hote.querySelector<HTMLButtonElement>('button.trier[data-tri="title"]');
    expect(bouton(), 'la colonne Titre ne se trie pas').toBeTruthy();
    urls = [];
    bouton()!.click();
    await attendre();
    expect(requetesPistes()[0]?.get('sort')).toBe('title');
    expect(requetesPistes()[0]?.get('order')).toBe('asc');
    expect(requetesPistes()[0]?.get('counts'), 'un tri ne recompte pas les sources').toBeNull();
    expect(m.hote.querySelector('.tracklist .trow')?.textContent).toContain('Azur 1');
    expect(bouton()!.closest('[role="columnheader"]')?.getAttribute('aria-sort')).toBe('ascending');
    urls = [];
    bouton()!.click();
    await attendre();
    expect(requetesPistes()[0]?.get('order')).toBe('desc');
    expect(m.hote.querySelector('.tracklist .trow')?.textContent).toContain('Piste 000500');
    unmount(m.monte); m.hote.remove();
  });

  it('la recherche et la provenance partent au serveur, et les comptes en reviennent', async () => {
    nbPistes = 600;
    const m = await monter();
    await ouvrirTitres(m.hote);
    const champ = m.hote.querySelector<HTMLInputElement>('.v2-rech input')!;
    urls = [];
    champ.value = 'azur';
    champ.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 300));
    await attendre();
    const p = requetesPistes().at(-1)!;
    expect(p.get('search')).toBe('azur');
    expect(p.get('counts')).toBe('sources');
    expect(m.hote.querySelector('.filters .chip.count')?.textContent).toContain('60');
    // Le menu Source affiche les comptes du serveur.
    const menu = m.hote.querySelector('.drop .menu')!;
    expect(menu.textContent).toContain('60');
    expect(menu.textContent).toContain('20');
    const upnp = [...menu.querySelectorAll('button')].find((b) => /UPNP|uuid/i.test(b.textContent ?? '')) as HTMLElement | undefined;
    expect(upnp, 'aucun choix UPnP dans le menu Source').toBeTruthy();
    urls = [];
    upnp!.click();
    await attendre();
    expect(requetesPistes().at(-1)?.get('provenance')).toMatch(/^upnp/);
    unmount(m.monte); m.hote.remove();
  });

  it('face à un serveur ancien, retombe sur la liste entière (web#2001)', async () => {
    nouveau = false;
    nbPistes = 120;
    const m = await monter();
    await ouvrirTitres(m.hote);
    expect(capaciteDuServeur()).toBe('ancien');
    expect(requetesPistes().some((p) => Number(p.get('limit')) === 5000), 'la liste entière n’a pas été demandée').toBe(true);
    expect(m.hote.querySelector('.tracklist')?.textContent).toContain('Piste 000120');
    // Le tri se fait alors dans le navigateur.
    m.hote.querySelector<HTMLButtonElement>('button.trier[data-tri="title"]')!.click();
    await attendre();
    expect(m.hote.querySelector('.tracklist .trow')?.textContent).toContain('Azur 1');
    unmount(m.monte); m.hote.remove();
  });
});
