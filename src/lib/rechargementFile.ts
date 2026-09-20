/**
 * QUAND redemander la file d'attente ENTIÈRE.
 *
 * ## Le défaut que cette règle referme
 *
 * `v2Live.ts` rappelait `rechargerFile()` sur TOUT événement commençant par
 * `playback.` — pause, reprise, volume, changement d'état compris — et
 * réécrivait `queueTracks` en entier à chaque fois. Sur la playlist Qobuz de
 * 1454 titres d'Alex Campbell (20/09/2026), une lecture ordinaire de onze
 * événements partait en sept requêtes complètes, 336 Ko chacune, chacune
 * suivie d'une réécriture intégrale de la liste.
 *
 * L'ancienne interface ne le faisait pas : `App.svelte` portait la note
 * « no fetchQueue() here — playback.started/track_changed already refetch the
 * queue above, and playback.resumed never changes it » (#1126). La bascule v2
 * l'a perdue. Refs #1126, #1096.
 *
 * ## La polarité de la garde, et pourquoi elle est dans ce sens
 *
 * On liste ce qui NE change PAS la file, et tout le reste recharge — jamais
 * l'inverse. Une liste blanche d'« événements qui changent la file » laisserait
 * un événement neuf, ou renommé côté serveur, passer en silence : l'écran
 * afficherait alors une file périmée, ce qui est pire que de la recharger pour
 * rien. Une file qui ment est le défaut inverse de celui qu'on corrige, et il
 * ne se voit pas.
 *
 * C'est pourquoi `playback.shuffle` et `playback.transferred` rechargent :
 * l'aléatoire rebat l'ORDRE et un transfert emmène la file sur une autre zone.
 * Seuls les gestes de transport pur sont dispensés.
 */

import { doitRechargerLaFileEntiere } from './suiviPisteEnCours';

/**
 * Les événements de lecture qui ne touchent PAS au contenu de la file.
 *
 * Chacun est un geste de TRANSPORT : il déplace un curseur, change un volume
 * ou un état, sans rien ajouter ni retirer. `playback.position`, `playback.seek`
 * et `playback.audio_levels` n'y figurent pas parce qu'ils sont traités — et
 * arrêtés — bien avant d'arriver ici.
 */
const TRANSPORT_PUR = new Set([
  'playback.paused',
  'playback.resumed',
  'playback.stopped',
  'playback.volume',
  'playback.state_changed',
  'playback.repeat',
  'playback.position',
  'playback.seek',
  'playback.audio_levels',
  'playback.error',
]);

/**
 * Les deux événements qui portent la position dans leur charge utile.
 *
 * Le serveur pose l'index AVANT d'émettre — `update_queue_info()` précède
 * `play()` puis `update_now_playing()` — « so the event carries the correct
 * queue_position and the client updates its highlight without refetching the
 * whole queue (#1096) ». Quand elle est là, une avance de piste ne déplace
 * qu'un pointeur.
 */
const AVANCE_DE_PISTE = new Set([
  'playback.started',
  'playback.track_changed',
  'playback.track_skipped',
]);

/**
 * Faut-il redemander la file entière pour cet événement ?
 *
 * @param type          Le type d'événement, tel que le serveur l'émet.
 * @param positionConnue `true` si l'événement porte une `queue_position`
 *                       exploitable — voir `positionFileAnnoncee`.
 */
export function doitRechargerLaFile(type: string, positionConnue: boolean): boolean {
  if (!type.startsWith('playback.')) return false;
  if (TRANSPORT_PUR.has(type)) return false;
  // `playback.started` : le contenu peut être neuf, donc toujours.
  // `track_changed` / `track_skipped` : seulement si la position manque — un
  // serveur plus ancien que le client, et l'ordre de déploiement n'est jamais
  // garanti. Même règle qu'`App` tenait, et la même fonction.
  if (AVANCE_DE_PISTE.has(type)) return doitRechargerLaFileEntiere(type, positionConnue);
  // Tout le reste — `playback.queue.*`, `playback.queue_changed`,
  // `playback.autoplay_tracks_added`, `playback.shuffle`,
  // `playback.transferred`, et tout nom que ce fichier ne connaît pas encore.
  return true;
}
