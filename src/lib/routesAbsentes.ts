/**
 * Fil 3104 (Edge, 40 537 pistes) — les SONDES de greffon ne repartent plus
 * après un 404.
 *
 * La console du testeur montrait des 404 en boucle sur la route des
 * réglages de l'assistant IA, et d'autres sur la zone de Crossfeed Pro
 * (`/audio-plugins/crossfeed-pro/zones/0`). Un 404 de ces
 * routes veut dire « greffon absent » (routes non montées) : la réponse ne
 * changera pas tant que le serveur ne change pas. Les sondes, elles, sont
 * relancées par des effets qui suivent la zone courante — objet neuf à
 * chaque évènement de zone, donc plusieurs fois par seconde en lecture.
 *
 * Ce registre retient les greffons constatés absents. Une sonde qui y trouve
 * le sien répond « absent » sans requête. Il s'oublie quand le serveur a pu
 * changer : reconnexion du flux après une coupure (redémarrage, mise à
 * jour), installation ou activation d'un greffon. Les écrans ouverts par
 * l'utilisateur (Réglages ▸ Assistant IA…) continuent d'interroger le
 * serveur et tiennent le registre à jour.
 */

/** Les greffons constatés absents (clé libre : `assistant-ia`, `audio-plugins/<id>`). */
const absents = new Set<string>();

export function greffonConnuAbsent(cle: string): boolean {
  return absents.has(cle);
}

export function noterGreffonAbsent(cle: string): void {
  absents.add(cle);
}

/** Une réponse prouve le greffon monté : on le redemandera. */
export function noterGreffonPresent(cle: string): void {
  absents.delete(cle);
}

/** Le serveur a pu changer : tout greffon absent sera redemandé. */
export function oublierGreffonsAbsents(): void {
  absents.clear();
}

type BusConnexion = { onEvent(h: (e: { type: string }) => void): () => void };

/**
 * Reconnexion après une coupure : le serveur a pu redémarrer avec d'autres
 * greffons. La première connexion n'efface rien. Rend le désabonnement.
 */
export function oublierGreffonsAbsentsALaReconnexion(bus: BusConnexion): () => void {
  let coupe = false;
  return bus.onEvent((e) => {
    if (e.type === '_disconnected' || e.type === '_polling_started') coupe = true;
    else if (e.type === '_connected' && coupe) {
      coupe = false;
      oublierGreffonsAbsents();
    }
  });
}
