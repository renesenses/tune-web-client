/**
 * Enrichissement des images d'artistes : la règle qui sépare les deux passages.
 *
 * Le passage « manquantes » (`POST /library/artwork/enrich-artists`) ne
 * s'occupe que des artistes sans image. Quand le serveur répond
 * `artists_without_image === 0`, la tâche se termine instantanément : lancer un
 * bandeau d'avancement laisserait croire à un travail qui n'a pas lieu.
 *
 * Le passage FORCÉ (`POST /library/artwork/enrich-artists/force`) existe
 * précisément pour le cas inverse — une bibliothèque où chaque artiste « a »
 * une image, mais dont le `image_path` pointe une entrée périmée qui ne
 * s'affiche jamais. Lui appliquer la même garde le rendrait inopérant dans le
 * seul cas qu'il sert (Fabien : scan complet, toujours aucune image d'artiste).
 */
export type ModeEnrichissementImages = 'manquantes' | 'forcé';

/**
 * Faut-il renoncer à lancer le passage, faute d'images manquantes ?
 *
 * Vrai uniquement pour le passage « manquantes » lorsque le serveur n'annonce
 * plus aucun artiste sans image. Le passage forcé ne s'arrête jamais ici.
 */
export function doitSArreterFauteDImagesManquantes(
  mode: ModeEnrichissementImages,
  artistesSansImage: number,
): boolean {
  return mode === 'manquantes' && artistesSansImage === 0;
}
