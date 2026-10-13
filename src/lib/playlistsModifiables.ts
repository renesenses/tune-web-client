/**
 * web#2097 (FabienM, fil forum 2236, point 8, 1.0.0-rc4) — « Il ne faut pas
 * pouvoir ajouter un titre Qobuz à une playlist éditoriale de Qobuz.
 * Uniquement une playlist Qobuz créée par soi peut accepter un ajout. »
 *
 * `/playlist/getUserPlaylists` rend, chez Qobuz, les playlists de
 * l'utilisateur ET celles qu'il suit. Le serveur dit désormais lesquelles il
 * peut modifier (`editable`, tune-server-rust, lot `batch/bugs-rc5-20261012`).
 *
 * Règle : on écarte une playlist SEULEMENT quand le serveur dit `false`.
 * Absent (serveur plus ancien, ou service qui ne le dit pas) : on la garde,
 * comme avant — le refus du service reste alors affiché par la fenêtre.
 */
export interface PlaylistAvecDroit {
  editable?: boolean | null;
}

export function estModifiable(p: PlaylistAvecDroit | null | undefined): boolean {
  return p?.editable !== false;
}

export function playlistsModifiables<T extends PlaylistAvecDroit>(liste: readonly T[] | null | undefined): T[] {
  return (liste ?? []).filter(estModifiable);
}
