// @vitest-environment jsdom
//
// #1509 — FabienM, fil 1896, 23/09/2026 : « Widget Favoris vide dans le menu
// accueil (alors que j'ai bien des favoris) ». Ses deux captures : le widget
// « Vos favoris » de l'Accueil rend « Rien à montrer ici pour l'instant. »,
// l'écran Favoris compte 2 albums, 113 pistes, 12 artistes.
//
// Le widget ne lisait que `getFavorites` — les favoris de la BIBLIOTHÈQUE —
// et son seul seau `albums`. Les cœurs posés chez Qobuz ou Tidal partent
// dans `streaming_favorites`, que l'écran Favoris additionne depuis le 03/09
// et que le widget ignorait. Deux albums de service : l'onglet dit 2, le
// widget 0. Et 113 pistes, 12 artistes ne remplissaient pas un widget qui ne
// lit que des albums.
//
// Le widget passe désormais par le chargeur PARTAGÉ de l'écran
// (`favorisFusionnes`), et se replie sur les artistes puis les pistes quand
// il n'y a aucun album favori.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as api from '../api';
import { widgetParId } from '../accueilWidgets';
import type { StreamingItemType } from '../streamingFavorites';

const lire = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

const ctx: any = { profileId: 1, langue: 'fr', albums: [], zones: [] };

/** Rien en bibliothèque — ce que `getFavorites` rend à un profil qui n'a aimé
 *  que chez les services. */
const VIDE = { tracks: [], albums: [], artists: [], playlists: [], smartPlaylistIds: [] } as any;

/** Un favori de service, tel que `/profiles/{id}/streaming-favorites` le rend. */
const service = (item_type: StreamingItemType, service_id: string, title: string, extra: any = {}) =>
  ({
    id: 0,
    profile_id: 1,
    item_type,
    service: 'qobuz',
    service_id,
    title,
    artist: 'Daft Punk',
    album: null,
    cover_url: `https://static.qobuz.com/${service_id}.jpg`,
    created_at: '2026-09-03T21:59:50Z',
    ...extra,
  }) as api.StreamingFavorite;

async function bande(locaux: any, services: api.StreamingFavorite[] | Error) {
  vi.spyOn(api, 'getFavorites').mockResolvedValue(locaux);
  const spy = vi.spyOn(api, 'getProfileStreamingFavorites');
  if (services instanceof Error) spy.mockRejectedValue(services);
  else spy.mockResolvedValue(services);
  return widgetParId('favoris')!.charger(ctx);
}

describe('« Vos favoris » sur l’Accueil — #1509', () => {
  beforeEach(() => vi.restoreAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it('🔴 la source : le widget passe par le chargeur partagé, pas par `getFavorites` seul', () => {
    const src = lire('../accueilWidgets.ts');
    expect(
      src.includes('chargerFavorisFusionnes(ctx.profileId)'),
      'le widget « Vos favoris » ne lit plus les favoris par le chargeur partagé (#1509)',
    ).toBe(true);
    expect(
      /id: 'favoris',[\s\S]{0,2000}?api\.getFavorites\(/.test(src.slice(src.indexOf("id: 'favoris'"), src.indexOf("id: 'recommandations'"))),
      'le widget a retrouvé son propre appel à `getFavorites` : un second chargeur, qui divergera',
    ).toBe(false);
  });

  it('🔴 2 albums favoris chez Qobuz, 0 en bibliothèque : le widget en montre 2, pas « Rien à montrer »', async () => {
    const els = await bande(VIDE, [
      service('album', '9140031', 'Random Access Memories'),
      service('album', '0060254735062', 'Discovery'),
    ]);
    expect(els.map((e) => e.titre)).toEqual(['Random Access Memories', 'Discovery']);
    expect(els.map((e) => e.source)).toEqual(['qobuz', 'qobuz']);
    expect(els[0].cover).toBe('https://static.qobuz.com/9140031.jpg');
    // La vignette joue l'ALBUM du service, comme celle de l'écran Favoris.
    const play = vi.spyOn(api, 'play').mockResolvedValue({} as any);
    await els[0].jouer!(3);
    expect(play).toHaveBeenCalledWith(3, { streaming_album_id: '9140031', source: 'qobuz' });
    expect(els[0].ouvrir, 'la pochette ouvre la fiche de l’album').toBe('album');
  });

  it('la bibliothèque PUIS les services, dans cet ordre, comme l’onglet Albums', async () => {
    const els = await bande(
      { ...VIDE, albums: [{ id: 12, title: 'Homework', artist_name: 'Daft Punk', cover_path: '/c/12.jpg' }] },
      [service('album', '9140031', 'Random Access Memories')],
    );
    expect(els.map((e) => e.titre)).toEqual(['Homework', 'Random Access Memories']);
    expect(els[0].source, 'un album local ne porte pas de pastille de service').toBeNull();
  });

  it('un service muet ne vide pas le widget : les albums de la bibliothèque restent', async () => {
    const els = await bande(
      { ...VIDE, albums: [{ id: 12, title: 'Homework', artist_name: 'Daft Punk', cover_path: '/c/12.jpg' }] },
      new Error('404'),
    );
    expect(els.map((e) => e.titre)).toEqual(['Homework']);
  });

  // web#2883 — décision de Bertrand du 12/11/2026 : le repli sur les artistes
  // puis les pistes est RETIRÉ. La bande s'appelle « Albums favoris » (web#2750)
  // et un profil sans album favori ne l'a pas (`masqueSiVide`) — garde montée
  // dans `albumsFavorisMasque2883.dom.test.ts`.
  it('sans album favori, la bande est vide — ni artistes ni pistes en repli (web#2883)', async () => {
    const els = await bande(
      { ...VIDE, artists: [{ id: 7, name: 'Nick Cave', image_path: '/a/7.jpg' }], tracks: [{ id: 42, album_id: 12, title: 'Around the World', artist_name: 'Daft Punk', cover_path: '/c/12.jpg' }] },
      [service('artist', '36819', 'Daft Punk', { artist: null }), service('track', '9140031', 'Get Lucky')],
    );
    expect(els).toEqual([]);
    expect(widgetParId('favoris')!.masqueSiVide, 'la bande vide doit être masquée').toBe(true);
  });

  it('les clés de liste restent uniques : deux favoris de service ont `id: null`', async () => {
    const els = await bande(VIDE, [
      service('album', '9140031', 'Random Access Memories'),
      service('album', '0060254735062', 'Discovery'),
    ]);
    expect(new Set(els.map((e) => e.id)).size).toBe(2);
  });

  it('sans profil, rien — et aucun appel', async () => {
    const gf = vi.spyOn(api, 'getFavorites');
    const els = await widgetParId('favoris')!.charger({ ...ctx, profileId: null });
    expect(els).toEqual([]);
    expect(gf).not.toHaveBeenCalled();
  });
});
