import type { ApiError } from './api';
import { estRefusPremium } from './premiumRefus';
import { COMPTE_NON_RELIE, MODULE_NON_POSSEDE } from './refusModuleSortie';

/**
 * Ce que le greffon Concerts refuse, ramené aux deux phrases que l'écran sait
 * dire (tune-server-rust#2363, décision de Bertrand du 25/09/2026 : pas de
 * version réduite, un compte gratuit reçoit un refus clair).
 *
 * Le serveur garde toutes les routes du greffon par `ModuleRefusal`
 * (`premium_guard.rs`) — corps `{"error":"module_required","code":…}` — ou par
 * `require_premium` (402, `premium_required`). On ne présume PAS du statut :
 * 402 ou 403, c'est le corps qui tranche.
 *
 * - `compte` : `module_account_not_linked`. Le serveur ne SAIT pas si le droit
 *   est acheté ; renvoyer vers la boutique quelqu'un qui a payé serait le faire
 *   acheter deux fois (#2392). Le geste est de relier son compte.
 * - `premium` : tout autre refus d'offre — module non possédé, 402 générique.
 */
export type RefusConcerts = 'premium' | 'compte' | null;

export function refusConcerts(e: unknown): RefusConcerts {
  if (!(e instanceof Error)) return null;
  const err = e as ApiError;
  const corps = (err.corps ?? null) as { error?: unknown; code?: unknown } | null;
  const code = typeof corps?.code === 'string' ? corps.code : err.code;
  if (code === COMPTE_NON_RELIE) return 'compte';
  if (
    estRefusPremium(e)
    || code === MODULE_NON_POSSEDE
    || corps?.error === 'module_required'
    || err.code === 'module_required'
  ) {
    return 'premium';
  }
  return null;
}
