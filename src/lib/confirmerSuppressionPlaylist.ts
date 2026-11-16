import { get } from 'svelte/store';
import { dialogs } from './stores/dialogs';
import { t, tn } from './i18n';

/**
 * web#3090 (fil 2849) — la confirmation avant de supprimer une playlist
 * LOCALE, la même sur tous les écrans qui proposent le geste : le mode
 * « Éditer » de la fiche (`PlaylistDetailV2`), le menu « … » d'une playlist
 * (`gestesObjet`) et la carte de la liste héritée (`PlaylistManagerView`).
 *
 * La suppression est définitive (la route `DELETE /playlists/{id}` efface la
 * playlist et toutes ses lignes) : la question dit le NOM et le NOMBRE DE
 * TITRES, le bouton dit « Supprimer » en rouge, et « Annuler » est le choix
 * par défaut (focus à l'ouverture, Entrée annule).
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
  const question =
    typeof nbTitres === 'number' && Number.isFinite(nbTitres) && nbTitres >= 0
      ? traduire('playlist.deleteConfirmAsk' as any)
          .replace('{name}', nomAffiche)
          .replace('{tracks}', get(tn)('v2.common.trackCountN', nbTitres))
      : traduire('menuObjet.deletePlaylistAsk' as any).replace('{name}', nomAffiche);
  return dialogs.confirm(question, {
    danger: true,
    libelleValider: traduire('common.delete'),
    annulerParDefaut: true,
  });
}
