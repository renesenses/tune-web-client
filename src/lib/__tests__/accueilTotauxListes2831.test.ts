/**
 * tune-server-rust#8625, fil 2831 (JLuc, rc11 Windows) — l'Accueil, carte
 * « Votre bibliothèque », disait « 1 036 ALBUMS » quand Bibliothèque › Albums
 * disait « Tout (1022) ». La ligne lisait `albums` (le compte des tables) au
 * lieu de `library_totals.albums` (le total des listes), que Statistiques,
 * Oxygen et Titres lisent depuis web#2934.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const statsServeur = vi.hoisted(() => ({ valeur: null as any }));
vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return { ...actual, getLibraryStats: vi.fn(async () => statsServeur.valeur) };
});

import { widgetParId, type Contexte } from '../accueilWidgets';
import { cartes } from '../chiffresAccueil';
import fr from '../locales/fr';

// Les nombres de JLuc ; 14 albums masqués ou en double.
const AVEC_TOTAUX = {
  albums: 1036,
  artists: 500,
  tracks: 12000,
  library_totals: {
    tracks: 11950,
    albums: 1022,
    stored_tracks: 12000,
    stored_albums: 1036,
    hidden_or_duplicate_tracks: 50,
    hidden_or_duplicate_albums: 14,
  },
};
const SANS_TOTAUX = { albums: 1036, artists: 500, tracks: 12000 };

const ctx: Contexte = {
  profileId: 1, chiffresChoisis: ['albums', 'artistes', 'titres'], langue: 'fr', albums: [], zones: [],
};
const nbsp = (s: string) => s.replace(/[  ]/g, ' ');

async function ligne(stats: any) {
  statsServeur.valeur = stats;
  const w = widgetParId('statistiques')!;
  const r = await w.chiffres!(ctx);
  return Object.fromEntries(r.map((c) => [c.id, c]));
}

describe('#8625 fil 2831 — la carte « Votre bibliothèque » de l’Accueil', () => {
  beforeEach(() => { statsServeur.valeur = null; });

  it('🔴 affiche le total des listes : 1 022 albums, pas 1 036', async () => {
    const c = await ligne(AVEC_TOTAUX);
    expect(nbsp(c.albums.valeur)).toBe('1 022');
    expect(nbsp(c.titres.valeur)).toBe('11 950');
    // `library_totals` ne compte pas les artistes : ils restent tels quels.
    expect(c.artistes.valeur).toBe('500');
  });

  it('porte la même infobulle que Statistiques, écart compris', async () => {
    const c = await ligne(AVEC_TOTAUX);
    expect(c.albums.infobulle).toContain(fr['bibliotheque.totaux.infobulle']);
    expect(nbsp(c.albums.infobulle!)).toContain('1 036');
    expect(c.albums.infobulle).toContain('14');
    expect(c.albums.infobulle).not.toContain('{');
    expect(c.titres.infobulle).toBe(c.albums.infobulle);
    expect(c.artistes.infobulle).toBeUndefined();
  });

  it('un serveur sans library_totals : repli sur le compte des tables, 1 036', async () => {
    const c = await ligne(SANS_TOTAUX);
    expect(nbsp(c.albums.valeur)).toBe('1 036');
    expect(nbsp(c.titres.valeur)).toBe('12 000');
    expect(c.albums.infobulle).toBe(fr['bibliotheque.totaux.infobulle']);
  });

  it('library_totals incomplet : repli aussi, jamais de carte à 0', () => {
    const v = cartes(['albums'], { bibliotheque: { albums: 1036, library_totals: { albums: 1022 } } }, 'fr');
    expect(nbsp(v[0].texte)).toBe('1 036');
    expect(cartes(['albums'], { bibliotheque: null }, 'fr')).toEqual([]);
  });

  it('le tableau de bord sans historique lit aussi library_totals', () => {
    const src = readFileSync(resolve(process.cwd(), 'src/components/v2-heritage/DashboardHighlights.svelte'), 'utf-8');
    expect(src).toContain('lireTotaux(stats)');
    expect(src).toContain('totauxListes?.albums ?? stats.albums');
    expect(src).toContain('totauxListes?.tracks ?? stats.tracks');
    const pw = readFileSync(resolve(process.cwd(), 'src/components/v2/PageWidgets.svelte'), 'utf-8');
    expect(pw).toContain("title={c.infobulle ?? $t('v2.home.statOpen' as any)}");
  });
});
