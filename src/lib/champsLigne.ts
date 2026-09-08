/**
 * Quels champs de métadonnées une LIGNE de piste a encore le droit d'afficher.
 *
 * Bertrand, 05/09/2026 : « Évite la duplication d'info et cela doit résoudre le
 * problème ». Il a raison, et c'est mieux que plafonner ou passer à la ligne :
 * la rangée n'était pas seulement longue, elle RÉPÉTAIT ce que la ligne montrait
 * déjà à côté.
 *
 * Sur une piste réelle de sa bibliothèque, les quinze puces disaient :
 *
 *     0 Divers · Disc 1 · #1 · Classical · ["Classical"] · 2024 · John Dowland
 *     · Alia Vox · CH4212400001 · DSF · 2822.4kHz/1bit · 2ch · 4:42 · 190.3 MB
 *     · 101 - Lachrimae Antiquae.dsf
 *
 * dont SEPT étaient déjà à l'écran :
 *
 *  - `0 Divers`        — l'artiste, écrit sous le titre ;
 *  - `#1`              — le numéro, dans la colonne de gauche ;
 *  - `["Classical"]`   — `genres`, le même mot que `genre` juste avant, en JSON brut ;
 *  - `DSF`             — le format, dans le badge de qualité ;
 *  - `2822.4kHz/1bit`  — la fréquence et la profondeur, dans le même badge ;
 *  - `4:42`            — la durée, dans sa propre colonne ;
 *  - `101 - Lachrimae Antiquae.dsf` — le nom de fichier, qui reprend le numéro
 *    ET le titre.
 *
 * Restent huit puces qui apprennent quelque chose. La ligne tient, sans rien
 * plafonner ni rien cacher.
 *
 * ## Ce module ne CHOISIT pas les champs
 *
 * Le choix appartient aux Réglages, par profil. On n'en retire que ce qui fait
 * doublon AVEC CETTE LIGNE-LÀ : sur un écran qui n'affiche pas de badge de
 * qualité, le format redevient une information utile. D'où les drapeaux.
 */

/** Ce que la ligne montre déjà, en dehors des puces. */
export interface DejaVisible {
  /** L'artiste est écrit sous le titre. */
  artiste?: boolean;
  /** Le titre de l'album est écrit sous le titre. */
  album?: boolean;
  /** Une colonne porte la durée. */
  duree?: boolean;
  /** Un badge porte format + fréquence + profondeur. */
  qualite?: boolean;
  /** Une colonne porte le numéro de piste. */
  numero?: boolean;
}

/** Les champs rendus redondants par chaque élément de la ligne. */
const DOUBLONS: Record<keyof DejaVisible, readonly string[]> = {
  artiste: ['artist', 'artist_name', 'album_artist'],
  album: ['album', 'album_title'],
  duree: ['duration', 'duration_ms'],
  qualite: ['format', 'sample_rate', 'bit_depth'],
  numero: ['track_number'],
};

/**
 * `genres` répète `genre` dès que les deux sont demandés — et le fait mal : le
 * serveur le rend en JSON brut, `["Classical"]`, crochets et guillemets
 * compris. Le champ simple gagne toujours.
 */
const REDONDANTS_ENTRE_EUX: readonly (readonly [string, string])[] = [
  ['genre', 'genres'],
];

/**
 * Le nom de fichier reprend presque toujours le numéro et le titre — c'est la
 * convention de nommage de toute bibliothèque rangée. Il n'a rien à faire sur
 * une ligne dont le titre est le premier mot.
 */
const JAMAIS_SUR_UNE_LIGNE: readonly string[] = ['file_path'];

/**
 * Les champs à passer aux puces d'une ligne, dans l'ordre choisi par
 * l'utilisateur, débarrassés de ceux que la ligne dit déjà.
 */
export function champsUtiles(champs: readonly string[], deja: DejaVisible): string[] {
  const exclus = new Set<string>(JAMAIS_SUR_UNE_LIGNE);
  for (const [cle, liste] of Object.entries(DOUBLONS) as [keyof DejaVisible, readonly string[]][]) {
    if (deja[cle]) for (const f of liste) exclus.add(f);
  }
  const demandes = new Set(champs);
  for (const [garde, retire] of REDONDANTS_ENTRE_EUX) {
    if (demandes.has(garde)) exclus.add(retire);
  }
  return champs.filter((f) => !exclus.has(f));
}
