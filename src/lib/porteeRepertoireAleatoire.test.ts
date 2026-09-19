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

const api = readFileSync(resolve(process.cwd(), 'src/lib/api.ts'), 'utf-8');


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

  it("la met sous la clé `folder` — vérifié sur la RÈGLE, plus sur sa recopie", () => {
    // #882 — recopiait `opts.folder = scopedFolder` à la lettre. La
    // construction est partagée depuis, et c'est son résultat qui compte.
    expect(optionsAleatoire({ dossier: '/data/music' })).toEqual({ folder: '/data/music' });
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


