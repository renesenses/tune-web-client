// @vitest-environment jsdom
/**
 * #1470 — « # écoutes » et « Dernière écoute » cochées d'office (go de
 * Bertrand, 12/10/2026), pour un navigateur ou un profil NEUF seulement.
 *
 * Deux choses à prouver, et la seconde compte autant que la première :
 *  1. sans préférence enregistrée, les deux colonnes sont retenues dans les
 *     trois modes (Débutant, Avancé, Expert) ;
 *  2. une liste de colonnes DÉJÀ enregistrée par l'utilisateur pour un mode
 *     n'est pas écrasée par le nouveau défaut.
 *
 * Le magasin est réimporté à neuf (`vi.resetModules()`) : `loadPrefs()` tourne
 * à l'import, et refaire la fusion à la main dans le test ne prouverait rien.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';
import { DEFAUTS, colonnesRetenues } from '../colonnesPistes';

const MODES = ['beginner', 'intermediate', 'expert'] as const;

async function magasinFrais(stocke?: unknown) {
  if (stocke === undefined) localStorage.removeItem('tune-preferences');
  else localStorage.setItem('tune-preferences', JSON.stringify(stocke));
  vi.resetModules();
  const mod = await import('../stores/preferences');
  return get(mod.preferences);
}

afterEach(() => {
  localStorage.removeItem('tune-preferences');
});

describe('#1470 — colonnes d’écoute cochées d’office', () => {
  it.each(MODES)('le défaut du mode %s porte « # écoutes » et « Dernière écoute »', (mode) => {
    expect(DEFAUTS[mode]).toContain('plays');
    expect(DEFAUTS[mode]).toContain('lastPlayed');
    const rendues = colonnesRetenues(DEFAUTS[mode], mode).map((c) => c.cle);
    expect(rendues).toContain('plays');
    expect(rendues).toContain('lastPlayed');
  });

  it('un navigateur neuf (aucune préférence) les reçoit dans les trois modes', async () => {
    const p = await magasinFrais();
    for (const mode of MODES) {
      expect(p.v2Colonnes[mode], mode).toContain('plays');
      expect(p.v2Colonnes[mode], mode).toContain('lastPlayed');
    }
  });

  it('des préférences anciennes SANS `v2Colonnes` les reçoivent aussi', async () => {
    const p = await magasinFrais({ settingsLevel: 'expert' });
    expect(p.v2Colonnes.expert).toContain('plays');
    expect(p.v2Colonnes.expert).toContain('lastPlayed');
  });

  it('🔴 une liste déjà enregistrée par l’utilisateur n’est PAS écrasée', async () => {
    const choix = ['num', 'title', 'artist', 'time'];
    const p = await magasinFrais({
      settingsLevel: 'expert',
      v2Colonnes: { expert: choix, beginner: ['title'] },
    });
    expect(p.v2Colonnes.expert).toEqual(choix);
    expect(p.v2Colonnes.beginner).toEqual(['title']);
    // Le mode jamais réglé, lui, prend le nouveau défaut.
    expect(p.v2Colonnes.intermediate).toEqual(DEFAUTS.intermediate);
    expect(p.v2Colonnes.intermediate).toContain('plays');
  });
});
