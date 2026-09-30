// web#1837 — FabienM (fil 2057, point 2), go de Bertrand du 30/09/2026 : en
// disposition « sous la barre d'avancement », le bloc pochette + colonne
// titres restait plafonné à 960 ou 1200 px (1720 et 2200 aux très grands
// écrans), et une bande vide restait à droite sur un grand écran. Le plafond
// est levé ; la pochette garde des proportions raisonnables ; « à droite »
// ne change pas.
//
// CE QUE CE TEST PROUVE, ET CE QU'IL NE PROUVE PAS
// ------------------------------------------------
// jsdom ne calcule aucune mise en page et n'applique pas les requêtes de
// média. On résout donc la cascade à la main, sur la feuille RÉELLE du
// composant (`cascadeCss.ts`, le moteur de `paliersGrandsEcrans.test.ts` et de
// `colonneSousLaBarre1837.test.ts`), puis on évalue la formule de la pochette
// pour un îlot qui occupe toute la largeur. La largeur rendue par un vrai
// navigateur (barre latérale, échelle d'affichage) n'est pas mesurée ici.
//
// La présence de la classe `file-sous-barre` sur `.content-layout`, file
// repliée comprise, est prouvée par `colonneSousLaBarre1837.test.ts`.
//
// CONTRE-ÉPREUVE (jouée sur Shrek) : sans la règle
// `.content-layout.wide.file-sous-barre { max-width: none }`, 6 rouges sur 16
// (l'îlot sur les cinq écrans, et la feuille compilée) ; sans la règle de la
// pochette, 6 aussi (les proportions sur les cinq écrans, et la feuille).
import { describe, expect, it } from 'vitest';
import { compile } from 'svelte/compiler';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { extraireFeuilleDeStyle, releverDeclarations, regleEffective, type Ecran } from '../cascadeCss';
import { largeurMaxEffective, releverReglesLargeur } from '../nowPlayingPaliers';

const CHEMIN = 'src/components/partages/NowPlaying.svelte';
const SOURCE = readFileSync(resolve(process.cwd(), CHEMIN), 'utf-8');
const FEUILLE = extraireFeuilleDeStyle(SOURCE);
const REGLES = releverReglesLargeur(FEUILLE);

const ILOT_DROITE = ['.content-layout', '.content-layout.wide'];
const ILOT_SOUS_BARRE = [...ILOT_DROITE, '.content-layout.wide.file-sous-barre'];
const POCHETTE_DROITE = ['.artwork-container', '.content-layout.wide .artwork-container'];
const POCHETTE_SOUS_BARRE = [...POCHETTE_DROITE, '.content-layout.wide.file-sous-barre .artwork-container'];

/** Les plafonds d'îlot qu'avait « sous la barre », et que garde « à droite ». */
const ECRANS: { ecran: Ecran; plafond: number }[] = [
  { ecran: { largeur: 1280, hauteur: 720 }, plafond: 960 },
  { ecran: { largeur: 1536, hauteur: 864 }, plafond: 1200 },
  { ecran: { largeur: 1920, hauteur: 1080 }, plafond: 1200 },
  { ecran: { largeur: 2560, hauteur: 1440 }, plafond: 1720 },
  { ecran: { largeur: 3840, hauteur: 2160 }, plafond: 2200 },
];

/** `gap` de l'îlot large, lu dans la feuille. */
function ecart(ecran: Ecran): number {
  const r = regleEffective(releverDeclarations(FEUILLE, ['gap']), ILOT_DROITE, 'gap', { ecran, survol: true });
  const px = /^(\d+)px$/.exec(r?.valeur ?? '');
  expect(px, 'gap de l’îlot large introuvable').not.toBeNull();
  return Number(px![1]);
}

/**
 * La largeur de la pochette en « sous la barre », pour un îlot de `ilot` px :
 * on lit la valeur gagnante, on exige la forme `min(max(var(--np-art), P%), Nvh)`
 * et on l'évalue.
 */
function pochetteSousLaBarre(ecran: Ecran, ilot: number): number {
  const gagnante = regleEffective(REGLES, POCHETTE_SOUS_BARRE, 'max-width', { ecran, survol: true });
  expect(gagnante?.selecteur, 'la pochette ne suit pas l’îlot en « sous la barre »')
    .toBe('.content-layout.wide.file-sous-barre .artwork-container');
  const forme = /^min\(\s*max\(\s*var\((--[\w-]+)\)\s*,\s*(\d+(?:\.\d+)?)%\s*\)\s*,\s*(\d+(?:\.\d+)?)vh\s*\)$/
    .exec(gagnante!.valeur.trim());
  expect(forme, `forme inattendue : ${gagnante!.valeur}`).not.toBeNull();
  const art = regleEffective(REGLES, POCHETTE_SOUS_BARRE, forme![1], { ecran, survol: true });
  const palier = Number(/^(\d+)px$/.exec(art?.valeur ?? '')?.[1]);
  expect(palier, 'palier --np-art introuvable').toBeGreaterThan(0);
  const part = (Number(forme![2]) / 100) * ilot;
  const hauteur = (Number(forme![3]) / 100) * ecran.hauteur;
  return Math.min(Math.max(palier, part), hauteur);
}

describe('web#1837 — « à droite » ne change pas', () => {
  for (const { ecran, plafond } of ECRANS) {
    it(`${ecran.largeur}×${ecran.hauteur} : l’îlot reste plafonné à ${plafond} px, la pochette à son palier`, () => {
      expect(largeurMaxEffective(REGLES, ILOT_DROITE, ecran)).toBe(plafond);
      const gagnante = regleEffective(REGLES, POCHETTE_DROITE, 'max-width', { ecran, survol: true });
      expect(gagnante?.selecteur).not.toContain('file-sous-barre');
    });
  }
});

describe('web#1837 — « sous la barre » : le plafond de l’îlot tombe', () => {
  for (const { ecran, plafond } of ECRANS) {
    it(`🔴 ${ecran.largeur}×${ecran.hauteur} : plus de plafond à ${plafond} px`, () => {
      const gagnante = regleEffective(REGLES, ILOT_SOUS_BARRE, 'max-width', { ecran, survol: true });
      expect(gagnante?.selecteur, `l’îlot reste plafonné à ${plafond} px`).toBe('.content-layout.wide.file-sous-barre');
      expect(gagnante?.valeur).toBe('none');
    });
  }
});

describe('web#1837 — « sous la barre » : la pochette garde des proportions raisonnables', () => {
  for (const { ecran } of ECRANS) {
    it(`🔴 ${ecran.largeur}×${ecran.hauteur} : pochette entre 25 et 45 % de l’îlot, jamais plus haute que la fenêtre`, () => {
      // L'îlot occupe désormais la largeur de l'écran, moins une barre
      // latérale de 240 px (hypothèse prudente : elle réduit l'îlot).
      const ilot = ecran.largeur - 240;
      const pochette = pochetteSousLaBarre(ecran, ilot);
      expect(pochette / ilot).toBeGreaterThanOrEqual(0.25);
      expect(pochette / ilot).toBeLessThanOrEqual(0.45);
      expect(pochette).toBeLessThanOrEqual(0.62 * ecran.hauteur + 0.5);
      // Jamais plus petite qu'en « à droite », à la borne de hauteur près
      // (les paliers des très grands écrans s'en affranchissent, pas celle-ci).
      const avant = largeurMaxEffective(REGLES, POCHETTE_DROITE, ecran)!;
      expect(pochette).toBeGreaterThanOrEqual(Math.min(avant, ilot, 0.62 * ecran.hauteur) - 0.5);
      // Et la colonne titres a sa place, bien au-delà des 420 px d'avant.
      expect(ilot - pochette - ecart(ecran)).toBeGreaterThan(420);
    });
  }
});

describe('web#1837 — la feuille compilée garde les deux règles', () => {
  it('Svelte n’élague ni la règle de l’îlot ni celle de la pochette', () => {
    const { css } = compile(SOURCE, { filename: CHEMIN, css: 'external' });
    const code = css!.code.replace(/\s+/g, ' ');
    expect(code).toMatch(/\.content-layout\.wide\.file-sous-barre\.svelte-[\w-]+ ?\{ ?max-width: none;? ?\}/);
    expect(code).toMatch(
      /\.content-layout\.wide\.file-sous-barre\.(svelte-[\w-]+) \.artwork-container(?::where\(\.\1\)|\.\1) ?\{ ?max-width: min\(max\(var\(--np-art\), 40%\), 62vh\);? ?\}/,
    );
  });
});
