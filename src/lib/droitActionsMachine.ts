/**
 * rc14 — les actions réservées à la machine du serveur ou à un administrateur
 * (Redémarrer / Arrêter le serveur, Éteindre / Redémarrer la machine) sont
 * GRISÉES quand l'appelant ne peut pas les exécuter, au lieu d'être refusées
 * APRÈS le clic par un long message rouge (capture d'Yves, rc13.1).
 *
 * Le serveur garde ces routes par `AdminOuCetteMachine` :
 *  - authentification active : il faut un compte administrateur ;
 *  - authentification coupée : il faut un appel de la machine du serveur.
 *
 * Le client lit les deux faits que le serveur expose déjà :
 *  - `GET /auth/activation` : `auth_enabled` et `from_this_machine`, calculé
 *    par la même règle que la garde (`appel_depuis_cette_machine` : relais,
 *    mandataire, appliance qui relaie le port 80 compris) ;
 *  - `GET /auth/me` : le `role` de la session, quand l'authentification est
 *    active.
 *
 * Tout ce qui ne se lit pas (serveur plus ancien, erreur réseau, `/auth/me`
 * absent) laisse les boutons actifs : le serveur reste juge, et son refus est
 * dit après coup (`refusHorsMachine`).
 *
 * La mise à jour n'est PAS concernée : depuis la rc13.1, elle est permise
 * depuis le réseau local.
 */
import { getAuthActivation, getAuthMe, type EtatActivationAuth } from './api';

/** Le fil épinglé du forum qui explique comment activer l'authentification. */
export const FIL_AIDE_ACTIONS_MACHINE =
  'https://mozaiklabs.fr/forum/threads/rc13-mise-a-jour-bloquee-ou-actions-refusees-activez-lauthentification-update-blocked-turn-on-authentication-3eAFTN';

/**
 * Pourquoi les actions de la machine sont indisponibles :
 *  - `hors_machine` : authentification coupée, appareil autre que la machine ;
 *  - `non_admin` : authentification active, compte non administrateur.
 */
export type RefusActionsMachine = 'hors_machine' | 'non_admin';

/**
 * La clé de la ligne affichée sous les boutons grisés.
 *
 * Sur un appareil Tune OS, `from_this_machine` est faux même sur la machine
 * elle-même quand l'image relaie le port 80 : « Disponible sur la machine du
 * serveur » serait faux. On y dit seulement de se connecter en administrateur.
 */
export function cleNoteActionsMachine(refus: RefusActionsMachine, appliance: boolean | null): string {
  if (refus === 'non_admin') return 'machineAction.adminOnly';
  return appliance === true ? 'machineAction.signInAsAdmin' : 'machineAction.unavailableHere';
}

/** `null` : les actions sont offertes (ou on ne sait pas, et le serveur jugera). */
export function refusActionsMachine(
  etat: Pick<EtatActivationAuth, 'auth_enabled' | 'from_this_machine'> | null | undefined,
  role: unknown,
): RefusActionsMachine | null {
  if (!etat || typeof etat.auth_enabled !== 'boolean') return null;
  if (!etat.auth_enabled) return etat.from_this_machine === false ? 'hors_machine' : null;
  return typeof role === 'string' && role !== 'admin' ? 'non_admin' : null;
}

/** Lit l'état auprès du serveur ; toute erreur rend `null` (boutons actifs). */
export async function lireRefusActionsMachine(
  lireEtat: () => Promise<EtatActivationAuth | null> = getAuthActivation,
  lireMoi: () => Promise<{ role?: unknown } | null | undefined> = getAuthMe,
): Promise<RefusActionsMachine | null> {
  let etat: EtatActivationAuth | null;
  try {
    etat = await lireEtat();
  } catch {
    return null;
  }
  let role: unknown;
  if (etat?.auth_enabled) {
    try {
      const moi = await lireMoi();
      role = moi && typeof moi === 'object' ? moi.role : undefined;
    } catch {
      role = undefined;
    }
  }
  return refusActionsMachine(etat, role);
}
