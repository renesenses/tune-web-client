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
 * Affordance du bouton « aléatoire » de l'en-tête Bibliothèque —
 * `renesenses/tune-server-rust#2261`.
 *
 * Signalé par Jean Valjean (forum, fil 764, Tune 0.8.159) :
 *
 *   « En haut dans bibliothèque, j'ai l'indication lecture aléatoire avec son
 *     symbole coloré. Il n'est pas possible de le désactiver en cliquant
 *     dessus. »
 *
 * Il cherchait à ÉTEINDRE UN MODE. Le bouton, lui, LANCE UNE LECTURE. Chaque
 * clic relançait donc une lecture aléatoire de toute la bibliothèque au lieu de
 * l'arrêter.
 *
 * Deux contrôles distincts se présentent aujourd'hui de façon interchangeable :
 *
 *   - l'en-tête Bibliothèque (`LibraryView.svelte`, `.shuffle-all-btn`) →
 *     `api.shuffleAll(...)`, une ACTION sans état ;
 *   - la barre de transport (`TransportBar.svelte`, `class:active={$shuffleEnabled}`)
 *     → `api.setShuffle(...)`, une BASCULE qui porte un état.
 *
 * Le correctif n'ajoute PAS d'état au bouton de la Bibliothèque : il n'en a pas
 * à porter, et lui en donner un serait mentir. Il le fait LIRE comme une
 * action — glyphe distinct de celui de la bascule, et libellé verbal.
 *
 * Les deux règles ci-dessous sont celles qui, si elles avaient tenu, auraient
 * évité la confusion. Elles échouent toutes les deux sur `origin/main`.
 */

const LIBRARY_VIEW = readFileSync(
  resolve(__dirname, '../../components/LibraryView.svelte'),
  'utf8',
);
const TRANSPORT_BAR = readFileSync(
  resolve(__dirname, '../../components/TransportBar.svelte'),
  'utf8',
);

/**
 * Extrait le premier `<svg>…</svg>` qui suit `ancre` dans `source`.
 *
 * On repère le bouton par une ancre textuelle stable (sa classe, ou la liaison
 * d'état qui le caractérise) plutôt que par un numéro de ligne : les numéros
 * bougent à chaque édition du fichier et un test qui les cite devient faux
 * sans rien signaler.
 */
function svgApres(source: string, ancre: string, ouQuoi: string): string {
  const debutAncre = source.indexOf(ancre);
  expect(debutAncre, `ancre introuvable dans ${ouQuoi} : ${ancre}`).toBeGreaterThan(-1);

  const debutSvg = source.indexOf('<svg', debutAncre);
  expect(debutSvg, `aucun <svg> après l'ancre dans ${ouQuoi}`).toBeGreaterThan(-1);

  const finSvg = source.indexOf('</svg>', debutSvg);
  expect(finSvg, `<svg> non refermé dans ${ouQuoi}`).toBeGreaterThan(-1);

  return source.slice(debutSvg, finSvg + '</svg>'.length);
}

/**
 * Réduit un `<svg>` à sa géométrie : la liste ordonnée de ses primitives de
 * tracé, espaces normalisés. Deux glyphes dont la géométrie coïncide dessinent
 * le même symbole à l'écran, quelles que soient leurs tailles ou leurs classes.
 */
function geometrie(svg: string): string[] {
  const primitives = svg.match(/<(?:path|polyline|polygon|line|circle|rect)\b[^>]*?\/?>/g) ?? [];
  return primitives.map((primitive) => {
    // On compare le DESSIN, pas sa mise en forme dans le fichier : le nom de la
    // balise et ses attributs triés. Sans cette normalisation, un simple espace
    // avant le `/>` suffirait à faire passer le test alors que les deux glyphes
    // sont rigoureusement superposables à l'écran — c'est arrivé à la première
    // rédaction de ce test.
    const nom = primitive.match(/^<([a-z]+)/)?.[1] ?? '?';
    const attributs = [...primitive.matchAll(/([a-zA-Z-]+)="([^"]*)"/g)]
      .map(([, cle, valeur]) => `${cle}=${valeur.replace(/\s+/g, ' ').trim()}`)
      .sort();
    return `${nom}|${attributs.join(';')}`;
  });
}

const GLYPHE_ENTETE = svgApres(
  LIBRARY_VIEW,
  'class="shuffle-all-btn"',
  'LibraryView.svelte',
);
const GLYPHE_BASCULE = svgApres(
  TRANSPORT_BAR,
  'class:active={$shuffleEnabled}',
  'TransportBar.svelte',
);

describe("le glyphe de l'action ne peut pas être celui de la bascule", () => {
  it('les deux boutons ont bien été retrouvés dans les sources', () => {
    expect(geometrie(GLYPHE_ENTETE).length).toBeGreaterThan(0);
    expect(geometrie(GLYPHE_BASCULE).length).toBeGreaterThan(0);
  });

  it("l'en-tête Bibliothèque ne dessine pas le symbole de la bascule de transport", () => {
    // C'est le cœur de #2261 : sur origin/main les deux <svg> portent les mêmes
    // cinq primitives, au caractère près. Rien à l'écran ne distingue
    // « déclencher » de « activer ».
    expect(
      geometrie(GLYPHE_ENTETE),
      "le bouton d'action de la Bibliothèque dessine exactement le même symbole que la bascule de la barre de transport",
    ).not.toEqual(geometrie(GLYPHE_BASCULE));
  });

  it("le glyphe de l'en-tête porte une marque de lecture, absente de la bascule", () => {
    // Une icône de lecture accolée dit « ceci démarre quelque chose ». La
    // bascule, elle, ne doit surtout pas en porter : elle ne démarre rien.
    expect(GLYPHE_ENTETE).toMatch(/shuffle-all-play/);
    expect(GLYPHE_BASCULE).not.toMatch(/shuffle-all-play/);
  });
});

describe("le bouton de l'en-tête reste une action, pas une bascule", () => {
  const balise = (() => {
    const debut = LIBRARY_VIEW.indexOf('<button class="shuffle-all-btn"');
    expect(debut, 'bouton .shuffle-all-btn introuvable').toBeGreaterThan(-1);
    return LIBRARY_VIEW.slice(debut, LIBRARY_VIEW.indexOf('>', debut) + 1);
  })();

  it("il ne se déguise pas en bascule avec aria-pressed", () => {
    // Le correctif ne doit PAS « régler » le problème en inventant un état :
    // le bouton n'en a aucun à refléter, et un aria-pressed toujours faux
    // ment autant que le glyphe partagé.
    expect(balise).not.toMatch(/aria-pressed/);
  });

  it("il ne se déguise pas en bascule avec class:active", () => {
    expect(balise).not.toMatch(/class:active/);
  });

  it('la vraie bascule, elle, conserve son état', () => {
    expect(TRANSPORT_BAR).toMatch(/class:active=\{\$shuffleEnabled\}/);
  });
});

type Dict = Record<string, string | undefined>;

const LANGUES: Array<[string, Dict]> = [
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

/** Les trois libellés que peut porter le bouton de l'en-tête Bibliothèque. */
const CLES_ENTETE = [
  'library.shuffleAll',
  'library.shuffle',
  'library.shuffleResults',
] as const;

describe("les libellés de l'en-tête ne se confondent pas avec celui de la bascule", () => {
  it('les onze langues sont couvertes par ce test', () => {
    expect(LANGUES).toHaveLength(11);
  });

  for (const [nom, dict] of LANGUES) {
    for (const cle of CLES_ENTETE) {
      it(`${nom} — ${cle} est renseigné`, () => {
        const valeur = dict[cle];
        expect(valeur, `${cle} manque en ${nom}`).toBeDefined();
        expect(String(valeur).trim().length).toBeGreaterThan(0);
        expect(valeur).not.toBe(cle);
      });

      it(`${nom} — ${cle} ne répète pas transport.shuffle`, () => {
        // Neuf langues sur onze nomment aujourd'hui l'action et le mode avec
        // le MÊME mot (« Shuffle », « Casuale », « 셔플 », « 随机播放 »…).
        // Même glyphe, même mot : la confusion du testeur était inévitable.
        const bascule = dict['transport.shuffle'];
        expect(bascule, `transport.shuffle manque en ${nom}`).toBeDefined();
        expect(
          dict[cle],
          `en ${nom}, ${cle} et transport.shuffle portent le même libellé`,
        ).not.toBe(bascule);
      });
    }
  }
});
