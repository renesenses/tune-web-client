/**
 * web#1857 — « Vider » en DEUX TEMPS (Didier, fil forum 2067).
 *
 * 🔵 LA RÈGLE : ce que fait le bouton se lit sur l'ÉTAT de la file, pas sur
 * un chronomètre.
 *
 *  - Quelque chose SUIT le morceau en cours → geste `suite` : on retire la
 *    suite, la lecture continue (règle de Bertrand du 20/09/2026, web#1324,
 *    `keep_current`). C'est le premier appui, inchangé.
 *  - Plus RIEN ne suit (cas d'après un premier appui, ou d'une file réduite au
 *    morceau en cours) → geste `tout` : on arrête la lecture et on retire le
 *    morceau en cours. C'est le second appui.
 *
 * Pourquoi l'état et pas un délai (« second clic dans les 3 s ») : un délai
 * est invisible et punit celui qui revient une minute plus tard. Ici le second
 * appui marche quand on veut, et le bouton CHANGE DE LIBELLÉ avant qu'on
 * clique (« Vider la file » → « Arrêter et vider ») : on sait toujours ce que
 * le prochain appui va faire.
 *
 * « Plus rien ne suit » se juge sur le curseur, pas sur `longueur === 1` :
 * `keep_current` garde aussi les pistes DÉJÀ JOUÉES avant le curseur
 * (tune-server-rust#4170). Le second temps les retire avec le reste.
 */
import * as api from './api';
import { stopAndSync } from './stores/zones';
import { browserStopForZone } from './stores/browserAudio';

export type GesteVider = 'suite' | 'tout';

/** Le geste que ferait un appui sur « Vider » maintenant ; `null` si la file est vide. */
export function gesteVider(longueur: number, position: number): GesteVider | null {
  if (!(longueur > 0)) return null;
  const p = Number.isFinite(position) && position > 0 ? position : 0;
  return p + 1 < longueur ? 'suite' : 'tout';
}

/**
 * Exécute le geste.
 *
 * `tout` arrête d'abord par `stopAndSync` — le chemin du bouton Stop, qui
 * reporte aussitôt l'état « arrêté » dans l'écran — puis vide SANS
 * `keep_current`, ce qui côté serveur arrête aussi la sortie
 * (`orchestrator.stop`, #3669). Enfin, si CE navigateur jouait la zone,
 * son audio local est coupé tout de suite (`browserStopForZone`, sans effet
 * sur une autre zone) au lieu d'attendre l'évènement `playback.stopped` —
 * #4090 : une zone navigateur qui continuait après un vidage. Un échec de
 * l'arrêt (rien ne jouait, par exemple) n'empêche pas le vidage.
 */
export async function executerVider(zoneId: number, geste: GesteVider): Promise<void> {
  if (geste === 'suite') {
    await api.clearQueue(zoneId);
    return;
  }
  try { await stopAndSync(zoneId); } catch { /* le vidage complet arrête aussi côté serveur */ }
  await api.clearQueue(zoneId, false);
  browserStopForZone(zoneId);
}
