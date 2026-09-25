// @vitest-environment jsdom
//
// tune-server-rust#4558 — Steve Taylor, fil 1671, réponse 6539, 19/09/2026 :
//
//   « Could you reinstate the "random" sort for albums in the library view
//     please? This was one of my favourite features (I asked for it) and it is
//     not yet in the new UI. »
//
// Il avait raison de dire « I asked for it » : le tri est le sien (#3074,
// livré en v0.9.131). Il vivait dans `LibraryView.svelte`, que la phase 5 a
// retiré (`d5ed7deb`, 19/09) ; `LibraryV2` ne l'avait jamais repris. Depuis la
// v0.9.158, il n'existe plus dans aucun écran du produit.
//
// ## POURQUOI CÔTÉ CLIENT, ALORS QUE LE SERVEUR SAIT LE FAIRE
//
// Le serveur porte bien `sort=random&seed=` (`routes/library/albums.rs:115`,
// `AlbumRepo::melange_aleatoire_sql`) — la moitié serveur de #3074 est
// intacte. Mais la v2 ne demande AUCUN tri au serveur : son chemin TRIÉ perd
// `added_at` (mesure du 05/09 reportée dans `v2Bootstrap.loadAlbums`) et ne
// sert pas `dynamic_range` (#4521). Elle charge toute la bibliothèque et trie
// les cinq autres critères elle-même. Y brancher le tri du serveur coûterait
// deux tris pour en gagner un — et il n'y a aucune pagination réseau à tenir.
//
// ## CE QUE CE TÉMOIN MESURE VRAIMENT
//
// Le piège du sujet n'est pas « est-ce mélangé », c'est « est-ce STABLE ».
// `sorted` est un `$derived.by` : il se recalcule à chaque frappe, à chaque
// filtre et à l'arrivée de la seconde page d'albums. Un `melangee()` posé là
// passerait toutes les gardes « l'ordre a changé » et danserait sous le doigt.
// Le témoin monte donc le vrai écran, choisit « Aléatoire » DANS LE MENU, puis
// reproduit chacun de ces recalculs et relit la grille.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import LibraryV2 from '../../components/v2/LibraryV2.svelte';
import { activeView } from '../stores/navigation';
import { albums as albumsStore, libraryFolderScope } from '../stores/library';
import { locale } from '../i18n';
import { rangAleatoire, graineAleatoire } from '../shuffle';
import type { Album } from '../types';

vi.setConfig({ testTimeout: 60_000 });

class ResizeObserverInerte { observe() {} unobserve() {} disconnect() {} }
for (const [prop, valeur] of [['clientHeight', 2000], ['clientWidth', 1400]] as const) {
  Object.defineProperty(HTMLElement.prototype, prop, { configurable: true, get: () => valeur });
}

/** Soixante albums : assez pour qu'un ordre identique au tri par titre soit une preuve, pas un hasard. */
const ALBUMS: Album[] = Array.from({ length: 60 }, (_, i) => ({
  id: i + 1,
  title: `Album ${String(i + 1).padStart(2, '0')}`,
  artist_name: `Artiste ${(i % 9) + 1}`,
  year: 1970 + (i % 6),
  added_at: 1_700_000_000 - i * 3600,
})) as unknown as Album[];

let hote: HTMLDivElement | null = null;
let monte: Record<string, unknown> | null = null;
const respirer = () => new Promise((r) => setTimeout(r, 0));

async function poserEcran(albums: Album[] = ALBUMS): Promise<HTMLElement> {
  activeView.set('library');
  albumsStore.set([...albums]);
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(LibraryV2, { target: hote, props: {} as never });
  for (let i = 0; i < 14; i++) await respirer();
  flushSync();
  return hote;
}

async function demonter(): Promise<void> {
  if (monte) unmount(monte);
  monte = null;
  hote?.remove();
  hote = null;
}

/** Les titres RENDUS dans la grille, dans l'ordre du DOM. */
function grille(el: HTMLElement): string[] {
  return [...el.querySelectorAll('.body .grid .card .ct')].map((n) => (n.textContent ?? '').trim());
}

/** Le GESTE : ouvrir le menu de tri et cliquer l'entrée par son libellé. */
async function choisirTri(el: HTMLElement, libelle: string): Promise<void> {
  const entrees = [...el.querySelectorAll<HTMLButtonElement>('.drop.right .menu button')];
  const b = entrees.find((x) => (x.textContent ?? '').trim() === libelle);
  if (!b) throw new Error(`tri « ${libelle} » absent — menu : ${entrees.map((x) => (x.textContent ?? '').trim()).join(' | ')}`);
  b.click();
  for (let i = 0; i < 6; i++) await respirer();
  flushSync();
}

/** Le GESTE : taper dans la recherche de la Bibliothèque. */
async function chercher(el: HTMLElement, texte: string): Promise<void> {
  const input = el.querySelector<HTMLInputElement>('.search input, input[placeholder]')!;
  input.value = texte;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  for (let i = 0; i < 6; i++) await respirer();
  flushSync();
}

async function reTirer(el: HTMLElement): Promise<void> {
  const b = el.querySelector<HTMLButtonElement>('button[title="Re-tirer au hasard"]');
  if (!b) throw new Error('le bouton de re-tirage est absent');
  b.click();
  for (let i = 0; i < 6; i++) await respirer();
  flushSync();
}

beforeEach(() => {
  locale.set('fr');
  activeView.set('home');
  libraryFolderScope.set(null);
  albumsStore.set([]);
  localStorage.clear();
  vi.stubGlobal('ResizeObserver', ResizeObserverInerte);
  vi.stubGlobal('fetch', vi.fn(async () => ({
    ok: true, status: 200, statusText: 'OK',
    headers: new Map([['content-type', 'application/json']]),
    json: async () => [], text: async () => '[]',
  } as unknown as Response)));
  vi.stubGlobal('WebSocket', class { close() {} addEventListener() {} removeEventListener() {} send() {} } as never);
});

afterEach(async () => {
  await demonter();
  albumsStore.set([]);
  activeView.set('home');
  localStorage.clear();
  vi.unstubAllGlobals();
});

describe('#4558 — le tri « Aléatoire » des albums est de retour dans la v2', () => {
  it('🔴 l’entrée existe dans le menu de tri, et elle mélange', async () => {
    const el = await poserEcran();
    const parTitre = grille(el);
    expect(parTitre).toHaveLength(ALBUMS.length);

    await choisirTri(el, 'Aléatoire');
    const tire = grille(el);

    // Les mêmes albums, aucun perdu, aucun en double.
    expect([...tire].sort()).toEqual([...parTitre].sort());
    // Et un ordre AUTRE : sur soixante albums, retomber sur l'alphabétique
    // n'arrive pas par hasard.
    expect(tire).not.toEqual(parTitre);
  });

  it('🔴 l’ordre TIENT quand la grille se recalcule — le piège du sujet', async () => {
    const el = await poserEcran();
    await choisirTri(el, 'Aléatoire');
    const avant = grille(el);

    // Recalcul n°1 : une frappe dans la recherche, puis son effacement.
    // `sorted` est reconstruit trois fois au passage.
    await chercher(el, 'Album 1');
    const filtre = grille(el);
    expect(filtre.length).toBeGreaterThan(0);
    expect(filtre.length).toBeLessThan(avant.length);
    // Le sous-ensemble garde l'ordre relatif du tirage complet : c'est ce qui
    // tient une pagination — la page 2 ne peut pas rendre ce qu'a rendu la 1.
    expect(filtre).toEqual(avant.filter((t) => filtre.includes(t)));

    await chercher(el, '');
    expect(grille(el), 'la recherche a re-tiré l’ordre').toEqual(avant);

    // Recalcul n°2 : la SECONDE page d'albums arrive (loadAlbums remplace la
    // liste par 2 000 entrées après les 100 premières). Les albums déjà là ne
    // bougent pas les uns par rapport aux autres.
    const plus = [...ALBUMS, ...Array.from({ length: 20 }, (_, i) => ({
      id: 1000 + i, title: `Tardif ${i}`, artist_name: 'X', year: 1990,
    }))] as unknown as Album[];
    albumsStore.set(plus);
    for (let i = 0; i < 8; i++) await respirer();
    flushSync();
    const apres = grille(el);
    expect(apres.length).toBe(plus.length);
    expect(apres.filter((t) => avant.includes(t))).toEqual(avant);
  });

  it('🔴 « Re-tirer au hasard » rend un AUTRE ordre, et rien d’autre ne le fait', async () => {
    const el = await poserEcran();
    await choisirTri(el, 'Aléatoire');
    const premier = grille(el);
    await reTirer(el);
    const second = grille(el);
    expect(second).not.toEqual(premier);
    expect([...second].sort()).toEqual([...premier].sort());
  });

  it('🔴 le tirage survit à la fermeture de l’écran — on retrouve sa grille', async () => {
    const el = await poserEcran();
    await choisirTri(el, 'Aléatoire');
    const tire = grille(el);
    await demonter();
    // Le choix de tri ET la graine sont retenus (`tune_v2_ecran_lib.sort*`).
    const el2 = await poserEcran();
    expect(grille(el2)).toEqual(tire);
  });

  it('sur un tirage, le rail A–Z reste mais chaque lettre repasse au tri Titre (Bertrand, 25/09/2026)', async () => {
    // Il était retiré : un saut sur un ordre tiré au sort atterrirait au
    // hasard. Il reste désormais, et chaque lettre ANNONCE qu'elle repasse au
    // tri Titre avant de sauter — elle ne saute donc jamais dans le tirage.
    const el = await poserEcran();
    await choisirTri(el, 'Aléatoire');
    const lettres = [...el.querySelectorAll<HTMLButtonElement>('.body .rail .rl')];
    expect(lettres.length).toBeGreaterThan(0);
    expect(lettres.every((b) => (b.getAttribute('aria-label') ?? '').includes('titre'))).toBe(true);
  });
});

describe('#4558 — la règle du tirage, mesurée seule', () => {
  it('même graine, même rang ; graine différente, rang différent', () => {
    expect(rangAleatoire(42, 7)).toBe(rangAleatoire(42, 7));
    expect(rangAleatoire(42, 7)).not.toBe(rangAleatoire(42, 8));
    expect(rangAleatoire(42, 7)).not.toBe(rangAleatoire(43, 7));
  });

  it('des identifiants CONSÉCUTIFS ne rendent pas des rangs consécutifs', () => {
    // Contre-épreuve du finaliseur de mélange : sans lui, un FNV-1a nu range
    // 1, 2, 3… presque dans l'ordre, et le « tirage » rendrait la base.
    const g = 12345;
    const ids = Array.from({ length: 200 }, (_, i) => i + 1);
    const ordre = [...ids].sort((a, b) => rangAleatoire(a, g) - rangAleatoire(b, g));
    const enPlace = ordre.filter((id, i) => id === ids[i]).length;
    expect(enPlace).toBeLessThan(10);
    // Et il reste une permutation : rien de perdu, rien en double.
    expect([...ordre].sort((a, b) => a - b)).toEqual(ids);
  });

  it('le rang est un entier non signé sur 32 bits — pas de NaN, pas de négatif', () => {
    for (const id of [0, 1, 999999, 'abc', '']) {
      const r = rangAleatoire(id, 1);
      expect(Number.isInteger(r)).toBe(true);
      expect(r).toBeGreaterThanOrEqual(0);
      expect(r).toBeLessThanOrEqual(0xffffffff);
    }
  });

  it('une graine tirée n’est jamais 0', () => {
    for (let i = 0; i < 200; i++) expect(graineAleatoire()).toBeGreaterThan(0);
  });
});
