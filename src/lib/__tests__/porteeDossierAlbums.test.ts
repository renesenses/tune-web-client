/**
 * Gardes de la portée dossier — fil 1880 (jfpaquet, 0.9.161, 6 599 albums).
 *
 * « Dans la liste des albums (Library) ceux dénommés "VA-xxx" ont disparu. »
 *
 * L'écran demandait 5 000 albums de portée en UN appel ; la route en borne
 * 2 000 (`clamp(1, 2000)`) et le dit seulement par son `total`, que personne
 * ne lisait. Comme elle ordonne par artiste de carte, les compilations
 * (« Various Artists », « VA ») sortent en DERNIER : ce sont exactement elles
 * que la coupe emporte.
 */
import { describe, it, expect, vi } from 'vitest';
import { idsAlbumsDeLaPortee, PAGE_PORTEE } from '../porteeDossierAlbums';

/**
 * Un serveur fidèle à `albums_detailed.rs` : il BORNE la page à
 * `clamp(1, 2000)`, rend le `total` de la portée entière, et ordonne par
 * artiste de carte — ici, l'ordre du tableau `ordonnes`.
 */
function serveurBorne(ordonnes: number[], plafond = PAGE_PORTEE) {
  return vi.fn(async (limite: number, rang: number) => ({
    items: ordonnes
      .slice(rang, rang + Math.min(limite, plafond))
      .map((album_id) => ({ album_id }) as any),
    total: ordonnes.length,
  }));
}

/** 3 200 albums, les 13 « VA - … » en dernier, comme le tri de la route. */
function porteeAvecVAEnQueue() {
  const ordinaires = Array.from({ length: 3187 }, (_, i) => i + 1);
  const va = Array.from({ length: 13 }, (_, i) => 9001 + i);
  return { tous: [...ordinaires, ...va], va };
}

describe('portée dossier : les albums de la portée, en entier (fil 1880)', () => {
  it('🔴 rend AUSSI les albums au-delà du plafond de la route — les « VA - … »', async () => {
    const { tous, va } = porteeAvecVAEnQueue();
    const page = serveurBorne(tous);

    const ids = await idsAlbumsDeLaPortee(page);

    expect(ids.size).toBe(3200);
    for (const id of va) {
      expect(ids.has(id)).toBe(true);
    }
    // Deux pages : 2 000 puis 1 200. La seconde est demandée au rang 2 000.
    expect(page).toHaveBeenCalledTimes(2);
    expect(page).toHaveBeenNthCalledWith(1, PAGE_PORTEE, 0);
    expect(page).toHaveBeenNthCalledWith(2, PAGE_PORTEE, 2000);
  });

  it('ne demande rien de plus quand une seule page suffit', async () => {
    const page = serveurBorne([7, 8, 9]);

    const ids = await idsAlbumsDeLaPortee(page);

    expect([...ids].sort((a, b) => a - b)).toEqual([7, 8, 9]);
    expect(page).toHaveBeenCalledTimes(1);
  });

  it('une portée vide ne rend rien et ne boucle pas', async () => {
    const page = serveurBorne([]);

    expect((await idsAlbumsDeLaPortee(page)).size).toBe(0);
    expect(page).toHaveBeenCalledTimes(1);
  });

  it('un `total` trop grand ne fait pas tourner la boucle sans fin', async () => {
    // Le scan tourne : le COUNT annonce 10 000, les pages n'en ont que 500.
    const page = vi.fn(async (limite: number, rang: number) => ({
      items: Array.from({ length: Math.max(0, Math.min(limite, 500 - rang)) }, (_, i) => ({
        album_id: rang + i + 1,
      })) as any[],
      total: 10_000,
    }));

    const ids = await idsAlbumsDeLaPortee(page);

    expect(ids.size).toBe(500);
    // La page VIDE arrête tout, bien avant le garde-fou de tours.
    expect(page).toHaveBeenCalledTimes(2);
  });

  it("sans `total`, c'est la page NON pleine qui termine", async () => {
    const page = vi.fn(async (limite: number, rang: number) => ({
      items: Array.from({ length: Math.max(0, Math.min(limite, 2500 - rang)) }, (_, i) => ({
        album_id: rang + i + 1,
      })) as any[],
    })) as any;

    const ids = await idsAlbumsDeLaPortee(page);

    expect(ids.size).toBe(2500);
    expect(page).toHaveBeenCalledTimes(2);
  });

  it("une erreur remonte : l'écran DIT qu'il ne sait pas, il ne montre pas une portée amputée", async () => {
    const page = vi.fn(async (_limite: number, rang: number) => {
      if (rang === 0) {
        return {
          items: Array.from({ length: PAGE_PORTEE }, (_, i) => ({ album_id: i + 1 })) as any[],
          total: 3000,
        };
      }
      throw new Error('503');
    });

    await expect(idsAlbumsDeLaPortee(page)).rejects.toThrow('503');
  });
});
