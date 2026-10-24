import { describe, expect, it } from 'vitest';
import { apresDetachement, identiteDetachee, peutDetacherIdentite } from './identiteArtiste';
import type { Artist } from './types';

describe('tune-server-rust#6463 — Détacher l\'identité', () => {
  it('ne se propose que pour un artiste local porteur d\'un MBID', () => {
    expect(peutDetacherIdentite({ id: 3, musicbrainz_id: 'mb-chanteuse' })).toBe(true);
    expect(peutDetacherIdentite({ id: 3, musicbrainz_id: '  ' })).toBe(false);
    expect(peutDetacherIdentite({ id: 3, musicbrainz_id: null })).toBe(false);
    expect(peutDetacherIdentite({ id: null, musicbrainz_id: 'mb' })).toBe(false);
    expect(peutDetacherIdentite(null)).toBe(false);
  });

  it('reconnaît une identité détachée : manuel ET sans MBID', () => {
    expect(identiteDetachee({ musicbrainz_id: null, musicbrainz_id_source: 'manuel' })).toBe(true);
    expect(identiteDetachee({ musicbrainz_id: 'mb-saisi', musicbrainz_id_source: 'manuel' })).toBe(false);
    expect(identiteDetachee({ musicbrainz_id: null, musicbrainz_id_source: null })).toBe(false);
    expect(identiteDetachee({ musicbrainz_id: null })).toBe(false);
  });

  it('la fiche perd le MBID et le portrait rapporté, la réponse du serveur prime', () => {
    const avant: Artist = {
      id: 3, name: 'Ange', musicbrainz_id: 'mb-chanteuse', musicbrainz_id_source: 'nom',
      image_path: 'h-chanteuse', image_source: 'auto',
    };
    const apres = apresDetachement(avant, { id: 3, name: 'Ange', image_path: null, image_source: null });
    expect(apres.musicbrainz_id).toBeNull();
    expect(apres.musicbrainz_id_source).toBe('manuel');
    expect(apres.image_path).toBeNull();
    expect(identiteDetachee(apres)).toBe(true);
  });
});
