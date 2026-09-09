/**
 * Rendre une liste sûre pour un bloc `{#each … (clé)}`.
 *
 * ## Le défaut vécu
 *
 * Reivax66, 15/08/2026, fil forum `ui-avec-edge-suJXMA`, suivi en
 * renesenses/tune-server-rust#1775 :
 *
 *   « En utilisant Edge, lorsque l'on clique sur oxygen dans la barre
 *     latérale, la page apparaît mais reste bloquée. Il faut faire F5. Le
 *     choix du niveau d'utilisation : débutant, expert n'est pas fonctionnel
 *     non plus. Ces bugs n'apparaissent pas avec Chrome. »
 *
 * Sa console, déposée le 16/08 sur le ticket :
 *
 *   Uncaught Error: https://svelte.dev/e/each_key_duplicate
 *
 * C'est le runtime Svelte 5 qui refuse DEUX ENTRÉES DE MÊME CLÉ dans un bloc
 * keyé. L'erreur est levée PENDANT le rendu : le DOM déjà peint reste à
 * l'écran — d'où « la page apparaît » — et le graphe d'effets s'arrête là,
 * donc plus aucun gestionnaire ne s'attache ensuite. Cela explique le second
 * symptôme d'un seul coup : le sélecteur de niveau, qui n'a rien à voir avec
 * Oxygen, devient inerte. F5 est la seule sortie.
 *
 * ## Pourquoi une liste peut porter deux fois la même clé
 *
 * Le rail de facettes clave sur des DONNÉES QU'IL NE PRODUIT PAS :
 *
 *   • `{#each shown as f (f)}`            — `shown` vient de
 *     `preferences.oxygenFacets`, lu dans `localStorage` ;
 *   • `{#each rowsOf(f) as row (row.value)}` — les valeurs viennent de
 *     `/library/facets`, donc de la base et des métadonnées.
 *
 * Aucun des deux chemins ne dédoublonnait. Le chargement des préférences
 * (`loadPrefs`) filtrait la liste enregistrée sur les facettes connues sans
 * jamais retirer un doublon ; seule la migration de révision, qui ne se joue
 * qu'une fois, produisait par accident une liste unique.
 *
 * ## Ce que ce module NE prouve PAS
 *
 * ⚠️ On ne sait pas laquelle des deux listes portait le doublon chez
 * Reivax66, et la trace ne le dira pas : elle est minifiée
 * (`index-D_qWY0qy.js`) et ne nomme aucun composant. Le symptôme n'a PAS été
 * reproduit ici.
 *
 * ⚠️ « Edge oui, Chrome non » n'est PAS expliqué par une différence de moteur
 * — Edge et Chrome partagent Blink. L'hypothèse cohérente avec les deux faits
 * est que la donnée diffère d'un navigateur à l'autre, et `localStorage` est
 * précisément un magasin PAR NAVIGATEUR : une liste de facettes enregistrée
 * abîmée dans le profil Edge n'existerait pas dans le profil Chrome. Ce n'est
 * pas démontré, seulement compatible avec tout ce qui est établi.
 *
 * ## Ce que ce module fait, et qui vaut sans connaître la cause
 *
 * Un doublon dans une liste doit coûter UNE LIGNE EN TROP, jamais un écran
 * mort. Le rail garde donc la première occurrence de chaque clé et laisse
 * tomber les suivantes. Aucun compte n'est additionné, aucune valeur
 * inventée : on n'affiche que ce que la source a réellement envoyé.
 */

/**
 * Les éléments de `items` dont la clé n'a pas déjà été vue, dans l'ordre.
 *
 * Rend le TABLEAU D'ORIGINE quand il ne porte aucun doublon — l'identité est
 * conservée, ce qui évite à un `$derived` de se recalculer en cascade dans le
 * cas normal, qui est l'immense majorité.
 */
export function sansDoublons<T>(items: readonly T[], cle: (item: T) => unknown): T[] {
  const vues = new Set<unknown>();
  let doublon = false;
  for (const item of items) {
    const k = cle(item);
    if (vues.has(k)) { doublon = true; break; }
    vues.add(k);
  }
  if (!doublon) return items as T[];
  vues.clear();
  const sortie: T[] = [];
  for (const item of items) {
    const k = cle(item);
    if (vues.has(k)) continue;
    vues.add(k);
    sortie.push(item);
  }
  return sortie;
}

/** Cas courant : une liste de chaînes qui se clave sur elle-même. */
export function chainesUniques(items: readonly string[]): string[] {
  return sansDoublons(items, (s) => s);
}
