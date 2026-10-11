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
 * Adresse PAR LE PONT du flux d'une zone navigateur, ou `null` hors relais.
 *
 * 🔴 Essai en 5G du 09/10/2026 : la zone « Cet ordinateur » jouait sur le
 * serveur et restait muette dans Safari. Seul le chemin des événements
 * WebSocket passait par `urlFlux()` ; les boutons Lecture, Suivant,
 * Précédent, la reprise, l'enchaînement de fin de piste et le saut sur
 * erreur posaient `zone.stream_url` — l'IP du réseau local
 * (`http://192.168.1.18:8888/stream/<id>.flac`). `sourceDuLecteur` la
 * ramenait en relatif, donc sur `bridge.mozaiklabs.fr/stream/<id>.flac`,
 * une route que le pont ne sert pas.
 *
 * La règle vit donc à l'endroit où TOUTES ces adresses passent, `browserPlay` :
 * une adresse de Tune (`/stream/<un-seul-segment>`) devient la route de flux
 * du pont, `/stream/relay/{server_id}/<id>?token=…` — la forme exacte que le
 * serveur annonce dans `stream_url_remote`
 * (`tune-stream-http`, `stream_url_distant`). Le jeton part en paramètre :
 * une balise `<audio>` ne pose aucun en-tête, et le pont l'accepte ainsi
 * (`tune-bridge/src/stream_proxy.rs`).
 *
 * Une adresse qui vise DÉJÀ le pont (`stream_url_remote`) reçoit le jeton
 * s'il lui manque. Une adresse tierce n'est pas touchée.
 */
export function fluxParLeRelais(url: string): string | null {
  if (!viaRelais()) return null;
  const e = resoudre();
  const origine = window.location.origin;
  let u: URL;
  try {
    u = new URL(url, origine);
  } catch {
    return null;
  }
  const avecJeton = (chemin: string, params: URLSearchParams) => {
    if (!params.has('token')) params.set('token', e.jeton as string);
    return `${origine}${chemin}?${params.toString()}`;
  };
  const prefixeRelais = `/stream/relay/${e.serverId}/`;
  if (u.origin === origine && u.pathname.startsWith(prefixeRelais)) {
    return avecJeton(u.pathname, u.searchParams);
  }
  const tune = /^\/stream\/([^/]+)$/.exec(u.pathname);
  if (tune) {
    return avecJeton(`${prefixeRelais}${tune[1]}`, u.searchParams);
  }
  return null;
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
 * Adresse d'API pour ce que le NAVIGATEUR va chercher seul : `<img src>`,
 * `<a href>` de téléchargement, `window.location.href`.
 *
 * Ces chemins-là ne passent pas par `fetch` : ni l'intercepteur ni
 * `entetesRelais()` ne peuvent y poser `X-Bridge-Token`. Le pont accepte donc
 * le jeton en `?token=` pour les LECTURES relayées (GET/HEAD — jamais pour
 * une écriture), le retire avant de relayer et le masque dans ses traces.
 *
 * Hors relais, ou pour une adresse qui ne vise pas l'API (autre domaine,
 * `blob:`, `data:`), l'adresse est rendue telle quelle.
 */
export function urlNavigateur(url: string): string {
  if (!url) return url;
  const cible = versLeRelais(url);
  if (cible === null) return url;
  const jeton = resoudre().jeton as string;
  const diese = cible.indexOf('#');
  const avant = diese < 0 ? cible : cible.slice(0, diese);
  const fragment = diese < 0 ? '' : cible.slice(diese);
  const sep = avant.includes('?') ? '&' : '?';
  return `${avant}${sep}token=${encodeURIComponent(jeton)}${fragment}`;
}

/**
 * La connexion au compte mozaiklabs.fr (SSO) est-elle possible d'ici ?
 *
 * PAS par le pont. Le parcours OAuth est une suite de NAVIGATIONS : le
 * serveur répond par une redirection vers mozaiklabs.fr, puis mozaiklabs.fr
 * renvoie le navigateur sur l'adresse de rappel du serveur. Or :
 *   - le pont rejoue la requête depuis le serveur lui-même (127.0.0.1) : la
 *     redirection est suivie CÔTÉ SERVEUR, jamais rendue au navigateur, et
 *     l'en-tête `Location` n'est pas relayé ;
 *   - l'adresse de rappel est construite sur l'hôte vu par le serveur, soit
 *     `http://127.0.0.1:8888/api/v1/cloud/sso/callback` — injoignable depuis
 *     un téléphone en 4G/5G, et non déclarée chez mozaiklabs.fr.
 * Le compte se relie une fois, sur le réseau local ; l'accès à distance n'en
 * a pas besoin (jeton du pont, puis compte Tune si le serveur l'exige).
 */
export function ssoDisponible(): boolean {
  return serverIdDepuisUrl() === null;
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
