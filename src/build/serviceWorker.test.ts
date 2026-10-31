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

function bac(texte: string, opts: { reseau?: 'ok' | 'coupe'; cachesInitiaux?: string[] } = {}) {
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
    return new Response(`reseau:${url}`, { status: 200, headers: { 'content-type': 'text/html' } });
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
  it('ressource : réseau d’abord, mise en cache du build, cache hors ligne', async () => {
    const b = bac(sw('B2'));
    const req = b.requete('/assets/index-abc.js');
    await b.declencher('fetch', { request: req });
    await b.tick();
    expect(b.magasins.get('tune-B2')!.has(req.url)).toBe(true);
    const hl = bac(sw('B2'), { reseau: 'coupe' });
    hl.magasins.set('tune-B2', b.magasins.get('tune-B2')!);
    const r = await hl.declencher('fetch', { request: req });
    expect(await r!.text()).toBe(`reseau:${req.url}`);
  });
});
