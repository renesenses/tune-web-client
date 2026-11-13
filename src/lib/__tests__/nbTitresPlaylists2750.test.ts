// @vitest-environment jsdom
//
// web#2750 points 6 et 7 — FabienM, fil 2723 (rc11) :
//   6 - « Menu Favoris, onglet Playlists : afficher en sous-titre le nombre de
//       titres de chaque playlist »
//   7 - « Menu Accueil, widgets sur les playlists : afficher en sous-titre le
//       nombre de titres de chaque playlist »
// Go de Bertrand du 12/11/2026 (rc12).
//
// Le nombre vient de l'objet quand il le porte (playlist de la bibliothèque,
// listes de playlists d'un service) ; un favori de SERVICE ne le porte pas
// (`streaming_favorites` garde titre et pochette) : il est demandé à la
// playlist, `GET /streaming/{service}/playlists/{id}`.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import * as api from '../api';
import { widgetParId, versElement, type Widget } from '../accueilWidgets';
import { compterTitresDeService, libelleNbTitres, nbTitresDe } from '../nbTitresPlaylist';
import { dictionnaire } from './onzeDictionnaires';
import PageWidgets from '../../components/v2/PageWidgets.svelte';
import { currentProfileId } from '../stores/profile';
import { locale } from '../i18n';

vi.setConfig({ testTimeout: 30_000 });
const fr = dictionnaire('fr');
const trFr = (k: string) => fr[k] ?? k;

describe('nbTitresDe / libelleNbTitres', () => {
  it('lit les champs connus, refuse ce qui n’est pas un entier positif', () => {
    expect(nbTitresDe({ track_count: 12 })).toBe(12);
    expect(nbTitresDe({ tracks_count: 3 })).toBe(3);
    expect(nbTitresDe({ nb_tracks: '7' })).toBe(7);
    expect(nbTitresDe({ track_count: 0 })).toBe(0);
    expect(nbTitresDe({ track_count: -1 })).toBeNull();
    expect(nbTitresDe({ track_count: null })).toBeNull();
    expect(nbTitresDe({})).toBeNull();
    expect(nbTitresDe(null)).toBeNull();
  });

  it('« 1 titre » / « 12 titres »', () => {
    expect(libelleNbTitres(1, trFr)).toBe('1 titre');
    expect(libelleNbTitres(12, trFr)).toBe('12 titres');
  });

  it('un service qui refuse rend `null`, jamais « 0 titre »', async () => {
    vi.spyOn(api, 'getStreamingPlaylist').mockRejectedValue(new Error('502'));
    expect(await compterTitresDeService('qobuz', '42')).toBeNull();
    vi.restoreAllMocks();
  });
});

describe('Accueil — les éléments de playlist portent leur nombre de titres', () => {
  beforeEach(() => vi.restoreAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it('🔴 une playlist de service listée (track_count) le porte', () => {
    const el = versElement({ source_id: '9', name: 'Jazz', track_count: 25 }, 0, 'qob', { service: 'qobuz', genre: 'playlist' });
    expect(el.nbTitres).toBe(25);
  });

  it('un album ne reçoit pas de nombre de titres de playlist', () => {
    const el = versElement({ id: 3, title: 'Kind of Blue', track_count: 5 }, 0, 'alb');
    expect(el.nbTitres).toBeUndefined();
  });

  it('🔴 « Playlists favorites » : locale lue sur l’objet, service demandée au service', async () => {
    vi.spyOn(api, 'getFavorites').mockResolvedValue({
      tracks: [], albums: [], artists: [], smartPlaylistIds: [],
      playlists: [{ id: 4, name: 'Dimanche', track_count: 18 }],
    } as any);
    vi.spyOn(api, 'getProfileStreamingFavorites').mockResolvedValue([
      { id: 0, profile_id: 1, item_type: 'playlist', service: 'qobuz', service_id: 'pq1', title: 'Qobuz Jazz', cover_url: null } as any,
    ]);
    const demande = vi.spyOn(api, 'getStreamingPlaylist').mockResolvedValue({ name: 'Qobuz Jazz', track_count: 40 } as any);
    const els = await widgetParId('favoris-playlists')!.charger({ profileId: 1, langue: 'fr', albums: [], zones: [] } as any);
    const locale_ = els.find((e) => e.titre === 'Dimanche')!;
    const service = els.find((e) => e.titre === 'Qobuz Jazz')!;
    expect(locale_.nbTitres).toBe(18);
    expect(locale_.compterTitres).toBeUndefined();
    expect(service.nbTitres ?? null).toBeNull();
    expect(demande, 'rien n’est demandé avant le rendu').not.toHaveBeenCalled();
    expect(await service.compterTitres!()).toBe(40);
    expect(demande).toHaveBeenCalledWith('qobuz', 'pq1');
  });
});

describe('Accueil — la vignette affiche « N titres »', () => {
  let hote: HTMLDivElement | null = null;
  let monte: Record<string, any> | null = null;

  beforeEach(() => {
    locale.set('fr');
    currentProfileId.set(1);
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true, status: 200, statusText: 'OK',
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({}), text: async () => '{}',
    }) as unknown as Response));
  });
  afterEach(() => {
    if (monte) { try { unmount(monte); } catch { /* sans objet */ } monte = null; }
    hote?.remove();
    hote = null;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('🔴 nombre porté ET nombre demandé : les deux s’affichent, la demande ne part qu’une fois', async () => {
    const compter = vi.fn(async () => 40);
    const widget: Widget = {
      id: 'temoin-playlists',
      cleTitre: 'v2.home.wFavPlaylists',
      forme: 'bande',
      charger: async () => [
        { id: 'p0', titre: 'Dimanche', nbTitres: 18, ouvrir: 'cible' },
        { id: 'p1', titre: 'Qobuz Jazz', compterTitres: compter, ouvrir: 'playlist' },
        { id: 'p2', titre: 'Album', sous: 'Miles Davis' },
      ] as any,
    };
    hote = document.createElement('div');
    document.body.appendChild(hote);
    monte = mount(PageWidgets, { target: hote, props: { catalogue: [widget], dispositionDefaut: ['temoin-playlists'], cle: 'accueil_temoin_2750' } });
    for (let i = 0; i < 40 && hote.querySelectorAll('[data-nb-titres]').length < 2; i++) {
      flushSync();
      await new Promise((r) => setTimeout(r, 25));
    }
    flushSync();
    await new Promise((r) => setTimeout(r, 25));
    flushSync();
    const textes = [...hote.querySelectorAll('[data-nb-titres]')].map((n) => n.textContent?.trim());
    expect(textes).toEqual(['18 titres', '40 titres']);
    expect(compter).toHaveBeenCalledTimes(1);
  });
});
