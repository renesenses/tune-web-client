/**
 * web#3118 — « Parce que vous aimez <artiste> » (FabienM, fil 2864 ; go de
 * Bertrand le 16/11/2026, rc13 ; 20 titres et 3 jours le 17/11/2026).
 *
 * Gardes : la traduction des titres du serveur en pistes jouables, l'ordre
 * conservé à l'enregistrement (segments homogènes), le widget dans le registre
 * mais HORS du défaut, et ses libellés dans toutes les langues.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getBecauseYouLike: vi.fn(),
  createPlaylist: vi.fn(),
  addPlaylistTracks: vi.fn(),
  play: vi.fn(),
  addToQueue: vi.fn(),
}));
vi.mock('../api', async (orig) => ({ ...(await orig<any>()), ...mocks }));

import {
  EnregistrementPartiel,
  chargerPlaylistsGenerees,
  enregistrerPlaylistGeneree,
  lirePlaylistGeneree,
  segments,
  texteVoisins,
  versPistes,
  type PlaylistGeneree,
} from '../parceQueVousAimez';
import { DISPOSITION_DEFAUT, widgetParId } from '../accueilWidgets';

function playlist(): PlaylistGeneree {
  return {
    id: 'pvaa-1',
    artist: 'Miles Davis',
    track_count: 4,
    similar_artists: ['John Coltrane', 'Ghost', 'Bill Evans', 'Herbie Hancock'],
    covers: ['/c/1.jpg'],
    sources: ['local', 'qobuz'],
    tracks: [
      { source: 'local', track_id: 11, title: 'So What', artist_name: 'Miles Davis', duration_ms: 1000 },
      { source: 'local', track_id: 12, title: 'Naima', artist_name: 'John Coltrane', duration_ms: 1000 },
      { source: 'qobuz', source_id: 'q1', title: 'Boo', artist_name: 'Ghost', duration_ms: 1000 },
      { source: 'local', track_id: 13, title: 'Peace Piece', artist_name: 'Bill Evans', duration_ms: 1000 },
    ],
  };
}

beforeEach(() => {
  for (const m of Object.values(mocks)) m.mockReset();
});

describe('parce que vous aimez — client', () => {
  it('traduit les titres en pistes : locales par id, de service par la paire', () => {
    const p = versPistes(playlist());
    expect(p.map((t: any) => t.id ?? t.source_id)).toEqual([11, 12, 'q1', 13]);
    expect((p[2] as any).source).toBe('qobuz');
  });

  it('enregistre dans l’ORDRE composé, par segments homogènes', async () => {
    expect(segments(playlist()).map((s) => [s.ids, s.services.map((x) => x.source_id)])).toEqual([
      [[11, 12], []],
      [[], ['q1']],
      [[13], []],
    ]);
    mocks.createPlaylist.mockResolvedValue({ id: 7 });
    mocks.addPlaylistTracks.mockResolvedValue({});
    const id = await enregistrerPlaylistGeneree(playlist(), 'Parce que vous aimez Miles Davis');
    expect(id).toBe(7);
    expect(mocks.createPlaylist).toHaveBeenCalledWith('Parce que vous aimez Miles Davis', undefined);
    expect(mocks.addPlaylistTracks.mock.calls.map((c) => [c[0], c[1], (c[3] ?? []).length])).toEqual([
      [7, [11, 12], 0],
      [7, [], 1],
      [7, [13], 0],
    ]);
  });

  it('un ajout qui échoue après la création lève un enregistrement PARTIEL, avec la playlist', async () => {
    mocks.createPlaylist.mockResolvedValue({ id: 9 });
    mocks.addPlaylistTracks.mockResolvedValueOnce({}).mockRejectedValueOnce(new Error('503'));
    const e = await enregistrerPlaylistGeneree(playlist(), 'X').catch((x) => x);
    expect(e).toBeInstanceOf(EnregistrementPartiel);
    expect((e as EnregistrementPartiel).playlistId).toBe(9);
    const modale = readFileSync(resolve(__dirname, '../../components/v2/PlaylistGenereeV2.svelte'), 'utf8');
    expect(modale).toMatch(/api\.deletePlaylist\(partielle\.id\)/);
    expect(modale).toContain('formatDuration(playlist.duration_ms');
  });

  it('refuse d’ajouter des titres à une playlist que le serveur n’a pas créée', async () => {
    mocks.createPlaylist.mockResolvedValue({});
    await expect(enregistrerPlaylistGeneree(playlist(), 'X')).rejects.toThrow();
    expect(mocks.addPlaylistTracks).not.toHaveBeenCalled();
  });

  it('« Lire » lance la tête et enfile la suite sur la zone donnée', async () => {
    mocks.play.mockResolvedValue({});
    mocks.addToQueue.mockResolvedValue({});
    const n = await lirePlaylistGeneree(3, playlist());
    expect(n).toBe(4);
    expect(mocks.play.mock.calls[0][0]).toBe(3);
    expect(mocks.addToQueue.mock.calls[0][0]).toBe(3);
  });

  it('ignore les réponses mal formées et les playlists vides', async () => {
    mocks.getBecauseYouLike.mockResolvedValue({ playlists: [playlist(), { artist: 'X', tracks: [] }, null] });
    expect((await chargerPlaylistsGenerees()).map((p) => p.artist)).toEqual(['Miles Davis']);
    mocks.getBecauseYouLike.mockResolvedValue({});
    expect(await chargerPlaylistsGenerees()).toEqual([]);
  });

  it('20 titres, renouvelés tous les 3 jours : la période du serveur suit chaque playlist', async () => {
    const vingt = { ...playlist(), track_count: 20, tracks: Array.from({ length: 20 }, (_, i) => ({ source: 'local', track_id: i + 1, title: `T${i}` })) };
    mocks.getBecauseYouLike.mockResolvedValue({ date: '2026-11-16', refresh_days: 3, playlists: [vingt] });
    const [p] = await chargerPlaylistsGenerees();
    expect(p.refresh_days).toBe(3);
    expect(versPistes(p)).toHaveLength(20);
    const w = widgetParId('parce-que-vous-aimez');
    const [el] = await w!.charger({} as any);
    expect(el.nbTitres).toBe(20);
    // Serveur sans `refresh_days` : rien n'est inventé.
    mocks.getBecauseYouLike.mockResolvedValue({ playlists: [vingt] });
    expect((await chargerPlaylistsGenerees())[0].refresh_days).toBeNull();
  });

  it('la ligne « avec » nomme trois voisins au plus', () => {
    expect(texteVoisins(playlist(), 'avec {artistes}')).toBe('avec John Coltrane, Ghost, Bill Evans');
    expect(texteVoisins({ ...playlist(), similar_artists: [] }, 'avec {artistes}')).toBeNull();
  });
});

describe('parce que vous aimez — widget', () => {
  it('est au registre, en bande, masqué vide, et HORS du défaut', async () => {
    const w = widgetParId('parce-que-vous-aimez');
    expect(w?.forme).toBe('bande');
    expect(w?.masqueSiVide).toBe(true);
    expect(DISPOSITION_DEFAUT).not.toContain('parce-que-vous-aimez');
    mocks.getBecauseYouLike.mockResolvedValue({ playlists: [playlist()] });
    const els = await w!.charger({} as any);
    expect(els).toHaveLength(1);
    expect(els[0].ouvrir).toBe('generee');
    expect(els[0].generee?.artist).toBe('Miles Davis');
    expect(els[0].nbTitres).toBe(4);
    expect(typeof els[0].jouer).toBe('function');
  });

  it('PageWidgets ouvre la liste d’une playlist générée', () => {
    const src = readFileSync(resolve(__dirname, '../../components/v2/PageWidgets.svelte'), 'utf8');
    expect(src).toMatch(/e\.ouvrir === 'generee' && e\.generee/);
    expect(src).toContain('<PlaylistGenereeV2');
    const modale = readFileSync(resolve(__dirname, '../../components/v2/PlaylistGenereeV2.svelte'), 'utf8');
    expect(modale).toContain('v2.home.becauseYouLikeRefresh');
  });

  it('chaque langue porte ses libellés', () => {
    const dossier = resolve(__dirname, '../locales');
    const cles = [
      'wBecauseYouLike', 'becauseYouLikeCard', 'becauseYouLikeWith', 'becauseYouLikeCount',
      'becauseYouLikePlay', 'becauseYouLikeSave', 'becauseYouLikeDone', 'becauseYouLikeName',
      'becauseYouLikeSaved', 'becauseYouLikeNoZone', 'becauseYouLikeRefresh',
      'becauseYouLikePartial', 'becauseYouLikeDeletePartial', 'becauseYouLikeDeleted',
    ];
    const langues = readdirSync(dossier).filter((f) => /^[a-z]{2}\.ts$/.test(f));
    expect(langues.length).toBeGreaterThanOrEqual(15);
    for (const f of langues) {
      const src = readFileSync(resolve(dossier, f), 'utf8');
      for (const k of cles) expect(src, `${f} : v2.home.${k}`).toContain(`"v2.home.${k}":`);
      expect(src).toMatch(/"v2\.home\.becauseYouLikeCard": "[^"]*\{artiste\}/);
    }
  });
});
