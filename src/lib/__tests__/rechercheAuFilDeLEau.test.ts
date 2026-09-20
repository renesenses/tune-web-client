// Le deuxième temps de la recherche se pose SERVICE PAR SERVICE — et sait
// retomber sur un appel unique quand il ignore la liste.
//
// Bertrand, 19/09/2026 : « La recherche se fait en deux temps : local puis
// streaming. Il ne faut pas faire patienter l'utilisateur ».
//
// Mesuré sur le .18 (0.9.155), requête « coltrane », à chaud :
//
//     qobuz 0,13   tidal 0,03   youtube 0,42   bandcamp 0,30   (seuls)
//     les quatre en un appel, à la file : 1,20 s
//     le plus lent seul                 : 0,42 s
//
// 🔴 CE BANC CHRONOMÈTRE. Une volée séquentielle rend exactement les mêmes
// objets qu'une volée concurrente, simplement plus tard : aucune assertion sur
// le contenu ne peut voir le défaut.
//
// 🔴 ET IL GARDE LE REPLI. Chercher service par service oblige l'écran à
// connaître la liste, donc à demander `/streaming/services` — dont l'échec est
// avalé par `statutsStreaming`, qui rend `{}`. Sans repli, la moitié streaming
// de l'écran se vide sans un mot : le défaut de #1231 à l'identique. C'est
// exactement ce qui est arrivé la première fois que cette version a été
// écrite, et vingt tests existants l'avaient signalé en rougissant.
import { describe, expect, it, vi } from 'vitest';
import {
  blocDuService,
  chercherAuFilDeLEau,
  planDuDeuxiemeTemps,
} from '../rechercheAuFilDeLEau';
import { SOURCES_SERVICES } from '../sourcesRecherche';
import type { FederatedSearchResult, SearchResult } from '../types';

const bloc = (svc: string) =>
  ({ artists: [], albums: [], tracks: [{ title: svc }] }) as unknown as SearchResult;

const reponse = (...svcs: string[]) =>
  ({
    services: Object.fromEntries(svcs.map((s) => [s, bloc(s)])),
  }) as unknown as FederatedSearchResult;

const apres = <T,>(ms: number, v: T) =>
  new Promise<T>((res) => setTimeout(() => res(v), ms));

/**
 * Un QUAI : une promesse que le cas résout lui-même, quand il veut — #1336.
 *
 * 🔴 L'ordre d'arrivée ne se fabrique pas avec l'horloge. La version d'avant
 * donnait à chaque service un `setTimeout` — tidal 10 ms, qobuz 20 ms — et
 * pariait sur l'ordre des échéances. Or `chercherAuFilDeLEau` lance les appels
 * par un `plan.services.map(…)`, dans l'ordre du plan : les trois minuteries ne
 * partent PAS au même instant. Il suffit d'une préemption de plus de 10 ms
 * entre deux tours du `.map` — ordinaire sous huit portes `npm test`
 * simultanées — pour que l'échéance de qobuz précède celle de tidal. Mesuré
 * sur Shrek le 20/09/2026 : 1 porte rouge sur 24, et le rouge accusait
 * `chercherAuFilDeLEau` de poser dans le désordre.
 *
 * Avec un quai, l'ordre d'arrivée est une DONNÉE du cas, pas un pari. Et le cas
 * y gagne : il peut lire l'état après CHAQUE arrivée, ce que la version
 * chronométrée ne permettait pas.
 */
function quai<T>() {
  let livrer!: (v: T) => void;
  const promesse = new Promise<T>((res) => { livrer = res; });
  return { promesse, livrer };
}

/** Laisse les `.then()` de la volée s'exécuter. */
const souffler = async () => { for (let i = 0; i < 5; i++) await Promise.resolve(); };

describe('le PLAN du deuxième temps', () => {
  it('des services connus : un appel par service', () => {
    expect(planDuDeuxiemeTemps(['qobuz', 'tidal'])).toEqual({
      voie: 'par-service',
      services: ['qobuz', 'tidal'],
    });
  });

  it('🔴 aucun service connu : UN appel, jeton `streaming`', () => {
    // LE REPLI. Sans lui, la volée ne part sur rien et l'écran se vide.
    for (const rien of [[], null, undefined, ['', '  ']]) {
      expect(planDuDeuxiemeTemps(rien as any), JSON.stringify(rien)).toEqual({
        voie: 'un-seul-appel',
        sources: [SOURCES_SERVICES],
      });
    }
  });

  it('🔴 le repli emploie le jeton du SERVEUR, pas une chaîne écrite ici', () => {
    const plan = planDuDeuxiemeTemps([]);
    expect(plan.voie).toBe('un-seul-appel');
    if (plan.voie === 'un-seul-appel') expect(plan.sources).toEqual(['streaming']);
  });

  it('les noms sont débordés de leurs espaces', () => {
    expect(planDuDeuxiemeTemps([' qobuz ', 'tidal'])).toEqual({
      voie: 'par-service',
      services: ['qobuz', 'tidal'],
    });
  });
});

describe('le bloc d’un service se lit sous SON nom', () => {
  it('la clé demandée, et elle seule', () => {
    expect(blocDuService('qobuz', reponse('qobuz'))).toEqual(bloc('qobuz'));
  });

  it('🔴 jamais « la première clé venue »', () => {
    // Un serveur qui rendrait deux blocs poserait sinon les résultats de l'un
    // sous le nom de l'autre — un album Tidal affiché comme un album Qobuz.
    expect(blocDuService('qobuz', reponse('tidal', 'qobuz'))).toEqual(bloc('qobuz'));
  });

  it('une réponse sans ce service ne rend rien', () => {
    expect(blocDuService('youtube', reponse('qobuz'))).toBeNull();
    expect(blocDuService('qobuz', { services: {} } as any)).toBeNull();
    expect(blocDuService('qobuz', null)).toBeNull();
    expect(blocDuService('qobuz', undefined)).toBeNull();
  });
});

describe('par service : chacun se pose DÈS QU’IL répond', () => {
  it('🔴 le rapide n’attend pas le lent', async () => {
    // Demandés dans l'ordre youtube, qobuz, tidal ; ils répondent dans l'ordre
    // INVERSE, et chacun doit se poser dès SON arrivée.
    const quais: Record<string, ReturnType<typeof quai<FederatedSearchResult>>> = {
      youtube: quai(), qobuz: quai(), tidal: quai(),
    };
    const poses: string[] = [];
    const volee = chercherAuFilDeLEau(
      planDuDeuxiemeTemps(['youtube', 'qobuz', 'tidal']),
      ([svc]) => quais[svc].promesse,
      (svc) => poses.push(svc),
      () => true,
    );

    // 🔴 Après CHAQUE arrivée : une implémentation qui attendrait toute la
    // volée avant de poser passait la version chronométrée ; ici elle tombe
    // dès la première mesure.
    expect(poses, 'rien n’est posé avant la première réponse').toEqual([]);
    quais.tidal.livrer(reponse('tidal'));
    await souffler();
    expect(poses, 'tidal a répondu, il doit être posé — seul').toEqual(['tidal']);
    quais.qobuz.livrer(reponse('qobuz'));
    await souffler();
    expect(poses).toEqual(['tidal', 'qobuz']);
    quais.youtube.livrer(reponse('youtube'));
    await volee;
    // L'ORDRE D'ARRIVÉE, pas celui de la demande : une volée séquentielle
    // rendrait ['youtube','qobuz','tidal'].
    expect(poses).toEqual(['tidal', 'qobuz', 'youtube']);
  });

  it('🔴 la volée part EN MÊME TEMPS, elle ne fait pas la queue', async () => {
    // La propriété visée est la simultanéité, pas une durée : on compte les
    // appels OUVERTS au même instant. Mesurer un chronomètre — « moins de la
    // moitié de la somme » — donnait la même réponse tant que la machine était
    // libre, et rougissait au hasard dès qu'elle ne l'était plus (#1336).
    const services = ['a', 'b', 'c', 'd'];
    const quais = Object.fromEntries(
      services.map((s) => [s, quai<FederatedSearchResult>()]),
    ) as Record<string, ReturnType<typeof quai<FederatedSearchResult>>>;
    let ouverts = 0;
    let creteOuverts = 0;
    const volee = chercherAuFilDeLEau(
      planDuDeuxiemeTemps(services),
      ([svc]) => {
        ouverts++;
        creteOuverts = Math.max(creteOuverts, ouverts);
        return quais[svc].promesse.then((r) => { ouverts--; return r; });
      },
      () => {},
      () => true,
    );
    expect(creteOuverts, `${creteOuverts} appel(s) ouvert(s) en même temps`)
      .toBe(services.length);
    for (const s of services) quais[s].livrer(reponse(s));
    await volee;
  });

  it('🔴 chaque appel ne demande QUE son service', async () => {
    // Demander tout à chaque fois rendrait quatre fois la même réponse
    // complète — quatre fois le travail, pour le même écran.
    const demandes: string[][] = [];
    await chercherAuFilDeLEau(
      planDuDeuxiemeTemps(['qobuz', 'tidal']),
      (sources) => { demandes.push(sources); return Promise.resolve(reponse(sources[0])); },
      () => {},
      () => true,
    );
    expect(demandes).toEqual([['qobuz'], ['tidal']]);
  });

  it('un service en échec ne fait pas tomber les autres', async () => {
    const poses: string[] = [];
    await chercherAuFilDeLEau(
      planDuDeuxiemeTemps(['qobuz', 'youtube']),
      ([svc]) =>
        svc === 'youtube' ? Promise.reject(new Error('502')) : Promise.resolve(reponse(svc)),
      (svc) => poses.push(svc),
      () => true,
    );
    expect(poses).toEqual(['qobuz']);
  });
});

describe('le REPLI rend ce que rendait la version d’avant', () => {
  it('🔴 un seul appel, et TOUS les blocs qu’il rapporte sont posés', async () => {
    // On ignore quels services répondront — c'est justement le cas où on
    // l'ignore. On pose donc tout ce qui revient.
    const demandes: string[][] = [];
    const poses: string[] = [];
    await chercherAuFilDeLEau(
      planDuDeuxiemeTemps([]),
      (sources) => { demandes.push(sources); return Promise.resolve(reponse('qobuz', 'tidal')); },
      (svc) => poses.push(svc),
      () => true,
    );
    expect(demandes).toEqual([[SOURCES_SERVICES]]);
    expect(poses.sort()).toEqual(['qobuz', 'tidal']);
  });

  it('🔴 le repli en ÉCHEC ne jette rien — l’écran garde ce qu’il a', async () => {
    await expect(
      chercherAuFilDeLEau(
        planDuDeuxiemeTemps([]),
        () => Promise.reject(new Error('502')),
        () => { throw new Error('ne devrait pas poser'); },
        () => true,
      ),
    ).resolves.toBeUndefined();
  });

  it('une réponse sans services ne pose rien, et ne casse pas', async () => {
    const poser = vi.fn();
    await chercherAuFilDeLEau(
      planDuDeuxiemeTemps([]),
      () => Promise.resolve({} as any),
      poser,
      () => true,
    );
    expect(poser).not.toHaveBeenCalled();
  });
});

describe('une frappe pendant la volée annule ce qui reste', () => {
  it('🔴 `aJour` est relu à CHAQUE réponse, pas une fois au départ', async () => {
    let courant = true;
    const poses: string[] = [];
    const quais = { rapide: quai<FederatedSearchResult>(), lent: quai<FederatedSearchResult>() };
    const volee = chercherAuFilDeLEau(
      planDuDeuxiemeTemps(['rapide', 'lent']),
      ([svc]) => quais[svc as 'rapide' | 'lent'].promesse,
      (svc) => poses.push(svc),
      () => courant,
    );
    quais.rapide.livrer(reponse('rapide'));
    await souffler();
    expect(poses, 'la première réponse arrive AVANT la frappe').toEqual(['rapide']);
    courant = false; // l'utilisateur a tapé
    quais.lent.livrer(reponse('lent'));
    await volee;
    expect(poses).toEqual(['rapide']);
  });

  it('🔴 le REPLI aussi relit `aJour`', async () => {
    let courant = true;
    const poser = vi.fn();
    const q = quai<FederatedSearchResult>();
    const volee = chercherAuFilDeLEau(
      planDuDeuxiemeTemps([]),
      () => q.promesse,
      poser,
      () => courant,
    );
    courant = false; // l'utilisateur a tapé PENDANT l'appel
    q.livrer(reponse('qobuz'));
    await volee;
    expect(poser).not.toHaveBeenCalled();
  });
});

describe('l’écran le fait VRAIMENT', () => {
  const src = (() => {
    const { readFileSync } = require('node:fs') as typeof import('node:fs');
    const { resolve } = require('node:path') as typeof import('node:path');
    return readFileSync(resolve(process.cwd(), 'src/components/v2/SearchV2.svelte'), 'utf-8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/^\s*\/\/.*$/gm, '');
  })();

  it('🔴 il passe par le PLAN — donc il a le repli', () => {
    // Appeler `chercherAuFilDeLEau` avec un plan fabriqué sur place
    // contournerait la règle du repli.
    expect(src).toContain('planDuDeuxiemeTemps(servicesInterrogeables(statuts))');
    expect(src).toContain('chercherAuFilDeLEau(');
  });

  it('🔴 les sources viennent du PLAN, pas de l’écran', () => {
    expect(src).toContain('(sources) => api.federatedSearch(query, sources)');
  });

  it('🔴 `fed` est REMPLACÉ, jamais muté', () => {
    // Svelte 5 suit l'affectation, pas l'écriture dans l'objet : `fed[svc] = …`
    // ne redessinerait rien.
    expect(src).toContain('fed = { ...fed, [svc]: resultats }');
    expect(src).not.toMatch(/fed\[[^\]]+\]\s*=/);
  });

  it('🔴 le PREMIER temps n’a pas bougé : `busy` ne suit que le local', () => {
    const i = src.indexOf('api.searchLibrary(');
    const j = src.indexOf('deuxiemeTemps(query, mine)');
    expect(i).toBeGreaterThan(-1);
    expect(j).toBeGreaterThan(i);
    const entre = src.slice(i, j);
    expect(entre).toContain('busy = false');
    expect(entre, 'un await entre les deux les remettrait à la file').not.toContain('await ');
  });
});
