/**
 * web#2209 (FabienM, fils 2302 point 6 et 2379 point 4 ; go de Bertrand le
 * 22/10) — dans l'Historique, un titre Qobuz lancé hors de son album n'avait
 * ni lien actif dans la colonne Album, ni « Aller à l'album » dans le menu
 * « … ». L'album se demande à la piste chez son service.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { albumAResoudre, completerAlbumsDeService, oublierAlbumsDesEcoutes } from '../albumDesEcoutes';
import { entreesDepuisServeur } from '../historiqueLecture';
import { ouvertureAlbumDePiste } from '../lienAlbumDePiste';
import { albumDeServiceDe } from '../routageAlbum';
import { entreesMenuPiste } from '../menuPiste';

/** Une ligne de `/library/history` : un titre Qobuz lancé SEUL (recherche). */
const ligne = (over: Record<string, unknown> = {}) => ({
  track_id: null, title: 'So What', artist_name: 'Miles Davis', album_title: 'Kind of Blue',
  duration_ms: 545000, source: 'qobuz', source_id: '19512572', album_id: null,
  cover_url: 'https://static.qobuz.com/kob.jpg', listened_at: '2026-10-22T10:00:00Z', zone_id: 1,
  context_type: 'track', context_id: '19512572', context_source: 'qobuz', ...over,
});

beforeEach(() => oublierAlbumsDesEcoutes());

describe('web#2209 — quelles écoutes demandent leur album', () => {
  it('un titre Qobuz sans album connu, oui ; radio, podcast, local, Bandcamp et album déjà connu, non', () => {
    const [qobuz] = entreesDepuisServeur([ligne()]);
    expect(albumDeServiceDe(qobuz.track as any), 'avant : aucun album de service').toBeNull();
    expect(albumAResoudre(qobuz.track)).toBe(true);
    for (const source of ['radio', 'podcast', 'local', 'bandcamp']) {
      const [e] = entreesDepuisServeur([ligne({ source })]);
      expect(albumAResoudre(e.track), source).toBe(false);
    }
    const [depuisAlbum] = entreesDepuisServeur([ligne({ context_type: 'album', context_id: '0886443927087' })]);
    expect(albumAResoudre(depuisAlbum.track), 'lancé depuis l’album : déjà connu').toBe(false);
    const [sansTitre] = entreesDepuisServeur([ligne({ album_title: null })]);
    expect(albumAResoudre(sansTitre.track)).toBe(false);
  });
});

describe('web#2209 — l’album vient de la piste chez son service', () => {
  it('🔴 le lien de la colonne Album et « Aller à l’album » s’ouvrent sur l’album Qobuz', async () => {
    const lire = vi.fn(async () => ({ album_id: '0886443927087', artist_id: 4451 }));
    const entrees = entreesDepuisServeur([ligne()]);
    const maj = await completerAlbumsDeService(entrees, lire);
    expect(lire).toHaveBeenCalledWith('qobuz', '19512572');
    expect(maj, 'les écoutes doivent être complétées').not.toBeNull();
    const t = maj![0].track as any;
    expect(t.album_id_service).toBe('0886443927087');

    // La colonne Album : le même geste que le menu.
    const ouvrirAlbum = vi.fn();
    const gestes = { ouvrirAlbum, ouvrirArtiste: vi.fn() } as any;
    const lien = ouvertureAlbumDePiste(t, gestes);
    expect(lien, 'la colonne Album doit être un lien').not.toBeNull();
    lien!();
    expect(ouvrirAlbum).toHaveBeenCalledWith(expect.objectContaining({
      service: 'qobuz', albumId: '0886443927087', titre: 'Kind of Blue',
    }));

    // Le menu « … » : l'entrée « Aller à l'album » est présente.
    const menu = entreesMenuPiste(
      { jouable: true, idBibliotheque: null, artistId: null, albumId: null, albumDeService: albumDeServiceDe(t) } as any,
      { allerAlbum: () => {} } as any,
    );
    expect(menu.map((e) => e.cle)).toContain('library.goToAlbum');
  });

  it('une réponse par piste, mémorisée ; un échec n’est pas mémorisé ; rien de neuf → null', async () => {
    const entrees = entreesDepuisServeur([ligne(), ligne({ listened_at: '2026-10-22T11:00:00Z' })]);
    const echec = vi.fn(async () => { throw new Error('504'); });
    expect(await completerAlbumsDeService(entrees, echec)).toBeNull();
    expect(echec).toHaveBeenCalledTimes(1);

    const lire = vi.fn(async () => ({ album_id: 'A1' }));
    const maj = await completerAlbumsDeService(entrees, lire);
    expect(lire, 'deux écoutes du même titre : une demande').toHaveBeenCalledTimes(1);
    expect(maj!.every((e) => (e.track as any).album_id_service === 'A1')).toBe(true);

    await completerAlbumsDeService(entrees, lire);
    expect(lire, 'mémorisé pour la session').toHaveBeenCalledTimes(1);

    const sansAlbum = vi.fn(async () => ({ album_id: null }));
    expect(await completerAlbumsDeService(entreesDepuisServeur([ligne({ source_id: '9' })]), sansAlbum)).toBeNull();
  });

  it('borné : au plus `plafond` demandes par passage', async () => {
    const entrees = entreesDepuisServeur(Array.from({ length: 10 }, (_, i) => ligne({ source_id: String(i + 1) })));
    const lire = vi.fn(async (_s: string, id: string) => ({ album_id: `A${id}` }));
    await completerAlbumsDeService(entrees, lire, { plafond: 4, parallele: 2 });
    expect(lire).toHaveBeenCalledTimes(4);
  });

  it('l’Historique branche la complétion sur ce qu’il lit du serveur', () => {
    const src = readFileSync(new URL('../../components/v2/HistoriqueV2.svelte', import.meta.url), 'utf8');
    expect(src).toMatch(/completerAlbumsDeService\(lues, api\.getStreamingTrack\)/);
  });
});
