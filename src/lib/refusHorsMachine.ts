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
 *
 * rc13.1/rc14 — les actions ouvertes au réseau local (mise à jour, liaison du
 * compte) refusent avec `reason: "not_local_network"` quand l'appel vient
 * d'ailleurs (accès à distance, mandataire, VPN). Leur phrase est déjà
 * traduite par le serveur (`message_key`) : on la garde, avec le chemin du
 * réglage, et le bouton « Ouvrir le réglage Authentification ».
 */
import { errText } from './utils';

export type MotifHorsMachine = 'not_local' | 'port80_relay' | 'not_local_network';

const MOTIFS: readonly string[] = ['not_local', 'port80_relay', 'not_local_network'];

/** Le motif du refus « hors de cette machine », ou `null` pour toute autre erreur. */
export function motifHorsMachine(e: unknown): MotifHorsMachine | null {
  if (!e || typeof e !== 'object') return null;
  const err = e as { status?: unknown; corps?: unknown };
  if (err.status !== 403 || !err.corps || typeof err.corps !== 'object') return null;
  const corps = err.corps as { error?: unknown; reason?: unknown };
  if (corps.error !== 'auth_required') return null;
  return typeof corps.reason === 'string' && MOTIFS.includes(corps.reason) ? (corps.reason as MotifHorsMachine) : null;
}

/**
 * La phrase à afficher pour ce refus, ou `null` si l'erreur n'en est pas un.
 *
 * rc14 (capture d'Yves, rc13.1) — une phrase COURTE et juste : ce qui est
 * refusé et pourquoi, puis quoi faire (« sur la machine du serveur, ou en vous
 * connectant en administrateur »). Plus aucune commande (`docker restart`,
 * `journalctl`…) : illisibles pour un utilisateur ordinaire, et pour Tune OS
 * le chemin simple est Cockpit, pas SSH. Le lien d'aide vit
 * sous les boutons grisés (`droitActionsMachine`), et le bouton « Ouvrir le
 * réglage Authentification » accompagne le refus.
 */
export function messageRefusHorsMachine(e: unknown, tr: (cle: string) => string): string | null {
  const motif = motifHorsMachine(e);
  if (motif === null) return null;
  // Où activer l'authentification : l'écran Réglages > Système > Authentification.
  const ou = tr('machineAction.whereToEnable');
  if (motif === 'port80_relay') return `${tr('machineAction.port80Relay')} ${ou}`;
  if (motif === 'not_local_network') {
    // La phrase du serveur nomme l'action et dit « depuis le réseau local » ;
    // `machineAction.notLocal` (« depuis cette machine ») serait faux ici.
    const corps = (e as { corps?: { message?: unknown; message_key?: unknown } }).corps;
    const phrase = typeof corps?.message === 'string' && typeof corps.message_key === 'string'
      ? corps.message.trim()
      : '';
    return phrase ? `${phrase} ${ou}` : ou;
  }
  return tr('machineAction.notLocal');
}

/**
 * web#3195 — ce que « Éteindre » / « Redémarrer » la machine (Tune OS)
 * affichent quand l'ordre échoue, ou `null` pour une coupure de transport
 * (attendue : la machine s'arrête et peut couper avant de répondre).
 *
 * D'abord la phrase du refus « hors de cette machine », puis le texte de
 * l'erreur (déjà traduit par `erreurAppliance`). Une réponse HTTP, même au
 * message générique (que `errText` tait), prouve que l'ordre a été refusé :
 * on la dit, sinon le bouton resterait grisé sans explication.
 */
export function messageEchecActionMachine(e: unknown, tr: (cle: string) => string): string | null {
  const horsMachine = messageRefusHorsMachine(e, tr);
  if (horsMachine !== null) return horsMachine;
  const texte = errText(e);
  if (texte !== null) return texte;
  const status = e && typeof e === 'object' ? (e as { status?: unknown }).status : undefined;
  return typeof status === 'number' && e instanceof Error && e.message ? e.message : null;
}
