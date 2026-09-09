/**
 * « Reprendre l'écoute » — dire ce qu'on propose de reprendre.
 *
 * Alex Campbell, 08/09/2026 : la bande montre l'album ET des titres isolés, sans
 * qu'on puisse les distinguer.
 *
 * ## Mesuré avant d'écrire (`GET /home/continue-listening?limit=20` sur le .18)
 *
 * Le serveur ÉTIQUETTE chaque ligne — `context_type` vaut `album` ou `track` —
 * et le client jetait l'étiquette. Sur les vingt lignes :
 *
 *   - 13 `album`, dont les 13 ont `title === album_title` ;
 *   - 7 `track`, dont « Extreme Ways » (album « 18 »), « David Bowie » de Phish
 *     (album « Junta »), « Rebel Rebel » (album « Diamond Dogs ») ;
 *   - 2 de ces pistes appartiennent à un album QUI FIGURE DÉJÀ dans la liste
 *     comme ligne album — « Stella by Starlight » et « A Plea » ;
 *   - 1 piste n'a aucun `album_title` ;
 *   - 7 lignes portent une progression chiffrée.
 *
 * Toutes s'affichaient identiquement : titre + artiste. Rien ne disait qu'on
 * reprendrait un album chez l'une et un morceau chez l'autre.
 *
 * ## Ce qu'on fait
 *
 * 1. on RETIRE la piste dont l'album est déjà proposé — reprendre l'album
 *    couvre le morceau, et la doublure n'ajoute rien ;
 * 2. on NOMME l'album sous un titre de piste, ce qui suffit à séparer les deux
 *    familles à l'œil : une ligne album porte l'artiste seul, une ligne piste
 *    porte « artiste · album » ;
 * 3. on montre la progression quand le serveur la chiffre.
 *
 * On ne masque PAS les pistes. Reprendre un morceau au milieu est le geste
 * d'origine de cette bande ; les cacher serait répondre à « je ne sais pas ce
 * que je regarde » par « tu ne regarderas plus ».
 */

export interface LigneReprise {
  context_type?: string | null;
  album_id?: number | null;
  title?: string | null;
  album_title?: string | null;
  artist_name?: string | null;
  listened_tracks?: number | null;
  track_count?: number | null;
  progress_percent?: number | null;
}

/** Une ligne qui reprend un MORCEAU, pas un album. */
export function estUnePiste(o: LigneReprise): boolean {
  return (o?.context_type ?? '') === 'track';
}

/**
 * Le sous-titre de la carte.
 *
 * Ligne album  → l'artiste, et la progression si le serveur la chiffre.
 * Ligne piste  → « artiste · album », qui dit à la fois de qui et d'où.
 *
 * Un album absent (mesuré : une piste sur sept) ne fabrique pas un séparateur
 * qui ne sépare rien.
 */
export function sousTitreReprise(o: LigneReprise): string {
  const artiste = (o?.artist_name ?? '').trim();
  if (estUnePiste(o)) {
    const album = (o?.album_title ?? '').trim();
    return [artiste, album].filter(Boolean).join(' · ');
  }
  const lus = o?.listened_tracks ?? null;
  const total = o?.track_count ?? null;
  // « 1/10 » seulement si les DEUX sont là : « 1/– » n'apprend rien.
  const avance = lus != null && total != null && total > 0 ? `${lus}/${total}` : '';
  return [artiste, avance].filter(Boolean).join(' · ');
}

/**
 * La liste débarrassée des pistes dont l'album est déjà proposé.
 *
 * L'ordre du serveur est conservé : c'est lui qui sait ce qui a été écouté en
 * dernier. On ne retire QUE la doublure exacte — même `album_id`, non nul.
 */
export function reprisesUtiles<T extends LigneReprise>(lignes: readonly T[]): T[] {
  const albumsProposes = new Set<number>();
  for (const l of lignes) {
    if (!estUnePiste(l) && l?.album_id != null) albumsProposes.add(l.album_id);
  }
  return lignes.filter((l) => !(estUnePiste(l) && l?.album_id != null && albumsProposes.has(l.album_id)));
}
