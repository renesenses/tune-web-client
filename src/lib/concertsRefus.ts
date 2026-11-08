import type { ApiError } from './api';
import { estRefusPremium } from './premiumRefus';
import { COMPTE_NON_RELIE, MODULE_NON_POSSEDE } from './refusModuleSortie';

/**
 * Ce que le greffon Concerts refuse (tune-server-rust#2363).
 *
 * Depuis tune-server-rust#7865 (Bertrand, 04/11/2026), les concerts ne sont
 * plus Premium : un serveur à jour ne refuse plus rien. Seul un serveur
 * d'avant (rc10) renvoie encore ces refus, et l'écran lui dit alors de se
 * mettre à jour, sans mention Premium ni lien vers l'offre. Les deux raisons
 * restent distinguées pour le panneau et les essais.
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
