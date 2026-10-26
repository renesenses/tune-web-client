/**
 * Le serveur démarre : une INFORMATION, pas une erreur — #2413
 * (tune-server-rust#7073).
 *
 * ## Le défaut
 *
 * Pendant le démarrage (Docker, testeur Alex, rc8), le répondeur du serveur
 * rend `503` avec `{"status":"starting","phase":"configuration","message":
 * "Tune démarre : configuration"}`. Le client le traitait comme toute panne
 * `>= 500` : un toast ROUGE « Server error: Tune démarre : configuration » —
 * en français dans une interface anglaise, et présenté comme un incident alors
 * que c'est la phase normale du démarrage.
 *
 * ## La règle
 *
 * - Le serveur donne `code: "server_starting"` et `phase_code` (ASCII, stable).
 *   Un serveur plus ancien n'a que `status: "starting"` et `phase` en français :
 *   on en retrouve le code par `CODES_DES_ANCIENNES_PHASES`.
 * - Le client affiche UN toast d'information, traduit, qui suit l'étape, et le
 *   RETIRE dès que le serveur répond normalement.
 */
import { get } from 'svelte/store';
import { t } from './i18n';
import { notifications } from './stores/notifications';

export const CODE_SERVEUR_DEMARRE = 'server_starting';

/** Les phrases d'étape des serveurs d'avant le code structuré. */
const CODES_DES_ANCIENNES_PHASES: Record<string, string> = {
  'démarrage': 'starting',
  'attente du disque de données': 'waiting_data_disk',
  'base de données': 'database',
  configuration: 'configuration',
  'partages réseau': 'network_shares',
  'sorties audio': 'audio_outputs',
  greffons: 'plugins',
  'découverte réseau': 'network_discovery',
  'Spotify Connect': 'spotify_connect',
  routes: 'routes',
};

export const CODES_DE_PHASE = [
  'starting', 'waiting_data_disk', 'database', 'configuration', 'network_shares',
  'audio_outputs', 'plugins', 'network_discovery', 'spotify_connect', 'routes', 'finishing',
] as const;

/**
 * Le code d'étape d'un corps de 503 de démarrage, `''` si le démarrage est
 * annoncé sans étape lisible, `null` si ce n'est PAS un démarrage.
 */
export function phaseDeDemarrage(corps: unknown): string | null {
  const c = corps as { code?: unknown; status?: unknown; phase_code?: unknown; phase?: unknown } | null;
  if (!c || typeof c !== 'object') return null;
  if (c.code !== CODE_SERVEUR_DEMARRE && c.status !== 'starting') return null;
  if (typeof c.phase_code === 'string' && (CODES_DE_PHASE as readonly string[]).includes(c.phase_code)) {
    return c.phase_code;
  }
  if (typeof c.phase === 'string') return CODES_DES_ANCIENNES_PHASES[c.phase] ?? '';
  return '';
}

/** « Tune is starting: configuration… » dans la langue de l'interface. */
export function messageDemarrage(phase: string): string {
  const tr = get(t) as (k: string) => string;
  const etape = phase ? tr(`v2.boot.phase.${phase}`) : '';
  return etape
    ? tr('v2.boot.starting').replace('{phase}', etape)
    : tr('v2.boot.startingPlain');
}

let toast: { id: number; message: string } | null = null;

/** Pose (ou met à jour) l'unique toast de démarrage. Jamais un toast d'erreur. */
export function signalerDemarrage(phase: string): string {
  const message = messageDemarrage(phase);
  const encore = toast !== null && get(notifications).some((n) => n.id === toast!.id);
  // Déjà affiché, identique : rien à faire. Fermé par l'utilisateur : on le repose.
  if (encore && toast!.message === message) return message;
  if (toast) notifications.dismiss(toast.id);
  // Durée 0 : il reste jusqu'à ce que le serveur réponde.
  toast = { id: notifications.info(message, 0), message };
  return message;
}

/** Une réponse normale est arrivée : le serveur est prêt, le toast s'en va. */
export function leServeurRepond(): void {
  if (!toast) return;
  notifications.dismiss(toast.id);
  toast = null;
}
