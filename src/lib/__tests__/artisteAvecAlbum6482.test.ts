// @vitest-environment jsdom
/**
 * tune-server-rust#6482 (DidLyon, fil 2321) — « si on met un album en favori,
 * ne pourrait-on pas mettre l'artiste également (automatiquement ou à la
 * demande) ? ». À la demande : une notification avec un bouton, jamais un
 * favori posé sans geste (FabienM, réponse 8458).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';
import { artisteAProposer, toggleStreamingFavorite } from '../streamingFavorites';
import { currentProfileId, favoriteStreamingKeys, streamingFavKey } from '../stores/profile';
import { notifications } from '../stores/notifications';
import { streamingServices } from '../stores/streaming';

const album = { itemType: 'album' as const, service: 'qobuz', serviceId: '5099749522428', title: 'Kind Of Blue', artist: 'Miles Davis', artistId: '6760' };

describe('artisteAProposer', () => {
  it('propose l’artiste après l’AJOUT d’un album dont l’artiste est connu', () => {
    expect(artisteAProposer(album, true, new Set())).toEqual(
      expect.objectContaining({ itemType: 'artist', service: 'qobuz', serviceId: '6760', title: 'Miles Davis' }),
    );
  });
  it('rien pour un retrait, un titre, un artiste inconnu ou déjà en favori', () => {
    expect(artisteAProposer(album, false, new Set())).toBeNull();
    expect(artisteAProposer({ ...album, itemType: 'track' }, true, new Set())).toBeNull();
    expect(artisteAProposer({ ...album, artistId: undefined }, true, new Set())).toBeNull();
    expect(artisteAProposer(album, true, new Set([streamingFavKey('artist', 'qobuz', '6760')]))).toBeNull();
  });
});

describe('toggleStreamingFavorite', () => {
  let ecritures: string[];
  beforeEach(() => {
    ecritures = [];
    streamingServices.set({ qobuz: { enabled: true, authenticated: true, favoris_miroir: true } } as any);
    favoriteStreamingKeys.set(new Set());
    currentProfileId.set(1);
    vi.stubGlobal('fetch', vi.fn(async (url: any, init?: RequestInit) => {
      ecritures.push(`${init?.method ?? 'GET'} ${String(url)} ${init?.body ?? ''}`);
      return new Response(JSON.stringify({ ok: true, miroir: { service: 'qobuz', statut: 'propage' } }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }));
  });
  afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); currentProfileId.set(null); favoriteStreamingKeys.set(new Set()); streamingServices.set({}); });

  it('l’ajout d’un album propose l’artiste ; le bouton le met en favori, rien avant', async () => {
    const espion = vi.spyOn(notifications, 'withAction');
    expect(await toggleStreamingFavorite(album)).toBe(true);
    expect(espion).toHaveBeenCalledTimes(1);
    const [message, , run] = espion.mock.calls[0];
    expect(message).toContain('Miles Davis');
    // Aucun favori d'artiste n'a été posé sans le geste.
    expect(ecritures.filter((e) => e.includes('"item_type":"artist"'))).toEqual([]);
    run();
    await new Promise((r) => setTimeout(r, 0));
    expect(ecritures.filter((e) => e.includes('"item_type":"artist"') && e.includes('"service_id":"6760"'))).toHaveLength(1);
    expect(get(favoriteStreamingKeys).has(streamingFavKey('artist', 'qobuz', '6760'))).toBe(true);
  });

  it('le retrait d’un album ne propose rien', async () => {
    favoriteStreamingKeys.set(new Set([streamingFavKey('album', 'qobuz', '5099749522428')]));
    const espion = vi.spyOn(notifications, 'withAction');
    expect(await toggleStreamingFavorite(album)).toBe(false);
    expect(espion).not.toHaveBeenCalled();
  });
});
