/**
 * tune-server-rust#6331 (FabienM, fils forum 2271 et 2302, rc4 puis rc6) —
 * « reproduire le filtre de l'appli Qobuz qui permet de filtrer les playlists
 * créées par soi et les playlists par Qobuz » : « Tous », « Par vous »,
 * « Par Qobuz », dans Streaming › Qobuz › Playlists.
 *
 * `/playlist/getUserPlaylists` mélange les playlists de l'utilisateur et
 * celles qu'il SUIT. Le serveur le dit déjà, playlist par playlist, depuis le
 * lot rc5 (web#2097) : `editable: true` — elle est à lui ; `false` — il la
 * suit (éditoriale Qobuz, ou d'un autre compte) ; absent — le service ne
 * permet pas de le dire.
 *
 * Règles :
 *  - « Par vous » = `editable === true` ; « Par <service> » = `editable ===
 *    false`. Une playlist sans le drapeau n'entre dans AUCUN des deux : on ne
 *    devine pas son auteur. Elle reste dans « Tous ».
 *  - Le filtre ne s'offre que si la liste le rend utile : au moins une
 *    playlist de chaque côté. Sinon (autre service, serveur ancien, compte
 *    sans playlist suivie) il n'y a rien à trier et les pastilles n'auraient
 *    qu'un effet : vider l'écran.
 */
export type FiltreAuteur = 'tous' | 'moi' | 'service';

export interface PlaylistAvecAuteur {
  editable?: boolean | null;
}

export function correspondAuteur(p: PlaylistAvecAuteur, filtre: FiltreAuteur): boolean {
  if (filtre === 'moi') return p.editable === true;
  if (filtre === 'service') return p.editable === false;
  return true;
}

export function filtrerParAuteur<T extends PlaylistAvecAuteur>(liste: readonly T[], filtre: FiltreAuteur): T[] {
  return liste.filter((p) => correspondAuteur(p, filtre));
}

export interface ComptesAuteur {
  tous: number;
  moi: number;
  service: number;
}

export function compterParAuteur(liste: readonly PlaylistAvecAuteur[]): ComptesAuteur {
  let moi = 0;
  let service = 0;
  for (const p of liste) {
    if (p.editable === true) moi++;
    else if (p.editable === false) service++;
  }
  return { tous: liste.length, moi, service };
}

export function filtreAuteurUtile(c: ComptesAuteur): boolean {
  return c.moi > 0 && c.service > 0;
}
