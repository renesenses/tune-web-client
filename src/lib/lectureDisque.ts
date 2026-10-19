/**
 * Lire UN disque d'un album à plusieurs disques — web#2221.
 *
 * Demande d'un utilisateur relayée par Bertrand le 19/10/2026 : « comment lire
 * un seul CD d'un coffret ? ». L'en-tête « Disque N » (#1431) n'était qu'un
 * libellé, et « Lire à partir de cette piste » met l'album ENTIER dans la file
 * (`album_id` + `start_index`) : la lecture continue sur les disques suivants.
 *
 * Ce module dit, pour un rang qui ouvre un disque, quelles pistes forment ce
 * disque et combien de temps il dure. Il ne joue rien : l'écran — seul à
 * savoir désigner ses pistes (bibliothèque, service, autre serveur Tune) —
 * reçoit la tranche et la lance.
 *
 * La liste arrive déjà rangée par disque puis par piste (voir
 * `enTetesDisque`) : un disque est donc une tranche CONTIGUË, du rang qui
 * l'ouvre au rang où `disc_number` change. On n'ordonne rien.
 */
import type { Track } from './types';

/** Les trois gestes de l'en-tête d'un disque. */
export type GesteDisque = 'lire' | 'ensuite' | 'file';

const disqueDe = (p: Track): number => p.disc_number || 1;

/** Combien de disques DISTINCTS porte la liste. */
export function nombreDeDisques(pistes: readonly Track[]): number {
  return new Set(pistes.map(disqueDe)).size;
}

/**
 * Les pistes du disque qui commence au rang `debut` : de ce rang jusqu'au
 * premier rang d'un autre disque, dans l'ordre de la liste.
 */
export function pistesDuDisque(pistes: readonly Track[], debut: number): Track[] {
  if (debut < 0 || debut >= pistes.length) return [];
  const d = disqueDe(pistes[debut]);
  let fin = debut;
  while (fin < pistes.length && disqueDe(pistes[fin]) === d) fin++;
  return pistes.slice(debut, fin);
}

/** La durée d'un disque, en millisecondes. Une piste sans durée compte zéro. */
export function dureeDuDisqueMs(pistes: readonly Track[]): number {
  return pistes.reduce((s, p) => s + (p.duration_ms ?? 0), 0);
}
