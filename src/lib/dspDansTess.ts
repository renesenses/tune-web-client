/**
 * rc14 (retours de Rémi, go de Bertrand du 25/11/2026) — TOUT le DSP se règle
 * désormais dans TESS.
 *
 * Une seule règle pour les écrans qui portaient encore un réglage DSP à côté
 * de TESS : la rangée d'actions de « Lecture en cours » (EQ, Crossfeed), le
 * menu d'une zone (« Correction de pièce ») et la fenêtre « Réglages de la
 * zone » (mode DSD, sortie mono, correction de pièce). Ils s'effacent au
 * profit de TESS QUAND LE SERVEUR L'ANNONCE (`capaciteTess === 'oui'`), et
 * restent tels quels sinon : un serveur ancien, sans TESS, ne perd aucun
 * réglage. Tant que la capacité est `inconnue` (sonde pas encore revenue),
 * rien ne disparaît.
 */
import type { CapaciteTess } from './stores/tess';

export function dspRegroupeDansTess(capacite: CapaciteTess | null | undefined): boolean {
  return capacite === 'oui';
}
