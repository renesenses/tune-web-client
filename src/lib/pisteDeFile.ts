/**
 * Une ligne de FILE D'ATTENTE vue comme une piste — #1430.
 *
 * Didier (Gros Bidon), fil 1884, 0.9.161 : le cœur d'un titre favori est plein
 * sur la fiche d'album et VIDE dans la file. Mesuré sur le .18
 * (`GET /zones/10/queue`, 22/09/2026) :
 *
 *     { "id": 26070, "track_id": 32764, "source": "local", … }
 *
 * `id` est le numéro de la LIGNE DE FILE (`queue_items.id`) ; l'identifiant de
 * bibliothèque est `track_id`. `PisteActions` lit `piste.id` pour tout : le
 * cœur (`favoriteTrackIds.has`), sa bascule, « Lire », « Lire ensuite »,
 * « Ajouter à la file », les étiquettes, et `etatDeLaLigne` pour la ligne qui
 * joue. Sur une ligne de file, tous visaient donc une autre piste — ou rien.
 *
 * C'est le troisième cas du même piège, après `NowPlaying`
 * (`types.ts` : « Lire l'id via `track_id ?? id` »).
 *
 * On remplace `id` par `track_id` QUAND il est là. Une ligne de streaming ou
 * de radio porte `track_id: null` : elle reste telle quelle, son cœur passe
 * par `source` + `source_id`. Les gestes propres à la file (sauter, monter,
 * descendre, retirer) travaillent au RANG, jamais à l'identifiant : ils ne
 * sont pas touchés.
 */
import type { Track } from './types';

export function pisteDeFile<T extends Track>(ligne: T): T {
  const tid = (ligne as T & { track_id?: number | null }).track_id;
  return typeof tid === 'number' && tid !== ligne.id ? { ...ligne, id: tid } : ligne;
}
