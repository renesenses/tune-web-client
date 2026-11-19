import { get } from 'svelte/store';
import { dialogs } from './stores/dialogs';
import { t, tn } from './i18n';
import { estLigneRadio } from './lignePlaylistRadio';
import type { Track } from './types';

/**
 * Les confirmations des gestes qui ÔTENT quelque chose d'une playlist, sur le
 * modèle de web#3245 : la boîte du client (`dialogs.confirm`, jamais un
 * dialogue natif, #166), teintée danger, « Annuler » par défaut (focus à
 * l'ouverture ; Échap et Entrée annulent).
 */

/**
 * web#3245 / web#3255 — retirer UN titre d'une playlist : la croix « Retirer »
 * (vue en pochettes et vue en liste) et l'entrée « Supprimer de cette
 * playlist » du menu « … » de la piste (chemin `retirerDe`). Le message nomme
 * le titre, son album (sauf pour une radio) et la playlist.
 */
export function confirmerRetraitTitre(piste: Pick<Track, 'title' | 'album_title' | 'radio' | 'source'>, nomPlaylist: string | null | undefined): Promise<boolean> {
  const traduire = get(t);
  const titre = piste.title ?? '';
  const album = piste.album_title && !estLigneRadio(piste) ? piste.album_title : '';
  const message = traduire((album ? 'v2.pl.confirmRemoveAlbum' : 'v2.pl.confirmRemove') as any)
    .replace('{title}', () => titre)
    .replace('{album}', () => album)
    .replace('{playlist}', () => nomPlaylist ?? '');
  return dialogs.confirm(message, { danger: true, annulerParDefaut: true, valider: traduire('v2.pl.remove' as any) });
}

/**
 * web#3255 (reprend web#3090, fil 2849) — supprimer une playlist ENTIÈRE.
 * `DELETE /playlists/{id}` efface la playlist et toutes ses lignes, sans
 * retour possible : la question nomme la playlist et son nombre de titres, et
 * dit que c'est définitif ; le bouton dit « Supprimer ».
 *
 * `nbTitres` inconnu (une ligne de liste sans `track_count`) : la question
 * sans le nombre, plutôt qu'un « 0 titre » qui mentirait.
 */
export function confirmerSuppressionPlaylist(
  nom: string | null | undefined,
  nbTitres: number | null | undefined,
): Promise<boolean> {
  const traduire = get(t);
  const nomAffiche = (nom ?? '').trim();
  const connu = typeof nbTitres === 'number' && Number.isInteger(nbTitres) && nbTitres >= 0;
  const question = connu
    ? traduire('playlist.deleteConfirmAsk' as any)
        .replace('{name}', () => nomAffiche)
        .replace('{tracks}', () => get(tn)('v2.common.trackCountN', nbTitres as number))
    : traduire('playlist.deleteConfirmAskNoCount' as any).replace('{name}', () => nomAffiche);
  return dialogs.confirm(question, { danger: true, annulerParDefaut: true, valider: traduire('common.delete') });
}
