import { describe, expect, it } from 'vitest';
import { optionsAleatoire } from './porteeAleatoire';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Portée de répertoire de la lecture aléatoire — `renesenses/tune-server-rust#2801`.
 *
 * Signalé par Marco Polo (forum, fil 1614, Tune 0.9.127) :
 *
 *   « Appuyer sur le bouton 'Tout lire en aléatoire' fonctionne mais il semble
 *     s'alimenter de toute la bibliothèque, pas seulement de la sélection à
 *     l'écran. »
 *
 * Il navigue par répertoire, clique « Voir en bibliothèque », obtient la
 * pastille « Disco Pack », puis lance la lecture aléatoire — qui part de toute
 * la bibliothèque.
 *
 * Le champ n'existait NULLE PART. La variable qui porte la portée
 * (`scopedFolder`) alimente la pastille, à six lignes du bouton, et
 * `shuffleAllLibrary` ne la lisait pas ; `api.shuffleAll` n'avait pas d'option
 * où la mettre ; `ShuffleAllQuery`, côté serveur, pas de champ où la recevoir.
 * Quand un répertoire seul est sélectionné, `opts` restait donc VIDE et l'appel
 * partait avec `undefined`.
 *
 * Ces tests lisent la SOURCE : `shuffleAllLibrary` dépend de l'état de
 * plusieurs onglets et d'un magasin Svelte, elle ne s'appelle pas depuis Node.
 * Ce qu'ils tiennent, c'est la chaîne de transmission — le seul endroit où le
 * défaut vivait.
 *
 * 🔴 RÉORIENTÉS le 12/09/2026 par #882. Le même défaut est réapparu dans la
 * NOUVELLE coquille : `LibraryV2` n'envoyait que `search_query`, et la portée
 * de répertoire repartait à la trappe — Marco Polo l'a signalé une seconde
 * fois, sur le même fil, deux mois plus tard.
 *
 * La construction vit désormais dans `lib/porteeAleatoire`, appelée par les
 * DEUX écrans. Les épreuves qui recopiaient `opts.folder = scopedFolder` à la
 * lettre tiennent maintenant le COMPORTEMENT de cette règle — ce qui est plus
 * fort : une recopie ne pouvait pas voir qu'un second écran construisait
 * autrement.
 */

const libraryView = readFileSync(
  resolve(process.cwd(), 'src/components/LibraryView.svelte'),
  'utf-8',
);
const api = readFileSync(resolve(process.cwd(), 'src/lib/api.ts'), 'utf-8');

/** Le corps de `shuffleAllLibrary`, isolé du reste du composant. */
function corpsDeShuffleAllLibrary(): string {
  const debut = libraryView.indexOf('async function shuffleAllLibrary(');
  expect(debut).toBeGreaterThan(-1);
  const fin = libraryView.indexOf('\n  }', libraryView.indexOf('finally {', debut));
  expect(fin).toBeGreaterThan(debut);
  return libraryView.slice(debut, fin);
}

describe('api.shuffleAll transporte le répertoire', () => {
  it('accepte une option `folder`', () => {
    const debut = api.indexOf('export function shuffleAll(');
    expect(debut).toBeGreaterThan(-1);
    const signature = api.slice(debut, api.indexOf(') {', debut));
    expect(signature).toContain('folder?: string');
  });

  it("l'écrit dans la chaîne de requête sous le nom que le serveur attend", () => {
    // `folder=<chemin absolu>` — le même nom que `/library/tracks` et que les
    // facettes Oxygen. Un autre nom serait accepté en 200 et jeté en silence.
    const debut = api.indexOf('export function shuffleAll(');
    const corps = api.slice(debut, api.indexOf('\n}', debut));
    expect(corps).toContain("params.set('folder', opts.folder)");
  });
});

describe('shuffleAllLibrary transmet la portée de répertoire', () => {
  it('lit `scopedFolder` — la variable qui porte la pastille', () => {
    // Le cœur de #2801 : cette fonction ne la lisait pas une seule fois.
    expect(corpsDeShuffleAllLibrary()).toContain('scopedFolder');
  });

  it("la met sous la clé `folder` — vérifié sur la RÈGLE, plus sur sa recopie", () => {
    // #882 — recopiait `opts.folder = scopedFolder` à la lettre. La
    // construction est partagée depuis, et c'est son résultat qui compte.
    expect(optionsAleatoire({ dossier: '/data/music' })).toEqual({ folder: '/data/music' });
  });

  it("passe bien la portée de l'écran à la règle", () => {
    // Ce que l'écran doit faire : lui donner `scopedFolder`. Le reste est
    // affaire de la règle, éprouvée à part.
    expect(corpsDeShuffleAllLibrary()).toMatch(/dossier:\s*scopedFolder/);
  });

  it("laisse partir la recherche AVEC le répertoire, pas à sa place", () => {
    // La zone de recherche ne fait que restreindre le sous-arbre affiché : les
    // deux voyagent ensemble, et le serveur les intersecte. Les séparer ferait
    // jouer tout le répertoire alors que l'écran montre un extrait.
    expect(optionsAleatoire({ dossier: '/d', recherche: 'miles' }))
      .toEqual({ folder: '/d', search_query: 'miles' });
  });

  it("n'envoie pas le genre en même temps que le répertoire", () => {
    // L'onglet Genres n'a pas de pastille de répertoire : les deux portées ne
    // coexistent pas à l'écran, et le serveur donne la priorité au répertoire.
    // Envoyer les deux laisserait croire à une intersection qui n'a pas lieu.
    expect(optionsAleatoire({ dossier: '/d', genre: 'Jazz' })).toEqual({ folder: '/d' });
  });
});

describe("le retour anticipé du genre ne désarme pas la portée de répertoire", () => {
  it('la branche « genre parent / sans genre » est gardée par `!scopedFolder`', () => {
    // Piège d'appelant désarmé : cette branche rend la main (`return`) AVANT
    // la construction d'`opts`. Pastille active, elle jouerait les albums d'un
    // genre qui n'est plus à l'écran — les trois onglets ne chargent alors que
    // le sous-arbre — et la portée ajoutée plus bas ne serait jamais atteinte.
    const corps = corpsDeShuffleAllLibrary();
    const branche = corps.slice(corps.indexOf('if (', corps.indexOf('selectedParent')));
    expect(corps).toMatch(
      /if \(!scopedFolder && !searchQuery\.trim\(\) && \(selectedParent \|\| selectedNoGenre\)/,
    );
    // Et cette garde est bien ANTÉRIEURE au `return` de la branche.
    expect(branche.indexOf('!scopedFolder')).toBeLessThan(branche.indexOf('return;'));
  });
});

describe("le bouton dit ce qu'il va faire", () => {
  it('`scopedFolder` compte comme une portée pour le libellé et pour l’infobulle', () => {
    // Capture 1 de Marco Polo : pastille « 80s 12 INCH COLLECTION » active, le
    // bouton annonce toujours « Tout lire en aléatoire ». Le bouton disait la
    // vérité — c'est la portée qui était perdue ; maintenant qu'elle passe, le
    // libellé doit suivre.
    expect(libraryView).toMatch(/let shuffleEstPorte = \$derived\(\s*!!\(scopedFolder \|\|/);
  });

  it("le libellé et l'infobulle lisent la MÊME expression", () => {
    // Elles portaient deux copies de la condition, à recopier à chaque ajout —
    // c'est ainsi que `scopedFolder` a pu manquer aux deux.
    const occurrences = libraryView.match(/shuffleEstPorte \?/g) ?? [];
    expect(occurrences).toHaveLength(2);
    expect(libraryView).not.toMatch(
      /searchQuery\.trim\(\) \|\| selectedGenre \|\| selectedParent \|\| selectedNoGenre \?/,
    );
  });
});
