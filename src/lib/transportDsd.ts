import type { Zone } from './types';

/**
 * #1876 — « Natif » réglé sur une sortie locale part en DoP : le serveur le
 * publie (`dsd_transport = "natif_servi_en_dop"`, `TransportDsd` côté
 * `tune-core`), l'écran doit le dire à côté du réglage.
 *
 * Rien n'est déduit ici du type de sortie : seul le champ du serveur fait foi
 * (absent = on ne sait pas = rien à dire). Le `dsd_mode` n'est regardé que
 * pour ne jamais afficher la mention sous un sélecteur qui ne dit plus
 * « Natif » (champ resté d'une réponse antérieure au changement de réglage).
 */
export const NATIF_SERVI_EN_DOP = 'natif_servi_en_dop';

export function natifServiEnDop(z: Pick<Zone, 'dsd_mode' | 'dsd_transport'> | null | undefined): boolean {
  return z?.dsd_transport === NATIF_SERVI_EN_DOP && z?.dsd_mode === 'native';
}

/**
 * #2513 (tune-server-rust#7372, ASIO Topping) — le serveur publie AUSSI le
 * motif de son diagnostic : `dsd_transport_reason`, à côté de
 * `dsd_transport_scope = "output_capability"`.
 *
 * - `dsd_transport: null` + `capacite_non_sondee` : la capacité DSD native de
 *   la sortie n'a pas encore été relevée (elle l'est à la résolution d'une
 *   piste DSD). Ce n'est NI un repli DoP NI un pilote occupé : on dit
 *   seulement que c'est à déterminer.
 * - `natif_servi_en_dop` + `sortie_non_asio` / `pilote_sans_dsd` : la cause
 *   connue du repli DoP.
 * - motif `null` : rien à expliquer (et tout ancien message s'efface, puisque
 *   le texte est recalculé à chaque réponse).
 *
 * C'est une capacité de SORTIE, pas le transport réel de la piste en cours :
 * aucune cadence, aucun verdict de pilote n'en est déduit ici, et l'affichage
 * ne déclenche aucun sondage (il ne fait que lire la zone).
 */
export type MotifTransportDsd = 'capacite_non_sondee' | 'sortie_non_asio' | 'pilote_sans_dsd';

export const CLE_MOTIF_DSD: Record<MotifTransportDsd, string> = {
  capacite_non_sondee: 'v2.set.dsdCapabilityUnknown',
  sortie_non_asio: 'v2.set.dsdDopNotAsio',
  pilote_sans_dsd: 'v2.set.dsdDopDriverWithoutDsd',
};

export interface DiagnosticDsd {
  /** Clé de traduction du message à afficher sous le sélecteur DSD. */
  cle: string;
  /** `inconnue` : capacité à déterminer ; `dop` : le natif part en DoP. */
  genre: 'inconnue' | 'dop';
}

export function diagnosticDsd(
  z: Pick<Zone, 'dsd_mode' | 'dsd_transport' | 'dsd_transport_reason'> | null | undefined,
): DiagnosticDsd | null {
  if (!z || z.dsd_mode !== 'native') return null;
  const motif = z.dsd_transport_reason;
  if (z.dsd_transport == null) {
    return motif === 'capacite_non_sondee' ? { cle: CLE_MOTIF_DSD.capacite_non_sondee, genre: 'inconnue' } : null;
  }
  if (z.dsd_transport !== NATIF_SERVI_EN_DOP) return null;
  if (motif === 'sortie_non_asio' || motif === 'pilote_sans_dsd') return { cle: CLE_MOTIF_DSD[motif], genre: 'dop' };
  // Serveur antérieur à #7372 (pas de motif) ou motif inconnu : la mention #1876.
  return { cle: 'v2.set.dsdNativeServedAsDop', genre: 'dop' };
}
