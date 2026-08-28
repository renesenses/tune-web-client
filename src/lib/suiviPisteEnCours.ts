/**
 * Suivi de la piste en cours : les deux décisions que prend le client quand le
 * serveur annonce `playback.started` ou `playback.track_changed`.
 *
 * Elles vivent ici, hors d'App.svelte, pour deux raisons. La première est
 * qu'elles se testent. La seconde est qu'elles avaient déjà été livrées une
 * fois, puis avalées par la fusion `f14553f` du 23/07/2026 sans que les
 * commits sortent de l'histoire : une règle nommée et couverte se voit
 * disparaître, une poignée de lignes noyées au milieu d'un gestionnaire
 * d'événements de mille lignes, non.
 */

import type { Zone } from './types';

/**
 * Position dans la file annoncée par le serveur, ou `null`.
 *
 * Deux porteurs la transportent, de forme identique : l'événement de lecture
 * (`event.data`) et la réponse de `GET /zones/{id}` — pas la liste `/zones`,
 * qui ne la contient pas. La même lecture sert donc aux deux.
 *
 * Le serveur pose l'index AVANT d'émettre — `update_queue_info()` précède
 * `play()` et `update_now_playing()` dans l'orchestrateur — précisément pour
 * que le client rafraîchisse sa surbrillance sans redemander la file (#1096).
 * On refuse tout ce qui n'est pas un entier positif : une position absente,
 * `null`, `NaN` ou négative doit retomber sur le rechargement complet plutôt
 * que de déplacer la surbrillance au petit bonheur.
 */
export function positionFileAnnoncee(data: unknown): number | null {
  if (!data || typeof data !== 'object') return null;
  const brute = (data as Record<string, unknown>).queue_position;
  if (typeof brute !== 'number' || !Number.isInteger(brute) || brute < 0) return null;
  return brute;
}

/**
 * Faut-il redemander la file ENTIÈRE ?
 *
 * Une avance de piste ne déplace que le pointeur : le contenu est inchangé, et
 * le retélécharger puis le réinjecter en entier figeait l'écran sous une file
 * aléatoire de toute la bibliothèque (#1096, Jean Valjean). On ne le fait donc
 * plus que dans les deux cas où c'est nécessaire :
 *
 *  - un DÉMARRAGE de lecture, où le contenu peut être neuf ;
 *  - un serveur qui ne porte pas la position, où c'est le seul moyen de
 *    connaître l'index — l'ordre de déploiement client/serveur n'est jamais
 *    garanti, et une surbrillance fausse est pire qu'un rechargement.
 */
export function doitRechargerLaFileEntiere(type: string, positionConnue: boolean): boolean {
  return type === 'playback.started' || !positionConnue;
}

/** Nombre maximal de re-synchronisations pour faire venir `signal_path`. */
export const MAX_ESSAIS_CHEMIN_SIGNAL = 6;

/** Recul progressif entre deux essais : 400 ms, 800 ms… soit ~8,4 s en tout. */
export function delaiEssaiCheminSignal(essai: number): number {
  return 400 * essai;
}

/**
 * Faut-il relancer une synchronisation pour obtenir le chemin du signal ?
 *
 * Le badge bit-perfect lit `zone.signal_path`, que le serveur calcule depuis
 * l'état VIVANT de la zone. La mise à jour optimiste conserve le chemin de la
 * piste précédente, si bien qu'à partir de la deuxième piste le badge reste
 * affiché ; mais sur la PREMIÈRE piste d'une zone démarrée à froid il n'y a
 * rien à conserver, et la réponse autoritaire peut arriver avant que la zone
 * ait fini de passer en lecture : elle revient nulle et le badge n'apparaît
 * qu'à la piste suivante (#72).
 *
 * On ne s'arrête donc PAS sur un état transitoire. Le premier correctif le
 * faisait — `state !== 'playing'` renvoyait immédiatement — et sur un
 * démarrage lent (NAS, SQLite, Windows — Bilou) la zone était encore en
 * transition à l'arrivée de l'événement : on rendait la main sans jamais
 * réessayer, et le badge manquait pendant toute la première piste (#75). On ne
 * renonce que sur une résolution, une zone disparue, un arrêt franc, ou
 * l'épuisement du budget.
 */
export function doitReessayerCheminSignal(
  zone: Pick<Zone, 'state' | 'signal_path'> | null | undefined,
  essaisFaits: number,
): boolean {
  if (!zone) return false;
  if (zone.signal_path) return false;
  if (zone.state === 'stopped') return false;
  return essaisFaits < MAX_ESSAIS_CHEMIN_SIGNAL;
}
