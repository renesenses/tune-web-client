// @vitest-environment jsdom
//
// #1716 — accélérer l'interface : la liste ENTIÈRE des pistes et les fiches
// d'album demandées pour rien.
//
// Mesuré dans un navigateur sans tête sur une base de test de 42 000 pistes
// (37 700 visibles, 3 770 albums) :
//
//  - onglet Titres : 19 pages de 2 000 demandées l'une après l'autre, 30,6 Mo,
//    17 s avant la première ligne ; et tout recommençait à chaque retour sur la
//    Bibliothèque ;
//  - grille d'albums : une fiche `GET /library/albums/{id}` par album affiché
//    sans pochette (100 au retour sur la grille, 528 pendant une recherche),
//    alors que la liste venait de dire `cover_path: null`.
//
// Ces témoins lisent les REQUÊTES émises (fetch simulé) et le DOM rendu ; aucun
// ne cherche une chaîne dans un fichier source.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import * as api from '../api';
import LibraryV2 from '../../components/v2/LibraryV2.svelte';
import { activeView } from '../stores/navigation';
import { albums as albumsStore, libraryFolderScope } from '../stores/library';
import { _remiseAZeroPourTests as remiseAlbums, invaliderBibliotheque } from '../stores/albumsPagines';
import { _remiseAZeroPourTests as remisePistes, demanderToutesLesPistes } from '../stores/pistesEntieres';
import type { Album } from '../types';
import lFr from '../locales/fr';

const fr = lFr as unknown as Record<string, string>;
vi.setConfig({ testTimeout: 30_000 });

const piste = (i: number) => ({ id: i + 1, title: `Piste ${i + 1}`, album_id: 1, artist_id: 1, artist_name: 'A' });

/** Le serveur simulé : `nbPistes` pistes, `total` rendu ou non, `limit` borné ou non. */
let nbPistes = 0;
let avecTotal = true;
let borneLimit: number | null = null;
/** Les requêtes de pistes, dans l'ordre d'émission, et le pic de simultanéité. */
let urls: string[] = [];
let enCours = 0;
let pic = 0;
/** Les signaux reçus par fetch, pour voir l'abandon. */
let signaux: (AbortSignal | undefined)[] = [];
/** Posée : chaque requête de pistes attend qu'on la dénoue. */
let verrou: Promise<void> | null = null;
let deverrouiller: () => void = () => {};

function poserVerrou() {
  verrou = new Promise<void>((r) => { deverrouiller = () => { verrou = null; r(); }; });
}

function corpsPour(u: string): unknown {
  const m = /\/library\/tracks\?limit=(\d+)&offset=(\d+)$/.exec(u);
  if (m) {
    const limit = Math.min(Number(m[1]), borneLimit ?? Infinity);
    const offset = Number(m[2]);
    const items = Array.from({ length: Math.max(0, Math.min(limit, nbPistes - offset)) }, (_, k) => piste(offset + k));
    return avecTotal ? { items, total: nbPistes, limit, offset } : items;
  }
  if (/\/library\/albums\?/.test(u)) {
    return { items: [{ id: 77, title: 'Sans pochette', cover_path: null }, { id: 78, title: 'Avec', cover_path: 'abc' }], total: 2 };
  }
  if (/\/library\/albums\/\d+$/.test(u)) return { id: Number(u.split('/').pop()), cover_path: null };
  if (/\/library\/artists/.test(u)) return [];
  if (/\/library\/stats/.test(u)) return { tracks: nbPistes };
  if (/\/zones|\/playlists/.test(u)) return [];
  return {};
}

beforeEach(() => {
  nbPistes = 0; avecTotal = true; borneLimit = null;
  urls = []; enCours = 0; pic = 0; signaux = []; verrou = null;
  remiseAlbums();
  remisePistes();
  activeView.set('home');
  libraryFolderScope.set(null);
  localStorage.clear();
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal('WebSocket', class { close() {} addEventListener() {} removeEventListener() {} send() {} } as unknown as typeof WebSocket);
  vi.stubGlobal('fetch', vi.fn(async (url: any, init?: RequestInit) => {
    const u = String(url);
    urls.push(u);
    const pistes = /\/library\/tracks\?/.test(u);
    if (pistes) { signaux.push(init?.signal ?? undefined); enCours++; pic = Math.max(pic, enCours); }
    try {
      for (let i = 0; i < 3; i++) await Promise.resolve();
      if (pistes && verrou) await verrou;
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

// Les pages de la liste ENTIÈRE. Celle que l'onglet Titres demande d'abord
// pour savoir si le serveur pagine (#1716, `order=`) n'en est pas une.
const pistesDemandees = () => urls.filter((u) => /\/library\/tracks\?limit=\d+&offset=\d+$/.test(u));
const offsets = () => pistesDemandees().map((u) => Number(/offset=(\d+)/.exec(u)![1]));

describe('#1716 — api.getAllTracks : grandes pages, deux à la fois, rien de perdu', () => {
  it('le total de la première page fait partir les suivantes DEUX par DEUX, dans l’ordre', async () => {
    nbPistes = 23_000;
    const toutes = await api.getAllTracks();
    expect(toutes).toHaveLength(23_000);
    expect(toutes.map((p) => p.id)).toEqual(Array.from({ length: 23_000 }, (_, i) => i + 1));
    expect(offsets()).toEqual([0, 5000, 10000, 15000, 20000]);
    expect(pistesDemandees().every((u) => /limit=5000/.test(u))).toBe(true);
    expect(pic, 'jamais plus de deux pages à la fois : une connexion de lecture reste libre').toBe(2);
  });

  it('un serveur qui borne `limit` : la page suit ce qu’il rend, aucune piste perdue', async () => {
    nbPistes = 4_500; borneLimit = 2_000;
    const toutes = await api.getAllTracks();
    expect(toutes).toHaveLength(4_500);
    expect(new Set(toutes.map((p) => p.id)).size).toBe(4_500);
  });

  it('un serveur sans `total` (tableau nu) : la boucle en série d’avant', async () => {
    nbPistes = 12_000; avecTotal = false;
    const toutes = await api.getAllTracks();
    expect(toutes).toHaveLength(12_000);
    expect(offsets()).toEqual([0, 5000, 10000]);
    expect(pic).toBe(1);
  });

  it('une bibliothèque sous une page : une seule requête', async () => {
    nbPistes = 120;
    expect(await api.getAllTracks()).toHaveLength(120);
    expect(offsets()).toEqual([0]);
  });
});

describe('#1716 — demanderToutesLesPistes : mémorisée, dédoublonnée, annulable', () => {
  it('deux appelants en même temps : un chargement ; un troisième après : aucune requête', async () => {
    nbPistes = 12_000;
    const [a, b] = await Promise.all([demanderToutesLesPistes(), demanderToutesLesPistes()]);
    expect(a).toHaveLength(12_000);
    expect(b).toBe(a);
    const n = pistesDemandees().length;
    expect(n).toBe(3);
    await demanderToutesLesPistes();
    expect(pistesDemandees().length, 'la liste était là : rien à redemander').toBe(n);
  });

  it('un scan (invalidation) rend la liste à refaire — et rien ne part de lui-même', async () => {
    nbPistes = 100;
    await demanderToutesLesPistes();
    invaliderBibliotheque();
    for (let i = 0; i < 5; i++) await Promise.resolve();
    expect(pistesDemandees()).toHaveLength(1);
    nbPistes = 150;
    expect(await demanderToutesLesPistes()).toHaveLength(150);
    expect(pistesDemandees()).toHaveLength(2);
  });

  it('un appelant qui abandonne n’arrête pas le chargement d’un autre ; le dernier l’arrête', async () => {
    nbPistes = 12_000;
    poserVerrou();
    const c1 = new AbortController();
    const p1 = demanderToutesLesPistes(c1.signal);
    const p2 = demanderToutesLesPistes();
    c1.abort();
    await expect(p1).rejects.toMatchObject({ name: 'AbortError' });
    deverrouiller();
    expect(await p2).toHaveLength(12_000);

    remisePistes(); urls = []; signaux = [];
    poserVerrou();
    const c3 = new AbortController();
    const c4 = new AbortController();
    const p3 = demanderToutesLesPistes(c3.signal);
    const p4 = demanderToutesLesPistes(c4.signal);
    for (let i = 0; i < 5; i++) await Promise.resolve();
    c3.abort();
    expect(signaux[0]?.aborted, 'un appelant attend encore').toBe(false);
    c4.abort();
    expect(signaux[0]?.aborted, 'plus personne n’attend : la requête est abandonnée').toBe(true);
    await expect(p3).rejects.toMatchObject({ name: 'AbortError' });
    await expect(p4).rejects.toMatchObject({ name: 'AbortError' });
    deverrouiller();
    // Abandonné, le chargement n'a rien mémorisé : la demande suivante repart.
    nbPistes = 10;
    expect(await demanderToutesLesPistes()).toHaveLength(10);
  });
});

describe('#1716 — les pochettes que la liste a déjà dites', () => {
  it('une page d’albums amorce le cache : AlbumArt ne redemande pas la fiche', async () => {
    await api.getAlbumsPagines({ limit: 100, offset: 0 });
    urls = [];
    expect(await api.getAlbumCoverPath(77)).toBeNull();
    expect(await api.getAlbumCoverPath(78)).toBe('abc');
    expect(urls.filter((u) => /\/library\/albums\/\d+$/.test(u)), 'aucune fiche redemandée').toEqual([]);
    // Contre-épreuve du dispositif : un album que la liste n'a pas dit se
    // demande bien, lui.
    expect(await api.getAlbumCoverPath(4242)).toBeNull();
    expect(urls.filter((u) => /\/library\/albums\/4242$/.test(u))).toHaveLength(1);
  });
});

describe('#1716 — l’onglet Titres, écran MONTÉ', () => {
  const respirer = () => new Promise((r) => setTimeout(r, 0));
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
  async function ouvrirTitres(el: HTMLElement) {
    const b = [...el.querySelectorAll('button.tab')].find((x) => (x.textContent ?? '').trim() === fr['favorites.tracks']);
    expect(b, 'aucun onglet Titres').toBeTruthy();
    (b as HTMLElement).click();
    for (let i = 0; i < 20; i++) await respirer();
    flushSync();
  }
  function demonter(m: { hote: HTMLDivElement; monte: Record<string, unknown> }) {
    unmount(m.monte);
    m.hote.remove();
  }

  it('revenir à la Bibliothèque ne recharge pas toutes les pistes', async () => {
    nbPistes = 12;
    const m1 = await monter();
    await ouvrirTitres(m1.hote);
    expect(m1.hote.querySelector('.tracklist')?.textContent).toContain('Piste 12');
    demonter(m1);
    const avant = pistesDemandees().length;
    expect(avant).toBe(1);

    const m2 = await monter();
    await ouvrirTitres(m2.hote);
    expect(m2.hote.querySelector('.tracklist')?.textContent, 'la liste mémorisée s’affiche').toContain('Piste 12');
    expect(pistesDemandees().length, 'toute la bibliothèque redemandée au retour').toBe(avant);
    demonter(m2);
  });

  it('quitter la Bibliothèque pendant le chargement l’abandonne', async () => {
    nbPistes = 12;
    poserVerrou();
    const m = await monter();
    await ouvrirTitres(m.hote);
    expect(signaux.length).toBeGreaterThan(0);
    expect(signaux[0], 'la requête de pistes ne porte aucun signal').toBeDefined();
    demonter(m);
    expect(signaux[0]?.aborted, 'la requête continue après la sortie de l’écran').toBe(true);
    deverrouiller();
  });
});
