// @vitest-environment jsdom
//
// #866 — Jean Valjean, forum 1671, réponse 6154, 09/09/2026 :
//
//   « Dans Bibliothèque, le bouton ne fonctionne que sur les années et pas sur
//     les dates de sortie d'album »
//
// Sa capture est recadrée sur la seule pastille « Plus récent d'abord » : c'est
// donc `button.anord` de la barre d'années de `LibraryV2`, pas le menu de tri.
//
// ## Ce qui était vrai
//
// `anneeAlbum` ne lisait que `year` et `original_year`, deux ENTIERS. La
// granularité maximale du tri était donc l'année, et deux albums de la même
// année retombaient sur `byTitle` — l'ordre ALPHABÉTIQUE. Sur une liste que la
// pastille annonce « Plus récent d'abord », ça se lit comme un bouton inerte.
//
// ## 🔴 Ce que ce témoin doit voir — et le piège qu'il évite
//
// Le premier témoin MONTE `LibraryV2`, clique la pastille, et lit l'ordre
// RENDU dans le DOM. Il ne cherche aucune chaîne dans un fichier source, et il
// n'appelle pas le comparateur à la main : vérifier qu'on PEUT comparer deux
// dates ne prouverait pas que l'écran s'en sert.
//
// ⚠️ Le catalogue est choisi pour que l'ordre alphabétique diffère de l'ordre
// chronologique DANS LES DEUX SENS. Une première version de ce témoin datait
// « Avril » en décembre et « Zulu » en janvier : l'ordre décroissant par date
// tombait alors exactement sur l'alphabet, et le témoin serait passé au VERT
// contre le code d'avant. Un témoin qui ne peut pas rougir ne garde rien.
//
// Ils ne prouvent RIEN sur le remplissage réel du parc. Mesure du 12/09/2026
// sur le .18 (v0.9.146, 4 255 albums) : `release_date` = 0, `original_date` =
// 90 dont 12 avec un mois, répartis sur deux années seulement. Le départage ne
// concerne donc aujourd'hui qu'une seule paire réelle. C'est une limite de
// DONNÉE, pas de code, et elle est consignée dans `anneeAlbum.ts`.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import LibraryV2 from '../../components/v2/LibraryV2.svelte';
import { activeView } from '../stores/navigation';
import { albums as albumsStore, libraryFolderScope } from '../stores/library';
import { comparerAlbumsParAnnee, dateAlbum } from '../anneeAlbum';
import type { Album } from '../types';

vi.setConfig({ testTimeout: 30_000 });

class ResizeObserverInerte {
  observe() {}
  unobserve() {}
  disconnect() {}
}
for (const [prop, valeur] of [['clientHeight', 2000], ['clientWidth', 1400]] as const) {
  Object.defineProperty(HTMLElement.prototype, prop, { configurable: true, get: () => valeur });
}

// ── Le catalogue ──────────────────────────────────────────────────────────
//
// Trois albums de LA MÊME année. L'alphabet dit « Alpha, Beta, Gamma » ; la
// chronologie dit « Alpha (jan), Gamma (juin), Beta (déc) ». Les deux ordres
// diffèrent, et ils diffèrent ENCORE une fois inversés — c'est ce qui rend le
// témoin capable de rougir dans les deux sens.
const ALBUMS: Album[] = [
  { id: 1, title: 'Alpha', artist_name: 'X', year: 1975, original_year: 1975, original_date: '1975-01-05' },
  { id: 2, title: 'Beta', artist_name: 'X', year: 1975, original_year: 1975, original_date: '1975-12-20' },
  { id: 3, title: 'Gamma', artist_name: 'X', year: 1975, original_year: 1975, original_date: '1975-06-10' },
] as Album[];

const ALPHABET = ['Alpha', 'Beta', 'Gamma'];
const PLUS_RECENT_DABORD = ['Beta', 'Gamma', 'Alpha'];
const PLUS_ANCIEN_DABORD = ['Alpha', 'Gamma', 'Beta'];

let hote: HTMLDivElement | null = null;
let monte: Record<string, unknown> | null = null;
const respirer = () => new Promise((r) => setTimeout(r, 0));

/**
 * Monte l'écran tel qu'un habitué le retrouve : la frise d'années ouverte
 * (`lib.nav`) et le tri par année retenu (`lib.sort`). Ce sont les deux choix
 * que `LibraryV2` PERSISTE lui-même (`ecrireChoix`) — les poser ici, c'est
 * rouvrir l'écran, pas le forcer. C'est dans cet état que la pastille
 * « Plus récent d'abord » de la capture est à l'écran.
 */
async function poser(): Promise<HTMLDivElement> {
  localStorage.setItem('tune_v2_ecran_lib.nav', 'years');
  localStorage.setItem('tune_v2_ecran_lib.sort', 'year');
  activeView.set('library');
  albumsStore.set([...ALBUMS]);
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(LibraryV2, { target: hote, props: {} as never });
  for (let i = 0; i < 12; i++) await respirer();
  flushSync();
  return hote;
}

/** Clique la pastille « Plus récent / Plus ancien d'abord » — le geste. */
async function basculerOrdre(el: HTMLElement) {
  const b = el.querySelector('button.anord');
  expect(b, 'la pastille d’ordre d’année est absente de l’écran').toBeTruthy();
  (b as HTMLElement).click();
  for (let i = 0; i < 10; i++) await respirer();
  flushSync();
}

/** L'ordre RÉELLEMENT rendu dans la grille d'albums. */
function ordreRendu(el: HTMLElement): string[] {
  return [...el.querySelectorAll('.grid .card .ct, .rows .lrow .ltt')]
    .map((n) => (n.textContent ?? '').trim())
    .filter((t) => ALBUMS.some((a) => a.title === t));
}

beforeEach(() => {
  activeView.set('home');
  libraryFolderScope.set(null);
  albumsStore.set([]);
  localStorage.clear();
  vi.stubGlobal('ResizeObserver', ResizeObserverInerte);
  vi.stubGlobal('fetch', vi.fn(async () => ({
    ok: true,
    status: 200,
    statusText: 'OK',
    headers: new Map([['content-type', 'application/json']]),
    json: async () => ({}),
    text: async () => '{}',
  } as unknown as Response)));
  vi.stubGlobal('WebSocket', class {
    close() {}
    addEventListener() {}
    removeEventListener() {}
    send() {}
  } as never);
});

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  if (hote) hote.remove();
  hote = null;
  albumsStore.set([]);
  libraryFolderScope.set(null);
  activeView.set('home');
  localStorage.clear();
  vi.unstubAllGlobals();
});

describe('#866 — le tri par année descend jusqu’à la DATE de sortie', () => {
  it('la pastille ordonne À LA DATE, et l’inverser réordonne vraiment', async () => {
    const el = await poser();

    // La pastille de la capture est bien à l'écran, et elle annonce son sens.
    expect((el.querySelector('button.anord')?.textContent ?? '').trim())
      .toBe("Plus récent d'abord");

    // 1. « Plus récent d'abord » : décembre, juin, janvier.
    const recent = ordreRendu(el);
    expect(recent, 'la grille n’a rendu aucun des trois albums').toHaveLength(3);
    expect(recent, "« Plus récent d'abord » a rendu l'ordre ALPHABÉTIQUE : la date n'est pas lue")
      .not.toEqual(ALPHABET);
    expect(recent).toEqual(PLUS_RECENT_DABORD);

    // 2. La pastille bascule sur « Plus ancien d'abord » : l'ordre s'inverse.
    //    C'est ici qu'un écran triant par titre se démasquerait — il rendrait
    //    DEUX FOIS la même liste.
    await basculerOrdre(el);
    expect((el.querySelector('button.anord')?.textContent ?? '').trim())
      .toBe("Plus ancien d'abord");

    const ancien = ordreRendu(el);
    expect(ancien, 'basculer l’ordre n’a rien changé : l’écran trie par titre')
      .not.toEqual(recent);
    expect(ancien, 'l’ordre croissant est retombé sur l’alphabet').not.toEqual(ALPHABET);
    expect(ancien).toEqual(PLUS_ANCIEN_DABORD);
  });

  it('une date sans MOIS ne départage pas — on ne décrète pas « janvier »', () => {
    // `1975` tout court ne dit rien de plus que l'année déjà comparée. La
    // comparer comme texte la placerait avant `1975-03-02`.
    const nu = { id: 10, title: 'Nu', year: 1975, original_year: 1975, original_date: '1975' } as Album;
    const date = { id: 11, title: 'Date', year: 1975, original_year: 1975, original_date: '1975-03-02' } as Album;
    expect(dateAlbum(nu, 'auto'), '« 1975 » a été retenu comme une date précise').toBeNull();
    expect(dateAlbum(date, 'auto')).toBe('1975-03-02');
    expect(comparerAlbumsParAnnee(nu, date, 'auto', 'desc'),
      'un album sans mois a été classé comme s’il était de janvier').toBe(0);
  });

  it('l’année prime TOUJOURS sur la date : 1994 passe devant décembre 1975', () => {
    // Le départage est un SECOND critère, jamais le premier — sinon un album
    // de décembre 1975 remonterait devant un album de 1994.
    const recent94 = { id: 20, title: 'R', year: 1994, original_year: 1994 } as Album;
    const vieux75 = { id: 21, title: 'V', year: 1975, original_year: 1975, original_date: '1975-12-31' } as Album;
    expect(comparerAlbumsParAnnee(recent94, vieux75, 'auto', 'desc')).toBeLessThan(0);
    expect(comparerAlbumsParAnnee(recent94, vieux75, 'auto', 'asc')).toBeGreaterThan(0);
  });

  it('un album SANS année reste en dernier dans les deux sens', () => {
    // La règle de `comparerAnnees` ne doit pas être perdue en chemin.
    const sans = { id: 40, title: 'S' } as Album;
    const avec = { id: 41, title: 'A', year: 1975, original_year: 1975 } as Album;
    expect(comparerAlbumsParAnnee(sans, avec, 'auto', 'desc')).toBeGreaterThan(0);
    expect(comparerAlbumsParAnnee(sans, avec, 'auto', 'asc')).toBeGreaterThan(0);
  });

  it('le mode d’année choisit la date LUE — édition ou origine', () => {
    // Le tri doit départager sur la même date que celle que l'écran affiche,
    // sinon deux albums se rangeraient selon une date qu'on ne montre pas.
    const a = {
      id: 30, title: 'A', year: 1994, original_year: 1975,
      release_date: '1994-11-02', original_date: '1975-03-01',
    } as Album;
    expect(dateAlbum(a, 'edition')).toBe('1994-11-02');
    expect(dateAlbum(a, 'origine')).toBe('1975-03-01');
    expect(dateAlbum(a, 'auto'), 'auto doit préférer l’origine, comme anneeAlbum').toBe('1975-03-01');
  });
});
