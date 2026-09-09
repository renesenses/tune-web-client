// @vitest-environment jsdom
//
// renesenses/tune-server-rust#3101 — Sevy Tabroc, 0.9.129 macOS, forum 1637 :
//
//   « Lorsque je sélectionne un répertoire celui-ci apparait dans bibliothèque
//     mais c'est l'entièreté de la bibliothèque en cours qui s'affiche et non
//     pas celle du répertoire sélectionné. »
//
// ## Ce qui était déjà fait, et ce qui restait
//
// `a3c80c75` (PR #747) a posé `libraryFolderScope` et `lib/porteeBibliotheque`,
// et l'ANCIEN client honore la portée sur ses trois listes
// (`porteeRepertoireEcranMonte3101.test.ts`). Le NOUVEAU — celui que voient
// les testeurs — ne l'honorait que sur l'onglet **Albums** :
//
//   - onglet **Titres** : `api.getAllTracks()`, toute la bibliothèque, et un
//     drapeau `tracksLoaded` qui interdisait tout rechargement — la portée ne
//     pouvait donc même pas s'appliquer après coup ;
//   - onglet **Artistes** : `/library/artists`, la table entière, aucune
//     portée passée à `ArtistesV2`.
//
// Dans les deux cas la PUCE du dossier était peinte au-dessus (`{#if
// porteeActive}`) : l'écran annonçait un répertoire et montrait tout. C'est le
// signalement, mot pour mot.
//
// 🔴 CES TÉMOINS MONTENT `LibraryV2`, cliquent l'onglet, et lisent le DOM
// RENDU plus la REQUÊTE réellement émise. Aucun ne cherche une chaîne dans un
// fichier source.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import LibraryV2 from '../../components/v2/LibraryV2.svelte';
import { activeView } from '../stores/navigation';
import { albums as albumsStore, libraryFolderScope } from '../stores/library';
import type { Album } from '../types';
import lFr from '../locales/fr';

const fr = lFr as unknown as Record<string, string>;

/** Monter `LibraryV2` compile un composant de plusieurs milliers de lignes. */
vi.setConfig({ testTimeout: 30_000 });

/** Une des quatre racines déclarées par Sevy Tabroc. */
const DOSSIER = '/Volumes/Music/CDThèque Yves';

class ResizeObserverInerte {
  observe() {}
  unobserve() {}
  disconnect() {}
}
for (const [prop, valeur] of [['clientHeight', 2000], ['clientWidth', 1400]] as const) {
  Object.defineProperty(HTMLElement.prototype, prop, { configurable: true, get: () => valeur });
}

// ── Le catalogue ──────────────────────────────────────────────────────────
// Deux albums DANS le dossier, deux HORS. Chacun porte son artiste.
const ALBUMS_PORTEE: Album[] = [
  { id: 9001, title: 'Frost', artist_id: 50, artist_name: 'Frost' },
  { id: 9002, title: 'CDThèque vol. 2', artist_id: 51, artist_name: 'Yves Corbat' },
] as Album[];
const ALBUMS_HORS: Album[] = [
  { id: 1, title: 'Album hors portée 1', artist_id: 999, artist_name: 'Hors Portee' },
  { id: 2, title: 'Album hors portée 2', artist_id: 999, artist_name: 'Hors Portee' },
] as Album[];

const ARTISTES = [
  { id: 50, name: 'Frost', image_path: null },
  { id: 51, name: 'Yves Corbat', image_path: null },
  { id: 999, name: 'Hors Portee', image_path: null },
];

/** Ce que `/library/tracks?folder=…` rend pour le dossier choisi. */
const PISTES_DU_DOSSIER = [
  { id: 1, title: 'Givre A1', album_id: 9001, album_title: 'Frost', artist_id: 50, artist_name: 'Frost' },
  { id: 2, title: 'Givre A2', album_id: 9001, album_title: 'Frost', artist_id: 50, artist_name: 'Frost' },
];
/** Ce que rend `/library/tracks` SANS portée — ce qui ne doit pas s'afficher. */
const PISTES_HORS_PORTEE = [
  { id: 500, title: 'Titre hors portee', album_id: 1, album_title: 'Album hors portée 1', artist_id: 999, artist_name: 'Hors Portee' },
];

let urls: string[] = [];

function corpsPour(u: string): unknown {
  if (/\/library\/albums-detailed/.test(u)) {
    return /[?&]folder=/.test(u)
      ? { items: ALBUMS_PORTEE.map((a) => ({ album_id: a.id })), total: 2 }
      : { items: [...ALBUMS_PORTEE, ...ALBUMS_HORS].map((a) => ({ album_id: a.id })), total: 4 };
  }
  if (/\/library\/tracks/.test(u)) {
    return /[?&]folder=/.test(u)
      ? { items: PISTES_DU_DOSSIER, total: PISTES_DU_DOSSIER.length }
      : PISTES_HORS_PORTEE;
  }
  if (/\/library\/artists/.test(u)) return ARTISTES;
  if (/\/library\/stats/.test(u)) return { tracks: 46877 };
  if (/\/zones/.test(u)) return [];
  if (/\/playlists/.test(u)) return [];
  return {};
}

let hote: HTMLDivElement | null = null;
let monte: Record<string, unknown> | null = null;
const respirer = () => new Promise((r) => setTimeout(r, 0));

async function poser(): Promise<HTMLDivElement> {
  activeView.set('library');
  albumsStore.set([...ALBUMS_PORTEE, ...ALBUMS_HORS]);
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(LibraryV2, { target: hote, props: {} as any });
  for (let i = 0; i < 10; i++) await respirer();
  flushSync();
  return hote;
}

/** Clique l'onglet par son libellé — le geste de l'utilisateur. */
async function ouvrirOnglet(el: HTMLElement, libelle: string) {
  const b = [...el.querySelectorAll('button.tab')].find(
    (x) => (x.textContent ?? '').trim() === libelle,
  );
  expect(b, `aucun onglet « ${libelle} »`).toBeTruthy();
  (b as HTMLElement).click();
  for (let i = 0; i < 10; i++) await respirer();
  flushSync();
}

const texte = (el: HTMLElement, sel: string) =>
  (el.querySelector(sel)?.textContent ?? '').replace(/\s+/g, ' ');

beforeEach(() => {
  urls = [];
  activeView.set('home');
  libraryFolderScope.set(null);
  localStorage.clear();
  vi.stubGlobal('ResizeObserver', ResizeObserverInerte);
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: any) => {
      const u = String(url);
      urls.push(u);
      const corps = corpsPour(u);
      return {
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: new Map([['content-type', 'application/json']]),
        json: async () => corps,
        text: async () => JSON.stringify(corps),
      } as unknown as Response;
    }),
  );
  vi.stubGlobal('WebSocket', class {
    close() {}
    addEventListener() {}
    removeEventListener() {}
    send() {}
  } as unknown as typeof WebSocket);
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

describe('#3101 — onglet Titres : la portée s’applique, et un changement de portée recharge', () => {
  it('les titres affichés sont ceux du RÉPERTOIRE, pas ceux de la bibliothèque', async () => {
    const el = await poser();
    // 1. Sans portée : l'onglet Titres montre la bibliothèque. C'est la
    //    contre-épreuve du dispositif — sans elle, « le titre hors portée est
    //    absent » serait vrai d'un écran qui n'affiche jamais rien.
    await ouvrirOnglet(el, fr['favorites.tracks']);
    expect(texte(el, '.tracklist'), 'l’onglet Titres n’a rien chargé du tout')
      .toContain('Titre hors portee');

    // 2. « Voir en bibliothèque » sur un répertoire — le geste du ticket.
    libraryFolderScope.set(DOSSIER);
    for (let i = 0; i < 12; i++) await respirer();
    flushSync();

    // La puce annonce bien le dossier…
    expect(texte(el, '.portee')).toContain('CDThèque Yves');
    // …et la liste doit être celle du dossier, pas « l'entièreté de la
    // bibliothèque en cours ».
    const liste = texte(el, '.tracklist');
    expect(liste, 'la bibliothèque entière est restée sous la puce du dossier')
      .not.toContain('Titre hors portee');
    expect(liste).toContain('Givre A1');
    expect(liste).toContain('Givre A2');

    // Et la requête est bien partie AVEC le dossier.
    expect(
      urls.some((u) => /\/library\/tracks/.test(u) && /[?&]folder=/.test(u)),
      'aucune requête de titres n’a porté le dossier',
    ).toBe(true);
  });

  /**
   * La PUCE de comptage, sous portée.
   *
   * `/library/stats` rend le total de TOUTE la bibliothèque — 46 877 titres
   * sur le .18. Il sert à annoncer un compte pendant que la longue liste
   * charge ; sous une portée de répertoire il annoncerait la bibliothèque
   * entière au-dessus d'une liste qui n'en montre qu'un dossier. C'est la même
   * faute que celle du ticket, d'un cran plus petit.
   *
   * (Le pendant textuel de cette garde vit dans `bibliothequePistes.test.ts`,
   * « un dépôt distant ne se voit pas prêter le total LOCAL » ; celle-ci lit
   * la puce RENDUE.)
   */
  it('la puce ne prête pas le total du serveur sous une portée', async () => {
    const el = await poser();
    libraryFolderScope.set(DOSSIER);
    await ouvrirOnglet(el, fr['favorites.tracks']);
    for (let i = 0; i < 12; i++) await respirer();
    flushSync();
    const puce = texte(el, '.chip.count');
    expect(puce, 'la puce annonce le total de toute la bibliothèque').not.toContain('46');
    expect(puce).toContain('2');
  });
});

describe('#3101 — onglet Artistes : la portée s’y applique aussi', () => {
  it('seuls les artistes du RÉPERTOIRE sont montrés', async () => {
    const el = await poser();
    await ouvrirOnglet(el, fr['favorites.artists']);
    // Contre-épreuve du dispositif : sans portée, les trois artistes sont là.
    expect(el.textContent, 'la grille d’artistes est vide : le témoin ne prouverait rien')
      .toContain('Hors Portee');

    libraryFolderScope.set(DOSSIER);
    for (let i = 0; i < 12; i++) await respirer();
    flushSync();

    expect(texte(el, '.portee')).toContain('CDThèque Yves');
    expect(
      el.textContent,
      'tous les artistes de la bibliothèque restent affichés sous la puce du dossier',
    ).not.toContain('Hors Portee');
    expect(el.textContent).toContain('Frost');
    expect(el.textContent).toContain('Yves Corbat');
  });
});
