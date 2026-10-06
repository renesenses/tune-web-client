// @vitest-environment jsdom
/**
 * Suite de web#1978 (fil 2167) — la vignette `?size=` sur toutes les grilles
 * et listes de pochettes : Favoris, Recherche, Collections, Playlists,
 * Accueil, Streaming, file d'attente.
 *
 * Deux choses à tenir :
 * - seule la route `/api/v1/library/artwork/{condensat}` lit `?size=`. Une
 *   pochette servie par le relais (streaming, logos de radio) ne change
 *   RIEN : même adresse, et pas d'image retenue le temps de mesurer la tuile ;
 * - les vues de détail et « Lecture en cours » gardent la grande image.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import AlbumArt from '../../components/partages/AlbumArt.svelte';
import MosaiquePochettes from '../../components/v2/MosaiquePochettes.svelte';

vi.mock('../api', async (original) => ({
  ...await original<typeof import('../api')>(),
  getAlbumCoverPath: vi.fn(async () => null),
}));

let target: HTMLDivElement;
let instance: ReturnType<typeof mount> | undefined;
let dpr: PropertyDescriptor | undefined;
const wait = async (assertion: () => void) => vi.waitFor(() => { flushSync(); assertion(); }, { timeout: 3000 });

beforeEach(() => {
  target = document.createElement('div'); document.body.appendChild(target);
  dpr = Object.getOwnPropertyDescriptor(window, 'devicePixelRatio');
  Object.defineProperty(window, 'devicePixelRatio', { configurable: true, value: 2 });
});
afterEach(async () => {
  if (instance) await unmount(instance);
  instance = undefined;
  target.remove();
  if (dpr) Object.defineProperty(window, 'devicePixelRatio', dpr);
  vi.restoreAllMocks();
});

const largeur = (l: number) => vi.spyOn(Element.prototype, 'getBoundingClientRect')
  .mockReturnValue({ width: l, height: l, top: 0, left: 0, right: l, bottom: l, x: 0, y: 0, toJSON() {} } as DOMRect);
const srcs = () => [...target.querySelectorAll('img')].map((i) => i.getAttribute('src'));

describe('vignette : seule la route du condensat change', () => {
  it('pochette de service (relais) : même adresse, aucune mesure', async () => {
    const mesure = largeur(150);
    const relais = 'https://resources.tidal.com/images/x/320x320.jpg';
    instance = mount(AlbumArt, { target, props: { coverPath: relais, size: 0, vignette: true } });
    await wait(() => expect(target.querySelector('img')).not.toBeNull());
    expect(srcs()[0]).toMatch(/\/library\/artwork\/proxy\?url=/);
    expect(srcs()[0]).not.toMatch(/size=/);
    expect(mesure).not.toHaveBeenCalled();
  });

  it('adresse de relais déjà faite : intacte', async () => {
    largeur(150);
    instance = mount(AlbumArt, { target, props: { coverPath: '/api/v1/library/artwork/proxy?url=x', size: 0, vignette: true } });
    await wait(() => expect(target.querySelector('img')).not.toBeNull());
    expect(srcs()[0]).toBe('/api/v1/library/artwork/proxy?url=x');
  });

  it('contre-épreuve : un condensat, lui, reçoit la case qui couvre la tuile', async () => {
    largeur(150);
    instance = mount(AlbumArt, { target, props: { coverPath: '/api/v1/library/artwork/abc123', size: 0, vignette: true } });
    await wait(() => expect(target.querySelector('img')).not.toBeNull());
    expect(srcs()[0]).toBe('/api/v1/library/artwork/abc123?size=400');
  });

  it('taille fixe (liste de 40 px, écran ×2) : ?size=80, sans mesurer', async () => {
    const mesure = largeur(999);
    instance = mount(AlbumArt, { target, props: { coverPath: '/api/v1/library/artwork/abc123', size: 40, vignette: true } });
    await wait(() => expect(target.querySelector('img')).not.toBeNull());
    expect(srcs()[0]).toBe('/api/v1/library/artwork/abc123?size=80');
    expect(mesure).not.toHaveBeenCalled();
  });
});

describe('mosaïque de playlist / collection : quatre vignettes', () => {
  it('chaque quart demande une vignette à sa largeur', async () => {
    largeur(80);
    instance = mount(MosaiquePochettes, { target, props: { pochettes: ['/api/v1/library/artwork/a1', '/api/v1/library/artwork/a2', '/api/v1/library/artwork/a3', '/api/v1/library/artwork/a4'] } });
    await wait(() => expect(target.querySelectorAll('img').length).toBe(4));
    expect(srcs()).toEqual(['a1', 'a2', 'a3', 'a4'].map((c) => `/api/v1/library/artwork/${c}?size=200`));
  });
});

/*
 * Garde de câblage : chaque `<AlbumArt>` des écrans de grille porte
 * `vignette`, et aucun des écrans de détail ne le porte. Les compteurs
 * attendus sont exacts : une pochette ajoutée sans `vignette` fait rougir.
 */
const lire = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf-8');
const balises = (src: string) => [...src.matchAll(/<AlbumArt\b[\s\S]*?\/>/g)].map((m) => m[0]);
const avecVignette = (b: string) => /\svignette[\s/>]/.test(b);

describe('câblage par écran', () => {
  it.each([
    ['src/components/v2/FavoritesV2.svelte', 5],
    ['src/components/v2/SearchV2.svelte', 7],
    ['src/components/v2/CollectionsV2.svelte', 2],
    ['src/components/v2/PlaylistsV2.svelte', 1],
    ['src/components/v2/PageWidgets.svelte', 3],
    ['src/components/v2/ligne1/CarteZoneL1.svelte', 1],
    ['src/components/v2/StreamingV2.svelte', 2],
    ['src/components/v2/QueueV2.svelte', 2],
    ['src/components/v2-heritage/SmartPlaylistsView.svelte', 2],
  ])('%s : toutes ses pochettes (%i) sont des vignettes', (fichier, n) => {
    const b = balises(lire(fichier));
    expect(b.length).toBe(n);
    expect(b.filter((x) => !avecVignette(x))).toEqual([]);
  });

  it('MosaiquePochettes : les quarts sont des vignettes', () => {
    const b = balises(lire('src/components/v2/MosaiquePochettes.svelte'));
    const quarts = b.filter((x) => x.includes('coverPath={c}'));
    expect(quarts.length).toBe(1);
    expect(quarts.every(avecVignette)).toBe(true);
  });

  it('PlaylistManagerView : la grille oui, la grande pochette du détail non', () => {
    const b = balises(lire('src/components/v2-heritage/PlaylistManagerView.svelte'));
    expect(b.find((x) => x.includes('item.coverPath'))).toSatisfy(avecVignette);
    expect(b.find((x) => x.includes('selectedStreamingPl'))).not.toSatisfy(avecVignette);
  });

  it.each([
    'src/components/v2/AlbumDetailV2.svelte',
    'src/components/v2/PlaylistDetailV2.svelte',
    'src/components/partages/NowPlaying.svelte',
    'src/components/partages/TransportBar.svelte',
  ])('%s garde la grande image', (fichier) => {
    expect(balises(lire(fichier)).filter(avecVignette)).toEqual([]);
  });
});
