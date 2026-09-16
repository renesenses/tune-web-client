// 🔴 La colonne d'actions du tableau doit être aussi LARGE que la barre.
//
// Bertrand, 16/09/2026, capture à l'appui (album « Five Leaves Left », mode
// Expert, colonne Dynamic Range cochée) : la cellule DR se lisait « 1▶ » au
// lieu de « 12 » — le bouton Lire de la barre d'actions recouvrait le second
// chiffre, sur les dix lignes.
//
// LE MÉCANISME
// ------------
// `ListePistesV2` cale la colonne d'actions à une largeur FIXE — c'est voulu,
// et une autre garde l'exige : dimensionnée par son contenu, elle différerait
// d'une ligne à l'autre et de l'en-tête. Mais ce chiffre était 178 px, « six
// boutons de 28 px + cinq gouttières de 2 px », et `PisteActions` en rend
// SEPT depuis le menu « … » (a5be266a, 07/09/2026). La cellule est en
// `overflow:visible; justify-content:flex-end` : les 30 px en trop débordent
// à GAUCHE, sur la dernière colonne de données — la colonne DR, alignée à
// droite, dont la valeur touche précisément le bord recouvert.
//
// Deux fichiers, une seule vérité : le chiffre n'a de sens que rapporté au
// nombre de boutons. Ce témoin les COMPTE et recalcule la largeur attendue.
// Le jour où la barre gagne ou perd un bouton, il rougit avant qu'une capture
// n'ait à le dire.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const lire = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf-8');
const sansCommentaires = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/<!--[\s\S]*?-->/g, '');

describe('🔴 la colonne d’actions suit la barre (DR recouvert, 16/09/2026)', () => {
  const barre = sansCommentaires(lire('src/components/v2/PisteActions.svelte'));
  const liste = sansCommentaires(lire('src/components/v2/ListePistesV2.svelte'));

  const boutons = (barre.match(/<button class="pa[" ]/g) ?? []).length;
  const cote = /\.pa\{[^}]*\bwidth:(\d+)px/.exec(barre);
  const gouttiere = /\.pactions\{[^}]*\bgap:(\d+)px/.exec(barre);

  it('la barre a bien SEPT boutons de 28 px, espacés de 2 px', () => {
    // Si ce nombre change, la largeur doit changer avec — c'est l'épreuve
    // suivante qui le tient. Celle-ci fixe le point de départ mesuré.
    expect(boutons).toBe(7);
    expect(cote?.[1]).toBe('28');
    expect(gouttiere?.[1]).toBe('2');
  });

  it('LARGEUR_ACTIONS = n × côté + (n − 1) × gouttière', () => {
    const attendu = boutons * Number(cote![1]) + (boutons - 1) * Number(gouttiere![1]);
    const px = /const LARGEUR_ACTIONS = '(\d+)px';/.exec(liste);
    const nombre = /const LARGEUR_ACTIONS_PX = (\d+);/.exec(liste);
    expect(px, 'LARGEUR_ACTIONS introuvable').not.toBeNull();
    expect(Number(px![1]), `la barre fait ${attendu} px, la colonne ${px![1]} — ce qui dépasse recouvre la colonne voisine`)
      .toBe(attendu);
    // Le plancher (#853) lit la même largeur en nombre : les deux ne doivent
    // jamais diverger.
    expect(Number(nombre![1])).toBe(Number(px![1]));
  });

  it('CONTRE-ÉPREUVE : à 178 px, le témoin aurait rougi', () => {
    // Le chiffre d'avant, contre la barre d'aujourd'hui.
    const attendu = boutons * Number(cote![1]) + (boutons - 1) * Number(gouttiere![1]);
    expect(178).not.toBe(attendu);
  });
});
