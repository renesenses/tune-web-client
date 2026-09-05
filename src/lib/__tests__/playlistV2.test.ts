import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

const lire = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf-8');
const sansCommentaires = (s: string) =>
  s.replace(/<!--[\s\S]*?-->/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

describe('Playlists v2 (Bertrand, 05/09/2026)', () => {
  const pl = sansCommentaires(lire('src/components/v2/PlaylistDetailV2.svelte'));
  const api = sansCommentaires(lire('src/lib/api.ts'));

  it("l'édition n'est plus réservée au niveau EXPERT", () => {
    // Renommer, supprimer et retirer une piste existaient, mais tous derrière
    // le niveau expert et sans rien pour les annoncer. Modifier sa propre
    // playlist est le geste ordinaire de qui en tient une.
    expect(pl).toContain('let edition = $state(false)');
    expect(pl).toContain("{#if edition && isLocal}");
    expect(pl, "le niveau ne commande plus l'édition").not.toContain('showExpert');
  });

  it('un MODE, pas trois boutons permanents', () => {
    // Suppression et croix de retrait sont destructrices : elles n'ont pas leur
    // place dans l'écran de lecture.
    expect(pl).toContain('v2.pl.edit');
    expect(pl).toContain('v2.pl.editDone');
    expect(pl).toContain('class:on={edition}');
  });

  it("une playlist de SERVICE ne prétend pas s'éditer, et on DIT pourquoi", () => {
    expect(pl).toContain('v2.pl.remoteHint');
    expect(pl).toContain('{#if !isLocal}');
  });

  it('le cœur couvre les DEUX espaces d’identifiants', () => {
    // « ET bouton favori sur la playlist ?? » — il n'y en avait aucun. Une
    // playlist locale vit par son `id`, celle d'un service par la paire
    // service + `source_id`, dans deux tables distinctes (#1478).
    expect(pl).toContain('basculerFavoriLocal({ playlistId: item.pl.id })');
    expect(pl).toContain("itemType: 'playlist'");
    expect(pl).toContain('favoritePlaylistIds');
    expect(pl).toContain('favoriteStreamingKeys');
  });

  it("l'export existe, et il ne vise que les playlists locales", () => {
    // La route ne connaît que les playlists locales : une playlist de service
    // n'a pas d'identifiant chez nous.
    expect(pl).toContain('v2.pl.export');
    expect(pl).toContain('api.exportPlaylist(item.pl.id');
    const i = pl.indexOf('async function exporter()');
    expect(pl.slice(i, i + 200)).toContain("item.kind !== 'local'");
  });

  it("le nom du fichier vient du SERVEUR, pas d'une recomposition", () => {
    // Il l'assainit déjà ; un nom de playlist peut contenir des caractères
    // qu'un système de fichiers refuse.
    const i = api.indexOf('export async function exportPlaylist');
    expect(i).toBeGreaterThan(-1);
    const corps = api.slice(i, i + 900);
    expect(corps).toContain("res.headers.get('content-disposition')");
    expect(corps).toContain('/filename="?([^";]+)"?/i');
    // M3U par défaut : le format qu'un autre lecteur saura relire.
    expect(corps).toContain("format: 'm3u' | 'json' | 'csv' = 'm3u'");
    expect(corps).toContain("format === 'm3u' ? '' :");
  });
});

describe("Pistes de service : la source, sans laquelle rien n'est désignable", () => {
  const api = sansCommentaires(lire('src/lib/api.ts'));

  it('les routes qui CONNAISSENT le service le posent sur les pistes', () => {
    // « Où sont les boutons d'action par piste ? » sur une playlist Qobuz :
    // nulle part. Mesuré sur le .18 — la piste arrive avec `source: null` et
    // seulement un `source_id`. Une piste distante se désigne par la PAIRE :
    // sans la source, elle n'est ni jouable, ni enfilable, ni favorisable, et
    // la barre se retirait entièrement. Elle avait raison ; la donnée était
    // incomplète.
    expect(api).toContain('function mapStreamingTracks(tracks: any[], service?: string)');
    expect(api).toContain('if (service && !(p as any).source) (p as any).source = service');
    // Les trois routes qui connaissent le service le passent.
    expect((api.match(/mapStreamingTracks\(t, service\)/g) ?? []).length).toBe(2);
    expect(api).toContain('mapStreamingTracks(data.tracks, service)');
  });

});

describe('getStreamingPlaylistTracks : comportement observé', () => {
  let api: typeof import('../api');
  beforeEach(async () => {
    vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => {}, removeItem: () => {} });
    vi.resetModules();
    api = await import('../api');
  }, 60_000);
  afterEach(() => vi.restoreAllMocks());

  function reponse(body: unknown) {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true, status: 200, statusText: 'OK',
      headers: new Map([['content-type', 'application/json']]),
      json: async () => body, text: async () => JSON.stringify(body),
    } as unknown as Response)));
  }

  it("pose le service quand la piste n'a pas de source", async () => {
    // La forme exacte mesurée sur le .18 : ni `id`, ni `source`.
    reponse([{ title: 'Champ magnétique', source_id: '55816716', duration_ms: 224000 }]);
    const t = await api.getStreamingPlaylistTracks('qobuz', '69142842');
    expect(t[0].source).toBe('qobuz');
    expect(t[0].source_id).toBe('55816716');
  });

  it('une piste qui porte DÉJÀ sa source garde la sienne', async () => {
    // Un agrégateur peut rendre du Tidal sous une route Qobuz.
    reponse([{ title: 'x', source_id: '1', source: 'tidal' }]);
    const t = await api.getStreamingPlaylistTracks('qobuz', '1');
    expect(t[0].source).toBe('tidal');
  });

  it("l'album d'un service est couvert par la même règle", async () => {
    reponse([{ title: 'y', source_id: '2' }]);
    const t = await api.getStreamingAlbumTracks('tidal', '2');
    expect(t[0].source).toBe('tidal');
  });
});
