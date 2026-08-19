import { writable, derived, get } from 'svelte/store';
import * as api from '../api';
import { connectionState } from './connection';

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
  /** Pistes TRAITÉES pour le modèle courant — empreinte écrite **ou** échec
   *  constaté. C'est ce nombre qui doit piloter la jauge : lui seul atteint le
   *  dénominateur quand il ne reste plus rien à faire. Absent sur un serveur
   *  antérieur, d'où le repli sur `analysed_tracks`. */
  processed_tracks?: number;
  /** Pistes traitées sans empreinte. Ni une file d'attente ni un blocage :
   *  elles sont FINIES, elles ont échoué. Les taire fabrique une jauge qui
   *  n'atteint jamais 100 %. */
  failed_tracks?: number;
  /** Débit de la passe : 'eco' | 'equilibre' | 'rapide'. */
  throttle?: string;
  /** La passe peut-elle réellement travailler — modèle configuré ET présent ?
   *  Absent sur un serveur antérieur : on suppose alors que oui, faute de
   *  mieux, plutôt que d'annoncer un problème qu'on ne sait pas constater. */
  model_ready?: boolean;
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

// Le fetch de la sidebar est unique, au mount : un serveur encore en train de
// démarrer (ou une coupure au chargement) laissait l'entrée Ambiance masquée
// jusqu'au rechargement complet de la page — vécu « la fonction a disparu »
// (point 19, revue 2026-08-15). Tant qu'on n'a pas obtenu UNE réponse, on
// retente à chaque retour de la connexion ; dès qu'un statut est connu, ce
// chemin ne fait plus rien (les rafraîchissements suivants restent aux mains
// des écrans concernés).
connectionState.subscribe((s) => {
  if ((s === 'connected' || s === 'polling') && get(acousticStatus) === null) {
    void refreshAcousticStatus();
  }
});

/** L'analyse est activée mais hors d'état de tourner : modèle non configuré ou
 *  absent. La jauge doit alors se taire et laisser place à une explication —
 *  « Analyse en cours — 0 % » sur une passe qui ne démarrera jamais se lit
 *  comme un blocage (Fabien, v0.9.68).
 *
 *  `model_ready` absent = serveur antérieur : on ne prétend pas savoir. */
export const acousticStalled = derived(
  acousticStatus,
  ($s) => $s?.enabled === true && $s?.model_ready === false,
);

/** Progression de l'analyse, ou `null` quand le serveur ne sait pas la dire
 *  (version antérieure, ou aucune piste analysable). */
export const acousticProgress = derived(acousticStatus, ($s) => {
  const total = $s?.eligible_tracks;
  if (!$s || typeof total !== 'number' || total <= 0) return null;
  // Le numérateur est `processed`, PAS `analysed`.
  //
  // Une piste traitée sans empreinte — un fichier que le décodeur refuse —
  // compte dans `processed` et pas dans `analysed`. Prendre `analysed` fige
  // donc la jauge juste sous 100 % **à jamais**, alors que la passe a fini et
  // ne fait plus rien. C'est exactement le défaut que #1819 a corrigé côté
  // serveur, où le commentaire le dit noir sur blanc : « c'est `processed` qui
  // doit piloter la barre ». Le serveur expose les deux depuis ; le client
  // continuait de prendre le mauvais (Bilou, « CLAP bloqué à 99 % », #1479).
  //
  // Repli sur `analysed_tracks` pour un serveur antérieur à `processed_tracks`.
  const done = Math.min($s.processed_tracks ?? $s.analysed_tracks, total);
  const failed = $s.failed_tracks ?? 0;
  return {
    done,
    total,
    // Arrondi vers le BAS : afficher « 100 % » alors qu'il reste des pistes
    // ferait croire à un blocage juste avant la fin.
    percent: Math.floor((done / total) * 100),
    remaining: Math.max(total - done, 0),
    complete: done >= total,
    // Traitées sans empreinte. L'écran doit pouvoir les NOMMER : « 51 pistes
    // n'ont pas pu être analysées » se comprend, une jauge coincée non.
    failed,
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
    // Même grandeur que la jauge, sinon le suivi continuerait d'interroger le
    // serveur pour une passe terminée — toutes les dix secondes, indéfiniment.
    const traitees = s?.processed_tracks ?? s?.analysed_tracks ?? 0;
    const done = typeof total === 'number' && total > 0 && traitees >= total;
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
