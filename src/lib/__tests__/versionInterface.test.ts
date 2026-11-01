/**
 * rc10 — l'onglet ouvert est-il encore celui du `web/` servi ?
 *
 * Contre-épreuve (documentée dans la PR) : `comparerBuilds` rendu constant à
 * 'identique', ou `deciderApresComparaison` qui rend toujours 'rien', fait
 * tomber les cas « différente » ci-dessous.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { get } from 'svelte/store';
import {
  CLE_RECHARGEMENT_VERSION,
  FENETRE_ANTI_BOUCLE_VERSION_MS,
  adresseVersionJson,
  buildCharge,
  comparerBuilds,
  deciderApresComparaison,
  extraireBuild,
  interfacePerimee,
  lireBuildServi,
  verifierVersion,
  type Environnement,
} from '../versionInterface';

function stockage() {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), m };
}

function reponse(corps: unknown, init: { status?: number; type?: string } = {}) {
  return new Response(typeof corps === 'string' ? corps : JSON.stringify(corps), {
    status: init.status ?? 200,
    headers: { 'content-type': init.type ?? 'application/json' },
  });
}

describe('comparerBuilds', () => {
  it('même build : identique', () => {
    expect(comparerBuilds('1.0.0+abc', '1.0.0+abc')).toBe('identique');
  });
  it('builds différents : différente', () => {
    expect(comparerBuilds('1.0.0+abc', '1.0.0+abd')).toBe('differente');
  });
  it('même version de paquet mais build différent : différente (package.json reste à 1.0.0)', () => {
    expect(comparerBuilds('1.0.0+kx1', '1.0.0+kx2')).toBe('differente');
  });
  it('un côté inconnu ne décide rien', () => {
    expect(comparerBuilds('1.0.0+abc', null)).toBe('inconnue');
    expect(comparerBuilds(null, '1.0.0+abc')).toBe('inconnue');
    expect(comparerBuilds('', '1.0.0+abc')).toBe('inconnue');
    expect(comparerBuilds('1.0.0+abc', '   ')).toBe('inconnue');
    expect(comparerBuilds('1.0.0+abc', 42)).toBe('inconnue');
  });
  it('les espaces autour ne font pas une différence', () => {
    expect(comparerBuilds(' 1.0.0+abc', '1.0.0+abc\n')).toBe('identique');
  });
});

describe('extraireBuild', () => {
  it('lit le champ build', () => {
    expect(extraireBuild({ version: '1.0.0', build: '1.0.0+abc' })).toBe('1.0.0+abc');
  });
  it('ancien version.json (sans build) : null', () => {
    expect(extraireBuild({ version: '1.0.0' })).toBeNull();
    expect(extraireBuild(null)).toBeNull();
    expect(extraireBuild('x')).toBeNull();
  });
});

describe('adresseVersionJson', () => {
  it('servi par le serveur : à la racine', () => {
    expect(adresseVersionJson(null)).toBe('/version.json');
  });
  it('par le relais : sous /{server_id}/', () => {
    expect(adresseVersionJson('abc-123')).toBe('/abc-123/version.json');
  });
});

describe('lireBuildServi', () => {
  it('demande sans cache et rend le build', async () => {
    let init: RequestInit | undefined;
    const f = (async (_u: string, i?: RequestInit) => {
      init = i;
      return reponse({ version: '1.0.0', build: 'B2' });
    }) as unknown as typeof fetch;
    expect(await lireBuildServi(f, '/version.json')).toBe('B2');
    expect(init?.cache).toBe('no-store');
  });
  it('404, HTML de repli, JSON cassé ou réseau coupé : null', async () => {
    const f404 = (async () => reponse('', { status: 404 })) as unknown as typeof fetch;
    const fHtml = (async () => reponse('<!doctype html>', { type: 'text/html' })) as unknown as typeof fetch;
    const fCasse = (async () => reponse('{', {})) as unknown as typeof fetch;
    const fCoupe = (async () => {
      throw new TypeError('Failed to fetch');
    }) as unknown as typeof fetch;
    for (const f of [f404, fHtml, fCasse, fCoupe]) expect(await lireBuildServi(f, '/version.json')).toBeNull();
  });
});

describe('deciderApresComparaison', () => {
  it('identique ou inconnue : rien, à tout moment', () => {
    for (const c of ['identique', 'inconnue'] as const) {
      expect(deciderApresComparaison(c, 'demarrage', stockage(), 1)).toBe('rien');
      expect(deciderApresComparaison(c, 'retour', stockage(), 1)).toBe('rien');
    }
  });
  it('différente au démarrage : recharger, et la garde est notée', () => {
    const s = stockage();
    expect(deciderApresComparaison('differente', 'demarrage', s, 1_000)).toBe('recharger');
    expect(s.m.get(CLE_RECHARGEMENT_VERSION)).toBe('1000');
  });
  it('second écart dans la fenêtre : bandeau, pas de boucle', () => {
    const s = stockage();
    deciderApresComparaison('differente', 'demarrage', s, 1_000);
    expect(deciderApresComparaison('differente', 'demarrage', s, 1_000 + FENETRE_ANTI_BOUCLE_VERSION_MS - 1)).toBe('bandeau');
  });
  it('après la fenêtre, un nouveau rechargement est permis', () => {
    const s = stockage();
    deciderApresComparaison('differente', 'demarrage', s, 1_000);
    expect(deciderApresComparaison('differente', 'demarrage', s, 1_000 + FENETRE_ANTI_BOUCLE_VERSION_MS)).toBe('recharger');
  });
  it('différente en cours de session : bandeau, jamais un rechargement imposé', () => {
    expect(deciderApresComparaison('differente', 'retour', stockage(), 1)).toBe('bandeau');
  });
  it('sans stockage (navigation privée bloquée) : bandeau plutôt que boucle', () => {
    expect(deciderApresComparaison('differente', 'demarrage', null, 1)).toBe('bandeau');
    const jette = { getItem: () => { throw new Error('x'); }, setItem: () => {} };
    expect(deciderApresComparaison('differente', 'demarrage', jette, 1)).toBe('bandeau');
  });
});

describe('verifierVersion — bout à bout', () => {
  beforeEach(() => interfacePerimee.set(false));

  function env(servi: string | null, charge = 'A'): Environnement & { recharges: number } {
    const e = {
      fetch: (async () => reponse(servi === null ? { version: '1.0.0' } : { version: '1.0.0', build: servi })) as unknown as typeof fetch,
      adresse: '/version.json',
      charge,
      stockage: stockage(),
      maintenant: () => 5_000,
      recharges: 0,
      recharger: () => { e.recharges++; },
    };
    return e;
  }

  it('serveur passé à un autre build, au démarrage : un rechargement', async () => {
    const e = env('B');
    expect(await verifierVersion(e, 'demarrage')).toBe('recharger');
    expect(e.recharges).toBe(1);
    expect(get(interfacePerimee)).toBe(false);
  });
  it('serveur passé à un autre build, onglet ouvert : le bandeau', async () => {
    const e = env('B');
    expect(await verifierVersion(e, 'retour')).toBe('bandeau');
    expect(e.recharges).toBe(0);
    expect(get(interfacePerimee)).toBe(true);
  });
  it('même build : ni rechargement ni bandeau', async () => {
    const e = env('A');
    expect(await verifierVersion(e, 'demarrage')).toBe('rien');
    expect(e.recharges).toBe(0);
    expect(get(interfacePerimee)).toBe(false);
  });
  it('ancien web/ sans champ build : rien', async () => {
    const e = env(null);
    expect(await verifierVersion(e, 'demarrage')).toBe('rien');
    expect(e.recharges).toBe(0);
  });
});

describe('buildCharge', () => {
  it('lit l’identifiant injecté au build', () => {
    expect(buildCharge()).toBe('0.0.0-test+build');
  });
});
