/**
 * Le service worker de Tune, exécuté pour de vrai dans un bac à sable (vm)
 * avec un faux `self`, de faux `caches` et un faux `fetch` (rc10).
 *
 * Ce qui est gardé, parce que c'est ce qui manquait le 31/10/2026 (ancienne
 * interface servie après la pose d'un nouveau `web/`, même après un
 * rechargement forcé) :
 *  - un `sw.js` DIFFÉRENT à chaque build, avec un cache à son nom ;
 *  - la coquille (navigation) demandée au réseau en `no-store` — l'ancien
 *    `fetch(requete)` passait par le cache HTTP et sa revalidation ;
 *  - skipWaiting + clients.claim : pas d'attente de la fermeture des onglets ;
 *  - la purge des caches `tune-*` d'un autre build, et d'eux seuls ;
 *  - le hors-ligne : la coquille en cache quand le réseau tombe ;
 *  - `version.json`, l'API et les flux jamais interceptés.
 *
 * Contre-épreuve (PR) : avec l'ancien `public/sw.js`, les cas « no-store »,
 * « purge de tune-v3 au profit du cache du build » et « version.json non
 * intercepté » tombent.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import vm from 'node:vm';
import {
  MARQUE_BUILD,
  MODELE_SW,
  cachesAPurger,
  greffonServiceWorker,
  identifiantDeBuild,
  nomDuCache,
  texteServiceWorker,
} from './serviceWorker';

const MODELE = readFileSync(MODELE_SW, 'utf-8');
const ORIGINE = 'http://tune.local:8888';

type Ecouteur = (e: any) => void;

type OptionsBac = {
  reseau?: 'ok' | 'coupe';
  cachesInitiaux?: string[];
  /** Corps de `/` servi par le réseau. */
  coquille?: string;
  /** Chemins auxquels le serveur répond 404 (morceaux d'un autre build). */
  introuvables?: string[];
};

function typeDe(chemin: string): string {
  if (chemin.endsWith('.js')) return 'text/javascript';
  if (chemin.endsWith('.css')) return 'text/css';
  if (chemin.endsWith('.png')) return 'image/png';
  return 'text/html';
}

function bac(texte: string, opts: OptionsBac = {}) {
  const ecouteurs = new Map<string, Ecouteur>();
  const magasins = new Map<string, Map<string, Response>>();
  for (const n of opts.cachesInitiaux ?? []) magasins.set(n, new Map());
  const appelsFetch: { url: string; init?: RequestInit }[] = [];
  const traces = { skipWaiting: 0, claim: 0 };
  const cle = (k: any) => (typeof k === 'string' ? new URL(k, ORIGINE).href : k.url);
  const caches = {
    open: async (n: string) => {
      if (!magasins.has(n)) magasins.set(n, new Map());
      const m = magasins.get(n)!;
      return { put: async (k: any, r: Response) => void m.set(cle(k), r) };
    },
    keys: async () => [...magasins.keys()],
    delete: async (n: string) => magasins.delete(n),
    match: async (k: any, o?: { cacheName?: string }) => {
      const noms = o?.cacheName ? [o.cacheName] : [...magasins.keys()];
      for (const n of noms) {
        const r = magasins.get(n)?.get(cle(k));
        if (r) return r;
      }
      return undefined;
    },
  };
  const fetch = async (entree: any, init?: RequestInit) => {
    const url = typeof entree === 'string' ? new URL(entree, ORIGINE).href : entree.url;
    appelsFetch.push({ url, init: init ?? (typeof entree === 'string' ? undefined : { cache: entree.cache }) });
    if (opts.reseau === 'coupe') throw new TypeError('Failed to fetch');
    const chemin = new URL(url).pathname;
    if (opts.introuvables?.includes(chemin)) return new Response('', { status: 404 });
    const corps = chemin === '/' && opts.coquille !== undefined ? opts.coquille : `reseau:${url}`;
    return new Response(corps, { status: 200, headers: { 'content-type': typeDe(chemin) } });
  };
  const self = {
    location: { origin: ORIGINE },
    addEventListener: (t: string, f: Ecouteur) => void ecouteurs.set(t, f),
    skipWaiting: () => { traces.skipWaiting++; return Promise.resolve(); },
    clients: { claim: () => { traces.claim++; return Promise.resolve(); } },
    registration: { showNotification: () => {} },
  };
  vm.runInNewContext(texte, { self, caches, fetch, Response, URL, Promise, console });

  async function declencher(type: string, extra: Record<string, unknown> = {}) {
    const attentes: Promise<unknown>[] = [];
    let reponse: Promise<Response> | undefined;
    ecouteurs.get(type)!({
      ...extra,
      waitUntil: (p: Promise<unknown>) => attentes.push(p),
      respondWith: (p: Promise<Response>) => { reponse = p; },
    });
    await Promise.all(attentes);
    return reponse;
  }
  function requete(chemin: string, o: { mode?: string; accept?: string } = {}) {
    return {
      method: 'GET',
      url: chemin.startsWith('http') ? chemin : `${ORIGINE}${chemin}`,
      mode: o.mode ?? 'cors',
      destination: o.mode === 'navigate' ? 'document' : '',
      cache: 'default',
      headers: new Headers(o.accept ? { accept: o.accept } : {}),
    };
  }
  const tick = () => new Promise((r) => setTimeout(r, 0));
  return { declencher, requete, magasins, appelsFetch, traces, tick };
}

const sw = (build: string) => texteServiceWorker(MODELE, build);

describe('identifiant de build et nom de cache', () => {
  it('deux builds de la même version ont deux identifiants', () => {
    expect(identifiantDeBuild('1.0.0', 1)).not.toBe(identifiantDeBuild('1.0.0', 2));
  });
  it('TUNE_BUILD_ID imposé prime', () => {
    expect(identifiantDeBuild('1.0.0', 1, 'rc10-abc')).toBe('rc10-abc');
    expect(identifiantDeBuild('1.0.0', 1, '  ')).toBe('1.0.0+1');
  });
  it('le cache porte le build', () => {
    expect(nomDuCache('1.0.0+x')).toBe('tune-1.0.0+x');
  });
  it('purge : les caches tune-* d’un autre build, et pas les autres', () => {
    expect(cachesAPurger(['tune-v3', 'tune-A', 'tune-B', 'autre'], 'tune-B')).toEqual(['tune-v3', 'tune-A']);
  });
});

describe('texte du sw.js', () => {
  it('le modèle porte la marque, le résultat ne la porte plus', () => {
    expect(MODELE).toContain(MARQUE_BUILD);
    expect(sw('B1')).not.toContain(MARQUE_BUILD);
    expect(sw('B1')).toContain("'B1'");
  });
  it('deux builds donnent deux sw.js différents (sinon le navigateur ne remplace rien)', () => {
    expect(sw('B1')).not.toBe(sw('B2'));
  });
  it('un identifiant hostile ne casse pas la chaîne', () => {
    expect(() => new vm.Script(sw("x'; throw 1; '"))).not.toThrow();
  });
  it('le greffon émet sw.js à la racine', () => {
    const emis: any[] = [];
    greffonServiceWorker('B9', MODELE).generateBundle.call({ emitFile: (a: unknown) => emis.push(a) });
    expect(emis).toHaveLength(1);
    expect(emis[0].fileName).toBe('sw.js');
    expect(emis[0].source).toContain("'B9'");
  });
});

describe('cycle de vie', () => {
  it('install : skipWaiting, sans attendre la fermeture des onglets', async () => {
    const b = bac(sw('B2'));
    await b.declencher('install');
    expect(b.traces.skipWaiting).toBe(1);
  });
  it('install : précharge la coquille sans cache HTTP, dans le cache du build', async () => {
    const b = bac(sw('B2'));
    await b.declencher('install');
    expect(b.appelsFetch[0].init?.cache).toBe('no-store');
    expect(b.magasins.has('tune-B2')).toBe(true);
  });
  it('install : serveur injoignable, l’installation n’échoue pas', async () => {
    const b = bac(sw('B2'), { reseau: 'coupe' });
    await expect(b.declencher('install')).resolves.toBeUndefined();
  });
  it('activate : purge tune-v3 et l’ancien build, garde le build courant et les caches étrangers, puis claim', async () => {
    const b = bac(sw('B2'), { cachesInitiaux: ['tune-v3', 'tune-B1', 'tune-B2', 'autre-appli'] });
    await b.declencher('activate');
    expect([...b.magasins.keys()].sort()).toEqual(['autre-appli', 'tune-B2']);
    expect(b.traces.claim).toBe(1);
  });
});

describe('fetch', () => {
  it('navigation : réseau en no-store (jamais de revalidation 304 vers une coquille ancienne)', async () => {
    const b = bac(sw('B2'));
    const r = await b.declencher('fetch', { request: b.requete('/library', { mode: 'navigate' }) });
    expect(await r!.text()).toBe(`reseau:${ORIGINE}/library`);
    expect(b.appelsFetch[0].init?.cache).toBe('no-store');
  });
  it('navigation hors ligne : la coquille de ce build', async () => {
    const b = bac(sw('B2'));
    await b.declencher('install');
    const hl = bac(sw('B2'), { reseau: 'coupe' });
    // Même cache que le premier bac : on recopie la coquille préchargée.
    hl.magasins.set('tune-B2', b.magasins.get('tune-B2')!);
    const r = await hl.declencher('fetch', { request: hl.requete('/albums/12', { mode: 'navigate' }) });
    expect(await r!.text()).toBe(`reseau:${ORIGINE}/`);
  });
  it('navigation hors ligne : une coquille d’un AUTRE build n’est pas servie', async () => {
    const b = bac(sw('B2'), { reseau: 'coupe', cachesInitiaux: ['tune-v3'] });
    b.magasins.get('tune-v3')!.set(`${ORIGINE}/`, new Response('ancienne'));
    const r = await b.declencher('fetch', { request: b.requete('/', { mode: 'navigate' }) });
    expect(r!.type).toBe('error');
  });
  it('version.json, sw.js, API, WebSocket, flux : jamais interceptés', async () => {
    const b = bac(sw('B2'));
    for (const p of ['/version.json', '/abc/version.json', '/sw.js', '/api/v1/zones', '/ws', '/stream/12']) {
      expect(await b.declencher('fetch', { request: b.requete(p) }), p).toBeUndefined();
    }
  });
  it('autre origine (polices) : non interceptée', async () => {
    const b = bac(sw('B2'));
    expect(await b.declencher('fetch', { request: b.requete('https://fonts.googleapis.com/css2') })).toBeUndefined();
  });
  it('ressource sans empreinte : réseau d’abord, mise en cache du build, cache hors ligne', async () => {
    const b = bac(sw('B2'));
    const req = b.requete('/icons/icone-192.png');
    await b.declencher('fetch', { request: req });
    await b.tick();
    expect(b.magasins.get('tune-B2')!.has(req.url)).toBe(true);
    const hl = bac(sw('B2'), { reseau: 'coupe' });
    hl.magasins.set('tune-B2', b.magasins.get('tune-B2')!);
    const r = await hl.declencher('fetch', { request: req });
    expect(await r!.text()).toBe(`reseau:${req.url}`);
  });
});

// tune-web-client#3054 — écran noir après une mise à jour : une coquille
// servie hors ligne (serveur en redémarrage) dont le bundle d'entrée n'était
// pas dans le cache du build.
const COQUILLE_N = [
  '<!doctype html><html><head>',
  '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Lato" />',
  '<script type="module" crossorigin src="/assets/index-N.js"></script>',
  '<link rel="stylesheet" crossorigin href="/assets/index-N.css">',
  '</head><body><div id="app"></div></body></html>',
].join('');

describe('fichiers à empreinte et coquille du même build (#3054)', () => {
  it('install : la coquille ET les /assets/ qu’elle cite entrent dans le cache du build', async () => {
    const b = bac(sw('N'), { coquille: COQUILLE_N });
    await b.declencher('install');
    const cles = [...b.magasins.get('tune-N')!.keys()].sort();
    expect(cles).toEqual([`${ORIGINE}/`, `${ORIGINE}/assets/index-N.css`, `${ORIGINE}/assets/index-N.js`]);
    // Les polices d'une autre origine ne sont pas demandées.
    expect(b.appelsFetch.some((a) => a.url.includes('fonts.googleapis'))).toBe(false);
  });

  it('install : un morceau introuvable n’est pas mis en cache, et l’installation aboutit', async () => {
    const b = bac(sw('N'), { coquille: COQUILLE_N, introuvables: ['/assets/index-N.js'] });
    await expect(b.declencher('install')).resolves.toBeUndefined();
    expect(b.magasins.get('tune-N')!.has(`${ORIGINE}/assets/index-N.js`)).toBe(false);
    expect(b.magasins.get('tune-N')!.has(`${ORIGINE}/assets/index-N.css`)).toBe(true);
  });

  it('fichier à empreinte en cache : servi sans aller au réseau', async () => {
    const b = bac(sw('N'), { cachesInitiaux: ['tune-N'] });
    b.magasins.get('tune-N')!.set(`${ORIGINE}/assets/index-N.js`, new Response('cache:N'));
    const r = await b.declencher('fetch', { request: b.requete('/assets/index-N.js') });
    expect(await r!.text()).toBe('cache:N');
    expect(b.appelsFetch).toHaveLength(0);
  });

  it('fichier à empreinte absent du cache : réseau, puis mis en cache', async () => {
    const b = bac(sw('N'));
    const req = b.requete('/assets/Bibliotheque-x1.js');
    const r = await b.declencher('fetch', { request: req });
    expect(await r!.text()).toBe(`reseau:${req.url}`);
    await b.tick();
    expect(b.magasins.get('tune-N')!.has(req.url)).toBe(true);
  });

  it('fichier à empreinte : ni un 404 ni une page HTML de repli ne sont gardés', async () => {
    const b = bac(sw('N'), { introuvables: ['/assets/disparu-N.js'] });
    const r404 = await b.declencher('fetch', { request: b.requete('/assets/disparu-N.js') });
    expect(r404!.status).toBe(404);
    const rHtml = await b.declencher('fetch', { request: b.requete('/assets/route-inconnue') });
    expect(rHtml!.headers.get('content-type')).toContain('text/html');
    await b.tick();
    expect(b.magasins.get('tune-N')?.size ?? 0).toBe(0);
  });

  it('serveur revenu avec N+1 : la coquille N servie hors ligne retrouve ses morceaux N', async () => {
    // Installation de N : coquille et morceaux en cache.
    const n = bac(sw('N'), { coquille: COQUILLE_N });
    await n.declencher('install');
    // Navigation pendant le redémarrage : coquille N du cache.
    const panne = bac(sw('N'), { reseau: 'coupe' });
    panne.magasins.set('tune-N', n.magasins.get('tune-N')!);
    const nav = await panne.declencher('fetch', { request: panne.requete('/', { mode: 'navigate' }) });
    expect(await nav!.text()).toContain('/assets/index-N.js');
    // Le serveur est revenu avec N+1 : les morceaux N n'y sont plus.
    const revenu = bac(sw('N'), { introuvables: ['/assets/index-N.js', '/assets/index-N.css'] });
    revenu.magasins.set('tune-N', n.magasins.get('tune-N')!);
    const js = await revenu.declencher('fetch', { request: revenu.requete('/assets/index-N.js') });
    expect(js!.status).toBe(200);
    expect(await js!.text()).toBe(`reseau:${ORIGINE}/assets/index-N.js`);
  });

  it('navigation, réseau joignable : toujours la coquille du réseau, jamais celle du cache', async () => {
    const b = bac(sw('N'), { coquille: 'coquille-N1', cachesInitiaux: ['tune-N'] });
    b.magasins.get('tune-N')!.set(`${ORIGINE}/`, new Response('coquille-N-en-cache'));
    const r = await b.declencher('fetch', { request: b.requete('/', { mode: 'navigate' }) });
    expect(await r!.text()).toBe('coquille-N1');
  });

  it('activation de N+1 : les caches de N (coquille et morceaux) sont purgés', async () => {
    const n = bac(sw('N'), { coquille: COQUILLE_N });
    await n.declencher('install');
    const n1 = bac(sw('N1'), { cachesInitiaux: ['tune-N1'] });
    n1.magasins.set('tune-N', n.magasins.get('tune-N')!);
    await n1.declencher('activate');
    expect([...n1.magasins.keys()]).toEqual(['tune-N1']);
    expect(n1.traces.claim).toBe(1);
  });
});
