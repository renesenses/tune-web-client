// Bertrand, 21/09/2026 : « On ne peut pas supprimer une smart collection.
// Pas normal ! » — puis « ok vu le bouton supprimer ». Il existait, mais au
// SURVOL, derrière le coin bas-gauche de la vignette, et dans l'éditeur.
// Deuxième personne à le chercher : FabienM l'avait cherché deux fois (#1143).
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ECRAN = readFileSync(resolve(process.cwd(), 'src/components/v2/CollectionsV2.svelte'), 'utf8');
const sansCommentaires = ECRAN
  .replace(/<!--[\s\S]*?-->/g, '')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '');

describe('« Supprimer » visible dans la fiche d’une collection', () => {
  it('le bouton est dans l’en-tête, À CÔTÉ de « Modifier »', () => {
    const modifier = sansCommentaires.indexOf('onclick={() => editerCollection(ouverte!)}');
    const supprimer = sansCommentaires.indexOf('onclick={() => void supprimerCollection(ouverte!)}');
    expect(modifier, '« Modifier » a disparu de la fiche').toBeGreaterThan(-1);
    expect(supprimer, '« Supprimer » absent de la fiche').toBeGreaterThan(-1);
    // Voisins : dans le même bloc, avant la fin de l'en-tête.
    const finEntete = sansCommentaires.indexOf('</header>', modifier);
    expect(supprimer).toBeGreaterThan(modifier);
    expect(supprimer).toBeLessThan(finEntete);
  });

  it('il passe par la MÊME fonction que les deux autres portes', () => {
    // Une seconde copie divergerait sur la sorte, donc sur la route, donc sur
    // ce qui disparaît — et sur la confirmation.
    const appels = sansCommentaires.match(/supprimerCollection\(/g) ?? [];
    expect(appels.length).toBeGreaterThanOrEqual(4); // définition + 3 portes
    const def = sansCommentaires.indexOf('async function supprimerCollection(');
    expect(sansCommentaires.slice(def, def + 400)).toContain('dialogs.confirm');
  });
});
