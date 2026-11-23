/**
 * rc14 — « Délier le compte mozaiklabs.fr » (menu de l'avatar, Réglages).
 *
 * Constat de Bertrand (rc13.2 sur le .18, depuis son Mac, authentification
 * coupée) : l'entrée s'appelait « Se déconnecter », on pouvait cliquer, et le
 * refus du serveur s'affichait DEUX fois, en un long texte technique qui ne
 * disait même pas que c'était la déliaison du compte qui était refusée.
 *
 * Ce que fait l'entrée : `POST /cloud/sso/disconnect`, qui DÉLIE le serveur du
 * compte (copie de bibliothèque en ligne et partages de cercle effacés,
 * premium du compte retiré) — ce n'est pas une simple fin de session du
 * navigateur. La route passe la règle `liaison_autorisee`
 * (tune-server-rust, `routes/cloud.rs`) :
 *  - authentification coupée : seulement depuis la machine du serveur ;
 *  - authentification active : l'administrateur délie le serveur, un compte
 *    standard délie son propre profil (permis, donc jamais grisé).
 *
 * Le seul cas refusé d'avance est donc « authentification coupée, appel d'un
 * autre appareil », que `GET /auth/activation` dit déjà (`from_this_machine`,
 * même règle que la garde du serveur). Même lecture que les actions de la
 * machine (web#3368, `droitActionsMachine`) ; tout ce qui ne se lit pas laisse
 * l'entrée active, et le serveur reste juge.
 *
 * Sur une appliance Tune OS qui relaie le port 80 (`port80_relay`), le serveur
 * ne distingue pas la machine du réseau : `from_this_machine` est faux même
 * sur la machine elle-même. Là, la note et la phrase ne proposent QUE
 * l'administrateur (même distinction que `cleNoteActionsMachine`, web#3368).
 */
import { get } from 'svelte/store';
import { getAuthActivation, getConfig, type EtatActivationAuth } from './api';
import { actionCadreAuthentification } from './cadreAuthentification';
import { t } from './i18n';
import { notifierErreur } from './notifierErreur';
import { motifHorsMachine } from './refusHorsMachine';
import { notifications } from './stores/notifications';

/**
 * Pourquoi la déliaison sera refusée d'ici :
 *  - `hors_machine` : authentification coupée, appareil autre que la machine ;
 *  - `admin_seulement` : même chose sur une appliance qui relaie le port 80,
 *    où seul l'administrateur peut le faire.
 */
export type RefusDeliaison = 'hors_machine' | 'admin_seulement';

/** `null` : l'entrée est offerte (ou on ne sait pas, et le serveur jugera). */
export function refusDeliaisonIci(
  etat: Pick<EtatActivationAuth, 'auth_enabled' | 'from_this_machine'> | null | undefined,
  appliance: boolean | null = null,
): RefusDeliaison | null {
  if (!etat || etat.auth_enabled !== false || etat.from_this_machine !== false) return null;
  return appliance === true ? 'admin_seulement' : 'hors_machine';
}

/** La note sous l'entrée grisée. */
export function cleNoteDeliaison(refus: RefusDeliaison): string {
  return refus === 'admin_seulement' ? 'settings.unlinkAccountNoteAdmin' : 'settings.unlinkAccountNote';
}

/** Lit l'état auprès du serveur ; toute erreur rend `null` (entrée active). */
export async function lireRefusDeliaison(
  lireEtat: () => Promise<EtatActivationAuth | null> = getAuthActivation,
  lireConfig: () => Promise<{ appliance?: unknown } | null | undefined> = getConfig,
): Promise<RefusDeliaison | null> {
  let etat: EtatActivationAuth | null;
  try {
    etat = await lireEtat();
  } catch {
    return null;
  }
  if (refusDeliaisonIci(etat) === null) return null;
  let appliance: boolean | null = null;
  try {
    const c = await lireConfig();
    appliance = c && typeof c === 'object' ? c.appliance === true : null;
  } catch {
    appliance = null;
  }
  return refusDeliaisonIci(etat, appliance);
}

/**
 * L'échec de la déliaison, dit UNE fois.
 *
 * `fetchJSON` ne pose pas son bandeau générique « hors de cette machine » pour
 * cette route (voir `api.ts`) : la phrase est celle-ci, courte, qui nomme
 * l'action refusée, avec le bouton « Ouvrir le réglage Authentification »
 * qu'avait ce bandeau. Tout autre échec passe par `notifierErreur`, qui se
 * tait si `fetchJSON` l'a déjà annoncé.
 */
export function annoncerEchecDeliaison(e: unknown): void {
  const tr = get(t) as (cle: string) => string;
  const motif = motifHorsMachine(e);
  if (motif !== null) {
    const cle = motif === 'port80_relay' ? 'settings.unlinkAccountRefusedAdmin' : 'settings.unlinkAccountRefused';
    notifications.error(tr(cle), 0, undefined, actionCadreAuthentification(tr));
    return;
  }
  notifierErreur(tr('common.error'), e, { motifSeul: true });
}
