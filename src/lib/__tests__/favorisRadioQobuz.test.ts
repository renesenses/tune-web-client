/**
 * Favoris radio → playlist Qobuz (go de Bertrand du 14/10/2026).
 *
 * Deux étages :
 *  - les RÈGLES de choix (`lib/favorisRadioQobuz.ts`) : ce qui est coché à
 *    l'ouverture, ce qui part au serveur ;
 *  - le BRANCHEMENT : l'appel d'aperçu, l'appel de création avec
 *    `track_ids`, et le bouton de l'écran Favoris — un module bien testé mais
 *    jamais appelé ne livrerait rien.
 *
 * Aucun appel réseau : `fetch` est simulé.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  candidatsDe,
  choixInitial,
  cleBadge,
  nomParDefaut,
  selectionnable,
  titresRetenus,
  type LigneApercu,
} from '../favorisRadioQobuz';

const piste = (id: string, title: string, artist: string, score = 0.95) => ({
  id,
  title,
  artist,
  album: 'Album',
  score,
});

function ligne(p: Partial<LigneApercu> & { favorite_id: number }): LigneApercu {
  return {
    title: 't',
    artist: 'a',
    station_name: 'FIP',
    cover_url: null,
    status: 'matched',
    match: null,
    alternatives: [],
    duplicate_of: null,
    ...p,
  };
}

const LIGNES: LigneApercu[] = [
  ligne({ favorite_id: 1, title: 'La Bohème', status: 'matched', match: piste('101', 'La Bohème', 'Charles Aznavour') }),
  ligne({ favorite_id: 2, title: 'Under the Strikes (feat. Tony Allen)', status: 'matched', match: piste('102', 'Under The Strikes', 'Yannis & The Yaw') }),
  ligne({ favorite_id: 3, title: 'Nightswimming', status: 'approximate', match: piste('103', 'Nights', 'R.E.M.', 0.63) }),
  ligne({
    favorite_id: 4,
    title: 'Hallelujah',
    artist: '',
    status: 'ambiguous',
    match: piste('105', 'Hallelujah', 'Jeff Buckley', 0.9),
    alternatives: [piste('106', 'Hallelujah', 'Leonard Cohen', 0.9)],
  }),
  ligne({ favorite_id: 5, title: 'Introuvable', status: 'not_found', match: null }),
  ligne({ favorite_id: 6, title: 'La Bohème', status: 'matched', match: piste('101', 'La Bohème', 'Charles Aznavour'), duplicate_of: 1 }),
];

describe('règles de choix', () => {
  it('seules les correspondances sûres et non doublons sont cochées à l’ouverture', () => {
    expect(choixInitial(LIGNES)).toEqual({ 1: '101', 2: '102', 3: null, 4: null, 5: null, 6: null });
  });

  it('un introuvable ne se coche pas ; une ambiguïté propose ses candidats', () => {
    expect(selectionnable(LIGNES[4])).toBe(false);
    expect(candidatsDe(LIGNES[3]).map((p) => p.id)).toEqual(['105', '106']);
  });

  it('les titres envoyés suivent l’ordre des favoris, sans doublon', () => {
    const choix = { ...choixInitial(LIGNES), 4: '106', 6: '101' };
    expect(titresRetenus(LIGNES, choix)).toEqual(['101', '102', '106']);
  });

  it('un choix absent des candidats montrés n’est pas envoyé', () => {
    expect(titresRetenus(LIGNES, { 1: '999' })).toEqual([]);
  });

  it('chaque cas douteux porte son badge', () => {
    expect(LIGNES.map(cleBadge)).toEqual([
      null,
      null,
      'v2.fav.qobuzApprox',
      'v2.fav.qobuzAmbiguous',
      'v2.fav.qobuzNotFound',
      'v2.fav.qobuzDuplicate',
    ]);
  });

  it('le nom proposé porte la date du jour, et reste un texte modifiable', () => {
    const d = new Date(2026, 9, 14);
    expect(nomParDefaut('Favoris radio — {date}', d, 'fr')).toBe('Favoris radio — 14/10/2026');
    expect(nomParDefaut('Radio favorites — {date}', d, 'en')).toBe('Radio favorites — 10/14/2026');
  });
});

describe('appels au serveur', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('l’aperçu et la création parlent aux bonnes routes, avec `track_ids`', async () => {
    const appels: { url: string; corps: any }[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init: any) => {
        appels.push({ url: String(url), corps: init?.body ? JSON.parse(init.body) : null });
        return new Response(JSON.stringify({ items: [], playlist_id: 'p', added: 2 }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }),
    );
    const api = await import('../api');
    await api.previewRadioFavoritesMatch();
    await api.createPlaylistFromRadioSelection('qobuz', 'Favoris radio — 14/10/2026', ['101', '102']);
    expect(appels[0].url).toMatch(/\/radio-favorites\/match-preview$/);
    expect(appels[0].corps).toEqual({ service: 'qobuz', limit: 200 });
    expect(appels[1].url).toMatch(/\/radio-favorites\/create-playlist$/);
    expect(appels[1].corps).toEqual({
      service: 'qobuz',
      playlist_name: 'Favoris radio — 14/10/2026',
      track_ids: ['101', '102'],
    });
  });
});

describe('branchement dans l’écran Favoris', () => {
  const lire = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf-8');
  const fav = lire('src/components/v2/FavoritesV2.svelte');
  const modale = lire('src/components/v2/FavorisRadioQobuzModale.svelte');

  it('le bouton n’apparaît que si Qobuz est actif ET connecté', () => {
    expect(fav).toContain('qobuzPret = !!(q?.enabled && q?.authenticated)');
    expect(fav).toMatch(/\{#if qobuzPret\}\s*<button[^>]*creationQobuz = true/);
    expect(fav).toContain('<FavorisRadioQobuzModale');
  });

  it('la modale demande l’aperçu, puis crée avec les titres retenus', () => {
    expect(modale).toContain('api\n      .previewRadioFavoritesMatch(SERVICE)');
    expect(modale).toContain('api.createPlaylistFromRadioSelection(SERVICE, n, retenus)');
    expect(modale).toContain('titresRetenus(lignes, choix)');
    expect(modale).toContain("const SERVICE = 'qobuz'");
  });
});
