// @vitest-environment jsdom
//
// #1640 — « Ajouter la facette répertoire dans Oxygen pour circonscrire la
// recherche » (fil 1963).
//
// La facette `folder` était servie par le serveur (`/library/folder-facet`) et
// rendue par le rail (`OxygenFolderFacet`), mais AUCUN chemin ne l'activait :
// absente des défauts et de toute révision d'`OXYGEN_FACETS_ADDED_BY_REV`.
// Seule une case cochée à la main, au niveau Expert, la faisait apparaître.
//
// Cette garde charge le VRAI magasin sur un `localStorage` posé à la main,
// comme celle de #1636 pour `dr`.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';

const CLE = 'tune-preferences';
/** Ce que portait une préférence née à la révision 5 sur les défauts. */
const DEFAUTS_REV5 = ['genre', 'artist', 'composer', 'label', 'year', 'format', 'sample_rate', 'bit_depth', 'dr', 'country'];

async function charger(stocke?: Record<string, unknown>) {
  localStorage.clear();
  if (stocke) localStorage.setItem(CLE, JSON.stringify(stocke));
  vi.resetModules();
  const mod = await import('../stores/preferences');
  return get(mod.preferences);
}

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

describe('#1640 — la facette Répertoire dans Oxygen', () => {
  it('une préférence NEUVE porte Répertoire', async () => {
    const p = await charger();
    expect(p.oxygenFacets).toContain('folder');
  });

  it('une préférence enregistrée à la révision 5 la reçoit, une seule fois', async () => {
    const p = await charger({ oxygenFacets: DEFAUTS_REV5, oxygenFacetsRev: 5 });
    expect(p.oxygenFacets.filter((f) => f === 'folder')).toEqual(['folder']);
    const encore = await recharger();
    expect(encore.oxygenFacets).toEqual(p.oxygenFacets);
  });

  it('une préférence plus ancienne la reçoit aussi', async () => {
    const p = await charger({ oxygenFacets: ['genre', 'artist'], oxygenFacetsRev: 2 });
    expect(p.oxygenFacets).toContain('folder');
  });

  it('décochée après la migration, elle reste décochée', async () => {
    // Révision courante, sans `folder` : le choix de l'utilisateur fait foi.
    const migree = await charger({ oxygenFacets: DEFAUTS_REV5, oxygenFacetsRev: 5 });
    const sansDossier = migree.oxygenFacets.filter((f) => f !== 'folder');
    const p = await charger({ oxygenFacets: sansDossier, oxygenFacetsRev: migree.oxygenFacetsRev });
    expect(p.oxygenFacets).not.toContain('folder');
  });

  it('elle prend sa place canonique, la dernière du rail', async () => {
    const p = await charger({ oxygenFacets: DEFAUTS_REV5, oxygenFacetsRev: 5 });
    expect(p.oxygenFacets[p.oxygenFacets.length - 1]).toBe('folder');
  });
});
