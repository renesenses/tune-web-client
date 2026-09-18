/**
 * LA CLÉ D'HISTORIQUE D'UNE FICHE ARTISTE — #1142.
 *
 * Le pendant de `cleDetailAlbum` pour les artistes. Elle vivait en toutes
 * lettres dans `ArtistesV2` (`ouvrirDetail(\`artiste:${a.id}\`)`, et la même
 * chaîne recopiée dans l'effet qui referme le calque) — c'était sans
 * conséquence tant qu'un seul fichier l'écrivait.
 *
 * Depuis #1142, l'écran qui ENVOIE vers la fiche doit poser la même clé que
 * celui qui l'OUVRE : la Recherche construit l'entrée composée
 * `#library/artiste:42`, `ArtistesV2` repose la sienne, et les deux doivent
 * être identiques au caractère près — sinon l'écran d'arrivée empile une
 * seconde entrée par-dessus la première, et le Précédent ne fait plus « rien »
 * une fois de trop. Deux littéraux dans deux fichiers, c'est exactement la
 * divergence qu'une fonction partagée empêche.
 *
 * 🔴 Elle rend `null` quand l'artiste n'a pas d'identifiant de bibliothèque.
 * Un artiste de SERVICE n'en a pas : il a sa propre VUE (`streamingartist`),
 * pas un détail dans la Bibliothèque — et une clé inventée ferait porter à
 * l'entrée une fiche que personne ne sait rouvrir.
 */
export function cleDetailArtiste(id: unknown): string | null {
  if (id == null) return null;
  const n = typeof id === 'number' ? id : Number(String(id).trim());
  if (!Number.isFinite(n)) return null;
  return `artiste:${n}`;
}
