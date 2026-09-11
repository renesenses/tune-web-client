// 🔴 `renesenses/tune-web-client#876` — Reivax66, 0.9.143, fil 1728 :
// « il manque la barre de défilement pour les zones ». Sa capture, mesurée au
// pixel dans le ticket : le panneau ZONES annonce SEPT zones, en dessine six
// entières, et la septième — peinte dans la couleur d'accent, donc celle qui
// JOUAIT — est tranchée par le bord bas du panneau. Le panneau fait 378 px à
// l'échelle 125 %, soit exactement les 300 px de `max-height`.
//
// CE QUE CETTE GARDE TIENT, ET RIEN DE PLUS
// -----------------------------------------
// Aucun test de ce dépôt ne mesure une hauteur : jsdom n'a pas de mise en page
// et n'injecte même pas les feuilles de style de composant. Ce qui se tient
// ici, c'est la DÉCLARATION : le plafond du panneau ne doit plus être un
// nombre en dur, sans rapport avec la place disponible au-dessus de la barre
// de lecture.
//
// ⚠️ Ce fichier ne prétend RIEN sur la barre de défilement invisible. Le
// ticket établit que `tune-theme.css` aurait dû en peindre une de 14 px et que
// la lecture du code ne dit pas pourquoi elle ne l'a pas fait. On ne garde pas
// ce qu'on n'a pas compris.
//
// CONTRE-ÉPREUVE : l'avant-dernier cas rejoue le texte d'AVANT le correctif
// et exige que le même prédicat le refuse. Sans lui, un prédicat trop lâche
// (« le bloc contient le mot max-height ») serait vert des deux côtés.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  resolve(__dirname, '../../components/TransportBar.svelte'),
  'utf-8',
);

/** Le corps de la règle `.zone-popover`, commentaires ÔTÉS. */
function reglePopoverZones(texte: string): string {
  const debut = texte.indexOf('.zone-popover {');
  expect(debut, 'la règle `.zone-popover` a disparu de TransportBar').toBeGreaterThanOrEqual(0);
  const fin = texte.indexOf('\n  }', debut);
  return texte.slice(debut, fin).replace(/\/\*[\s\S]*?\*\//g, '');
}

/**
 * Le plafond est-il relatif à la fenêtre ?
 *
 * On lit la valeur déclarée, pas la présence d'un mot : un `max-height` en
 * pixels DOIT être refusé, y compris s'il cohabite avec autre chose.
 */
function plafondRelatif(regle: string): boolean {
  const m = regle.match(/max-height:\s*([^;]+);/);
  if (!m) return false;
  const valeur = m[1].trim();
  if (/^\d+px$/.test(valeur)) return false;
  return /vh|dvh|svh|calc\(/.test(valeur);
}

describe('#876 — le panneau des zones ne plafonne plus en dur', () => {
  it('le plafond déclaré est relatif à la fenêtre', () => {
    const regle = reglePopoverZones(source);
    expect(
      plafondRelatif(regle),
      `plafond en dur : la zone en cours de lecture peut rester hors champ — reçu ${
        regle.match(/max-height:[^;]+;/)?.[0] ?? 'aucun max-height'
      }`,
    ).toBe(true);
  });

  it('la gouttière est réservée : un débordement se VOIT', () => {
    const regle = reglePopoverZones(source);
    expect(regle).toContain('overflow-y: auto');
    expect(
      /scrollbar-gutter:\s*stable/.test(regle),
      'sans gouttière stable, le débordement n’a aucun indice à l’écran',
    ).toBe(true);
  });

  it('CONTRE-ÉPREUVE : le texte d’avant le correctif est bien REFUSÉ', () => {
    const avant = `.zone-popover {
    position: absolute;
    min-width: 220px;
    max-width: 320px;
    max-height: 300px;
    overflow-y: auto;
  }`;
    expect(
      plafondRelatif(avant.replace(/\/\*[\s\S]*?\*\//g, '')),
      'le prédicat accepte le plafond de 300 px : il ne garde rien',
    ).toBe(false);
  });

  it('CONTRE-ÉPREUVE : un commentaire qui CITE l’ancien plafond ne suffit pas', () => {
    // Le correctif cite `max-height: 300px` dans son commentaire, pour dire
    // d'où l'on vient. Un prédicat qui lirait le fichier brut s'y tromperait.
    const leurre = `.zone-popover {
    /* avant : max-height: 300px; */
    max-height: min(60vh, 520px);
  }`;
    expect(plafondRelatif(leurre.replace(/\/\*[\s\S]*?\*\//g, ''))).toBe(true);
    expect(
      /max-height:\s*300px/.test(leurre),
      'le leurre ne contient pas ce qu’il est censé piéger',
    ).toBe(true);
  });
});
