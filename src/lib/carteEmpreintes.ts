import { writable } from 'svelte/store';
import type { InstantaneTachesDeFond } from './tachesDeFond';

/**
 * La carte « Empreintes audio » de l'écran État du serveur — tune-server-rust#8346.
 *
 * BenjaminB (AudioScienceReview, message #161, rc11, Linux) voyait depuis
 * 8 h un rééchantillonnage continu 44,1 kHz → 11 kHz dans le terminal, sans
 * savoir quelle tâche le faisait ni comment l'arrêter. C'est la passe
 * d'empreintes (mono 11 025 Hz), nouvelle en rc11. Sa pause existe côté
 * serveur (`/system/background-tasks/fingerprints/pause`, conservée au
 * redémarrage), mais aucun écran ne la proposait : ReplayGain, plage
 * dynamique, CLAP, métadonnées et images avaient leur carte ; les empreintes
 * n'apparaissaient qu'en ligne de « Ce qui tourne », sans bouton.
 *
 * Tout se lit dans l'entrée `fingerprints` de `pausable[]`, que l'écran lit
 * déjà : `state`, `paused` et `progress` (#7915). Un serveur qui ne publie pas
 * cette entrée n'a pas de carte : rien n'est inventé.
 */
export const TRAITEMENT_EMPREINTES = 'fingerprints';

export type CarteEmpreintes = {
  etat: 'running' | 'idle';
  enPause: boolean;
  /** Avancement de la passe en cours, quand le serveur le publie. */
  fait?: number;
  total?: number;
  /** Secondes restantes estimées par le serveur, ou `null`. */
  resteSecondes: number | null;
};

const nombre = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) ? v : null;

export function carteEmpreintes(
  instantane: InstantaneTachesDeFond | null | undefined,
): CarteEmpreintes | null {
  const entree = (instantane?.pausable ?? []).find((p) => p?.id === TRAITEMENT_EMPREINTES) as
    | Record<string, any>
    | undefined;
  if (!entree) return null;
  const enPause = !!entree.paused;
  const etat = entree.state === 'en_cours' && !enPause ? 'running' : 'idle';
  const p = entree.progress;
  const total = nombre(p?.total);
  const fait = nombre(p?.processed);
  const carte: CarteEmpreintes = { etat, enPause, resteSecondes: null };
  if (total !== null && total > 0 && fait !== null) {
    carte.fait = Math.max(0, Math.min(fait, total));
    carte.total = total;
    const eta = nombre(p?.eta_seconds);
    carte.resteSecondes = eta !== null && eta > 0 ? eta : null;
  }
  return carte;
}

/**
 * La carte que l'indicateur d'activité de la barre latérale demande d'amener
 * à l'écran (#8346) : l'identifiant serveur du traitement (`fingerprints`,
 * `dynamic_range`…), lu et vidé par État du serveur une fois ses cartes posées.
 */
export const carteDeFondCiblee = writable<string | null>(null);
