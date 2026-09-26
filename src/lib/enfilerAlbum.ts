/**
 * Le GESTE « ajouter cet album à la file » — pour toutes les pochettes.
 *
 * Il existait DEUX fois, sur deux surfaces, avec deux messages différents :
 *
 *  - `AlbumDetailV2.addQueue` (fiche album) : `api.addToQueue(zid, { album_id })`,
 *    succès `v2.album.queued`, échec `v2.pa.queueError` ;
 *  - `FavoritesV2.queueAlbum` (vignette) : le même appel, aucun message de
 *    succès, et l'échec écrit dans un bandeau local (`v2.fav.queueFailed`).
 *
 * Le catalogue de `lib/actionsPochette` le propose désormais sur les sept
 * emplacements qui montrent un album de la bibliothèque. Une troisième copie
 * aurait été une troisième vérité : c'est le reproche que
 * `renesenses/tune-server-rust#1848` faisait au menu de piste, et la raison
 * d'être de `lib/albumVersCollection` et de `lib/ancrageMenu`.
 *
 * On garde les messages de la FICHE — ils nomment l'album (« Requiem ajouté à
 * la file »), là où le bandeau de `FavoritesV2` ne disait que « échec ».
 *
 * 🔴 L'album LOCAL part par son IDENTIFIANT, jamais par ses pistes.
 *
 * Le commentaire de `AlbumDetailV2` le dit et il a coûté un défaut : « le
 * serveur applique alors le rattrapage de la ligne sœur, que résoudre les
 * pistes ici ignorerait — l'album s'ajoutait VIDE là où "lire" marchait »
 * (Pascal, v0.9.21). Une vignette n'a de toute façon pas chargé les pistes, et
 * n'a aucune raison de le faire au survol dans une grille de 800 albums : c'est
 * pourquoi le catalogue réserve ce geste à un album qui porte un `album_id`.
 */
import { get } from 'svelte/store';
import * as api from './api';
import { notifications } from './stores/notifications';
import { zoneRequise } from './zoneRequise';

/**
 * Met l'album en file, et le DIT — succès comme échec.
 *
 * Sans zone active, `zoneRequise()` le dit et rend `null` : le geste s'arrête
 * là, sans se taire (#1233, vingt-huit gestes muets relevés le 19/09/2026).
 *
 * `titre` ne sert qu'au message. Absent, il devient vide — le gabarit
 * `v2.album.queued` porte un `{title}`, et une chaîne vide vaut mieux qu'un
 * « undefined » à l'écran.
 */
export async function enfilerAlbum(
  albumId: number | null | undefined,
  titre?: string | null,
): Promise<void> {
  if (albumId == null) return;
  const zid = zoneRequise();
  if (zid == null) return;
  /**
   * ⚠️ `get(t)(…)` et non `$t(…)`, et l'import est DYNAMIQUE.
   *
   * Dynamique parce que `lib/i18n` tire des magasins qui lisent `localStorage`
   * à l'évaluation du module : l'importer en tête ferait entrer ces effets dans
   * le graphe de tout fichier qui importe celui-ci, y compris les bancs qui
   * tournent en `node`. Même motif que `lib/zoneRequise`.
   */
  const { t } = await import('./i18n');
  const traduire = get(t);
  try {
    await api.addToQueue(zid, { album_id: albumId });
    notifications.success(traduire('v2.album.queued' as any).replace('{title}', titre ?? ''));
  } catch {
    notifications.error(traduire('v2.pa.queueError' as any));
  }
}
