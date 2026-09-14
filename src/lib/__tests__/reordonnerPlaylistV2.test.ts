import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Réordonner les pistes d'une playlist, en v2. Lot 1 du portage.
 *
 * `reorderPlaylistTracks` faisait partie des treize appels que la v2 ne savait
 * pas faire (#1036). Il est le premier porté : le geste est courant, et il ne
 * demande rien à `ListePistesV2`, que six écrans partagent.
 *
 * ## Ce que cette garde tient, et pourquoi
 *
 * Trois propriétés, dont deux sont des corrections de l'écran hérité :
 *
 *  1. l'appel existe et part du bon écran ;
 *  2. l'échec est **dit** — l'écran hérité fait `console.error` et recharge en
 *     silence, l'utilisateur voit sa piste revenir sans comprendre ;
 *  3. le geste est atteignable **au clavier** — l'écran hérité réordonne par
 *     glisser-déposer, hors de portée d'un lecteur d'écran.
 */

const RACINE = resolve(process.cwd());
const lire = (c: string) => readFileSync(resolve(RACINE, c), 'utf8');

/** Une garde satisfaite par la documentation de ce qu'elle garde ne garde
 *  rien : les commentaires d'ici citent tous les noms cherchés. */
function sansCommentaires(src: string): string {
  return src
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

describe('réordonner une playlist en v2', () => {
  const ecran = sansCommentaires(lire('src/components/v2/PlaylistDetailV2.svelte'));

  it('l’écran v2 APPELLE reorderPlaylistTracks', () => {
    // L'appel, avec sa parenthèse : une mention ne réordonne rien.
    expect(ecran).toMatch(/api\.reorderPlaylistTracks\s*\(/);
  });

  it('un geste d’utilisateur le déclenche', () => {
    // Sans bouton, l'appel serait un écran mort de plus — ce client en a
    // produit trois.
    expect(ecran, 'rien n’appelle deplacer() : la fonction est écrite et pas branchée')
      .toMatch(/onclick=\{\(\) => deplacer\(/);
  });

  it('🔴 l’échec est DIT, pas avalé', () => {
    // Le défaut de l'écran hérité : `console.error` puis rechargement muet.
    // L'utilisateur voit sa piste reprendre sa place sans explication.
    const corps = ecran.slice(ecran.indexOf('async function deplacer'), ecran.indexOf('</script>'));
    expect(corps, 'le déplacement échoue en silence').toMatch(/notifications\.error\s*\(/);
    expect(corps, 'console.error est le défaut qu’on corrige').not.toMatch(/console\.error\s*\(/);
  });

  it('🔴 l’échec REND la liste à son état d’avant', () => {
    // Optimiste est bien ; menteur ne l'est pas. Si le serveur refuse, l'ordre
    // affiché doit redevenir celui qu'il connaît.
    const corps = ecran.slice(ecran.indexOf('async function deplacer'), ecran.indexOf('</script>'));
    expect(corps).toMatch(/tracks = avant/);
  });

  it('🔴 le geste est atteignable au CLAVIER', () => {
    // L'écran hérité réordonne par glisser-déposer : ni clavier, ni lecteur
    // d'écran. Deux boutons nommés font le même travail pour tout le monde.
    expect(ecran).toMatch(/aria-label=\{\$tr\('playlist\.moveUp'\)\}/);
    expect(ecran).toMatch(/aria-label=\{\$tr\('playlist\.moveDown'\)\}/);
    // Et rien n'y conduit par glisser-déposer seul.
    expect(ecran, 'un glisser-déposer sans équivalent clavier serait une régression')
      .not.toMatch(/draggable=\{?true/);
  });

  it('les bouts de liste ne proposent pas un déplacement impossible', () => {
    // Un bouton qui ne fait rien est pire qu'un bouton absent — la règle de
    // cet écran, déjà écrite pour la loupe d'album.
    expect(ecran).toMatch(/disabled=\{i === 0 \|\|/);
    expect(ecran).toMatch(/disabled=\{i === tracks\.length - 1 \|\|/);
  });
});
