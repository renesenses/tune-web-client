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
 */
import { get } from 'svelte/store';
import type { EtatActivationAuth } from './api';
import { t } from './i18n';
import { notifierErreur } from './notifierErreur';
import { motifHorsMachine } from './refusHorsMachine';
import { notifications } from './stores/notifications';

/** Vrai quand la déliaison sera refusée depuis cet appareil (entrée grisée). */
export function deliaisonRefuseeIci(
  etat: Pick<EtatActivationAuth, 'auth_enabled' | 'from_this_machine'> | null | undefined,
): boolean {
  return !!etat && etat.auth_enabled === false && etat.from_this_machine === false;
}

/**
 * L'échec de la déliaison, dit UNE fois.
 *
 * `fetchJSON` ne pose pas son bandeau générique « hors de cette machine » pour
 * cette route (voir `api.ts`) : la phrase est celle-ci, courte, qui nomme
 * l'action refusée. Tout autre échec passe par `notifierErreur`, qui se tait
 * si `fetchJSON` l'a déjà annoncé.
 */
export function annoncerEchecDeliaison(e: unknown): void {
  const tr = get(t) as (cle: string) => string;
  if (motifHorsMachine(e) !== null) {
    notifications.error(tr('settings.unlinkAccountRefused'));
    return;
  }
  notifierErreur(tr('common.error'), e, { motifSeul: true });
}
