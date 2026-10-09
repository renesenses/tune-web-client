/**
 * #1875 (Marco Polo, fil 2104) — « Localiser sur le disque » ouvre AUSSI le
 * dossier dans l'Explorateur Windows (ou le Finder, ou le gestionnaire de
 * fichiers de Linux), comme « Open containing folder » de foobar2000.
 *
 * Un navigateur ne peut pas lancer l'Explorateur : c'est le SERVEUR qui le
 * fait, sur SA machine (`POST /library/albums/{id}/reveal`). Il ne le fait
 * que pour un administrateur dont le navigateur tourne sur cette même machine
 * — jamais pour un poste distant, jamais à travers le relais. Le client ne
 * MONTRE le bouton que lorsque le serveur dit qu'il servirait
 * (`GET /library/reveal/available`) : depuis une tablette ou un autre PC, il
 * n'apparaît pas, et « Localiser sur le disque » (l'écran Répertoires) reste
 * le geste.
 *
 * Un serveur antérieur ne connaît pas la route : 404, le bouton reste absent.
 */
import { getRevelationDisponible, revelerDossierAlbum } from './api';

/** Le bouton servirait-il ici ? Toute erreur vaut NON : rien n'est affiché. */
export async function revelationDisponible(
  lire: () => Promise<{ available?: boolean } | undefined> = getRevelationDisponible,
): Promise<boolean> {
  try {
    return (await lire())?.available === true;
  } catch {
    return false;
  }
}

/** La clé du message d'échec, d'après le code stable du serveur. */
export function cleEchecRevelation(code: string | undefined): string {
  if (code === 'album_folder_not_found') return 'v2.album.revealNotFound';
  if (code?.startsWith('reveal_')) return 'v2.album.revealRefused';
  return 'v2.album.revealFailed';
}

export { revelerDossierAlbum };
