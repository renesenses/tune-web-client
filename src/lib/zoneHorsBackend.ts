/**
 * tune-server-rust#5353 — la zone dont la sortie s'ouvre HORS du backend choisi.
 *
 * Décision de Bertrand (29/09/2026) : quand ASIO est choisi, les zones liées à
 * une sortie WASAPI (« This Computer », « Speakers ») restent jouables, mais
 * elles sont SIGNALÉES. Jean-François (fil 2018) jouait sur « Speakers » en
 * croyant jouer sur son pilote ASIO, et rien à l'écran ne le lui disait.
 *
 * Le serveur pose `backend_sortie` et `hors_backend_choisi` sur une zone locale
 * dont la sortie est connue. Sans ces champs (serveur plus ancien, zone non
 * locale, sortie absente), rien n'est signalé : une absence n'est pas un « oui ».
 */
import type { Zone } from './types';

export interface SignalementHorsBackend {
  /** Le backend réel de la sortie, en capitales : « WASAPI ». */
  badge: string;
  /** ASIO est choisi et cette sortie n'est pas ASIO : conseiller la zone ASIO. */
  noteAsio: boolean;
}

export function signalementHorsBackend(
  z: Pick<Zone, 'backend_sortie' | 'hors_backend_choisi'>,
): SignalementHorsBackend | null {
  if (z.hors_backend_choisi !== true) return null;
  const backend = (z.backend_sortie ?? '').trim();
  if (!backend) return null;
  return { badge: backend.toUpperCase(), noteAsio: backend.toLowerCase() !== 'asio' };
}
