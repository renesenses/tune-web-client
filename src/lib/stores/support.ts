import { writable, get } from 'svelte/store';
import * as api from '../api';
import { licenseState } from './license';

/** Nombre total de réponses support non lues (somme des unread_count des
 *  tickets mozaiklabs). Alimente la pastille sur l'entrée Support de la
 *  sidebar. Poll léger : au démarrage (dès que la licence est connue) puis
 *  toutes les 5 minutes — même approche que le store updates. */
export const supportUnread = writable(0);

let pollTimer: ReturnType<typeof setInterval> | null = null;
let lastKey: string | null = null;

export async function refreshSupportUnread(): Promise<void> {
  const key = get(licenseState).licenseKey;
  if (!key) {
    supportUnread.set(0);
    return;
  }
  try {
    const data = await api.getSupportTickets(key);
    const total = (data?.tickets ?? []).reduce(
      (n: number, t: api.SupportTicketSummary) => n + (t.unread_count ?? 0),
      0,
    );
    supportUnread.set(total);
  } catch {
    // Endpoint mozaiklabs pas encore déployé, hors-ligne, CORS… : silencieux,
    // on garde la dernière valeur connue. La pastille ne doit jamais générer
    // d'erreur visible.
  }
}

export function startSupportPolling(): void {
  if (pollTimer) return;
  // La licence se charge en asynchrone au démarrage : on rafraîchit dès que la
  // clé apparaît (ou change), au lieu de rater le premier poll.
  licenseState.subscribe((s) => {
    if (s.licenseKey !== lastKey) {
      lastKey = s.licenseKey;
      refreshSupportUnread();
    }
  });
  pollTimer = setInterval(refreshSupportUnread, 5 * 60 * 1000);
}

export function stopSupportPolling(): void {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}
