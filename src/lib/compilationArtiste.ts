/**
 * Quel artiste porte un album issu d'une fusion de compilation ?
 *
 * Arbitrage **C2** du chantier « gestion du tag compilation » (Bertrand,
 * 14/09/2026) : *l'artiste d'album tagué s'il existe, sinon « Various
 * Artists »*.
 *
 * 🔴 Pourquoi cette fonction existe : `POST /metadata/albums/merge` garde
 * l'artiste du disque **maître**, celui qu'il a choisi. Mesuré le 18/09 sur le
 * .18 — les douze lignes « Coco María Presents Club Coco ¡AHORA! » réunies
 * sont ressorties sous **« Ronald Snijders »**, un invité de la compilation.
 * L'écran doit donc reposer l'artiste après la fusion.
 *
 * La règle est celle de C2, appliquée aux seules données dont l'écran dispose :
 * les artistes d'album des lignes réunies.
 *
 * - **un seul artiste distinct** ⇒ on ne touche à rien. C'est le coffret d'un
 *   chef ou d'un groupe : lui reprendre son nom pour « Various Artists » serait
 *   la régression que C2 interdit explicitement (les 63 CD de Fritz Reiner).
 * - **plusieurs** ⇒ aucun d'eux n'est l'artiste du disque, c'est la définition
 *   d'une compilation, et la convention le dit : « Various Artists ».
 * - **aucun** (tous vides) ⇒ on ne touche à rien : on n'invente pas un nom
 *   là où la base n'en a aucun.
 */
export const VARIOUS_ARTISTS = 'Various Artists';

/**
 * Rend l'artiste à poser sur l'album réuni, ou `null` s'il ne faut rien
 * écrire. Les entrées vides ou blanches ne comptent pas — une ligne sans
 * artiste n'est pas un artiste de plus.
 */
export function artisteApresFusion(artistesDAlbum: Array<string | null | undefined>): string | null {
  const distincts = new Set(
    artistesDAlbum.map((a) => (a ?? '').trim()).filter((a) => a.length > 0),
  );
  return distincts.size > 1 ? VARIOUS_ARTISTS : null;
}
