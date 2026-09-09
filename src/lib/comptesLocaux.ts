/**
 * Le compte LOCAL a-t-il quelque chose a expliquer ?
 *
 * L'onglet Bibliotheque affiche deux nombres a quelques centimetres l'un de
 * l'autre : le compteur « Pistes » (`SELECT COUNT(*) FROM tracks`, toutes
 * sources) et `total_files` du dernier rapport de scan (les fichiers trouves
 * sur le disque). Une piste Qobuz, Tidal, radio ou podcast vit dans `tracks`
 * sans avoir le moindre fichier a trouver : les deux nombres ne portent pas
 * sur la meme population, et leur difference se lit comme des pistes fantomes.
 *
 * C'est le signalement de Bruno Lescarret (#2147, 46 847 contre 46 705) et
 * celui de Reivax66 (113 d'ecart cote Windows, zero cote Linux).
 *
 * Le serveur sert la ventilation depuis #3277. Rendu :
 *  - `null` quand il n'y a rien a dire — serveur trop ancien (champ absent),
 *    ou bibliotheque purement locale ou les deux nombres coincident ;
 *  - le nombre de pistes locales sinon, celui qui se compare au rapport.
 */
export function compteLocalAAfficher(total: unknown, local: unknown): number | null {
  if (typeof total !== 'number' || typeof local !== 'number') return null;
  if (!Number.isFinite(total) || !Number.isFinite(local)) return null;
  // `>=` et pas `!==` : un local superieur au total ne decrit rien de sensé,
  // on se tait plutot que d'afficher une incoherence de plus.
  if (local >= total) return null;
  return local;
}
