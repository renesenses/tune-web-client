// @vitest-environment jsdom
//
// 🔴 `renesenses/tune-web-client#872` — Jean Valjean, 0.9.143, Windows 11 /
// Firefox, fil 1732 : « on clique sur les ... d'un morceau [de la file
// d'attente], il est impossible de voir plus d'options ». Sa capture montre un
// rectangle arrondi QUASI VIDE sous la ligne, avec un fragment tronqué en haut.
//
// La cause, établie dans le ticket : `.queue-item` porte
// `content-visibility: auto`, qui implique `contain: layout style paint` ; le
// panneau de `TrackContextMenu` commence à `top: calc(100% + 4px)`, donc hors
// de la boîte de 56 px de la ligne, et la contention de peinture le rogne.
//
// CE QUE CE FICHIER TIENT, ET RIEN DE PLUS
// ----------------------------------------
// jsdom n'a AUCUNE mise en page : `content-visibility`, `overflow` et les
// feuilles de style de composant n'y produisent rien. Une garde qui
// prétendrait « le panneau est visible » mentirait — c'est la même limite que
// `enTetesAncres2112`.
//
// Ce qui SE mesure, c'est la STRUCTURE dont le rognage dépend : un panneau qui
// n'est pas un descendant de la ligne ne peut pas être rogné par elle, ni par
// aucun de ses ancêtres. C'est vrai sans mesurer un pixel et dans tous les
// moteurs. Et le placement, lui, est un calcul pur : il se vérifie exactement.
//
// CONTRE-ÉPREUVE — ce fichier est ROUGE avant le correctif :
//   · `panneauHorsDeLaLigne` : sur `main`, le panneau est rendu DANS
//     `.track-more-wrap`, donc `hote.contains(panneau)` vaut `true` ;
//   · `styleMenuAncre` n'existait pas — l'import échouait.
// Une troisième épreuve, ci-dessous, sabote le calcul en mémoire et vérifie
// que l'assertion de placement vire bien au rouge : sans elle, un
// `styleMenuAncre` qui rendrait n'importe quoi passerait pour gardé.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import MenuPisteV1 from '../../components/MenuPisteV1.svelte';
import { LARGEUR_MENU, styleMenuAncre } from '../ancrageMenu';
import type { Track } from '../types';

vi.spyOn(console, 'error').mockImplementation(() => {});

let monte: any = null;
let hote: HTMLElement | null = null;
afterEach(() => {
  if (monte) unmount(monte, { outro: false });
  monte = null;
  if (hote) hote.remove();
  hote = null;
});

const PISTE: Track = {
  id: 2450, title: 'La fleur', artist_id: 125, artist_name: 'M',
  album_id: 259, album_title: 'Je dis aime', source: 'local',
};

/** Monte le bouton « … » dans un hôte, clique, et rend l'hôte. */
function ouvrir(): HTMLElement {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(MenuPisteV1 as never, { target: hote, props: { piste: PISTE } as never });
  flushSync();
  const bouton = hote.querySelector('.track-more-btn') as HTMLElement;
  expect(bouton, 'aucun bouton « … » rendu').toBeTruthy();
  bouton.click();
  flushSync();
  return hote;
}

describe('#872 — le panneau échappe à la ligne qui l’ouvre', () => {
  it('le panneau n’est PAS un descendant de l’hôte du bouton', () => {
    const h = ouvrir();
    const panneau = document.querySelector('.track-menu');
    expect(panneau, 'aucun panneau rendu').toBeTruthy();
    expect(
      h.contains(panneau),
      'le panneau est resté dans la ligne : tout ancêtre qui contient sa peinture le rognera',
    ).toBe(false);
    expect(panneau!.parentElement?.classList.contains('track-menu-backdrop')).toBe(true);
    expect(document.body.contains(panneau), 'le panneau a disparu du document').toBe(true);
  });

  it('le FOND aussi est porté : sinon il couvrirait la seule ligne', () => {
    const h = ouvrir();
    const fond = document.querySelector('.track-menu-backdrop');
    expect(fond, 'aucun fond rendu').toBeTruthy();
    expect(h.contains(fond), 'le fond est resté dans la ligne').toBe(false);
    expect(fond!.parentElement).toBe(document.body);
  });

  it('le panneau est retiré du document au démontage', () => {
    ouvrir();
    expect(document.querySelectorAll('.track-menu')).toHaveLength(1);
    unmount(monte, { outro: false });
    monte = null;
    flushSync();
    expect(
      document.querySelectorAll('.track-menu'),
      'le panneau survit à l’écran qui l’a ouvert',
    ).toHaveLength(0);
  });
});

/** La fenêtre de référence des épreuves de placement. */
const FENETRE = { innerWidth: 1440, innerHeight: 900 };
const ancre = (top: number, bottom: number, right: number) => ({ top, bottom, right });

describe('#872 — où le panneau se pose, une fois libre', () => {
  it('sous le bouton, aligné à droite sur lui', () => {
    const s = styleMenuAncre(ancre(300, 326, 1000), 7, FENETRE);
    expect(s).toBe(`left:${1000 - LARGEUR_MENU}px;top:330px;`);
  });

  it('au-dessus, quand le bas de la fenêtre est trop proche', () => {
    // Sept entrées ≈ 246 px : posé à 326, le panneau finirait à 580 — ça tient.
    expect(styleMenuAncre(ancre(300, 326, 1000), 7, FENETRE)).toContain('top:');
    // Depuis la dernière ligne de la liste, il naîtrait hors de l'écran.
    const bas = styleMenuAncre(ancre(840, 866, 1000), 7, FENETRE);
    expect(bas, 'le panneau naîtrait sous le bord bas').toContain('bottom:');
    expect(bas).toBe(`left:${1000 - LARGEUR_MENU}px;bottom:${900 - 840 + 4}px;`);
  });

  it('borné aux deux bords : un bouton au ras du cadre ne le pousse pas dehors', () => {
    expect(styleMenuAncre(ancre(300, 326, 1438), 4, FENETRE))
      .toContain(`left:${1440 - LARGEUR_MENU - 8}px;`);
    expect(styleMenuAncre(ancre(300, 326, 40), 4, FENETRE)).toContain('left:8px;');
  });

  it('CONTRE-ÉPREUVE : un calcul saboté fait bien virer l’épreuve au rouge', () => {
    // Le sabotage vit ici, en mémoire, et ne touche pas le fichier corrigé :
    // remettre le panneau à gauche du bouton, comme le ferait un oubli du
    // retrait de la largeur.
    const sabote = (a: { top: number; bottom: number; right: number }) =>
      `left:${a.right}px;top:${a.bottom + 4}px;`;
    const attendu = `left:${1000 - LARGEUR_MENU}px;top:330px;`;
    expect(styleMenuAncre(ancre(300, 326, 1000), 7, FENETRE)).toBe(attendu);
    expect(
      sabote(ancre(300, 326, 1000)),
      'le sabotage passe l’assertion : elle ne garde rien',
    ).not.toBe(attendu);
  });
});
