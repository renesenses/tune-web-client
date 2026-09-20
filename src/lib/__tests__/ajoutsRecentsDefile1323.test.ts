// @vitest-environment jsdom
//
// #1323 — Jean Valjean, fils 1855 et 1856, 19/09/2026, Tune 0.9.158,
// Windows 11 / Firefox, 2 806 albums :
//
//   « Dans l'onglet Bibliothèque, il n'est pas possible de faire défiler les
//     albums, il n'y a pas d'ascenseur. Le défilement avec la souris ne
//     fonctionne pas. […] Ajouts récents […] Si le nombre d'album est
//     important, il n'est pas possible de tous les voir. »
//
// ## LA CAUSE, MESURÉE
//
// `LibraryV2` pose `.v2-lib{height:100%; overflow:hidden}` et, dedans,
// `.body{flex:1; min-height:0; display:flex}`. Le corps est donc une boîte
// HAUTE COMME L'ÉCRAN qui COUPE ce qui dépasse : c'est à la vue posée dedans
// de porter son propre ascenseur. Les six autres vues le font
// (`.grid`, `.rows`, `.tracklist`, `.facets`, `.fliste`, et `.grille` de
// `ArtistesV2`) ; `AjoutsRecentsV2` ne le faisait pas — `.recents` n'avait
// que `padding:4px 0 24px`. Étirée par `align-items:stretch`, la vue prenait
// exactement la hauteur du corps, sa grille débordait, et `overflow:hidden`
// l'effaçait. Aucun ascenseur, aucune molette : rien ne défile.
//
// ## CE QUE CE TÉMOIN REFUSE DE FAIRE
//
// Il ne cherche pas `overflow-y:auto` dans le source. Une garde de texte est
// satisfaite par la règle posée n'importe où — sur une classe morte, sur une
// vue que personne n'atteint, ou derrière une media query. Or c'est justement
// la question du ticket : QUEL élément, dans la pile réellement montée sous
// une carte d'album, retient le débordement ?
//
// Il MONTE donc le vrai écran, CLIQUE l'onglet, prend une carte RENDUE, et
// remonte ses ancêtres jusqu'à `.v2-lib` en lisant le `overflow-y` CALCULÉ —
// les feuilles des composants concernés étant COMPILÉES par Svelte (portée
// comprise) et posées dans le document. Retirer la règle du composant rend le
// témoin rouge.
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import { readFileSync } from 'node:fs';
import { compile } from 'svelte/compiler';
import { resolve } from 'node:path';
import LibraryV2 from '../../components/v2/LibraryV2.svelte';
import { activeView } from '../stores/navigation';
import { albums as albumsStore, libraryFolderScope } from '../stores/library';
import { locale } from '../i18n';
import type { Album } from '../types';

// Le cas avait déjà son budget ; le HOOK, lui, gardait les 10 000 ms par
// défaut de vitest — c'est LUI qui expirait (#1354). Les deux sont désormais
// à la taille d'une machine saturée.
vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

class ResizeObserverInerte { observe() {} unobserve() {} disconnect() {} }
for (const [prop, valeur] of [['clientHeight', 2000], ['clientWidth', 1400]] as const) {
  Object.defineProperty(HTMLElement.prototype, prop, { configurable: true, get: () => valeur });
}

/**
 * Les feuilles des composants du corps, COMPILÉES par Svelte puis posées dans
 * le document : `getComputedStyle` répond alors sur les vraies règles, et sur
 * elles seules — les sélecteurs portent le suffixe de portée du composant,
 * exactement comme en production. Sans cette compilation, le `.grille` de
 * `ArtistesV2` (qui, lui, défile) s'appliquerait au `.grille` des Ajouts
 * récents et le témoin passerait au vert sans rien avoir corrigé.
 *
 * ## UNE SEULE fois par fichier — #1354
 *
 * `compile()` coûte **~600 ms** pour ces quatre composants, mesuré sur Shrek
 * (40 cœurs) À VIDE. Dans le `beforeEach`, cette passe était payée DIX fois,
 * une par cas, par le chronomètre d'un hook qui gardait les 10 000 ms par
 * défaut de vitest. Sous douze portes simultanées, un worker reçoit une
 * fraction de cœur, le hook dépasse dix secondes, et TOUS les cas du fichier
 * tombent ensemble en accusant `AjoutsRecentsV2` de n'avoir pas d'ascenseur —
 * c'est-à-dire le défaut #1323, corrigé et livré. Aucun navigateur ne compile
 * de composant pour afficher la page : le coût était celui du banc, pas de la
 * production.
 *
 * Les feuilles ne dépendent d'AUCUN cas — même source, même sortie. On les
 * compile donc une fois et on les LAISSE dans le `<head>` pour toute la durée
 * du fichier, comme Vite pose la feuille d'un composant une fois pour toutes.
 */
const COMPOSANTS = [
  'src/components/v2/LibraryV2.svelte',
  'src/components/v2/AjoutsRecentsV2.svelte',
  'src/components/v2/ArtistesV2.svelte',
  'src/components/v2/ListePistesV2.svelte',
];

interface Feuille { chemin: string; portee: string; el: HTMLStyleElement }

function compilerFeuilles(): Feuille[] {
  return COMPOSANTS.map((chemin) => {
    const src = readFileSync(resolve(process.cwd(), chemin), 'utf-8');
    const { css } = compile(src, { css: 'external', filename: chemin });
    if (!css?.code) throw new Error(`${chemin} : aucune feuille compilée`);
    const portee = css.code.match(/\.(svelte-[a-z0-9]+)/)?.[1];
    if (!portee) throw new Error(`${chemin} : aucune classe de portée`);
    const el = document.createElement('style');
    el.textContent = css.code;
    document.head.appendChild(el);
    return { chemin, portee, el };
  });
}

/**
 * La feuille compilée ici et le composant monté par Vite doivent porter LA
 * MÊME classe de portée, sinon aucune règle ne s'applique et tout passe au
 * vert pour une mauvaise raison. On le vérifie sur le DOM.
 */
function verifierPortee(racine: HTMLElement, chemin: string): void {
  const f = feuilles.find((x) => x.chemin === chemin)!;
  const n = racine.querySelectorAll(`.${f.portee}`).length;
  if (!n) throw new Error(`${chemin} : la portée ${f.portee} n'est sur aucun élément monté`);
}

/** Le premier ancêtre qui retient le débordement, `.v2-lib` exclu (il COUPE). */
function ascenseurAuDessus(depart: Element): HTMLElement | null {
  let n: Element | null = depart;
  while (n && !n.classList.contains('v2-lib')) {
    const o = getComputedStyle(n as HTMLElement).overflowY;
    if (o === 'auto' || o === 'scroll') return n as HTMLElement;
    n = n.parentElement;
  }
  return null;
}

/** La chaîne des classes, de la carte à `.v2-lib` — de quoi lire un échec. */
function pile(depart: Element): string {
  const out: string[] = [];
  let n: Element | null = depart;
  while (n && n !== document.body) {
    const c = [...n.classList].filter((x) => !x.startsWith('svelte-')).join('.');
    out.push(c ? `.${c}` : n.tagName.toLowerCase());
    if (n.classList.contains('v2-lib')) break;
    n = n.parentElement;
  }
  return out.join(' < ');
}

const ALBUMS: Album[] = Array.from({ length: 40 }, (_, i) => ({
  id: i + 1,
  title: `Album ${String(i + 1).padStart(2, '0')}`,
  artist_name: `Artiste ${(i % 7) + 1}`,
  year: 1970 + (i % 6),
})) as unknown as Album[];

/** Ce que rend `/home/recently-added` : 23 albums, la fenêtre 15 jours du testeur. */
const RECENTS = Array.from({ length: 23 }, (_, i) => ({
  id: 500 + i,
  title: `Récent ${String(i + 1).padStart(2, '0')}`,
  artist_name: `Artiste ${(i % 5) + 1}`,
  cover_path: null,
}));

const RESUME = { days: 15, album_count: 23, track_count: 231, duration_ms: 21_300_000, duration_seconds: 21_300 };

const PISTES = Array.from({ length: 30 }, (_, i) => ({
  id: 900 + i,
  title: `Piste ${i + 1}`,
  artist_name: 'Artiste 1',
  album_name: 'Album 01',
  album_id: 1,
  duration: 200,
}));

const ARTISTES = Array.from({ length: 12 }, (_, i) => ({ id: i + 1, name: `Artiste ${i + 1}` }));

function corpsPour(url: string): unknown {
  if (url.includes('/home/recently-added/summary')) return RESUME;
  if (url.includes('/home/recently-added')) return RECENTS;
  if (/\/library\/artists(\?|$)/.test(url)) return ARTISTES;
  if (/\/library\/tracks(\?|$)/.test(url)) return PISTES;
  if (url.includes('/tracks')) return PISTES;
  if (url.includes('/stats')) return { track_count: PISTES.length, album_count: ALBUMS.length };
  return [];
}

let hote: HTMLDivElement | null = null;
let monte: Record<string, unknown> | null = null;
let feuilles: Feuille[] = [];
const respirer = () => new Promise((r) => setTimeout(r, 0));

async function poserEcran(): Promise<HTMLElement> {
  activeView.set('library');
  albumsStore.set([...ALBUMS]);
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(LibraryV2, { target: hote, props: {} as never });
  for (let i = 0; i < 14; i++) await respirer();
  flushSync();
  verifierPortee(hote, 'src/components/v2/LibraryV2.svelte');
  return hote;
}

/** Le GESTE : cliquer l'onglet par son libellé, comme le testeur. */
async function cliquerOnglet(el: HTMLElement, libelle: string): Promise<void> {
  const bouton = [...el.querySelectorAll<HTMLButtonElement>('nav.tabs button.tab')]
    .find((b) => (b.textContent ?? '').trim() === libelle);
  if (!bouton) {
    const vus = [...el.querySelectorAll('nav.tabs button.tab')].map((b) => (b.textContent ?? '').trim());
    throw new Error(`onglet « ${libelle} » absent — présents : ${vus.join(' | ')}`);
  }
  bouton.click();
  for (let i = 0; i < 14; i++) await respirer();
  flushSync();
}

beforeAll(() => {
  feuilles = compilerFeuilles();
});

afterAll(() => {
  for (const f of feuilles) f.el.remove();
  feuilles = [];
});

beforeEach(() => {
  locale.set('fr');
  activeView.set('home');
  libraryFolderScope.set(null);
  albumsStore.set([]);
  localStorage.clear();
  vi.stubGlobal('ResizeObserver', ResizeObserverInerte);
  vi.stubGlobal('fetch', vi.fn(async (entree: unknown) => {
    const url = String(typeof entree === 'string' ? entree : (entree as Request)?.url ?? entree);
    const corps = corpsPour(url);
    return {
      ok: true, status: 200, statusText: 'OK',
      headers: new Map([['content-type', 'application/json']]),
      json: async () => corps,
      text: async () => JSON.stringify(corps),
    } as unknown as Response;
  }));
  vi.stubGlobal('WebSocket', class { close() {} addEventListener() {} removeEventListener() {} send() {} } as never);
});

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  hote?.remove();
  hote = null;
  albumsStore.set([]);
  activeView.set('home');
  localStorage.clear();
  vi.unstubAllGlobals();
});

describe('#1323 — Ajouts récents : la grille défile', () => {
  it('🔴 le corps COUPE le débordement : la mesure qui fonde le ticket', async () => {
    const el = await poserEcran();
    const lib = el.querySelector<HTMLElement>('.v2-lib')!;
    const corps = el.querySelector<HTMLElement>('.body')!;
    // Sans ces deux règles, la vue posée dedans n'aurait pas besoin d'ascenseur.
    expect(getComputedStyle(lib).overflow || getComputedStyle(lib).overflowY).toContain('hidden');
    expect(getComputedStyle(corps).overflowY).not.toBe('auto');
    expect(getComputedStyle(corps).overflowY).not.toBe('scroll');
  });

  it('🔴 une carte des Ajouts récents a un ascenseur au-dessus d’elle', async () => {
    const el = await poserEcran();
    await cliquerOnglet(el, 'Ajouts récents');

    // Contre-épreuve du montage : la vue est bien celle du ticket, peuplée.
    const cartes = el.querySelectorAll('.body .recents .grille .carte');
    expect(cartes.length, 'les Ajouts récents ne sont pas rendus').toBe(RECENTS.length);
    verifierPortee(el, 'src/components/v2/AjoutsRecentsV2.svelte');

    const ascenseur = ascenseurAuDessus(cartes[0]);
    expect(
      ascenseur,
      `aucun ascenseur entre la carte et .v2-lib — pile : ${pile(cartes[0])}`,
    ).not.toBeNull();
    // Et c'est bien la vue elle-même qui le porte, pas le corps commun :
    // le corps est partagé par les sept onglets, lui donner l'ascenseur
    // ferait défiler le rail alphabétique avec la grille.
    expect(ascenseur!.classList.contains('recents')).toBe(true);
  });

  it('🔴 la vue occupe le corps au lieu d’être dimensionnée par son contenu', async () => {
    const el = await poserEcran();
    await cliquerOnglet(el, 'Ajouts récents');
    const vue = el.querySelector<HTMLElement>('.body .recents')!;
    const cs = getComputedStyle(vue);
    // `flex:1` : sans lui la vue est large comme son contenu dans un corps en
    // ligne. `min-height:0` : sans lui, un enfant en flex refuse de rétrécir
    // sous sa taille de contenu et l'ascenseur ne s'arme jamais.
    expect(cs.flexGrow).toBe('1');
    expect(cs.minHeight).toBe('0px');
  });
});

describe('#1323 — parité : aucune autre vue du même corps n’est sans ascenseur', () => {
  // Les SEPT onglets, tels que `TABS` les nomme — aucun n'est exclu : le
  // ticket vaut pour toute vue posée dans ce corps, et c'est précisément
  // parce qu'une seule d'entre elles n'avait pas d'ascenseur qu'il a fallu
  // les mesurer une à une.
  const ATTENDUS: Array<[string, string]> = [
    ['Albums', '.body .grid .card, .body .rows .lrow'],
    ['Artistes', '.body .zone .grille > *'],
    ['Pistes', '.body .tracklist *'],
    ['Genres', '.body .fliste .fl'],
    ['Années', '.body .fliste .fl'],
    ['Labels', '.body .fliste .fl'],
    ['Ajouts récents', '.body .recents .grille .carte'],
  ];

  for (const [onglet, selecteurContenu] of ATTENDUS) {
    it(`« ${onglet} » : son contenu a un ascenseur au-dessus de lui`, async () => {
      const el = await poserEcran();
      await cliquerOnglet(el, onglet);
      const contenu = el.querySelector(selecteurContenu);
      expect(contenu, `« ${onglet} » n'a rien rendu (${selecteurContenu})`).not.toBeNull();
      expect(
        ascenseurAuDessus(contenu!),
        `« ${onglet} » : rien ne retient le débordement — pile : ${pile(contenu!)}`,
      ).not.toBeNull();
    });
  }
});
