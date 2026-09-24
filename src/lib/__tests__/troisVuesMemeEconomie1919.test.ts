// « Library : switching between views » — jfpaquet, fil 1919, ticket support
// 165, 0.9.163 Windows, 6 704 albums / 80 228 pistes :
//
//   « In "My Library" using the little button to change between the 3 albums
//     views does not work well : hesitating and slow, and I've put only 6
//     thousands albums. I fear that will be a problem with 40.000+ »
//
// 🔴 LES TROIS VUES SONT TROIS BRANCHES SŒURS.
//
// `grid`, `list` et `carousel` sont trois `{#if}` frères dans `LibraryV2`, et
// non un seul conteneur qui changerait d'habillage. Svelte démonte donc
// intégralement la branche qu'on quitte et monte intégralement celle qu'on
// rejoint : une vignette pèse près de trente nœuds depuis qu'elle porte cinq
// boutons d'action (le fichier le mesure lui-même dans son CSS), ce qui fait
// quelque 200 000 éléments jetés puis reconstruits à chaque clic sur 6 704
// albums — et le coût est LINÉAIRE en nombre d'albums, exactement ce que le
// testeur redoute pour 40 000.
//
// 🔴 CE QUE CE TÉMOIN TIENT, ET CE QU'IL NE TIENT PAS.
//
// Il ne mesure RIEN : une durée de rendu ne se mesure pas sous jsdom, et un
// seuil de millisecondes y serait un faux vert ou un faux rouge selon la
// charge de la machine. Il tient la seule chose qui soit vraie dans le source
// et qui se perde en silence : la PARITÉ des trois vues devant le coût du
// hors-écran.
//
// `.card` (grille) et `.ccard` (carrousel) portent `content-visibility:auto`
// depuis leurs chantiers respectifs — hors du cadre, une vignette ne coûte ni
// style, ni disposition, ni peinture. `.lrow` (liste) ne l'avait pas : elle
// était la seule des trois à payer plein tarif, et donc la plus lente des six
// transitions. C'est ce déséquilibre-là que le témoin interdit de revenir.
//
// ⚠️ Il ne prétend donc PAS que la bascule est devenue rapide. La guérison
// demande une vue unique, ou une fenêtre de rendu ; elle n'est pas dans cette
// PR. Le témoin empêche seulement qu'une des trois vues reparte sans
// l'amortissement que les deux autres ont.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Le source, COMMENTAIRES RETIRÉS.
 *
 * 🔴 Obligatoire : le commentaire qui explique `content-visibility` dans
 * `.lrow` contient le mot lui-même. Une recherche naïve se prendrait elle-même
 * et resterait verte après la suppression de la déclaration.
 */
function sourceSansCommentaires(): string {
  return readFileSync(resolve(process.cwd(), 'src/components/v2/LibraryV2.svelte'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '');
}

/**
 * Le corps de la règle CSS d'un sélecteur — et lui seul.
 *
 * `.lrow{…}` et non `.lrow:hover{…}` ni `.lrow .lt{…}` : l'accolade doit
 * suivre le sélecteur, à un blanc près. Sans cela, une déclaration posée sur
 * `.lrow:hover` suffirait à satisfaire le témoin, alors qu'elle ne s'applique
 * qu'au survol.
 */
function corpsDeRegle(src: string, selecteur: string): string | null {
  const m = new RegExp(`(^|[\\s}])${selecteur.replace('.', '\\.')}\\s*\\{`, 'm').exec(src);
  if (!m) return null;
  const debut = m.index + m[0].length;
  const fin = src.indexOf('}', debut);
  return fin < 0 ? null : src.slice(debut, fin);
}

const VUES: ReadonlyArray<readonly [string, string, string]> = [
  ['.card', 'la grille', 'display === grid'],
  ['.ccard', 'le carrousel', 'display === carousel'],
  ['.lrow', 'la liste', 'display === list'],
];

describe('fil 1919 (ticket 165) — les trois vues d’albums paient le même prix hors écran', () => {
  it.each(VUES)('%s — %s amortit ses vignettes hors du cadre', (selecteur, quoi) => {
    const corps = corpsDeRegle(sourceSansCommentaires(), selecteur);
    expect(corps, `la règle \`${selecteur}\` a disparu de LibraryV2`).not.toBeNull();
    expect(
      /content-visibility\s*:\s*auto/.test(corps!),
      `${quoi} ne saute plus le rendu hors écran : chaque bascule de vue lui fait ` +
        `styler et disposer TOUS les albums, et le coût grandit avec la collection — ` +
        `c’est le défaut du fil 1919.`,
    ).toBe(true);
  });

  it.each(VUES)('%s — et annonce une taille de repli, sinon le rail A–Z tombe à côté', (selecteur, quoi) => {
    // `content-visibility:auto` sans `contain-intrinsic-size` donne une hauteur
    // nulle aux éléments sautés : la barre de défilement ment, et le saut à une
    // lettre du rail atterrit ailleurs. Le mot-clé `auto` fait en plus retenir
    // la taille RÉELLE une fois l'élément rendu une première fois.
    const corps = corpsDeRegle(sourceSansCommentaires(), selecteur);
    expect(corps, `la règle \`${selecteur}\` a disparu de LibraryV2`).not.toBeNull();
    expect(
      /contain-intrinsic-size\s*:\s*auto\s/.test(corps!),
      `${quoi} saute son rendu sans annoncer de taille de repli : la hauteur totale ` +
        `est fausse et le rail A–Z vise à côté.`,
    ).toBe(true);
  });

  it('les trois vues restent bien TROIS branches exclusives — le coût est connu, pas ignoré', () => {
    // Ce témoin-ci documente la cause de fond, et interdit qu'on la perde de
    // vue : si un jour les trois vues partagent un seul `{#each}`, ce test
    // rougira, et c'est à ce moment-là qu'il faudra le retirer — pas avant.
    const src = sourceSansCommentaires();
    expect(src.includes("type Display = 'grid' | 'list' | 'carousel'"), 'les trois vues ont changé de forme').toBe(true);
    const branches = (src.match(/display === 'list'|display === 'carousel'/g) ?? []).length;
    expect(
      branches,
      'les branches de vue ont changé : vérifier que la bascule ne reconstruit plus toute la collection',
    ).toBeGreaterThanOrEqual(2);
  });
});
