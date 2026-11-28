/**
 * Liaison au serveur, vue par Nocturne (itération 6).
 *
 * `stores/connection.connectionState` n'est posé par personne : la pastille de
 * l'en-tête restait « hors ligne ». La source réelle est le client WebSocket,
 * qui émet `_connected`, `_disconnected` et `_polling_started` (repli HTTP,
 * toujours relié). Ce module les suit, pour la pastille et pour le bandeau de
 * reconnexion posé en haut au centre.
 */
import { writable, type Readable } from 'svelte/store';
import { tuneWS } from '../../lib/websocket';

export type Liaison = 'inconnue' | 'reliee' | 'coupee';

/** L'état après un événement du client WebSocket (les autres ne changent rien). */
export function liaisonApres(etat: Liaison, type: string | undefined): Liaison {
  if (type === '_connected' || type === '_polling_started') return 'reliee';
  if (type === '_disconnected') return 'coupee';
  return etat;
}

const etat = writable<Liaison>('inconnue');
export const liaison: Readable<Liaison> = { subscribe: etat.subscribe };

let abonnes = 0;
let arreter: (() => void) | null = null;

/** Suit la liaison tant qu'un composant en a besoin ; rend la fonction d'arrêt. */
export function suivreLiaison(): () => void {
  if (abonnes++ === 0) {
    try { if (tuneWS.connected) etat.set('reliee'); } catch { /* client absent (tests) */ }
    const fin = tuneWS.onEvent((e: { type?: string }) => etat.update((x) => liaisonApres(x, e?.type)));
    arreter = typeof fin === 'function' ? fin : null;
  }
  return () => {
    if (--abonnes === 0) { arreter?.(); arreter = null; }
  };
}

/** « Réessayer » : le même geste que le changement de langue du client. */
export function reessayerLiaison(): void {
  try { tuneWS.disconnect(); tuneWS.connect(); } catch { /* rien à relancer */ }
}
