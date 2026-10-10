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

/**
 * Adresse d'un fichier de `public/` (logo, icônes), valable dans les DEUX modes.
 *
 * 🔴 Un chemin absolu (`/tune-logo.png`) vise la RACINE du domaine. Servie par
 * le relais, la page vit sous `/{server_id}/` : la racine de
 * `bridge.mozaiklabs.fr` n'a pas de logo, l'image restait cassée (09/10/2026,
 * essai en 5G). Un chemin relatif simple ne suffit pas non plus : la coquille
 * navigue par `pushState`, et `tune-logo.png` se résoudrait contre l'écran
 * courant. On ancre donc sur `/{server_id}/` par le relais, sur la base Vite
 * sinon.
 */
export function urlRessourcePublique(nom: string): string {
  const propre = nom.replace(/^\/+/, '');
  const sid = serverIdDepuisUrl();
  if (sid) return `/${sid}/${propre}`;
  const base = (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/';
  return `${base.endsWith('/') ? base : `${base}/`}${propre}`;
}

/**
 * Adresse par le relais d'un appel d'API écrit en dur (`/api/v1/…`), ou `null`
 * quand l'appel ne concerne pas le relais (autre domaine, autre chemin).
 *
 * Une adresse qui vise DÉJÀ le relais est rendue telle quelle, en absolu : il
 * lui manque peut-être seulement l'en-tête, que l'intercepteur ajoute.
 */
export function versLeRelais(url: string): string | null {
  if (!viaRelais()) return null;
  const origine = window.location.origin;
  let chemin = url;
  if (/^[a-z][a-z0-9+.-]*:/i.test(url)) {
    let u: URL;
    try {
      u = new URL(url);
    } catch {
      return null;
    }
    if (u.origin !== origine) return null;
    chemin = u.pathname + u.search + u.hash;
  }
  if (chemin === '/api/v1' || chemin.startsWith('/api/v1/') || chemin.startsWith('/api/v1?')) {
    return `${baseApi()}${chemin.slice('/api/v1'.length)}`;
  }
  const prefixeRelais = `/api/relay/${resoudre().serverId}`;
  if (chemin === prefixeRelais || chemin.startsWith(`${prefixeRelais}/`) || chemin.startsWith(`${prefixeRelais}?`)) {
    return `${origine}${chemin}`;
  }
  return null;
}

/**
 * Filet pour TOUT `fetch` vers l'API, par le relais.
 *
 * `baseApi()` et `entetesRelais()` couvrent les appels qui passent par
 * `api.ts`. Mais des dizaines d'autres s'écrivent en dur — `'/api/v1'` dans
 * `LoginView`, `api/_client.ts`, `preferences.ts`, `displayFields.ts` — ou
 * posent leurs propres en-têtes sans le jeton du pont (`installUpdate`,
 * téléchargements…). Par le relais, les premiers frappent la racine de
 * `bridge.mozaiklabs.fr` (405 sur un POST : « Erreur 405 » à la connexion),
 * les seconds se font refuser en 401 par le pont, ce que l'application lit
 * comme « Session expirée ».
 *
 * Plutôt que de compter sur chaque appelant, l'intercepteur réécrit
 * `/api/v1/…` vers `/api/relay/{id}/…` et ajoute `X-Bridge-Token` à tout ce
 * qui vise le relais. Servie normalement, la page n'est PAS touchée : rien ne
 * s'installe hors relais.
 *
 * Ne couvre pas ce qui ne passe pas par `fetch` : `<img src>`, `<a href>`,
 * `<audio src>`, `window.location` — un navigateur n'y pose aucun en-tête.
 */
export function installerIntercepteurRelais(): boolean {
  if (typeof window === 'undefined' || typeof window.fetch !== 'function') return false;
  if (!viaRelais()) return false;
  const w = window as typeof window & { __tuneIntercepteurRelais?: boolean };
  if (w.__tuneIntercepteurRelais) return true;
  const fetchOrigine = window.fetch.bind(window);
  const jeton = entetesRelais()['X-Bridge-Token'];
  const relaye = (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    if (typeof Request !== 'undefined' && input instanceof Request) {
      const cible = versLeRelais(input.url);
      if (cible === null) return fetchOrigine(input, init);
      const req = new Request(cible, input);
      if (!req.headers.has('X-Bridge-Token')) req.headers.set('X-Bridge-Token', jeton);
      return fetchOrigine(req, init);
    }
    const url = input instanceof URL ? input.href : String(input);
    const cible = versLeRelais(url);
    if (cible === null) return fetchOrigine(input, init);
    const headers = new Headers(init?.headers ?? undefined);
    if (!headers.has('X-Bridge-Token')) headers.set('X-Bridge-Token', jeton);
    return fetchOrigine(cible, { ...init, headers });
  };
  window.fetch = relaye as typeof window.fetch;
  w.__tuneIntercepteurRelais = true;
  return true;
}
