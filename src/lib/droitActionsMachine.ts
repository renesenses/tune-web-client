/**
 * rc14 — les actions réservées à la machine du serveur ou à un administrateur
 * (Redémarrer / Arrêter le serveur, Éteindre / Redémarrer la machine) sont
 * GRISÉES quand l'appelant ne peut pas les exécuter, au lieu d'être refusées
 * APRÈS le clic par un long message rouge (capture d'Yves, rc13.1).
 *
 * Le serveur garde ces routes par `AdminOuCetteMachine` :
 *  - authentification active : il faut un compte administrateur ;
 *  - authentification coupée : il faut un appel de la machine du serveur ou,
 *    depuis la rc14, du réseau local (sauf réglage « Administration depuis
 *    cette machine seulement ») ; jamais Internet ni l'accès à distance.
 *
 * rc14 — le serveur dit lui-même si CET appareil passe
 * (`machine_actions_allowed`) et sinon pourquoi (`machine_actions_refusal`).
 * Un serveur plus ancien ne le dit pas : on retombe sur `from_this_machine`.
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
 * depuis le réseau local, réglage strict ou non.
 */
import { getAuthActivation, getAuthMe, type EtatActivationAuth } from './api';

/** Le fil épinglé du forum qui explique comment activer l'authentification. */
export const FIL_AIDE_ACTIONS_MACHINE =
  'https://mozaiklabs.fr/forum/threads/rc13-mise-a-jour-bloquee-ou-actions-refusees-activez-lauthentification-update-blocked-turn-on-authentication-3eAFTN';

/**
 * Pourquoi les actions de la machine sont indisponibles :
 *  - `hors_machine` : authentification coupée, appareil autre que la machine
 *    (réglage strict, serveur plus ancien) ;
 *  - `hors_reseau_local` : authentification coupée, appareil hors du réseau
 *    local (accès à distance, mandataire, VPN) — rc14 ;
 *  - `adresse_masquee` : authentification coupée, l'adresse de l'appareil
 *    n'est pas fiable (relais du port 80 de Tune OS, conteneur en pont) ;
 *  - `non_admin` : authentification active, compte non administrateur.
 */
export type RefusActionsMachine = 'hors_machine' | 'hors_reseau_local' | 'adresse_masquee' | 'non_admin';

/**
 * La clé de la ligne affichée sous les boutons grisés.
 *
 * Sur un appareil Tune OS, `from_this_machine` est faux même sur la machine
 * elle-même quand l'image relaie le port 80 : « Disponible sur la machine du
 * serveur » serait faux. On y dit seulement de se connecter en administrateur.
 */
export function cleNoteActionsMachine(refus: RefusActionsMachine, appliance: boolean | null): string {
  if (refus === 'non_admin') return 'machineAction.adminOnly';
  if (refus === 'adresse_masquee') return 'machineAction.signInAsAdmin';
  if (refus === 'hors_reseau_local') return 'machineAction.unavailableOutsideLan';
  return appliance === true ? 'machineAction.signInAsAdmin' : 'machineAction.unavailableHere';
}

/** `null` : les actions sont offertes (ou on ne sait pas, et le serveur jugera). */
export function refusActionsMachine(
  etat:
    | Pick<EtatActivationAuth, 'auth_enabled' | 'from_this_machine' | 'machine_actions_allowed' | 'machine_actions_refusal'>
    | null
    | undefined,
  role: unknown,
): RefusActionsMachine | null {
  if (!etat || typeof etat.auth_enabled !== 'boolean') return null;
  if (!etat.auth_enabled) {
    // rc14 : le serveur juge lui-même (réseau local, réglage strict).
    if (typeof etat.machine_actions_allowed === 'boolean') {
      if (etat.machine_actions_allowed) return null;
      switch (etat.machine_actions_refusal) {
        case 'not_local_network':
          return 'hors_reseau_local';
        case 'container_network':
        case 'port80_relay':
          return 'adresse_masquee';
        default:
          return 'hors_machine';
      }
    }
  }
  return refusActionsPont(etat, role);
}

/**
 * Le pont d'accès à distance — l'activer, renouveler son jeton, lire son
 * lien — reste sous la garde STRICTE du serveur (`AdminOuCetteMachineStricte`) :
 * le lien porte le jeton, qui ouvre le serveur depuis Internet.
 *  - authentification coupée : cette machine seulement (`from_this_machine`),
 *    jamais le réseau local, quoi que dise `machine_actions_allowed` ;
 *  - authentification active : un compte administrateur.
 *
 * L'éteindre reste une action de la machine ordinaire (`refusActionsMachine`).
 * `null` : offert, ou inconnu (serveur ancien) — le serveur reste juge.
 */
export function refusActionsPont(
  etat: Pick<EtatActivationAuth, 'auth_enabled' | 'from_this_machine'> | null | undefined,
  role: unknown,
): RefusActionsMachine | null {
  if (!etat || typeof etat.auth_enabled !== 'boolean') return null;
  if (!etat.auth_enabled) return etat.from_this_machine === false ? 'hors_machine' : null;
  return typeof role === 'string' && role !== 'admin' ? 'non_admin' : null;
}

/** Les deux refus, lus en un seul aller-retour. */
export interface RefusDesActions {
  machine: RefusActionsMachine | null;
  pont: RefusActionsMachine | null;
}

/** Lit l'état auprès du serveur ; toute erreur rend `null` (boutons actifs). */
export async function lireRefusActionsMachine(
  lireEtat: () => Promise<EtatActivationAuth | null> = getAuthActivation,
  lireMoi: () => Promise<{ role?: unknown } | null | undefined> = getAuthMe,
): Promise<RefusActionsMachine | null> {
  return (await lireRefusDesActions(lireEtat, lireMoi)).machine;
}

/**
 * Les refus des actions de la machine ET du pont d'accès à distance ; toute
 * erreur rend `null` pour les deux (boutons actifs, le serveur jugera).
 */
export async function lireRefusDesActions(
  lireEtat: () => Promise<EtatActivationAuth | null> = getAuthActivation,
  lireMoi: () => Promise<{ role?: unknown } | null | undefined> = getAuthMe,
): Promise<RefusDesActions> {
  let etat: EtatActivationAuth | null;
  try {
    etat = await lireEtat();
  } catch {
    return { machine: null, pont: null };
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
  return { machine: refusActionsMachine(etat, role), pont: refusActionsPont(etat, role) };
}
