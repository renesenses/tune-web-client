/**
 * web#2353 — une illustration nettement rectangulaire ne se rogne pas.
 *
 * Les playlists éditoriales Qobuz ont pour pochette `image_rectangle` : une
 * illustration dessinée, photo à gauche et titre écrit à droite (le serveur
 * la choisit exprès, `pochette_playlist` dans `tune-core`, et ne la recouvre
 * pas d'une mosaïque pour qu'elle « reste entière »). La boîte de
 * `AlbumArt` est carrée (`aspect-ratio: 1`) et l'image y était posée en
 * `object-fit: cover` : recadrée au centre, elle perdait le texte de droite
 * (« Les meil… batteu… », Fabien, fil 2379).
 *
 * La règle tient au seul format de l'image chargée : au-delà de ce rapport,
 * dans un sens ou dans l'autre, l'image est contenue (`object-fit: contain`
 * sur le fond neutre de la boîte) au lieu d'être recadrée. Une pochette
 * d'album, carrée ou presque (600 × 600, 1 425 × 1 400…), ne change pas.
 */
export const RAPPORT_RECTANGLE = 1.2;

export function illustrationRectangulaire(largeur: number, hauteur: number): boolean {
  if (!(largeur > 0) || !(hauteur > 0)) return false;
  const rapport = largeur / hauteur;
  return rapport >= RAPPORT_RECTANGLE || rapport <= 1 / RAPPORT_RECTANGLE;
}
