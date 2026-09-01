import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import fr from '../locales/fr';
import en from '../locales/en';
import de from '../locales/de';
import es from '../locales/es';
import it_ from '../locales/it';
import ja from '../locales/ja';
import ko from '../locales/ko';
import ro from '../locales/ro';
import sv from '../locales/sv';
import zh from '../locales/zh';
import hu from '../locales/hu';

/**
 * #2574 — « On ne retrouve pas les mêmes fonctions/options disponibles sur un
 * titre en fonction du menu » (FabienM, forum du 27/08, v0.9.115).
 *
 * L'inventaire est dans la PR. Ces tests ne gardent QUE les écarts tranchés :
 *
 *  1. l'onglet « Titres » de la bibliothèque n'ouvrait aucun menu « … », alors
 *     que la fiche d'album — le même objet, le même écran — en ouvre un ;
 *  2. la fiche d'album se rend en DEUX exemplaires (multi-disque / mono-disque)
 *     qui n'offraient pas le même menu : le mono-disque proposait « Aller à
 *     l'album » alors qu'on y est déjà ;
 *  3. la même action porte deux libellés selon l'écran.
 *
 * Ils gardent AUSSI l'écart légitime, dans l'autre sens : « Autres versions »
 * doit RESTER absente de l'onglet « Titres », faute du panneau dépliant qui en
 * affiche le résultat. Uniformiser à l'aveugle y ferait apparaître une entrée
 * muette — pire qu'une entrée absente.
 *
 * Ces tests lisent les sources. Les commentaires sont dépouillés avant toute
 * recherche : un motif trouvé dans un commentaire laisserait la garde verte à
 * tort.
 */

const lire = (chemin: string) => readFileSync(resolve(__dirname, chemin), 'utf8');

/** Retire les commentaires HTML/Svelte et les commentaires JS de bloc et de ligne. */
function sansCommentaires(src: string): string {
  return src
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
}

const LIBRARY = sansCommentaires(lire('../../components/LibraryView.svelte'));

/** Découpe `src` entre le premier `debut` et le premier `fin` qui le suit. */
function tranche(src: string, debut: string, fin: string): string {
  const i = src.indexOf(debut);
  expect(i, `ancre introuvable : ${debut}`).toBeGreaterThan(-1);
  const j = src.indexOf(fin, i + debut.length);
  expect(j, `ancre de fin introuvable : ${fin}`).toBeGreaterThan(-1);
  return src.slice(i, j);
}

/** Les noms de props passés au premier `<TrackContextMenu … />` de `bloc`. */
function propsDuMenu(bloc: string): string[] {
  const i = bloc.indexOf('<TrackContextMenu');
  expect(i, 'aucun <TrackContextMenu> dans ce bloc').toBeGreaterThan(-1);
  const j = bloc.indexOf('/>', i);
  expect(j, '<TrackContextMenu> non refermé').toBeGreaterThan(-1);
  const corps = bloc.slice(i + '<TrackContextMenu'.length, j);
  return [...corps.matchAll(/(^|\s)(on[A-Z][A-Za-z]*)=/g)].map((m) => m[2]).sort();
}

// Les trois listes de pistes de la bibliothèque, bornées à leur branche.
const FICHE_MULTI_DISQUE = tranche(LIBRARY, '{#if hasMultipleDiscs}', "{:else if $libraryTab === 'artists'}");
const ONGLET_TITRES = tranche(LIBRARY, "{:else if $libraryTab === 'tracks'}", "{:else if $libraryTab === 'genres'}");

describe("#2574 — l'onglet « Titres » ouvre le même menu que la fiche d'album", () => {
  it('une piste de l\'onglet « Titres » porte un menu « … »', () => {
    expect(
      ONGLET_TITRES.includes('<TrackContextMenu'),
      "l'onglet « Titres » ne monte aucun TrackContextMenu : le même objet " +
        "n'offre pas les mêmes actions selon l'onglet",
    ).toBe(true);
  });

  it('le menu de l\'onglet « Titres » offre les six actions praticables', () => {
    expect(propsDuMenu(ONGLET_TITRES)).toEqual([
      'onAddToPlaylist',
      'onAddToQueue',
      'onClose',
      'onGoToAlbum',
      'onGoToArtist',
      'onPlay',
      'onPlaySimilar',
    ]);
  });

  /**
   * L'écart légitime. `expandedTrackVersions` n'est rendu que dans la fiche
   * d'album : sans ce panneau, « Autres versions » basculerait un état que
   * rien n'affiche. L'entrée doit rester absente de cet onglet.
   */
  it('« Autres versions » reste absente faute de panneau pour l\'afficher', () => {
    expect(
      ONGLET_TITRES.includes('expandedTrackVersions'),
      'le panneau des versions est apparu dans l\'onglet « Titres » : ' +
        'ce test doit alors être revu, l\'entrée devient praticable',
    ).toBe(false);
    expect(
      ONGLET_TITRES.includes('onOtherVersions'),
      "« Autres versions » est branchée sans le panneau qui l'affiche : " +
        'une entrée muette, pire qu\'une entrée absente',
    ).toBe(false);
  });
});

describe("#2574 — la fiche d'album offre le même menu sur ses deux rendus", () => {
  it('les rendus multi-disque et mono-disque montent chacun un menu', () => {
    const montages = LIBRARY.split('<TrackContextMenu').length - 1;
    expect(montages, 'le nombre de menus montés a changé').toBe(3);
    expect(FICHE_MULTI_DISQUE.split('<TrackContextMenu').length - 1).toBe(2);
  });

  it('les deux rendus offrent EXACTEMENT les mêmes actions', () => {
    const i = FICHE_MULTI_DISQUE.indexOf('<TrackContextMenu');
    const j = FICHE_MULTI_DISQUE.indexOf('<TrackContextMenu', i + 1);
    const multi = propsDuMenu(FICHE_MULTI_DISQUE.slice(i, j));
    const mono = propsDuMenu(FICHE_MULTI_DISQUE.slice(j));
    expect(
      mono,
      'un album à un disque et un album à plusieurs disques sont le MÊME écran : ' +
        'leurs menus ont dérivé',
    ).toEqual(multi);
  });

  /**
   * « Aller à l'album » depuis la fiche de cet album relançait
   * `selectAlbumDetail($selectedAlbum)` : on y est déjà. Une action présente
   * qui ne mène nulle part est pire qu'une action absente.
   */
  it("aucun menu ne propose « Aller à l'album » vers l'album déjà ouvert", () => {
    expect(
      /onGoToAlbum=\{\(\)\s*=>\s*selectAlbumDetail\(\$selectedAlbum/.test(LIBRARY),
      "« Aller à l'album » renvoie vers l'album déjà affiché : entrée inopérante",
    ).toBe(false);
  });
});

type Dict = Record<string, string | undefined>;

const LANGUES: [string, Dict][] = [
  ['fr', fr as Dict],
  ['en', en as Dict],
  ['de', de as Dict],
  ['es', es as Dict],
  ['it', it_ as Dict],
  ['ja', ja as Dict],
  ['ko', ko as Dict],
  ['ro', ro as Dict],
  ['sv', sv as Dict],
  ['zh', zh as Dict],
  ['hu', hu as Dict],
];

/**
 * Troisième cas de l'inventaire : la même action, nommée autrement selon
 * l'écran. La recherche disait « Ajouter a la file » (sans accent) là où la
 * file, la bibliothèque et le streaming disent « Ajouter à la file ».
 */
describe('#2574 — i18n : une action, un seul libellé, dans les onze langues', () => {
  it('couvre bien onze langues', () => {
    expect(LANGUES).toHaveLength(11);
  });

  for (const [langue, dict] of LANGUES) {
    it(`search.addToQueue = queue.addToQueue — ${langue}`, () => {
      const file = dict['queue.addToQueue'];
      const recherche = dict['search.addToQueue'];
      expect(file, `queue.addToQueue manque en ${langue}`).toBeTruthy();
      expect(recherche, `search.addToQueue manque en ${langue}`).toBeTruthy();
      expect(
        recherche,
        `« ${recherche} » (recherche) ≠ « ${file} » (file) en ${langue} : ` +
          "la même action porte deux noms selon l'écran",
      ).toBe(file);
    });
  }
});
