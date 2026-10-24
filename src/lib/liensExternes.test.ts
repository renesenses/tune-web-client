import { describe, expect, it } from 'vitest';
import { liensAffichables, lienSur } from './liensExternes';

// Forme rendue par `GET /library/artists/{id}/external-links` (tune-server-rust#6001).
const ok = {
  statut: 'ok' as const,
  mbid: '83b9cbe7-9857-49e2-ab8e-b57b01038103',
  liens: [
    { site: 'progarchives', nom: 'ProgArchives', url: 'https://www.progarchives.com/artist.asp?id=78' },
    { site: 'metal-archives', nom: 'Metal Archives', url: 'https://www.metal-archives.com/bands/X/1' },
    { site: 'allmusic', nom: 'AllMusic', url: 'https://www.allmusic.com/artist/mn0000346336' },
  ],
};

describe('#6001 — liens vers ProgArchives, Metal Archives et AllMusic', () => {
  it('rend les trois liens d’une réponse ok', () => {
    expect(liensAffichables(ok).map((l) => l.site)).toEqual(['progarchives', 'metal-archives', 'allmusic']);
  });

  it('n’affiche rien hors statut ok', () => {
    for (const statut of ['non_identifie', 'inconnu', 'indisponible'] as const) {
      expect(liensAffichables({ ...ok, statut })).toEqual([]);
    }
    expect(liensAffichables(null)).toEqual([]);
  });

  it('refuse un autre hôte, un autre schéma, un site inconnu', () => {
    expect(lienSur({ site: 'allmusic', nom: 'AllMusic', url: 'javascript:void(0)' })).toBe(false);
    expect(lienSur({ site: 'allmusic', nom: 'AllMusic', url: 'http://www.allmusic.com/x' })).toBe(false);
    expect(lienSur({ site: 'allmusic', nom: 'AllMusic', url: 'https://allmusic.com.example.org/x' })).toBe(false);
    expect(lienSur({ site: 'progarchives', nom: 'ProgArchives', url: 'https://www.allmusic.com/x' })).toBe(false);
    expect(lienSur({ site: 'discogs', nom: 'Discogs', url: 'https://www.discogs.com/x' })).toBe(false);
  });
});
