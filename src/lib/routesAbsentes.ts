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
 * Ce registre retient les greffons constatés absents. Seules les SONDES DE
 * FOND le lisent : `sonderAssistantIa`, et `sonderReglageGreffonNatif`
 * (présence de Crossfeed Pro et de Crosstalk, « traite-t-il la zone ? »).
 * Une sonde qui y trouve son greffon répond « absent » sans requête.
 *
 * Les écrans ouverts par l'utilisateur ne le lisent JAMAIS : ils
 * interrogent toujours le serveur. Réglages ▸ Assistant IA (`appelIa`) et
 * l'écran Greffons (`getReglageGreffonNatifEtNoter`, `GET /audio-plugins`)
 * tiennent en plus le registre à jour : présent sur une réponse, absent sur
 * un 404 ; la liste note présents tous les greffons qu'elle contient. Les
 * écrans Crossfeed Pro, Crosstalk et TESS lisent le serveur sans toucher au
 * registre.
 *
 * Il s'oublie entièrement quand le serveur a pu changer : reconnexion du
 * flux après une coupure, et toute installation, activation, mise à jour,
 * relance, désactivation ou désinstallation de greffon passée par `api`
 * (dont `install-from-catalog`, qui active à chaud sans reconnexion).
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
