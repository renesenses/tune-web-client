import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('../stores/albumsPagines', () => ({ invaliderBibliotheque: vi.fn() }));
import { invaliderBibliotheque } from '../stores/albumsPagines';
import { dossierDeLAlbum } from '../dossierAlbum';
import { verdictDePurge } from '../purgeOrphelines';
import { retirerUnDossier } from '../ajoutDossier';
beforeEach(() => vi.clearAllMocks());
it('localise les tranches CUE par leur média', () => {
  expect(dossierDeLAlbum([{ file_path: null, cue_media_path: '/musique/Boy/image.flac', source: 'local' }])).toBe('/musique/Boy');
});
it('ne localise pas les pistes de streaming', () => {
  expect(dossierDeLAlbum([{ cue_media_path: '/musique/Boy/image.flac', source: 'tidal' }])).toBeNull();
});
it('signale une purge partiellement refusée comme erreur', () => {
  expect(verdictDePurge({ purged: 1, purge_failed: 2 }, k => k).ton).toBe('error');
});
it('invalide la bibliothèque après une purge confirmée', async () => {
  const retirer = vi.fn().mockResolvedValueOnce({ music_dirs: [], orphan_tracks: 2, confirm_purge_required: 2 }).mockResolvedValueOnce({ music_dirs: [], orphan_tracks: 2, purged: 2 });
  await retirerUnDossier('/musique/Boy', { retirer, confirmer: async () => true, annoncer: vi.fn(), tr: k => k });
  expect(invaliderBibliotheque).toHaveBeenCalledTimes(1);
});
