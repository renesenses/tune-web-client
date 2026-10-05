/**
 * PURE ET REPLAYGAIN — tune-server-rust#5633. Décision de Bertrand (05/10) :
 * PURE garde le bit-perfect, donc ignore le ReplayGain, et Tune le DIT.
 *
 * GgB (fil 1797) : basculer PURE sur une piste de bibliothèque faisait
 * monter le niveau « de pas loin de 10 dB ». C'était le ReplayGain de la
 * piste, que PURE cesse d'appliquer — sans que rien ne le dise.
 *
 * Le chiffre vient du serveur, jamais d'une chaîne à analyser :
 *   - hors PURE, l'étape « ReplayGain » du chemin du signal porte `gain_db` ;
 *   - sous PURE, `pure_replaygain_ignored.gain_db` dit ce que la piste en
 *     cours recevrait hors PURE.
 * Un serveur qui ne les publie pas : on prévient sans chiffre.
 */
import type { SignalPath } from './types';

/** L'étape ReplayGain qui altère RÉELLEMENT le signal, hors PURE. */
function etapeReplayGain(sp: SignalPath | null | undefined) {
  return sp?.steps?.find((s) => s.name === 'ReplayGain' && s.bit_perfect === false) ?? null;
}

/** Hors PURE : le ReplayGain appliqué à la piste en cours existe-t-il ? */
export function replayGainActif(sp: SignalPath | null | undefined): boolean {
  return etapeReplayGain(sp) != null;
}

/** Hors PURE : le gain ReplayGain de la piste en cours, en dB, s'il est publié. */
export function gainReplayGainApplique(sp: SignalPath | null | undefined): number | null {
  const g = etapeReplayGain(sp)?.gain_db;
  return typeof g === 'number' && Number.isFinite(g) ? g : null;
}

/** Sous PURE : le gain ReplayGain que PURE laisse de côté, s'il est publié. */
export function gainIgnoreParPure(sp: SignalPath | null | undefined): number | null {
  if (!sp?.pure) return null;
  const g = sp.pure_replaygain_ignored?.gain_db;
  return typeof g === 'number' && Number.isFinite(g) ? g : null;
}
