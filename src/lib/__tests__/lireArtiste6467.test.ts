import { describe, expect, it, vi } from 'vitest';
import { PLAFOND_ARTISTE, lireArtisteBibliotheque, serveurSansArtistId } from '../lireArtiste';

// tune-server-rust#6467 — « Lire » un artiste : 50 titres au hasard au plus.
describe('lire un artiste (#6467)', () => {
  it('demande l’artiste au serveur, qui tire lui-même', async () => {
    const lire = vi.fn().mockResolvedValue({});
    const titres = vi.fn();
    expect(await lireArtisteBibliotheque(7, { lire, titres })).toBeNull();
    expect(lire).toHaveBeenCalledWith({ artist_id: 7 });
    expect(titres).not.toHaveBeenCalled();
  });

  it('sur un serveur antérieur, tire 50 titres au plus, sans les bannis', async () => {
    const lire = vi
      .fn()
      .mockRejectedValueOnce(new Error('no track source specified'))
      .mockResolvedValue({});
    const liste = Array.from({ length: 80 }, (_, i) => ({ id: i + 1, banned: i === 0 }));
    const n = await lireArtisteBibliotheque(7, { lire, titres: async () => liste });
    expect(n).toBe(PLAFOND_ARTISTE);
    const corps = lire.mock.calls[1][0];
    expect(corps.context_type).toBe('artist');
    expect(corps.context_id).toBe('7');
    expect(corps.track_ids).toHaveLength(50);
    expect(new Set(corps.track_ids).size).toBe(50);
    expect(corps.track_ids).not.toContain(1);
    // Pas le premier album dans l'ordre : un tirage.
    expect(corps.track_ids).not.toEqual(Array.from({ length: 50 }, (_, i) => i + 2));
  });

  it('une autre erreur n’est pas maquillée en repli', async () => {
    const lire = vi.fn().mockRejectedValue(new Error('zone injoignable'));
    await expect(lireArtisteBibliotheque(7, { lire, titres: async () => [] })).rejects.toThrow('zone injoignable');
  });

  it('rien de jouable : 0, sans appel de lecture', async () => {
    const lire = vi.fn().mockRejectedValueOnce(new Error('no track source specified'));
    expect(await lireArtisteBibliotheque(7, { lire, titres: async () => [{ id: 3, banned: true }] })).toBe(0);
    expect(lire).toHaveBeenCalledTimes(1);
  });

  it('reconnaît le refus d’un serveur sans artist_id', () => {
    expect(serveurSansArtistId(new Error('no track source specified'))).toBe(true);
    expect(serveurSansArtistId(new Error('no tracks to play'))).toBe(false);
  });
});
