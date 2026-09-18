// @vitest-environment jsdom
//
// « V1 : les barres de défilement alphabétique de Collections ne répondent
// pas, alors qu'elles marchent en V0 » — tune-web-client#1153.
//
// Jean-Luc Cassé, fil 1784, 14/09/2026, mot pour mot :
//
//   « Par contre les barres de défilement alphabétique des répertoires dans
//     Collections ne fonctionnent pas, alors qu'elles sont opérationnelles
//     dans la V0. »
//
// ## Ce qui différait de la V0, mesuré
//
// 1. Dans une collection OUVERTE, le rail de la V1 lisait `a.title` en toutes
//    circonstances, alors que la grille est rangée PAR ARTISTE (le tri par
//    défaut, `?sort=artist`, fait par le serveur). Cliquer « Z » pour Zappa
//    était impossible — la lettre n'était même pas proposée, puisque aucun
//    TITRE ne commence par Z — et cliquer une lettre proposée atterrissait au
//    milieu de la liste, sans rapport avec l'ordre affiché. Exactement le
//    défaut que Lulu avait signalé sur la Bibliothèque (forum 1671) et qui y a
//    été corrigé : `LibraryV2.firstLetter` suit le tri, et le rail disparaît
//    sur un tri chronologique. Collections n'avait jamais reçu ce correctif —
//    les deux écrans portaient bien DEUX rails différents.
// 2. Sur la LISTE des collections — « les répertoires » de Jean-Luc — la V0
//    (`CollectionsView.svelte`, `collectionLetters` / `scrollToCollectionLetter`)
//    porte un rail ; la V1 n'en avait aucun.
//
// ## Ce que ce témoin prouve, et ce qu'il ne prouve PAS
//
// Il MONTE l'écran et CLIQUE. Il observe l'ÉLÉMENT sur lequel
// `scrollIntoView` est appelé — pas un mock de fonction interne — donc il
// tient la cible du saut : la bonne carte, celle de la bonne lettre, dans
// l'ordre réellement affiché.
//
// 🔴 Il ne prouve RIEN sur le déplacement lui-même : jsdom ne met rien en
// page, `scrollIntoView` y est une fonction vide, il n'y a ni hauteur, ni
// position, ni conteneur défilant réel. Qu'une carte soit VISIBLE après le
// saut, que le rail collant ne se range pas derrière l'en-tête, que le
// `behavior:'smooth'` aboutisse — rien de tout cela n'est ici. Ça se mesure
// dans un navigateur.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import { get } from 'svelte/store';
import CollectionsV2 from '../../components/v2/CollectionsV2.svelte';
import { dialogs } from '../stores/dialogs';

/**
 * Trois albums dont l'initiale de l'ARTISTE et celle du TITRE ne coïncident
 * jamais : un rail qui viserait le titre ne peut pas passer par accident.
 * La liste est rendue dans l'ordre du serveur — par artiste : ABBA, Piaf,
 * Zappa.
 */
const ALBUMS_PAR_ARTISTE = [
  { id: 10, title: 'Zoo', artist_name: 'ABBA', cover_path: null },
  { id: 11, title: 'Mothers', artist_name: 'Édith Piaf', cover_path: null },
  { id: 12, title: 'Apostrophe', artist_name: 'Frank Zappa', cover_path: null },
];
/** La même liste rangée par TITRE, ce que le serveur rendrait sur `?sort=title`. */
const ALBUMS_PAR_TITRE = [
  { id: 12, title: 'Apostrophe', artist_name: 'Frank Zappa', cover_path: null },
  { id: 11, title: 'Mothers', artist_name: 'Édith Piaf', cover_path: null },
  { id: 10, title: 'Zoo', artist_name: 'ABBA', cover_path: null },
];

/** Trois collections manuelles, pour le rail de la LISTE. */
const COLLECTIONS = [
  { id: 1, name: 'Ambiances', description: null, album_ids: [10], covers: [], created_at: '2026-01-01T00:00:00Z' },
  { id: 2, name: 'Émotions', description: null, album_ids: [11], covers: [], created_at: '2026-02-01T00:00:00Z' },
  { id: 3, name: 'Zénith', description: null, album_ids: [12], covers: [], created_at: '2026-03-01T00:00:00Z' },
];

let derniersAlbums = ALBUMS_PAR_ARTISTE;
/** Les requêtes sorties, chemin + requête, pour lire le `?sort=` demandé. */
let requetes: string[] = [];

function corps(chemin: string): unknown {
  if (chemin.includes('/smart-collections/preview')) return { total: 0, albums: [] };
  if (/\/smart-collections\/\d+\/albums/.test(chemin)) return [];
  if (chemin.includes('/smart-collections')) return [];
  if (/\/collections\/\d+\/albums/.test(chemin)) return derniersAlbums;
  if (chemin.endsWith('/library/collections')) return COLLECTIONS;
  return [];
}

class Inerte {
  observe() {}
  unobserve() {}
  disconnect() {}
}

let hote: HTMLDivElement | null = null;
let monte: Record<string, any> | null = null;
/** Les éléments sur lesquels `scrollIntoView` a réellement été appelé. */
let sauts: Element[] = [];
const scrollOrigine = Element.prototype.scrollIntoView;

beforeEach(() => {
  requetes = [];
  sauts = [];
  derniersAlbums = ALBUMS_PAR_ARTISTE;
  localStorage.clear();
  Element.prototype.scrollIntoView = function (this: Element) {
    sauts.push(this);
  };
  vi.stubGlobal('ResizeObserver', Inerte);
  vi.stubGlobal('IntersectionObserver', Inerte);
  vi.stubGlobal('WebSocket', class { close() {} addEventListener() {} removeEventListener() {} send() {} } as any);
  vi.stubGlobal('fetch', vi.fn(async (url: any) => {
    const brut = String(typeof url === 'string' ? url : url?.url ?? '');
    const chemin = brut.replace(/^https?:\/\/[^/]+/, '');
    requetes.push(chemin);
    const c = corps(chemin.split('?')[0]);
    return {
      ok: true, status: 200, statusText: 'OK',
      headers: new Map([['content-type', 'application/json']]),
      json: async () => c,
      text: async () => JSON.stringify(c),
    } as unknown as Response;
  }));
});

afterEach(() => {
  for (const r of get(dialogs)) dialogs.settle(r.id, false);
  if (monte) unmount(monte);
  monte = null;
  if (hote) hote.remove();
  hote = null;
  for (const n of Array.from(document.querySelectorAll('.fond'))) n.remove();
  Element.prototype.scrollIntoView = scrollOrigine;
  vi.unstubAllGlobals();
});

async function tourner(tours = 8) {
  for (let i = 0; i < tours; i++) {
    await new Promise((r) => setTimeout(r, 0));
    flushSync();
  }
}

/** Attente BORNÉE par une condition, jamais par un délai fixe. */
async function attendreQue(condition: () => boolean, tours = 400): Promise<boolean> {
  for (let i = 0; i < tours; i++) {
    if (condition()) return true;
    await new Promise((r) => setTimeout(r, 5));
    flushSync();
  }
  return condition();
}

async function poser(): Promise<HTMLDivElement> {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(CollectionsV2, { target: hote, props: {} as any });
  flushSync();
  await tourner();
  return hote;
}

/** L'onglet « Collections » (manuelles) — le second de la barre. */
async function ongletManuel(racine: HTMLElement) {
  const onglets = Array.from(racine.querySelectorAll<HTMLButtonElement>('nav.tabs button.tab'));
  expect(onglets.length, 'les deux onglets').toBeGreaterThanOrEqual(2);
  onglets[1].click();
  await tourner();
}

/** Le rail visible, lettre par lettre, avec son état actif/inerte. */
function rail(racine: HTMLElement): { lettre: string; actif: boolean }[] {
  return Array.from(racine.querySelectorAll<HTMLButtonElement>('.rail .rl')).map((b) => ({
    lettre: (b.textContent ?? '').trim(),
    actif: !b.disabled,
  }));
}

function lettresActives(racine: HTMLElement): string[] {
  return rail(racine).filter((r) => r.actif).map((r) => r.lettre);
}

function cliquerLettre(racine: HTMLElement, lettre: string) {
  const b = Array.from(racine.querySelectorAll<HTMLButtonElement>('.rail .rl'))
    .find((x) => (x.textContent ?? '').trim() === lettre);
  expect(b, `la lettre ${lettre} n’est pas au rail`).toBeTruthy();
  expect(b!.disabled, `la lettre ${lettre} est inerte`).toBe(false);
  b!.click();
}

/** Le titre porté par la carte atteinte — c'est ce qui identifie la cible. */
function titreDuSaut(): string {
  expect(sauts.length, 'aucun saut n’a été demandé').toBe(1);
  const carte = sauts[0] as HTMLElement;
  expect(carte.classList.contains('card'), 'le saut ne vise pas une carte').toBe(true);
  return (carte.querySelector('.ct')?.textContent ?? '').trim();
}

/** Ouvre la première collection de l'onglet manuel et attend sa grille. */
async function ouvrirPremiere(racine: HTMLElement) {
  const cartes = Array.from(racine.querySelectorAll<HTMLButtonElement>('.grid .card button.meta'));
  expect(cartes.length, 'la liste des collections est vide').toBeGreaterThan(0);
  cartes[0].click();
  await attendreQue(() => racine.querySelectorAll('.aveclettres .grid .card').length > 0);
  await tourner();
}

describe('#1153 — le rail A-Z d’une collection ouverte suit l’ordre affiché', () => {
  it('trié par ARTISTE (le défaut), il propose les initiales d’artiste et saute sur la bonne carte', async () => {
    const racine = await poser();
    await ongletManuel(racine);
    await ouvrirPremiere(racine);

    // Le serveur a bien été interrogé sur l'ordre par artiste.
    expect(requetes.some((r) => r.includes('/albums?sort=artist&order=asc'))).toBe(true);

    // ABBA · Édith Piaf · Frank Zappa — et surtout PAS Z (Zoo), M (Mothers),
    // A (Apostrophe), qui sont les initiales des TITRES.
    expect(lettresActives(racine)).toEqual(['A', 'E', 'F']);

    cliquerLettre(racine, 'F');
    expect(titreDuSaut()).toBe('Apostrophe'); // la carte de Frank Zappa
  });

  it('trié par TITRE, il bascule sur les initiales de titre', async () => {
    derniersAlbums = ALBUMS_PAR_TITRE;
    localStorage.setItem('tune_v2_ecran_v2.collection.albums.tri', 'title');
    const racine = await poser();
    await ongletManuel(racine);
    await ouvrirPremiere(racine);

    expect(requetes.some((r) => r.includes('/albums?sort=title&order=asc'))).toBe(true);
    expect(lettresActives(racine)).toEqual(['A', 'M', 'Z']);

    cliquerLettre(racine, 'Z');
    expect(titreDuSaut()).toBe('Zoo');
  });

  it('trié CHRONOLOGIQUEMENT, il est retiré plutôt que de promettre un saut au hasard', async () => {
    localStorage.setItem('tune_v2_ecran_v2.collection.albums.tri', 'added_at');
    const racine = await poser();
    await ongletManuel(racine);
    await ouvrirPremiere(racine);

    expect(racine.querySelectorAll('.rail .rl').length).toBe(0);
  });
});

describe('#1153 — la LISTE des collections (« les répertoires ») a retrouvé son rail', () => {
  it('rangée alphabétiquement, elle porte un rail qui saute sur le bon dossier', async () => {
    const racine = await poser();
    await ongletManuel(racine);
    await attendreQue(() => racine.querySelectorAll('.grid .card').length === 3);

    // Ambiances · Émotions · Zénith — l'accent replié comme au tri.
    expect(lettresActives(racine)).toEqual(['A', 'E', 'Z']);

    cliquerLettre(racine, 'E');
    expect(titreDuSaut()).toBe('Émotions');
  });

  it('rangée par DATE, elle n’affiche aucun rail', async () => {
    localStorage.setItem('tune_v2_ecran_v2.collections.tri', 'recent');
    const racine = await poser();
    await ongletManuel(racine);
    await attendreQue(() => racine.querySelectorAll('.grid .card').length === 3);

    expect(racine.querySelectorAll('.rail .rl').length).toBe(0);
  });
});
