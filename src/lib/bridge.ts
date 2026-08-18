/**
 * Accès distant : la même application, servie par le relais Tune Bridge.
 *
 * Quand la page vient du relais, son adresse porte l'identifiant du serveur :
 *
 *     https://bridge.mozaiklabs.fr/75f24b9e-…/
 *
 * Tout en découle. Il n'y a rien à configurer, rien à deviner : l'application
 * sait d'où elle a été chargée, donc par où joindre le serveur.
 *
 * Servie normalement — depuis le serveur lui-même, sur le réseau local — rien
 * de ce module ne s'active et le comportement est identique à avant.
 */

/** Segment d'URL de la forme d'un UUID v4, tel que le relais les sert. */
const FORME_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const CLE_JETON = 'tune.bridge.token';

/**
 * Identifiant du serveur, lu dans le chemin de la page.
 *
 * `null` quand l'application est servie normalement : c'est ce qui distingue
 * les deux modes, sans réglage ni détection fragile.
 */
export function serverIdDepuisUrl(): string | null {
  // Hors navigateur — tests unitaires, rendu serveur — il n'y a pas d'URL a
  // lire : on repond « pas de relais » plutot que de lever.
  // Hors navigateur, ou sous un `window.location` factice (tests), il n'y a
  // pas de chemin a lire : on repond « pas de relais » plutot que de lever.
  const chemin =
    typeof window === 'undefined' ? undefined : window.location?.pathname;
  if (typeof chemin !== 'string') return null;
  const premier = chemin.split('/').filter(Boolean)[0];
  return premier && FORME_UUID.test(premier) ? premier : null;
}

/**
 * Récupère le jeton et le RETIRE de la barre d'adresse.
 *
 * Le fragment (`#token=…`) n'est jamais transmis au serveur : il ne peut donc
 * pas se retrouver dans un journal d'accès. Mais il resterait dans
 * l'historique du navigateur et dans une capture d'écran partagée — d'où le
 * `replaceState`, qui l'efface dès qu'il est lu.
 *
 * Le jeton est ensuite conservé localement : on ne demande pas à l'utilisateur
 * de rescanner un QR code à chaque ouverture.
 */
export function recupererJeton(): string | null {
  const hash = typeof window === 'undefined' ? undefined : window.location?.hash;
  if (typeof hash !== 'string') return null;
  const fragment = hash.replace(/^#/, '');
  const params = new URLSearchParams(fragment);
  const depuisUrl = params.get('token');

  if (depuisUrl) {
    try {
      localStorage.setItem(CLE_JETON, depuisUrl);
    } catch {
      // Navigation privée : on garde le jeton en mémoire pour cette session
      // seulement. Mieux vaut une session qui marche qu'un refus net.
    }
    params.delete('token');
    const reste = params.toString();
    window.history.replaceState(
      null,
      '',
      window.location.pathname + window.location.search + (reste ? `#${reste}` : ''),
    );
    return depuisUrl;
  }

  try {
    return localStorage.getItem(CLE_JETON);
  } catch {
    return null;
  }
}

/** Oublie le jeton — pour un appareil prêté, ou après un changement. */
export function oublierJeton(): void {
  try {
    localStorage.removeItem(CLE_JETON);
  } catch {
    /* rien à faire */
  }
}

/** Enregistre un jeton saisi à la main, quand le lien n'en portait pas. */
export function enregistrerJeton(jeton: string): void {
  const j = jeton.trim();
  if (!j) return;
  try {
    localStorage.setItem(CLE_JETON, j);
  } catch {
    /* rien à faire */
  }
}

/**
 * État résolu une seule fois, à la PREMIÈRE utilisation.
 *
 * Pas à l'import : ce module est chargé par des tests qui tournent hors
 * navigateur, et lire `window` à l'évaluation les ferait tous échouer sur un
 * détail sans rapport avec ce qu'ils vérifient.
 */
let etat: { serverId: string | null; jeton: string | null } | null = null;

function resoudre(): { serverId: string | null; jeton: string | null } {
  if (!etat) {
    const sid = serverIdDepuisUrl();
    etat = { serverId: sid, jeton: sid ? recupererJeton() : null };
  }
  return etat;
}

/** Réinitialise l'état résolu — pour les tests. */
export function reinitialiserPourTest(): void {
  etat = null;
}

/**
 * L'application parle-t-elle au serveur À TRAVERS le relais ?
 *
 * Les DEUX éléments sont exigés : un identifiant sans jeton ne produirait que
 * des 401 en boucle. Mieux vaut demander le jeton qu'échouer en silence.
 */
export function viaRelais(): boolean {
  const e = resoudre();
  return Boolean(e.serverId && e.jeton);
}

/** Identifiant du serveur quand la page vient du relais, sinon `null`. */
export function serverId(): string | null {
  return resoudre().serverId;
}

/** Vrai quand la page vient du relais mais qu'aucun jeton n'est connu. */
export function jetonManquant(): boolean {
  const e = resoudre();
  return Boolean(e.serverId && !e.jeton);
}

/**
 * Base des appels d'API.
 *
 * Le relais expose `/api/relay/{server_id}/{chemin}` et transmet au serveur
 * `/api/v1/{chemin}` : cette base remplace donc EXACTEMENT `/api/v1`, et aucun
 * des 437 appels du client n'a à changer.
 */
export function baseApi(): string {
  const e = resoudre();
  if (!viaRelais()) return '/api/v1';
  return `${window.location.origin}/api/relay/${e.serverId}`;
}

/** En-têtes propres au relais, vides en local. */
export function entetesRelais(): Record<string, string> {
  const e = resoudre();
  return viaRelais() ? { 'X-Bridge-Token': e.jeton as string } : {};
}

/** Adresse du WebSocket, selon le mode. */
export function urlWebSocket(): string {
  const e = resoudre();
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  if (viaRelais()) {
    // Le jeton passe en paramètre : l'API WebSocket du navigateur ne permet
    // pas de poser d'en-tête sur la poignée de main.
    return `${proto}//${window.location.host}/ws/client/${e.serverId}?token=${encodeURIComponent(e.jeton as string)}`;
  }
  return `${proto}//${window.location.host}/ws`;
}

/**
 * URL de flux à utiliser pour la lecture navigateur.
 *
 * Le serveur annonce deux adresses : `stream_url` en IP locale, et
 * `stream_url_remote` par le relais. Depuis un téléphone en 4G, la première ne
 * mène nulle part — c'est tout l'objet de ce chantier.
 *
 * Le jeton est ajouté en paramètre parce qu'une balise `<audio>` ne peut pas
 * porter d'en-tête sur sa source.
 */
export function urlFlux(
  streamUrl: string | null | undefined,
  streamUrlRemote?: string | null,
): string | null {
  const e = resoudre();
  if (viaRelais() && streamUrlRemote) {
    const sep = streamUrlRemote.includes('?') ? '&' : '?';
    return `${streamUrlRemote}${sep}token=${encodeURIComponent(e.jeton as string)}`;
  }
  return streamUrl ?? null;
}
