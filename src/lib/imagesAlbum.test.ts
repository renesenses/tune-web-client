import { describe, expect, it } from 'vitest';
import { chargerImagesAlbum, indiceApresTouche, libelleImage, urlImageAlbum } from './imagesAlbum';

const lecteurs = (images: unknown) => ({
  base: '/api/v1',
  liste: async () => ({ images: images as Array<Record<string, unknown>> }),
  navigateur: (u: string) => u,
});

describe('fil forum 3050 — la galerie des images du dossier d\'un album', () => {
  it('construit les adresses par IDENTIFIANT, jamais par nom', () => {
    expect(urlImageAlbum('/api/v1', 64, '0123456789abcdef')).toBe('/api/v1/library/albums/64/images/0123456789abcdef');
    expect(urlImageAlbum('/api/v1', 64, '0123456789abcdef', 400)).toBe('/api/v1/library/albums/64/images/0123456789abcdef?size=400');
  });

  it('garde les images bien formées, dans l\'ordre du serveur', async () => {
    const l = await chargerImagesAlbum(64, lecteurs([
      { id: '0123456789abcdef', name: 'folder.jpg', folder: null, size: 10, mime: 'image/jpeg' },
      { id: 'fedcba9876543210', name: 'Back.jpeg', folder: 'Scans', size: 10, mime: 'image/jpeg' },
    ]));
    expect(l).toEqual([
      {
        id: '0123456789abcdef', nom: 'folder.jpg', dossier: null,
        vignette: '/api/v1/library/albums/64/images/0123456789abcdef?size=400',
        url: '/api/v1/library/albums/64/images/0123456789abcdef',
      },
      {
        id: 'fedcba9876543210', nom: 'Back.jpeg', dossier: 'Scans',
        vignette: '/api/v1/library/albums/64/images/fedcba9876543210?size=400',
        url: '/api/v1/library/albums/64/images/fedcba9876543210',
      },
    ]);
  });

  it('écarte un identifiant qui n\'a pas la forme émise par le serveur (et les doublons)', async () => {
    const l = await chargerImagesAlbum(64, lecteurs([
      { id: '../../etc/passwd', name: 'x.jpg' },
      { id: 'Scans/back.jpg', name: 'back.jpg' },
      { id: '0123456789ABCDEF', name: 'maj.jpg' },
      { id: 42, name: 'nombre.jpg' },
      { id: '0123456789abcdef', name: 'ok.jpg' },
      { id: '0123456789abcdef', name: 'doublon.jpg' },
    ]));
    expect(l.map((i) => i.nom)).toEqual(['ok.jpg']);
  });

  it('un serveur ancien (404), une panne ou un album hors bibliothèque : aucune galerie', async () => {
    expect(await chargerImagesAlbum(64, { ...lecteurs([]), liste: async () => { throw new Error('404'); } })).toEqual([]);
    expect(await chargerImagesAlbum(64, { ...lecteurs([]), liste: async () => null })).toEqual([]);
    expect(await chargerImagesAlbum(0, lecteurs([{ id: '0123456789abcdef' }]))).toEqual([]);
    expect(await chargerImagesAlbum(-3, lecteurs([{ id: '0123456789abcdef' }]))).toEqual([]);
  });

  it('se parcourt au clavier en boucle, Échap ferme', () => {
    expect(indiceApresTouche('ArrowRight', 0, 3)).toBe(1);
    expect(indiceApresTouche('ArrowRight', 2, 3)).toBe(0);
    expect(indiceApresTouche('ArrowLeft', 0, 3)).toBe(2);
    expect(indiceApresTouche('Home', 2, 3)).toBe(0);
    expect(indiceApresTouche('End', 0, 3)).toBe(2);
    expect(indiceApresTouche('Escape', 1, 3)).toBeNull();
    expect(indiceApresTouche('a', 1, 3)).toBeUndefined();
  });

  it('nomme une image sans son extension, précédée de son sous-dossier', () => {
    expect(libelleImage({ nom: 'Back.JPEG', dossier: 'Scans' })).toBe('Scans · Back');
    expect(libelleImage({ nom: 'folder.jpg', dossier: null })).toBe('folder');
  });
});
