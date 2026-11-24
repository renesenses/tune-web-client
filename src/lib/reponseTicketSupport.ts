/**
 * #3286 (fil 2951) — répondre à un ticket AVEC des pièces jointes.
 *
 * `postSupportTicketReply` (`api.ts`) n'envoie que `{ body }` en JSON. Le
 * relais local (`routes/support.rs`, `reply`) choisit pourtant son format
 * d'après le `Content-Type` entrant et sait relayer un `multipart/form-data`
 * (`body` + `attachments[]`), mêmes règles qu'à l'ouverture d'un ticket.
 *
 * `fetchJSON` ne pose pas d'en-tête `Content-Type` sur un `FormData` (#7532) :
 * le navigateur écrit lui-même le boundary. Les refus (401, 402, 413, 429…)
 * passent par le même chemin que la réponse en JSON.
 */
import { BASE, fetchJSON } from './api';

export function postSupportTicketReplyMultipart(id: number, body: string, fichiers: File[]): Promise<any> {
  const form = new FormData();
  form.append('body', body);
  for (const f of fichiers) form.append('attachments[]', f, f.name);
  return fetchJSON<any>(`${BASE}/support/tickets/${id}/reply`, { method: 'POST', body: form });
}
