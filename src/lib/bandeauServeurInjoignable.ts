/**
 * #3185 — le bandeau « Le serveur ne répond pas » (`common.serverUnreachable`),
 * partagé par les trois chemins de requête (`api.ts` `fetchJSON` et
 * `fetchEcriture`, `api/_client.ts` `fetchJSON`).
 *
 * Deux règles :
 *
 * - une requête ABANDONNÉE par son appelant (signal annulé : délai d'abandon,
 *   navigation, #1788) n'est pas une panne du réseau : pas de bandeau ;
 * - le bandeau est une ERREUR PERSISTANTE (durée 0) : sans rien d'autre, il
 *   restait affiché alors que les requêtes suivantes aboutissaient (fils 2889,
 *   2949). Dès qu'une réponse arrive du serveur — quel que soit son statut
 *   HTTP : il a répondu —, le bandeau se retire de lui-même.
 */
import { notifications } from './stores/notifications';
import { notifierTraduit } from './notificationTraduite';

let derniereAnnonce = 0;
let idBandeau: number | null = null;

/**
 * Une requête a été rejetée avant toute réponse. `fenetreMs` : pas plus d'une
 * annonce par fenêtre (anti-rafale, propre à chaque appelant).
 */
export function annoncerServeurInjoignable(signal: AbortSignal | null | undefined, fenetreMs: number): void {
  if (signal?.aborted) return;
  const maintenant = Date.now();
  if (maintenant - derniereAnnonce < fenetreMs) return;
  derniereAnnonce = maintenant;
  // Souvent au démarrage, avant la langue choisie : retraduite (voir `notificationTraduite`).
  idBandeau = notifierTraduit((m) => notifications.error(m), (tr) => tr('common.serverUnreachable'));
}

/** Une réponse est arrivée du serveur : le bandeau, s'il est affiché, se retire. */
export function serveurARepondu(): void {
  if (idBandeau === null) return;
  const id = idBandeau;
  idBandeau = null;
  // Une nouvelle panne après ce retour doit pouvoir s'annoncer tout de suite.
  derniereAnnonce = 0;
  notifications.dismiss(id);
}
