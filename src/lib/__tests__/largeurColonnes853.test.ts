// 🔴 `renesenses/tune-web-client#853` — Pierre M, fil 1671 :
// « impossible de lire le morceau ou l'artiste, la répartition des largeurs
// des colonnes me semble une révision... » et « pas d'ascenseur horizontale ».
//
// LE MÉCANISME, ARITHMÉTIQUE
// --------------------------
// Toutes les colonnes de texte étaient en `minmax(0, Nfr)` — plancher ZÉRO —
// et tout le reste en pixels fixes. Sur sa capture (fenêtre de 1 491 px, ~19
// colonnes cochées contre 10 par défaut au niveau Expert) :
//
//     fixes ≈ 44+64+56+72+64+132+56+76+86+124+86+178 ≈ 1 040 px
//     utiles ≈ 1 450 px  ⇒  reste ~400 px pour ~12,6 fr
//     ⇒ 1 fr ≈ 32 px, et le titre (2 fr) ≈ 64 px
//
// C'est exactement le « E… » qu'il montre. `overflow:hidden` +
// `text-overflow:ellipsis` rendaient l'écrasement PROPRE — donc invisible à la
// lecture du code.
//
// CE QUE CE FICHIER TIENT
// -----------------------
// jsdom ne met rien en page : on ne mesure pas des pixels. On tient les deux
// invariants qui les causent — aucune colonne de texte n'a un plancher nul, et
// la largeur minimale du tableau se calcule pour que le conteneur puisse poser
// un ascenseur au lieu de comprimer.
//
// CONTRE-ÉPREUVE : la dernière épreuve rejoue un catalogue à plancher zéro et
// exige que le prédicat le refuse.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { COLONNES, largeurMinimale, type Colonne } from '../colonnesPistes';

/** Une colonne de texte : sa largeur est un `minmax`, pas un nombre de pixels. */
const estTexte = (c: Colonne) => c.largeur.startsWith('minmax(');
const plancherDe = (c: Colonne) => {
  const m = /^minmax\(([0-9.]+)px,/.exec(c.largeur);
  return m ? parseFloat(m[1]) : 0;
};

describe('#853 — aucune colonne de texte ne peut tomber à zéro', () => {
  it('🔴 chaque colonne de texte a un plancher en pixels', () => {
    const nues = COLONNES.filter((c) => estTexte(c) && plancherDe(c) <= 0);
    expect(
      nues.map((c) => c.cle),
      'ces colonnes peuvent encore être écrasées jusqu’à une lettre',
    ).toEqual([]);
  });

  it('le TITRE, qui porte le clic de lecture, a le plancher le plus large', () => {
    const titre = COLONNES.find((c) => c.cle === 'title')!;
    const autres = COLONNES.filter((c) => estTexte(c) && c.cle !== 'title');
    for (const c of autres) {
      expect(plancherDe(titre), `${c.cle} a un plancher plus large que le titre`)
        .toBeGreaterThanOrEqual(plancherDe(c));
    }
  });
});

describe('#853 — la largeur en deçà de laquelle le tableau doit DÉFILER', () => {
  it('elle additionne les fixes et les planchers', () => {
    const jeu: Colonne[] = [
      { cle: 'num', cleI18n: 'x', largeur: '44px' } as Colonne,
      { cle: 'title', cleI18n: 'x', largeur: 'minmax(170px,2fr)' } as Colonne,
      { cle: 'time', cleI18n: 'x', largeur: '64px' } as Colonne,
    ];
    expect(largeurMinimale(jeu)).toBe(44 + 170 + 64);
    expect(largeurMinimale(jeu, 178)).toBe(44 + 170 + 64 + 178);
  });

  it('🔴 le cas de Pierre M dépasse sa fenêtre — donc il DOIT défiler', () => {
    // Les colonnes de sa capture, dans l'ordre de l'en-tête qu'elle montre.
    const cles = ['num', 'title', 'artist', 'time', 'year', 'channels', 'bpm', 'genre',
      'quality', 'album', 'albumArtist', 'disc', 'label', 'format', 'sampleRate',
      'isrc', 'composer', 'source', 'path'];
    const jeu = cles
      .map((k) => COLONNES.find((c) => c.cle === k))
      .filter((c): c is Colonne => c != null);
    expect(jeu.length, 'des colonnes de la capture ont disparu du catalogue')
      .toBeGreaterThanOrEqual(17);
    const min = largeurMinimale(jeu, 178);
    expect(min, `largeur minimale calculée : ${min} px`).toBeGreaterThan(1491);
  });

  it('le conteneur pose bien un ascenseur, et la grille porte le plancher', () => {
    const src = readFileSync(
      resolve(__dirname, '../../components/v2/ListePistesV2.svelte'), 'utf-8',
    );
    const css = src.slice(src.lastIndexOf('<style')).replace(/\/\*[\s\S]*?\*\//g, ' ');
    expect(/\.tbl\{[^}]*overflow-x:auto/.test(css),
      'le tableau ne peut pas déborder : il comprimera toujours').toBe(true);
    expect(/\.thead, \.trow\{[^}]*min-width:var\(--tmin/.test(css),
      'la grille ignore le plancher qu’on vient de calculer').toBe(true);
    expect(src).toContain('--tmin:{minGrille}px');
  });

  it('CONTRE-ÉPREUVE : un catalogue à plancher zéro est bien REFUSÉ', () => {
    const zero = { cle: 'title', cleI18n: 'x', largeur: 'minmax(0,2fr)' } as Colonne;
    expect(plancherDe(zero), 'le témoin ne reproduit pas l’ancien plancher').toBe(0);
    expect(largeurMinimale([zero], 178), 'un plancher nul compte encore pour quelque chose')
      .toBe(178);
  });
});
