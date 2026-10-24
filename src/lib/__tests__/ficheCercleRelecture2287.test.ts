// @vitest-environment jsdom
//
// jsdom : sans `window`, `$effect` ne se déclenche pas et la fiche ne lirait
// jamais le greffon — un test vert qui n'aurait rien exécuté.
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import PlaylistCercleV2 from '../../components/v2/PlaylistCercleV2.svelte';
import { preparerLocale } from '../i18n';
import { RELECTURE_CERCLE_MS } from '../circle';
import { issueRelecture, type PlaylistCercle } from '../circlePlaylists';

/**
 * web#2287 (part web de renesenses/tune-server-rust#6688) — la fiche OUVERTE
 * d'une playlist de cercle ne se relisait jamais : un seul `charger()` à
 * l'ouverture. Ce qu'un autre membre (ou le suivi de la playlist d'origine)
 * écrivait n'apparaissait qu'après un geste (409) ou une réouverture.
 *
 * Le faux greffon porte un état et une version, comme le cloud.
 */

type Item = { item_id: string; title: string };
type Pl = { id: string; name: string; version: number; mine: boolean; items: Item[] };

let pl: Pl;
let appels: { url: string; method: string }[] = [];
/** Une écriture retenue : le geste reste « en cours » tant qu'on ne la libère pas. */
let retenue: { liberer: () => void } | null = null;
let retenir = false;

function reponse(status: number, corps: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: String(status),
    headers: new Headers({ 'content-type': 'application/json' }),
    json: async () => corps,
    text: async () => JSON.stringify(corps),
  } as unknown as Response;
}
const vue = () => JSON.parse(JSON.stringify(pl));

async function greffon(u: string, method: string): Promise<Response> {
  const chemin = u.split('?')[0].replace(/^.*\/api\/v1\/ext\/circle/, '');
  if (chemin === `/playlists/${pl.id}` && method === 'GET') return reponse(200, vue());
  if (chemin === `/playlists/${pl.id}/resolve` && method === 'POST') {
    return reponse(200, pl.items.map((x) => ({ item_id: x.item_id, status: 'not_found' })));
  }
  const m = chemin.match(/^\/playlists\/[^/]+\/items\/([^/]+)$/);
  if (m && method === 'DELETE') {
    if (retenir) await new Promise<void>((r) => { retenue = { liberer: r }; });
    pl.items = pl.items.filter((x) => x.item_id !== decodeURIComponent(m[1]));
    pl.version++;
    return reponse(200, vue());
  }
  return reponse(404, { error: 'not_found' });
}

/** Un autre membre écrit au cloud, hors de cet écran. */
function unAutreMembreAjoute(titre: string) {
  pl.items.push({ item_id: `it-${pl.items.length + 10}`, title: titre });
  pl.version++;
}

const lectures = () => appels.filter((a) => a.method === 'GET' && /\/ext\/circle\/playlists\/pl-a$/.test(a.url)).length;
const resolutions = () => appels.filter((a) => /\/resolve$/.test(a.url)).length;

let hote: HTMLDivElement | null = null;
let monte: Record<string, unknown> | null = null;
let cache = false;

beforeAll(async () => { await preparerLocale('fr'); });

beforeEach(() => {
  vi.useFakeTimers();
  appels = [];
  retenue = null;
  retenir = false;
  cache = false;
  pl = { id: 'pl-a', name: 'Dimanche', version: 3, mine: false, items: [
    { item_id: 'it-1', title: 'So What' },
    { item_id: 'it-2', title: 'Blue in Green' },
  ] };
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => cache });
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const u = String(url);
    const method = (init?.method ?? 'GET').toUpperCase();
    appels.push({ url: u, method });
    if (u.includes('/ext/circle')) return greffon(u, method);
    return reponse(200, {});
  }));
});

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  hote?.remove();
  hote = null;
  vi.unstubAllGlobals();
  vi.useRealTimers();
  delete (document as any).hidden;
});

async function laisserFaire() {
  for (let i = 0; i < 12; i++) {
    await vi.advanceTimersByTimeAsync(0);
    flushSync();
  }
}

async function ouvrirFiche(): Promise<HTMLDivElement> {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(PlaylistCercleV2, { target: hote, props: { id: 'pl-a', onFermer: () => {} } });
  flushSync();
  await laisserFaire();
  return hote;
}

async function attendre(ms: number) {
  await vi.advanceTimersByTimeAsync(ms);
  await laisserFaire();
}

const titres = (el: Element) => [...el.querySelectorAll('li.morceau .titre-morceau')].map((n) => (n.textContent ?? '').trim());
const nom = (el: Element) => (el.querySelector('.nom-playlist')?.textContent ?? '').trim();

describe('web#2287 — la fiche ouverte d’une playlist de cercle se relit', () => {
  it('un ajout d’un autre membre apparaît sans réouverture, et la résolution est refaite', async () => {
    const el = await ouvrirFiche();
    expect(titres(el)).toEqual(['So What', 'Blue in Green']);
    const resAvant = resolutions();

    unAutreMembreAjoute('Naima');
    await attendre(RELECTURE_CERCLE_MS);

    expect(titres(el), 'l’ajout de l’autre membre doit apparaître dans la fiche restée ouverte').toEqual(['So What', 'Blue in Green', 'Naima']);
    expect(resolutions()).toBe(resAvant + 1);
  });

  it('même version : rien ne bouge, ni l’écran ni la résolution', async () => {
    const el = await ouvrirFiche();
    const resAvant = resolutions();
    // Le cloud rend des morceaux différents sous la MÊME version : la fiche
    // ne doit pas les prendre (seule la version dit qu'il y a du neuf).
    pl.items = [{ item_id: 'it-9', title: 'Intrus' }];
    await attendre(RELECTURE_CERCLE_MS);

    expect(lectures()).toBeGreaterThanOrEqual(2);
    expect(titres(el)).toEqual(['So What', 'Blue in Green']);
    expect(resolutions()).toBe(resAvant);
  });

  it('un renommage (version neuve, mêmes morceaux) remplace l’écran sans refaire la résolution', async () => {
    const el = await ouvrirFiche();
    const resAvant = resolutions();
    pl.name = 'Dimanche matin';
    pl.version++;
    await attendre(RELECTURE_CERCLE_MS);

    expect(nom(el)).toBe('Dimanche matin');
    expect(resolutions()).toBe(resAvant);
  });

  it('pendant un geste en cours, la relecture ne s’applique pas', async () => {
    const el = await ouvrirFiche();
    retenir = true;
    (el.querySelector('li.morceau button.menu-morceau') as HTMLButtonElement).click();
    await laisserFaire();
    (el.querySelector('li.morceau .retirer-morceau') as HTMLButtonElement).click();
    await laisserFaire();
    expect(retenue, 'le retrait doit être parti et retenu').not.toBeNull();

    const avant = lectures();
    unAutreMembreAjoute('Naima');
    await attendre(RELECTURE_CERCLE_MS);
    expect(lectures(), 'aucune relecture pendant le geste').toBe(avant);
    expect(titres(el)).toEqual(['So What', 'Blue in Green']);

    retenue!.liberer();
    await laisserFaire();
    // Le geste rend l'état du cloud, ajout de l'autre membre compris.
    expect(titres(el)).toEqual(['Blue in Green', 'Naima']);
  });

  it('onglet caché : aucune relecture ; au retour de l’onglet, relecture immédiate', async () => {
    const el = await ouvrirFiche();
    cache = true;
    const avant = lectures();
    unAutreMembreAjoute('Naima');
    await attendre(RELECTURE_CERCLE_MS * 2);
    expect(lectures()).toBe(avant);
    expect(titres(el)).toEqual(['So What', 'Blue in Green']);

    cache = false;
    document.dispatchEvent(new Event('visibilitychange'));
    await laisserFaire();
    expect(titres(el)).toEqual(['So What', 'Blue in Green', 'Naima']);
  });

  it('la fiche fermée, le minuteur s’arrête', async () => {
    await ouvrirFiche();
    unmount(monte!);
    monte = null;
    const avant = lectures();
    await attendre(RELECTURE_CERCLE_MS * 3);
    document.dispatchEvent(new Event('visibilitychange'));
    await laisserFaire();
    expect(lectures()).toBe(avant);
  });
});

describe('web#2287 — issueRelecture', () => {
  const p = (version: number, ids: string[], name = 'P'): PlaylistCercle => ({
    id: 'x', name, version, mine: false, items: ids.map((i) => ({ item_id: i, title: i }) as any),
  });
  it('même version : ni remplacement ni résolution', () => {
    expect(issueRelecture(p(3, ['a', 'b']), p(3, ['c']))).toEqual({ remplacer: false, resoudre: false });
  });
  it('version neuve, mêmes item_id (réordonnés) : remplacement sans résolution', () => {
    expect(issueRelecture(p(3, ['a', 'b']), p(4, ['b', 'a']))).toEqual({ remplacer: true, resoudre: false });
  });
  it('version neuve, item_id changés : remplacement et résolution', () => {
    expect(issueRelecture(p(3, ['a', 'b']), p(4, ['a', 'b', 'c']))).toEqual({ remplacer: true, resoudre: true });
  });
});
