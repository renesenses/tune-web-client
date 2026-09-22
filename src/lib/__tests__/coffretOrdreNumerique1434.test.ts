// @vitest-environment jsdom
//
// #1434 — « sur les coffrets Radio Nova, l'affichage met le CD 10 avant le
// CD 2 » (Bertrand, recette de la 0.9.161).
//
// Les disques d'un coffret éclaté ne diffèrent QUE par leur numéro :
// « Radio Nova - La boîte Bleue, Disc 10 », « …, Disc 2 ». Un `localeCompare`
// nu les range en TEXTE (`"10" < "2"`). Ce témoin monte l'écran où l'on
// compose un coffret, tape la recherche, et lit l'ordre des lignes RENDUES —
// pas la source.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import { readFileSync } from 'node:fs';
import MetadataV2 from '../../components/v2/MetadataV2.svelte';
import { trierAlbumsParAnnee } from '../trierAlbums';
import { albumsAvecManque } from '../manquesAlbums';
import { ordreNaturel } from '../ordreNaturel';
import type { Album } from '../types';

const DELAI_MONTAGE = 60_000;
const T = 'Radio Nova - La boîte Bleue, Disc';

/** Volontairement dans le désordre : l'écran doit trier, pas recopier. */
const ALBUMS = [10, 2, 1, 11, 3].map((n) => ({
  album_id: 100 + n, title: `${T} ${n}`, album_artist: 'Various Artists',
  track_count: 10, cover_path: null, is_compilation: false,
}));
const ATTENDU = [1, 2, 3, 10, 11].map((n) => `${T} ${n}`);

function reponse(url: string): Response {
  const corps = String(url).includes('/library/albums')
    ? { items: ALBUMS, total: ALBUMS.length }
    : {};
  return {
    ok: true, status: 200, statusText: 'OK',
    headers: new Map([['content-type', 'application/json']]),
    json: async () => corps,
    text: async () => JSON.stringify(corps),
  } as unknown as Response;
}

let hote: HTMLDivElement | null = null;
let monte: Record<string, any> | null = null;
const attendre = (ms = 60) => new Promise((r) => setTimeout(r, ms));

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => reponse(url)));
  vi.stubGlobal('WebSocket', class {
    close() {} addEventListener() {} removeEventListener() {} send() {}
  } as unknown as typeof WebSocket);
});

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  if (hote) hote.remove();
  hote = null;
  vi.unstubAllGlobals();
});

async function lignesDeLOnglet(motif: RegExp, classe: string): Promise<string[]> {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(MetadataV2 as any, { target: hote, props: {} as any });
  flushSync();
  await attendre();
  const onglet = [...hote.querySelectorAll('nav.tabs button')]
    .find((b) => motif.test(b.textContent ?? '')) as HTMLButtonElement | undefined;
  expect(onglet, `aucun onglet ${motif} dans la barre`).toBeDefined();
  onglet!.click();
  flushSync();
  await attendre();
  const champ = hote.querySelector<HTMLInputElement>('input.cpq');
  expect(champ, 'pas de champ de recherche dans l’onglet').not.toBeNull();
  champ!.value = 'Nova';
  champ!.dispatchEvent(new Event('input', { bubbles: true }));
  flushSync();
  await attendre();
  return [...hote.querySelectorAll(`${classe} .pt`)].map((s) => s.textContent?.trim() ?? '');
}

describe('#1434 — le Disc 10 ne passe plus avant le Disc 2', () => {
  it('🔴 onglet Coffrets : les disques dans l’ordre des NOMBRES', { timeout: DELAI_MONTAGE }, async () => {
    const titres = await lignesDeLOnglet(/coffret/i, 'label.cprow');
    expect(titres).toEqual(ATTENDU);
  });

  it('tri par année : deux albums de la même année départagés par nombre', () => {
    const a = ALBUMS.map((x) => ({ id: x.album_id, title: x.title, year: 2008 }) as unknown as Album);
    expect(trierAlbumsParAnnee(a, 'asc').map((x) => x.title)).toEqual(ATTENDU);
  });

  it('manques : à pistes égales, le titre départage par nombre', () => {
    const a = ALBUMS.map((x) => ({
      id: x.album_id, title: x.title, track_count: 10, source: 'local', genre: null,
    }) as unknown as Album);
    expect(albumsAvecManque(a, 'genre' as any).map((x) => x.title)).toEqual(ATTENDU);
  });

  it('l’ordre naturel ne change rien d’autre qu’un nombre', () => {
    expect(ordreNaturel('Disc 2', 'Disc 10')).toBeLessThan(0);
    expect(ordreNaturel('abc', 'abd')).toBe('abc'.localeCompare('abd'));
    expect(ordreNaturel(null, 'a')).toBeLessThan(0);
  });

  it('la Bibliothèque et les Compilations trient leurs titres par le même ordre', () => {
    const lib = readFileSync('src/components/v2/LibraryV2.svelte', 'utf8');
    expect(lib).toMatch(/const byTitle = \(a: Album, b: Album\) => ordreNaturel\(/);
    const meta = readFileSync('src/components/v2/MetadataV2.svelte', 'utf8');
    expect(meta).not.toMatch(/\(x\.title \?\? ''\)\.localeCompare\(/);
  });
});
