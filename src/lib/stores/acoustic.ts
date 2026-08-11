import { writable, derived, get } from 'svelte/store';
import * as api from '../api';

/** État de la brique acoustique côté serveur, tel que renvoyé par
 *  `GET /library/search/acoustic/status`. `null` tant qu'on n'a pas répondu. */
export interface AcousticStatus {
  available: boolean;
  enabled: boolean;
  analysed_tracks: number;
  /** Pistes que la passe PEUT analyser — pas la bibliothèque entière : le DSD
   *  et les pistes sans fichier local en sont exclus. Absent sur un serveur
   *  antérieur à la jauge de progression. */
  eligible_tracks?: number;
  pending_tracks?: number;
  /** Débit de la passe : 'eco' | 'equilibre' | 'rapide'. */
  throttle?: string;
}

export const acousticStatus = writable<AcousticStatus | null>(null);

/** L'entrée Ambiance doit-elle figurer dans la navigation ?
 *
 *  On ne masque QUE le cas où l'utilisateur ne peut rien y faire : un binaire
 *  sans la brique acoustique. Partout ailleurs l'entrée reste visible, et
 *  l'écran explique ce qu'il faut activer — avec le geste sur place.
 *
 *  La première version masquait aussi quand l'analyse était désactivée. C'était
 *  éviter une porte fermée, mais l'effet fut pire : un menu connu disparaissait
 *  sans prévenir, et deux testeurs ont cru la fonction supprimée en moins d'un
 *  jour (Fabien, Philippe). Un silence en avait remplacé un autre.
 *
 *  Tant que le serveur n'a pas répondu (`null`), on n'affiche pas : mieux vaut
 *  une entrée qui apparaît qu'une entrée qui disparaît sous le curseur. */
export const ambianceUsable = derived(
  acousticStatus,
  ($s) => $s !== null && $s.available,
);

/** L'analyse est-elle activée ? L'écran Ambiance s'en sert pour choisir entre
 *  « à activer » et « en cours ». */
export const acousticEnabled = derived(
  acousticStatus,
  ($s) => $s?.enabled === true,
);

/** Recharge l'état. Appelé au démarrage et après bascule de l'interrupteur
 *  dans les Paramètres, pour que la navigation suive sans rechargement. */
export async function refreshAcousticStatus(): Promise<void> {
  try {
    acousticStatus.set(await api.getAcousticStatus());
  } catch {
    // Serveur plus ancien (route absente) ou hors ligne : on reste sur `null`,
    // donc l'entrée reste masquée plutôt que de promettre ce qu'on ne sait pas.
    acousticStatus.set(null);
  }
}

/** Progression de l'analyse, ou `null` quand le serveur ne sait pas la dire
 *  (version antérieure, ou aucune piste analysable). */
export const acousticProgress = derived(acousticStatus, ($s) => {
  const total = $s?.eligible_tracks;
  if (!$s || typeof total !== 'number' || total <= 0) return null;
  const done = Math.min($s.analysed_tracks, total);
  return {
    done,
    total,
    // Arrondi vers le BAS : afficher « 100 % » alors qu'il reste des pistes
    // ferait croire à un blocage juste avant la fin.
    percent: Math.floor((done / total) * 100),
    remaining: Math.max(total - done, 0),
    complete: done >= total,
  };
});

/** Suivi vivant : tant que l'analyse tourne, on redemande l'état. Le pas est
 *  volontairement lent — cette page n'est pas un tableau de bord temps réel, et
 *  chaque appel fait deux COUNT sur la base. Le suivi s'arrête tout seul dès
 *  que l'analyse est finie, désactivée, ou que l'onglet passe en arrière-plan :
 *  personne n'a besoin d'une jauge qui progresse dans un onglet invisible. */
let pollTimer: ReturnType<typeof setInterval> | null = null;
const POLL_MS = 10_000;

export function startAcousticPolling(): () => void {
  const tick = async () => {
    if (typeof document !== 'undefined' && document.hidden) return;
    await refreshAcousticStatus();
    const s = get(acousticStatus);
    const total = s?.eligible_tracks;
    const done = typeof total === 'number' && total > 0 && s!.analysed_tracks >= total;
    if (!s?.enabled || done) stopAcousticPolling();
  };
  stopAcousticPolling();
  void tick();
  pollTimer = setInterval(tick, POLL_MS);
  return stopAcousticPolling;
}

export function stopAcousticPolling(): void {
  if (pollTimer !== null) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}
