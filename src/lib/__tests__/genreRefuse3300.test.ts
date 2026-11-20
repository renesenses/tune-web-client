// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

vi.mock('../stores/notifications', () => ({
  notifications: { error: vi.fn(), info: vi.fn(), success: vi.fn(), warning: vi.fn() },
}));

import * as api from '../api';
import { getStreamingGenreAlbums } from '../api';
import { catalogueService } from '../widgetsService';
import { notifications } from '../stores/notifications';
import * as rubriques from '../rubriquesGenre';
import type { FeaturedSection } from '../types';

/**
 * #3300 — suite de tune-server-rust#9247 : un genre que TIDAL refuse rend
 * désormais un 502 au lieu d'un `200 []`. L'écran Genres avalait l'erreur
 * (`rubriquesGenre` la changeait en liste vide) et la page restait vide, ou
 * disait « aucun album », ce qui est faux.
 */

/** Une erreur de l'API telle que `fetchJSON` la lève : un `status` porté,
 *  et le `code` du corps JSON quand le serveur en donne un. */
const erreurApi = (status: number, code?: string) =>
  Object.assign(new Error(`HTTP ${status}`), { status, ...(code ? { code } : {}) });

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

  it('seul 409 + code `genre_refuse` est un refus ; tout le reste — 502 compris — est un échec', () => {
    expect(rubriques.CODE_GENRE_REFUSE).toBe('genre_refuse');
    expect(rubriques.motifEchecGenre(erreurApi(409, 'genre_refuse'))).toBe('refuse');
    // Contre-épreuve : une panne Qobuz/Deezer/Spotify ou un délai TIDAL sort
    // en 502 (`svc_response`) — ce n'est PAS un refus du genre.
    expect(rubriques.motifEchecGenre(erreurApi(502))).toBe('echec');
    expect(rubriques.motifEchecGenre(erreurApi(502, 'genre_refuse'))).toBe('echec');
    // Un autre refus au code stable (session du service à reconnecter) non plus.
    expect(rubriques.motifEchecGenre(erreurApi(409, 'streaming_session_refused'))).toBe('echec');
    expect(rubriques.motifEchecGenre(erreurApi(409))).toBe('echec');
    expect(rubriques.motifEchecGenre(erreurApi(500))).toBe('echec');
    expect(rubriques.motifEchecGenre(new Error('Failed to fetch'))).toBe('echec');
    expect(rubriques.motifEchecGenre(null)).toBe('echec');
    expect(rubriques.CLE_ECHEC_GENRE.refuse).toBe('streaming.genreRefused');
    expect(rubriques.CLE_ECHEC_GENRE.echec).toBe('streaming.genreLoadFailed');
  });
});

describe('api.ts — l’échec du genre ne lève pas de bandeau quand l’écran le porte', () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.mocked(notifications.error).mockClear(); });

  it('409 `genre_refuse` du serveur : rejet avec statut ET code, aucun bandeau, motif `refuse`', async () => {
    vi.stubGlobal('fetch', vi.fn(async () =>
      new Response(JSON.stringify({ code: 'genre_refuse', error: 'genre_refuse', message: 'tidal 404 (2001): absent' }), {
        status: 409, headers: { 'Content-Type': 'application/json' },
      })));
    const err = await getStreamingGenreAlbums('tidal', 'Polish', 40, undefined, true).catch((e) => e);
    expect(err).toMatchObject({ status: 409, code: 'genre_refuse' });
    expect(rubriques.motifEchecGenre(err)).toBe('refuse');
    expect(rubriques.estGenreRefuse(err)).toBe(true);
    expect(notifications.error).not.toHaveBeenCalled();
  });

  it('502 en texte brut (panne du service) : motif `echec`, pas `refuse`', async () => {
    vi.stubGlobal('fetch', vi.fn(async () =>
      new Response('qobuz /genre/list: 503 Service Unavailable', { status: 502 })));
    const err = await getStreamingGenreAlbums('qobuz', '112', 40, undefined, true).catch((e) => e);
    expect(err).toMatchObject({ status: 502 });
    expect(rubriques.motifEchecGenre(err)).toBe('echec');
    expect(notifications.error).not.toHaveBeenCalled();
  });

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

  it('une PANNE se dit même si des playlists du genre sont arrivées, avant « aucun album »', () => {
    const iPanne = source.indexOf("{:else if genreId && genreEchec === 'echec'}");
    const iVide = source.indexOf("$t('streaming.genreNoAlbums')");
    expect(iPanne).toBeGreaterThan(-1);
    expect(iVide).toBeGreaterThan(iPanne);
    // Pas de condition sur les playlists : une panne n'est jamais « aucun album ».
    const ligne = source.slice(iPanne, source.indexOf('\n', iPanne));
    expect(ligne).not.toContain('genrePlaylists');
    expect(source).toContain('CLE_ECHEC_GENRE.echec');
  });

  it('le REFUS se dit sans playlists du genre ; avec elles, « aucun album » est exact', () => {
    const iRefus = source.indexOf("{:else if genreId && genreEchec === 'refuse' && !genrePlaylists.length}");
    const iPanne = source.indexOf("{:else if genreId && genreEchec === 'echec'}");
    const iVide = source.indexOf("$t('streaming.genreNoAlbums')");
    expect(iRefus).toBeGreaterThan(iPanne);
    expect(iVide).toBeGreaterThan(iRefus);
    expect(source).toContain("CLE_ECHEC_GENRE.refuse as any).replace('{service}'");
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

describe('les widgets de genre de l’accueil (#3300)', () => {
  const service = readFileSync(resolve(process.cwd(), 'src/lib/widgetsService.ts'), 'utf-8');
  const page = readFileSync(resolve(process.cwd(), 'src/components/v2/PageWidgets.svelte'), 'utf-8');

  it('demandent les albums du genre sans bandeau', () => {
    expect(service).toMatch(/getStreamingGenreAlbums\(service, gid, limiteDe\(ctx\), undefined, true\)/);
  });

  it('un genre refusé passe en « non proposé », pas en échec', () => {
    expect(page).toContain("if (estGenreRefuse(err)) { majEtat(id, { phase: 'non-propose' }); return; }");
    // Il est testé AVANT l'écriture de la phase `echec`.
    expect(page.indexOf('if (estGenreRefuse(err))')).toBeLessThan(page.indexOf("phase: 'echec',"));
  });
});

describe('le chargeur d’un widget de genre (#3300)', () => {
  afterEach(() => vi.restoreAllMocks());

  it('appelle l’API avec sansBandeau=true et laisse remonter le refus avec son code', async () => {
    vi.spyOn(api, 'getStreamingFeaturedSections').mockResolvedValue([] as any);
    vi.spyOn(api, 'getStreamingGenres').mockResolvedValue([{ id: 'Polish', name: 'Polish' }] as any);
    vi.spyOn(api, 'getStreamingFeaturedPlaylistsByTag').mockResolvedValue([] as any);
    const espion = vi.spyOn(api, 'getStreamingGenreAlbums').mockRejectedValue(erreurApi(409, 'genre_refuse'));
    const w = (await catalogueService('tidal')).find((x) => x.id === 'tidal-genre-Polish');
    expect(w).toBeDefined();
    const err = await (w as any).charger({}).catch((e: unknown) => e);
    expect(rubriques.estGenreRefuse(err)).toBe(true);
    expect(espion).toHaveBeenCalledWith('tidal', 'Polish', expect.any(Number), undefined, true);
  });
});
