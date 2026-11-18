/**
 * La carte « Analyse acoustique (CLAP) » de l'écran État du serveur —
 * tune-server-rust#9046 (fil 2907, rc12, macOS).
 *
 * La carte déduisait son état de la JAUGE seule : toute bibliothèque entamée
 * et non finie était « en cours », que la passe travaille, dorme, cède à la
 * lecture ou ait renoncé à charger son modèle. Le testeur lisait « EN COURS »,
 * 87 %, un compteur immobile, pendant que « Ce qui tourne », juste au-dessus,
 * disait « aucune tâche de fond ne tourne ». Deux écrans, deux vérités.
 *
 * Le serveur publie déjà les deux signaux qui tranchent :
 * - `GET /system/background-tasks` → `pausable[id=acoustic].state`, le témoin
 *   que lit « Ce qui tourne » ;
 * - `GET /library/search/acoustic/status` → `paused_reason`, la raison pour
 *   laquelle la passe ne travaille pas.
 *
 * Règle : « en cours » SEULEMENT si le serveur dit `en_cours` ; une raison de
 * pause l'emporte et se nomme ; sinon la carte est « au repos » avec sa jauge.
 * Même correction que celle de la plage dynamique (tune-web-client#1828) et du
 * ReplayGain (tune-server-rust#5519).
 */
import type { InstantaneTachesDeFond } from './tachesDeFond';

/** L'identifiant serveur de la passe CLAP dans `pausable[]`. */
export const TRAITEMENT_ACOUSTIQUE = 'acoustic';

/** `pausable[id=acoustic].state` tel que le serveur le publie, ou `undefined`
 *  (serveur sans l'entrée, ou instantané illisible). */
export function etatServeurAcoustique(
  instantane: Pick<InstantaneTachesDeFond, 'pausable'> | null | undefined,
): string | undefined {
  const t = instantane?.pausable?.find((x) => x?.id === TRAITEMENT_ACOUSTIQUE) as
    | { state?: unknown }
    | undefined;
  return typeof t?.state === 'string' ? t.state : undefined;
}

export type EtatCarteClap = {
  etat: 'running' | 'done' | 'idle';
  /** La raison que le serveur donne pour ne pas travailler, ou `null`. */
  raisonPause: string | null;
};

export function etatCarteClap(p: {
  fait: number;
  total: number;
  /** Il ne reste que des pistes reportées (fichiers qui ne répondent pas). */
  attendLesFichiers: boolean;
  /** `pausable[id=acoustic].state`, ou `undefined`. */
  etatServeur: string | undefined;
  /** `paused_reason` de `/library/search/acoustic/status`. */
  raisonPause: unknown;
}): EtatCarteClap {
  const raison = typeof p.raisonPause === 'string' && p.raisonPause.length > 0 ? p.raisonPause : null;
  if (p.attendLesFichiers) return { etat: 'idle', raisonPause: null };
  if (p.total > 0 && p.fait >= p.total) return { etat: 'done', raisonPause: null };
  // Une raison nommée prime : la passe ne travaille pas, et l'écran dit
  // pourquoi au lieu d'un « en cours » figé.
  if (raison) return { etat: 'idle', raisonPause: raison };
  if (p.etatServeur === 'en_cours') return { etat: 'running', raisonPause: null };
  // Jauge entamée, aucune activité publiée : « au repos », jauge conservée.
  // Un serveur qui ne publie pas l'entrée n'affirme rien : pas d'« en cours ».
  return { etat: 'idle', raisonPause: null };
}
