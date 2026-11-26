import { describe, expect, it, vi } from 'vitest';
import {
  FILTRES_DU_PANNEAU, PANNEAU_VIDE, epinglablesHorsPanneau, estDuPanneau, libelleSens, ligneAnneesVisible,
  LIBELLE_MODE_ANNEE, LIBELLE_COURT_AFFICHAGE, nombreFiltresDuPanneau, segmentNavigationOffert, sensInverse,
} from '../barreBibliotheque';
import { FILTRES_EPINGLABLES } from '../filtresEpinglesBibliotheque';
import { DELAI_APPUI_LONG_MS, moteurAppuiLong, type Minuterie } from '../appuiLong';
import fr from '../locales/fr';
import en from '../locales/en';

/** Harmonisation rc14 — la barre de la Bibliothèque à sept commandes. */
describe('regroupement des filtres : panneau « Filtres » et épinglage', () => {
  it('Source, Qualité, Favoris, Compilations, Incomplets vivent dans le panneau', () => {
    expect([...FILTRES_DU_PANNEAU]).toEqual(['provenance', 'quality', 'favoris', 'compilations', 'incomplets']);
    for (const f of FILTRES_DU_PANNEAU) expect(FILTRES_EPINGLABLES).toContain(f);
  });

  it('les autres filtres restent épinglables, dans leur ordre', () => {
    const dispo = FILTRES_EPINGLABLES.map((id) => ({ id, actif: id === 'rate' }));
    const reste = epinglablesHorsPanneau(dispo);
    expect(reste.map((f) => f.id)).toEqual(['recent', 'repertoire', 'pays', 'instrument', 'rate', 'dr', 'format', 'depth']);
    expect(reste.find((f) => f.id === 'rate')?.actif).toBe(true);
    expect(reste.some((f) => estDuPanneau(f.id))).toBe(false);
  });

  it('aucun filtre ne se perd : panneau + épinglables = tous les filtres', () => {
    const tous = FILTRES_EPINGLABLES.map((id) => ({ id }));
    const ids = new Set([...FILTRES_DU_PANNEAU, ...epinglablesHorsPanneau(tous).map((f) => f.id)]);
    expect(ids.size).toBe(FILTRES_EPINGLABLES.length);
  });

  it('compte les filtres posés du panneau (une qualité = un filtre)', () => {
    expect(nombreFiltresDuPanneau(PANNEAU_VIDE)).toBe(0);
    expect(nombreFiltresDuPanneau({ provenance: 'upnp', qualites: ['hires', 'lossy'], favoris: true, compilation: true, incomplets: true })).toBe(6);
    expect(nombreFiltresDuPanneau({ ...PANNEAU_VIDE, compilation: false })).toBe(1);
  });

  it('l\'état vide est figé', () => {
    expect(Object.isFrozen(PANNEAU_VIDE)).toBe(true);
  });
});

describe('ligne des années : seulement en mode Années', () => {
  const base = { tab: 'albums', frise: true, navMode: 'alpha' as const, sourcePropre: false };
  it('absente en A–Z, présente en Années', () => {
    expect(ligneAnneesVisible(base)).toBe(false);
    expect(ligneAnneesVisible({ ...base, navMode: 'years' })).toBe(true);
  });
  it('toujours sur l\'onglet Années, jamais sur une source propre', () => {
    expect(ligneAnneesVisible({ ...base, tab: 'years', frise: false })).toBe(true);
    expect(ligneAnneesVisible({ ...base, navMode: 'years', sourcePropre: true })).toBe(false);
  });
  it('mode Années retenu sans frise (niveau Essentiel) : pas de ligne', () => {
    expect(ligneAnneesVisible({ ...base, navMode: 'years', frise: false })).toBe(false);
  });
  it('le segment A–Z / Années suit la frise', () => {
    expect(segmentNavigationOffert(base)).toBe(true);
    expect(segmentNavigationOffert({ ...base, frise: false })).toBe(false);
    expect(segmentNavigationOffert({ ...base, sourcePropre: true })).toBe(false);
  });
});

describe('correspondances d\'états', () => {
  it('le sens du tri bascule et se nomme', () => {
    expect(sensInverse('desc')).toBe('asc');
    expect(sensInverse('asc')).toBe('desc');
    expect(libelleSens('desc')).toBe('v2.lib.yearNewestFirst');
    expect(libelleSens('asc')).toBe('v2.lib.yearOldestFirst');
  });
  it('chaque libellé existe en français et en anglais', () => {
    const cles = [
      ...Object.values(LIBELLE_MODE_ANNEE), ...Object.values(LIBELLE_COURT_AFFICHAGE),
      libelleSens('asc'), libelleSens('desc'),
      'v2.lib.yearChip', 'v2.lib.view', 'v2.lib.viewLayout', 'v2.lib.navigation', 'v2.lib.more',
      'v2.lib.filtres.albums', 'v2.lib.filtres.reset', 'v2.lib.filtres.voirN',
    ];
    for (const c of cles) {
      expect((fr as Record<string, string>)[c], c).toBeTruthy();
      expect((en as Record<string, string>)[c], c).toBeTruthy();
    }
    expect((en as Record<string, string>)['v2.lib.yearChip']).toContain('{mode}');
  });
});

describe('appui long (sélection au doigt)', () => {
  function minuterieManuelle() {
    let f: (() => void) | null = null;
    const m: Minuterie = { poser: (g, ms) => { expect(ms).toBe(DELAI_APPUI_LONG_MS); f = g; return 1; }, retirer: () => { f = null; } };
    return { m, ecouler: () => { const g = f; f = null; g?.(); }, pose: () => f != null };
  }
  const doigt = { pointerType: 'touch', clientX: 10, clientY: 10 };

  it('un appui tenu sélectionne, et le clic qui suit est avalé une fois', () => {
    const t = minuterieManuelle();
    const surAppui = vi.fn();
    const g = moteurAppuiLong(surAppui, t.m);
    g.baisser(doigt);
    t.ecouler();
    expect(surAppui).toHaveBeenCalledTimes(1);
    g.lever();
    expect(g.avalerClic()).toBe(true);
    expect(g.avalerClic()).toBe(false);
  });

  it('lever avant le délai : rien, et le clic passe', () => {
    const t = minuterieManuelle();
    const surAppui = vi.fn();
    const g = moteurAppuiLong(surAppui, t.m);
    g.baisser(doigt);
    g.lever();
    expect(t.pose()).toBe(false);
    expect(surAppui).not.toHaveBeenCalled();
    expect(g.avalerClic()).toBe(false);
  });

  it('le doigt qui défile annule le geste', () => {
    const t = minuterieManuelle();
    const surAppui = vi.fn();
    const g = moteurAppuiLong(surAppui, t.m);
    g.baisser(doigt);
    g.bouger({ ...doigt, clientY: 40 });
    expect(t.pose()).toBe(false);
    expect(surAppui).not.toHaveBeenCalled();
  });

  it('un petit tremblement ne l\'annule pas', () => {
    const t = minuterieManuelle();
    const g = moteurAppuiLong(() => {}, t.m);
    g.baisser(doigt);
    g.bouger({ ...doigt, clientX: 14 });
    expect(t.pose()).toBe(true);
  });

  it('à la souris, un clic maintenu reste un clic', () => {
    const t = minuterieManuelle();
    const surAppui = vi.fn();
    const g = moteurAppuiLong(surAppui, t.m);
    g.baisser({ ...doigt, pointerType: 'mouse' });
    expect(t.pose()).toBe(false);
    expect(g.avalerClic()).toBe(false);
  });
});
