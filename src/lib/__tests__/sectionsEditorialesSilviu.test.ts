import { describe, expect, it, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { get } from 'svelte/store';
import { locale, t } from '../i18n';
import * as locales from './lesOnzeLangues';

vi.mock('../api', () => ({
  getStreamingFeaturedSections: vi.fn(),
  getStreamingGenres: vi.fn(async () => []),
  getStreamingFeaturedPlaylistsByTag: vi.fn(async () => []),
  getStreamingFeaturedPlaylists: vi.fn(async () => []),
  getStreamingNewReleases: vi.fn(async () => []),
  getStreamingFeatured: vi.fn(async () => []),
  getStreamingGenreAlbums: vi.fn(async () => []),
  getStreamingFavorites: vi.fn(async () => []),
  getStreamingPlaylists: vi.fn(async () => []),
  play: vi.fn(),
}));

import * as api from '../api';
import { catalogueService, cleSectionEditoriale, SECTIONS_TRADUITES } from '../widgetsService';

/**
 * Garde : les intitulés de rangée de l'écran ÉDITORIAL qui nous appartiennent
 * sont des clés de traduction.
 *
 * ── LA CAPTURE ──────────────────────────────────────────────────────────
 *
 * Silviu, testeur roumain, v0.9.161, écran éditorial Qobuz (compte « Qobuz
 * UK ») : le chrome est en roumain, les intitulés de rangée disent
 * « Histoires de labels », « Les Pépites de l'équipe », « Nouveautés »,
 * « Artistes », « Dans le casque de… ».
 *
 * ── DEUX ORIGINES, DEUX REMÈDES ─────────────────────────────────────────
 *
 * 1. Les SEPT sections de `featured/sections` ne viennent pas de Qobuz : le
 *    serveur les écrit lui-même, en ANGLAIS et en dur
 *    (`tune-core/src/streaming/qobuz.rs:2379-2411`). Dans une interface
 *    roumaine elles s'affichaient donc en anglais — même défaut, autre
 *    langue. Leur `id` est stable : c'est NOTRE libellé, il devient une clé.
 *    C'est ce que ce test tient.
 *
 * 2. Les CATÉGORIES de playlists (« Histoires de labels », « Les Pépites de
 *    l'équipe »…) viennent de Qobuz, et le serveur PRÉFÈRE le français en les
 *    dépaquetant — `qobuz.rs:2517-2523`, `obj.get("fr").or_else(…)`. Aucune
 *    table côté client ne répare ça honnêtement : leurs identifiants sont des
 *    slugs Qobuz qu'on n'a pas mesurés en production, et inventer la
 *    correspondance serait deviner. Le dernier bloc CONSTATE que le client
 *    les rend telles quelles, pour que le correctif reste identifié comme
 *    serveur.
 */

type Dict = Record<string, string | undefined>;
const DICTS = locales as unknown as Record<string, Dict>;
const LANGUES = ['fr', 'en', 'de', 'es', 'it', 'zh', 'ja', 'ko', 'ro', 'sv', 'hu'] as const;

/** Les sept sections exactement telles que le serveur les écrit. */
const SECTIONS_DU_SERVEUR = [
  { id: 'new-releases', name: 'New Releases' },
  { id: 'best-sellers', name: 'Best Sellers' },
  { id: 'press-awards', name: 'Press Awards' },
  { id: 'editor-picks', name: 'Editor Picks' },
  { id: 'most-streamed', name: 'Most Streamed' },
  { id: 'ideal-discography', name: 'Ideal Discography' },
  { id: 'qobuzissims', name: 'Qobuzissimes' },
];

describe('sections éditoriales — capture Silviu (roumain, v0.9.161)', () => {
  beforeEach(() => {
    vi.mocked(api.getStreamingFeaturedSections).mockResolvedValue(SECTIONS_DU_SERVEUR as any);
  });

  it('donne une clé de traduction aux six sections dont le nom est à nous', () => {
    for (const id of SECTIONS_TRADUITES) {
      const cle = cleSectionEditoriale(id);
      expect(cle, id).toBeTruthy();
      for (const langue of LANGUES) {
        expect(DICTS[langue][cle!], `${cle} manque dans ${langue}.ts`).toBeTruthy();
      }
    }
    expect(SECTIONS_TRADUITES).toHaveLength(6);
  });

  it('le catalogue ne porte plus le nom ANGLAIS du serveur pour ces six-là', async () => {
    const w = await catalogueService('qobuz');
    const sections = w.filter((x) => x.id.startsWith('qobuz-sec-'));
    expect(sections).toHaveLength(7);

    const parId = new Map(sections.map((x) => [x.id, x.cleTitre]));
    expect(parId.get('qobuz-sec-new-releases')).toBe('v2.svc.sec.newReleases');
    expect(parId.get('qobuz-sec-best-sellers')).toBe('v2.svc.sec.bestSellers');
    expect(parId.get('qobuz-sec-press-awards')).toBe('v2.svc.sec.pressAwards');
    expect(parId.get('qobuz-sec-editor-picks')).toBe('v2.svc.sec.editorPicks');
    expect(parId.get('qobuz-sec-most-streamed')).toBe('v2.svc.sec.mostStreamed');
    expect(parId.get('qobuz-sec-ideal-discography')).toBe('v2.svc.sec.idealDiscography');

    for (const brut of ['New Releases', 'Best Sellers', 'Press Awards',
      'Editor Picks', 'Most Streamed', 'Ideal Discography']) {
      expect([...parId.values()], brut).not.toContain(brut);
    }
  });

  it('rend les six intitulés en roumain', async () => {
    locale.set('ro');
    const tr = get(t);
    const w = await catalogueService('qobuz');
    const rendus = w
      .filter((x) => x.id.startsWith('qobuz-sec-') && x.id !== 'qobuz-sec-qobuzissims')
      .map((x) => tr(x.cleTitre));

    expect(rendus).toEqual([
      'Noutăți', 'Cele mai vândute', 'Premii ale presei',
      'Alegerile redacției', 'Cele mai ascultate', 'Discoteca ideală',
    ]);
    locale.set('fr');
  });

  it('laisse « Qobuzissimes » tel quel — c’est une marque, pas une phrase', async () => {
    expect(cleSectionEditoriale('qobuzissims')).toBeNull();
    const w = await catalogueService('qobuz');
    const q = w.find((x) => x.id === 'qobuz-sec-qobuzissims');
    expect(q?.cleTitre).toBe('Qobuzissimes');
  });

  it('retombe sur le nom du service pour une section inconnue', async () => {
    vi.mocked(api.getStreamingFeaturedSections).mockResolvedValue(
      [{ id: 'tidal-page-abc', name: 'Rising' }] as any,
    );
    const w = await catalogueService('tidal');
    const s = w.find((x) => x.id === 'tidal-sec-tidal-page-abc');
    // Surtout pas `v2.svc.sec.tidal-page-abc`, qui s'afficherait tel quel.
    expect(s?.cleTitre).toBe('Rising');
    expect(cleSectionEditoriale('tidal-page-abc')).toBeNull();
  });
});

describe('ce qui reste au SERVEUR — les catégories de playlists Qobuz', () => {
  /**
   * Constat, pas correctif. Le nom d'une catégorie est celui que le SERVICE
   * envoie ; le serveur le choisit en français (`qobuz.rs:2519`). Le client
   * ne doit pas fabriquer une table de slugs Qobuz qu'il n'a pas mesurés.
   */
  it('rend la catégorie telle que le service la nomme', async () => {
    vi.mocked(api.getStreamingFeaturedSections).mockResolvedValue([] as any);
    vi.mocked(api.getStreamingFeaturedPlaylistsByTag).mockResolvedValue(
      [{ id: 'label', name: 'Histoires de labels', playlists: [{ id: 1, name: 'x' }] }] as any,
    );
    const w = await catalogueService('qobuz');
    const g = w.find((x) => x.id === 'qobuz-tag-label');
    expect(g?.cleTitre).toBe('Histoires de labels');
  });
});

describe('l’écran Streaming — deux messages vides restés en français', () => {
  /**
   * Trouvés en balayant la MÊME page que la capture 4, avec la forme que
   * `check-i18n` ne voit pas : du texte collé à une accolade
   * (`Aucun favori dans votre compte {label(active)}.`). Sa forme `VISIBLE`
   * s'arrête aux accolades, exactement comme pour « {n} à suivre » sur la
   * file d'attente.
   */
  const SOURCE = readFileSync(
    resolve(__dirname, '../../..', 'src/components/v2/StreamingV2.svelte'), 'utf8');

  it('ne dit plus « Aucune playlist dans votre compte » en dur', () => {
    expect(SOURCE).not.toContain('Aucune playlist dans votre compte');
    expect(SOURCE).toContain("'v2.str.noPlaylistsInAccount'");
  });

  it('ne dit plus « Aucun favori dans votre compte » en dur', () => {
    expect(SOURCE).not.toContain('Aucun favori dans votre compte');
    expect(SOURCE).toContain("'v2.str.noFavoritesInAccount'");
  });

  it('les deux clés existent dans les onze langues, avec leur jeton {s}', () => {
    for (const cle of ['v2.str.noPlaylistsInAccount', 'v2.str.noFavoritesInAccount']) {
      for (const langue of LANGUES) {
        const v = DICTS[langue][cle];
        expect(v, `${cle} manque dans ${langue}.ts`).toBeTruthy();
        expect(v, `${cle} perd {s} en ${langue}`).toContain('{s}');
      }
    }
  });
});
