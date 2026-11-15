// Service worker de Tune — MODÈLE. Le build (`src/build/serviceWorker.ts`)
// remplace `__TUNE_BUILD__` par l'identifiant du build et dépose le résultat
// en `dist/sw.js`. Ne pas le copier tel quel dans `public/`.
//
// 🔴 POURQUOI UN IDENTIFIANT DE BUILD ICI (rc10, 31/10/2026). L'ancien `sw.js`
// était un fichier fixe (`tune-v3`) : d'une version à l'autre, ses octets ne
// changeaient pas, donc le navigateur ne voyait JAMAIS de nouveau service
// worker, ne purgeait jamais rien, et sa coquille `/` en cache vivait d'une
// version à l'autre. Un octet différent par build suffit à déclencher
// install → skipWaiting → activate (purge) → clients.claim.
//
// 🔴 POURQUOI `no-store` SUR LA COQUILLE. Le « réseau d'abord » d'avant
// passait par le cache HTTP : `fetch(requete)` avec le mode de cache par
// défaut revalide `index.html` par `If-Modified-Since`, et le serveur (ServeDir,
// sans ETag) répond 304 dès que le NOUVEL `index.html` porte une date de
// modification antérieure ou égale à l'ancienne — dossier `web/` posé en
// conservant les dates, par exemple. Le navigateur ressert alors l'ancienne
// coquille, qui charge les anciens morceaux hachés, encore en cache
// `immutable` : l'ancienne interface entière, alors que le serveur répond.
// En navigation privée, ni cache ni service worker : la nouvelle apparaît.
// `no-store` ne pose aucun en-tête conditionnel : la coquille vient du réseau,
// ou, hors ligne seulement, du cache de CE build.
//
// 🔴 COQUILLE ET MORCEAUX DU MÊME BUILD (tune-web-client#3054, rc12, 15/11/2026).
// Hors ligne — serveur en redémarrage pendant une mise à jour —, la coquille
// en cache était servie, mais ses morceaux ne l'étaient que s'ils avaient
// été demandés un jour à CE service worker : le bundle d'entrée, chargé avant
// la prise de contrôle, n'y était pas. Coquille sans bundle = écran noir. À
// l'installation, la coquille ET les fichiers `/assets/` qu'elle cite entrent
// donc ensemble dans le cache du build. Les fichiers à empreinte (`/assets/`)
// sont servis cache d'abord : leur nom change à chaque contenu, un nom connu
// ne peut pas être périmé, et l'ancienne coquille servie hors ligne retrouve
// ses morceaux même quand le serveur revenu n'a plus que ceux du nouveau build.
// Jamais mis en cache : une réponse en erreur ou en `text/html` (repli SPA).

const BUILD = '__TUNE_BUILD__';
const PREFIXE_CACHE = 'tune-';
const CACHE_NAME = PREFIXE_CACHE + BUILD;
const COQUILLE = '/';

// Jamais interceptés : l'API, les flux, le WebSocket, et les deux fichiers qui
// DISENT quelle version tourne — les servir depuis un cache les ferait mentir.
function passeSansIntercepter(url) {
  const p = url.pathname;
  return (
    p.startsWith('/api/') ||
    p === '/ws' ||
    p.startsWith('/ws/') ||
    p.includes('/stream/') ||
    p === '/sw.js' ||
    p.endsWith('/version.json')
  );
}

function estUneNavigation(requete) {
  if (requete.mode === 'navigate') return true;
  const accept = requete.headers && requete.headers.get ? requete.headers.get('accept') || '' : '';
  return requete.destination === 'document' || accept.includes('text/html');
}

// Fichiers à empreinte de Vite : `/assets/nom-HASH.ext` (sous `/{server_id}/`
// par le relais).
function estAEmpreinte(url) {
  return url.pathname.includes('/assets/');
}

// Une réponse qu'on peut garder pour un fichier à empreinte : 200, et pas la
// page de repli d'une route inconnue.
function bonneRessource(resp) {
  if (!resp || !resp.ok) return false;
  const type = (resp.headers && resp.headers.get && resp.headers.get('content-type')) || '';
  return !type.includes('text/html');
}

// Les `/assets/` cités par la coquille : bundle d'entrée, feuille, préchargements.
function ressourcesDeLaCoquille(html) {
  const vus = new Set();
  const motif = /(?:src|href)="([^"]*\/assets\/[^"]+)"/g;
  let m;
  while ((m = motif.exec(html))) vus.add(m[1]);
  return [...vus];
}

function coquilleDuReseau(url) {
  // `redirect: 'manual'` : une réponse redirigée rendue à une navigation est
  // refusée par Chrome ; la redirection opaque, elle, est acceptée.
  return fetch(url, { cache: 'no-store', credentials: 'same-origin', redirect: 'manual' });
}

self.addEventListener('install', (e) => {
  self.skipWaiting();
  // Précharge la coquille de CE build pour le hors-ligne. Un échec (serveur
  // injoignable pendant l'installation) ne bloque pas l'installation.
  // Ses fichiers `/assets/` aussi (#3054) : une coquille sans eux ne démarre pas.
  e.waitUntil(
    coquilleDuReseau(COQUILLE)
      .then((resp) => {
        if (!resp.ok) return undefined;
        return Promise.all([caches.open(CACHE_NAME), resp.clone().text()]).then(([c, html]) =>
          c.put(COQUILLE, resp).then(() =>
            Promise.all(
              ressourcesDeLaCoquille(html).map((chemin) =>
                fetch(chemin, { credentials: 'same-origin' })
                  .then((r) => (bonneRessource(r) ? c.put(chemin, r) : undefined))
                  .catch(() => undefined)
              )
            )
          )
        );
      })
      .catch(() => undefined)
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((cles) =>
        Promise.all(
          cles
            .filter((k) => k.startsWith(PREFIXE_CACHE) && k !== CACHE_NAME)
            .map((k) => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const requete = e.request;
  // The Cache API only accepts http(s) GET requests. Browser extensions emit
  // chrome-extension:// fetches that otherwise reach `cache.put` and throw.
  if (requete.method !== 'GET' || !/^https?:/.test(requete.url)) return;
  const url = new URL(requete.url);
  // Autre origine (polices Google…) : le navigateur s'en charge.
  if (url.origin !== self.location.origin) return;
  if (passeSansIntercepter(url)) return;

  if (estUneNavigation(requete)) {
    e.respondWith(
      coquilleDuReseau(requete.url)
        .then((resp) => {
          if (resp.ok) {
            const copie = resp.clone();
            caches.open(CACHE_NAME).then((c) => c.put(COQUILLE, copie));
          }
          return resp;
        })
        // Hors ligne : la coquille de CE build, quelle que soit la route.
        .catch(() => caches.match(COQUILLE, { cacheName: CACHE_NAME }).then((r) => r || Response.error()))
    );
    return;
  }

  // Fichiers à empreinte : cache de CE build d'abord, réseau sinon (#3054).
  if (estAEmpreinte(url)) {
    e.respondWith(
      caches.match(requete, { cacheName: CACHE_NAME }).then(
        (enCache) =>
          enCache ||
          fetch(requete).then((resp) => {
            if (bonneRessource(resp)) {
              const copie = resp.clone();
              caches.open(CACHE_NAME).then((c) => c.put(requete, copie));
            }
            return resp;
          })
      )
    );
    return;
  }

  // Autres ressources (icônes, manifeste) : réseau d'abord, cache de CE build
  // hors ligne.
  e.respondWith(
    fetch(requete)
      .then((resp) => {
        if (resp.ok) {
          const copie = resp.clone();
          caches.open(CACHE_NAME).then((c) => c.put(requete, copie));
        }
        return resp;
      })
      .catch(() => caches.match(requete, { cacheName: CACHE_NAME }).then((r) => r || Response.error()))
  );
});

// Track change notifications — posted from the main thread when the tab is
// hidden. Using the service worker ensures the notification shows even if
// the browser has throttled or suspended the page.
self.addEventListener('message', (e) => {
  if (e.data && e.data.type === 'TRACK_NOTIFICATION') {
    const { title, body, icon } = e.data;
    self.registration.showNotification(title, {
      body: body || undefined,
      icon: icon || undefined,
      tag: 'tune-track-change',
      silent: true,
      renotify: true,
    });
  }
});

// Clicking a notification focuses the existing Tune tab (or opens one)
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          return client.focus();
        }
      }
      return self.clients.openWindow('/');
    })
  );
});
