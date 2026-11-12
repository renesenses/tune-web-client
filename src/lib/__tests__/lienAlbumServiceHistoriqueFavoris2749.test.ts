/**
 * web#2749 (FabienM, fil 2723, points 3 et 10) — la colonne Album des titres
 * de service (Qobuz, Tidal, Bandcamp) n'était cliquable ni dans l'Historique
 * ni dans Titres favoris, et « Aller à l'album » manquait au menu « … ».
 *
 * Trois causes, trois témoins :
 *  1. `entreesDepuisServeur` ignorait `album_id_service`, que
 *     `/library/history` sert (mesuré sur le .18 le 10/11/2026) ;
 *  2. la complétion par la piste chez son service ne passait que sur les
 *     lignes du SERVEUR, pas sur les écoutes notées par ce navigateur (celles
 *     qui portent l'étiquette de qualité) ;
 *  3. un Titre favori de service n'a aucun identifiant d'album, et l'écran
 *     Favoris ne le demandait pas.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  appliquerAlbumsConnus, completerAlbumsDePistes, completerAlbumsDeService, oublierAlbumsDesEcoutes,
} from '../albumDesEcoutes';
import { entreesDepuisServeur } from '../historiqueLecture';
import { ouvertureAlbumDePiste } from '../lienAlbumDePiste';
import { versPiste } from '../favorisFusionnes';
import type { HistoryEntry } from '../stores/history';

const gestes = () => ({ ouvrirAlbum: vi.fn(), ouvrirArtiste: vi.fn() }) as any;

beforeEach(() => oublierAlbumsDesEcoutes());

describe('web#2749 — Historique : l’album servi par /library/history', () => {
  it('🔴 un titre Qobuz lancé seul, avec album_id_service servi, est un lien', () => {
    const [e] = entreesDepuisServeur([{
      track_id: null, title: 'Love & Hate', artist_name: 'Michael Kiwanuka', album_title: 'Love & Hate',
      source: 'qobuz', source_id: '32597028', album_id: null, album_id_service: '0060254794964',
      context_type: 'track', context_id: '32597028', context_source: 'qobuz',
      listened_at: '2026-11-09T16:16:50Z', zone_id: 10,
    }]);
    expect((e.track as any).album_id_service).toBe('0060254794964');
    const g = gestes();
    const lien = ouvertureAlbumDePiste(e.track, g);
    expect(lien, 'la colonne Album doit être un lien').not.toBeNull();
    lien!();
    expect(g.ouvrirAlbum).toHaveBeenCalledWith(expect.objectContaining({ service: 'qobuz', albumId: '0060254794964' }));
  });

  it('le contexte d’album reste prioritaire ; une radio ne reçoit rien', () => {
    const [ctx] = entreesDepuisServeur([{ source: 'tidal', source_id: '1', album_title: 'X',
      album_id_service: 'SERVI', context_type: 'album', context_id: 'CTX', context_source: 'tidal' }]);
    expect((ctx.track as any).album_id_service).toBe('CTX');
    const [radio] = entreesDepuisServeur([{ source: 'radio', source_id: 'u', album_id_service: 'Z' }]);
    expect((radio.track as any).album_id_service).toBeNull();
  });
});

describe('web#2749 — Historique : les écoutes notées par ce navigateur', () => {
  /** Une écoute du magasin local : le `NowPlaying` de la zone, avec sa qualité. */
  const locale = (): HistoryEntry => ({
    track: { id: null, title: 'So What', artist_name: 'Miles Davis', album_title: 'Kind of Blue',
      source: 'qobuz', source_id: '19512572', sample_rate: 96000, bit_depth: 24 } as any,
    playedAt: '2026-11-09T10:00:00Z', zoneName: 'Salon',
  });

  it('🔴 la complétion sur la fusion rend l’album aux écoutes locales', async () => {
    const lire = vi.fn(async () => ({ album_id: '0886443927087' }));
    const fusion = [locale()];
    expect(ouvertureAlbumDePiste(fusion[0].track, gestes()), 'avant : texte inerte').toBeNull();
    await completerAlbumsDeService(fusion, lire);
    const rendu = appliquerAlbumsConnus(fusion);
    expect(lire).toHaveBeenCalledWith('qobuz', '19512572');
    expect(ouvertureAlbumDePiste(rendu[0].track, gestes())).not.toBeNull();
  });

  it('rien de connu → le même tableau (aucun rendu inutile)', () => {
    const fusion = [locale()];
    expect(appliquerAlbumsConnus(fusion)).toBe(fusion);
  });

  it('HistoriqueV2 applique les albums connus à la fusion, pas aux seules lignes du serveur', () => {
    const src = readFileSync(new URL('../../components/v2/HistoriqueV2.svelte', import.meta.url), 'utf8');
    expect(src).toMatch(/appliquerAlbumsConnus\(fusion\)/);
    expect(src).not.toMatch(/completerAlbumsDeService\(lues,/);
  });
});

describe('web#2749 — Titres favoris d’un service', () => {
  it('🔴 un favori Qobuz reçoit l’album de sa piste chez le service', async () => {
    const piste = versPiste({
      id: 1, profile_id: 1, item_type: 'track', service: 'qobuz', service_id: '8766738',
      title: 'If You Leave Me Now', artist: 'Chicago', album: 'X',
    } as any);
    expect(ouvertureAlbumDePiste(piste, gestes()), 'avant : texte inerte').toBeNull();
    const lire = vi.fn(async () => ({ album_id: '0603497924615', artist_id: '1' }));
    const maj = await completerAlbumsDePistes([piste], lire);
    expect(lire).toHaveBeenCalledWith('qobuz', '8766738');
    const g = gestes();
    const lien = ouvertureAlbumDePiste(maj![0], g);
    expect(lien).not.toBeNull();
    lien!();
    expect(g.ouvrirAlbum).toHaveBeenCalledWith(expect.objectContaining({ service: 'qobuz', albumId: '0603497924615' }));
  });

  it('une piste de bibliothèque n’est jamais demandée', async () => {
    const lire = vi.fn();
    expect(await completerAlbumsDePistes([{ id: 3, source: 'local', album_id: 9, album_title: 'A' }], lire as any)).toBeNull();
    expect(lire).not.toHaveBeenCalled();
  });

  it('FavoritesV2 branche la complétion sur ses pistes', () => {
    const src = readFileSync(new URL('../../components/v2/FavoritesV2.svelte', import.meta.url), 'utf8');
    expect(src).toMatch(/completerAlbumsDePistes\(fusion\.tracks, api\.getStreamingTrack, \{/);
  });
});
