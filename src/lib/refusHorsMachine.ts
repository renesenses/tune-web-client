/**
 * Refus d'une action qui engage la machine (redémarrer, arrêter, installer un
 * greffon…) quand l'authentification est désactivée et que l'appel ne vient
 * pas de la machine qui fait tourner Tune (tune-server-rust#9029 : « Redémarrer »
 * sans effet depuis un NAS).
 *
 * Le serveur répond `403 { error: "auth_required", reason: "not_local" }`
 * (ou `reason: "port80_relay"` sur une appliance qui relaie le port 80). Son
 * texte est en anglais et ne dit pas quoi faire depuis l'interface : on le
 * remplace par une phrase traduite qui donne les deux issues.
 */
import type { InfoConteneur } from './conteneurServeur';

export type MotifHorsMachine = 'not_local' | 'port80_relay';

/** Le motif du refus « hors de cette machine », ou `null` pour toute autre erreur. */
export function motifHorsMachine(e: unknown): MotifHorsMachine | null {
  if (!e || typeof e !== 'object') return null;
  const err = e as { status?: unknown; corps?: unknown };
  if (err.status !== 403 || !err.corps || typeof err.corps !== 'object') return null;
  const corps = err.corps as { error?: unknown; reason?: unknown };
  if (corps.error !== 'auth_required') return null;
  return corps.reason === 'not_local' || corps.reason === 'port80_relay' ? corps.reason : null;
}

/** La commande citée quand le moteur du conteneur n'est pas connu. */
export const COMMANDE_PAR_DEFAUT = 'docker restart <container>';

/**
 * La phrase à afficher pour ce refus, ou `null` si l'erreur n'en est pas un.
 * `geste: 'restart'` cite la commande du conteneur (connue par
 * `GET /system/env`, sinon celle de Docker).
 */
export function messageRefusHorsMachine(
  e: unknown,
  tr: (cle: string) => string,
  geste: 'restart' | 'autre' = 'autre',
  conteneur?: InfoConteneur | null,
): string | null {
  const motif = motifHorsMachine(e);
  if (motif === null) return null;
  if (motif === 'port80_relay') return tr('machineAction.port80Relay');
  if (geste === 'restart') {
    return tr('machineAction.notLocalRestart').replace('{command}', conteneur?.commande ?? COMMANDE_PAR_DEFAUT);
  }
  return tr('machineAction.notLocal');
}
