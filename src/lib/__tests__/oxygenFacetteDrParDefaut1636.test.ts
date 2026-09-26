// @vitest-environment jsdom
//
// #1636 — « la vue Dynamic Range n'apparaît plus dans la vue Oxygène »
// (Patatorz, fil 1961).
//
// `dr` manquait aux facettes PAR DÉFAUT, et la révision 4 ne l'ajoutait
// qu'aux préférences antérieures : une préférence née à la révision 4
// (navigateur neuf, autre adresse, données effacées) n'avait jamais DR.
//
// Cette garde charge le VRAI magasin sur un `localStorage` posé à la main,
// puis lit ce qu'il en fait. Elle n'établit pas que c'est la cause chez le
// testeur : c'est un mécanisme lu dans le code, pas observé chez lui.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';

const CLE = 'tune-preferences';
/** Les défauts livrés jusqu'à la révision 4, sans `dr`. */
const DEFAUTS_REV4 = ['genre', 'artist', 'composer', 'label', 'year', 'format', 'sample_rate', 'bit_depth', 'country'];
/** Ce que porte une préférence migrée depuis la révision 0 : les défauts
 *  plus tout ce que les révisions 1 à 4 ont ajouté. */
const MIGREE_REV4 = [...DEFAUTS_REV4, 'dr', 'favorite', 'playlist', 'untagged', 'original_year'];

async function charger(stocke?: Record<string, unknown>) {
  localStorage.clear();
  if (stocke) localStorage.setItem(CLE, JSON.stringify(stocke));
  vi.resetModules();
  const mod = await import('../stores/preferences');
  return get(mod.preferences);
}

/** Relit ce que le magasin a réécrit, comme le ferait un rechargement. */
async function recharger() {
  const brut = localStorage.getItem(CLE);
  vi.resetModules();
  if (brut) localStorage.setItem(CLE, brut);
  const mod = await import('../stores/preferences');
  return get(mod.preferences);
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 200 })));
});

afterEach(() => {
  vi.unstubAllGlobals();
  try { localStorage.clear(); } catch { /* mode privé */ }
});

describe('#1636 — la facette DR dans Oxygen', () => {
  it('une préférence NEUVE porte DR', async () => {
    const p = await charger();
    expect(p.oxygenFacets).toContain('dr');
  });

  it('une liste enregistrée vide retombe sur des défauts qui portent DR', async () => {
    const p = await charger({ oxygenFacets: [], oxygenFacetsRev: 4 });
    expect(p.oxygenFacets).toContain('dr');
  });

  it('une ancienne révision reçoit DR, une seule fois', async () => {
    const p = await charger({ oxygenFacets: ['genre', 'artist', 'year'], oxygenFacetsRev: 3 });
    expect(p.oxygenFacets.filter((f) => f === 'dr')).toEqual(['dr']);
    // Rechargée, la liste ne bouge plus : pas de second ajout.
    const encore = await recharger();
    expect(encore.oxygenFacets).toEqual(p.oxygenFacets);
  });

  it('une préférence NÉE à la révision 4 sur les défauts sans DR le reçoit', async () => {
    // Le cas du testeur, si c'est bien celui-là : défauts de la révision 4,
    // jamais retouchés.
    const p = await charger({ oxygenFacets: DEFAUTS_REV4, oxygenFacetsRev: 4 });
    expect(p.oxygenFacets).toContain('dr');
    // Et dans l'ordre canonique du rail : après bit_depth.
    expect(p.oxygenFacets.indexOf('dr')).toBeGreaterThan(-1);
    expect(p.oxygenFacets.indexOf('dr')).toBe(p.oxygenFacets.indexOf('bit_depth') + 1);
  });

  it('DR décoché exprès à la révision 4 reste décoché', async () => {
    const sansDr = MIGREE_REV4.filter((f) => f !== 'dr');
    const p = await charger({ oxygenFacets: sansDr, oxygenFacetsRev: 4 });
    expect(p.oxygenFacets).not.toContain('dr');
    expect((await recharger()).oxygenFacets).not.toContain('dr');
  });

  it('DR décoché exprès après la migration reste décoché', async () => {
    // Une préférence neuve porte DR ; l'utilisateur le décoche.
    await charger();
    const brut = JSON.parse(localStorage.getItem(CLE) ?? '{}');
    brut.oxygenFacets = brut.oxygenFacets.filter((f: string) => f !== 'dr');
    localStorage.setItem(CLE, JSON.stringify(brut));
    const p = await recharger();
    expect(p.oxygenFacets).not.toContain('dr');
    // Même quand ce qui reste est exactement l'ancienne liste par défaut :
    // à la révision courante, c'est un choix, pas une empreinte.
    expect([...p.oxygenFacets].sort()).toEqual([...DEFAUTS_REV4].sort());
    expect((await recharger()).oxygenFacets).not.toContain('dr');
  });
});
