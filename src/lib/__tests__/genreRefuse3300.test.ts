// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

vi.mock('../stores/notifications', () => ({
  notifications: { error: vi.fn(), info: vi.fn(), success: vi.fn(), warning: vi.fn() },
}));

import { getStreamingGenreAlbums } from '../api';
import { notifications } from '../stores/notifications';
import * as rubriques from '../rubriquesGenre';
import type { FeaturedSection } from '../types';

/**
 * #3300 — suite de tune-server-rust#9247 : un genre que TIDAL refuse rend
 * désormais un 502 au lieu d'un `200 []`. L'écran Genres avalait l'erreur
 * (`rubriquesGenre` la changeait en liste vide) et la page restait vide, ou
 * disait « aucun album », ce qui est faux.
 */

/** Une erreur de l'API telle que `fetchJSON` la lève : un `status` porté. */
const erreurApi = (status: number) => Object.assign(new Error(`HTTP ${status}`), { status });

const DEUX: FeaturedSection[] = [
  { id: 'new-releases', name: 'New Releases' },
  { id: 'best-sellers', name: 'Best Sellers' },
];

describe('le refus du genre remonte jusqu’à l’écran (#3300)', () => {
  it('sans rubrique (TIDAL) : le 502 de la liste par défaut REJETTE, il ne donne plus une liste vide', async () => {
    const charger = vi.fn(async () => { throw erreurApi(502); });
    await expect(rubriques.chargerRubriquesGenre([], charger)).rejects.toMatchObject({ status: 502 });
  });

  it('avec des rubriques toutes en erreur et une liste par défaut refusée : rejet aussi', async () => {
    const charger = vi.fn(async () => { throw erreurApi(502); });
    await expect(rubriques.chargerRubriquesGenre(DEUX, charger)).rejects.toMatchObject({ status: 502 });
  });

  it('un genre réellement vide reste une liste vide (« aucun album »)', async () => {
    await expect(rubriques.chargerRubriquesGenre([], async () => [])).resolves.toEqual([]);
  });

  it('une rubrique en erreur ne fait toujours pas tomber l’écran quand la liste par défaut répond', async () => {
    const bandes = await rubriques.chargerRubriquesGenre(DEUX, async (s) => {
      if (s !== undefined) throw erreurApi(400);
      return [{ id: 'a' }];
    });
    expect(bandes).toHaveLength(1);
  });

  it('502 = refus du service ; tout le reste = échec de lecture', () => {
    expect(rubriques.motifEchecGenre(erreurApi(502))).toBe('refuse');
    expect(rubriques.motifEchecGenre(erreurApi(500))).toBe('echec');
    expect(rubriques.motifEchecGenre(new Error('Failed to fetch'))).toBe('echec');
    expect(rubriques.motifEchecGenre(null)).toBe('echec');
    expect(rubriques.CLE_ECHEC_GENRE.refuse).toBe('streaming.genreRefused');
    expect(rubriques.CLE_ECHEC_GENRE.echec).toBe('streaming.genreLoadFailed');
  });
});

describe('api.ts — le 502 du genre ne lève pas de bandeau quand l’écran le porte', () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.mocked(notifications.error).mockClear(); });

  it('sansBandeau : erreur rejetée avec son statut, aucun « Server error »', async () => {
    vi.stubGlobal('fetch', vi.fn(async () =>
      new Response(JSON.stringify({ error: 'tidal: genre refusé (404)' }), {
        status: 502, headers: { 'Content-Type': 'application/json' },
      })));
    await expect(getStreamingGenreAlbums('tidal', 'Polish', 40, undefined, true)).rejects.toMatchObject({ status: 502 });
    expect(notifications.error).not.toHaveBeenCalled();
  });
});

describe('l’écran Streaming branche le message (#3300)', () => {
  const source = readFileSync(resolve(process.cwd(), 'src/components/v2/StreamingV2.svelte'), 'utf-8');

  it('l’erreur du chargement est lue, pas jetée', () => {
    expect(source).toContain('genreEchec = motifEchecGenre(e)');
    expect(source).toMatch(/getStreamingGenreAlbums\(svc, gid, 40, section, true\)/);
  });

  it('le message est rendu avant « aucun album », et seulement sans playlists du genre', () => {
    const iEchec = source.indexOf('{:else if genreId && genreEchec && !genrePlaylists.length}');
    const iVide = source.indexOf("$t('streaming.genreNoAlbums')");
    expect(iEchec).toBeGreaterThan(-1);
    expect(iVide).toBeGreaterThan(iEchec);
    expect(source).toContain('CLE_ECHEC_GENRE[genreEchec]');
  });

  it('les deux messages existent dans les 16 langues, avec {service} pour le refus', () => {
    const langues = ['de', 'el', 'en', 'es', 'fr', 'hu', 'it', 'ja', 'ko', 'nb', 'pl', 'ro', 'sv', 'tr', 'vi', 'zh'];
    for (const l of langues) {
      const s = readFileSync(resolve(process.cwd(), `src/lib/locales/${l}.ts`), 'utf-8');
      expect(s, l).toMatch(/"streaming\.genreRefused": ".*\{service\}.*",/);
      expect(s, l).toMatch(/"streaming\.genreLoadFailed": ".+",/);
    }
  });
});
