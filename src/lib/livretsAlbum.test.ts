import { describe, expect, it } from 'vitest';
import { chargerLivrets, cibleLivrets, type LecteursLivrets } from './livretsAlbum';

const lecteurs = (o: Partial<LecteursLivrets> = {}): LecteursLivrets => ({
  base: '/api/v1',
  locaux: async () => ({ booklets: [{ name: 'Livret numérique.pdf' }] }),
  deService: async () => [{ name: 'Livret Numérique', url: 'https://static.qobuz.com/goodies/42/000153842.pdf' }],
  navigateur: (u) => u,
  ...o,
});

describe('#6481 — livret PDF de la fiche album', () => {
  it('quelle source pour quel album', () => {
    expect(cibleLivrets({ id: 64 }, {})).toEqual({ kind: 'local', albumId: 64 });
    expect(cibleLivrets({ id: null, source_id: '5099749522428' }, { service: 'qobuz' }))
      .toEqual({ kind: 'service', service: 'qobuz', albumId: '5099749522428' });
    // Dépôt distant, Bandcamp, service sans livrets, album non désigné : rien.
    expect(cibleLivrets({ id: 64 }, { depot: {} })).toBeNull();
    expect(cibleLivrets({ id: null, source_id: 'x' }, { bandcamp: 'https://a.bandcamp.com/album/x' })).toBeNull();
    expect(cibleLivrets({ id: null, source_id: '1' }, { service: 'tidal' })).toBeNull();
    expect(cibleLivrets({ id: null, source_id: '' }, { service: 'qobuz' })).toBeNull();
  });

  it('un livret local s’ouvre par la route du serveur, nom encodé', async () => {
    const l = await chargerLivrets({ kind: 'local', albumId: 64 }, lecteurs());
    expect(l).toEqual([{ nom: 'Livret numérique.pdf', url: '/api/v1/library/albums/64/booklets/Livret%20num%C3%A9rique.pdf' }]);
  });

  it('le jeton du pont est posé sur l’adresse locale', async () => {
    const l = await chargerLivrets({ kind: 'local', albumId: 64 }, lecteurs({ navigateur: (u) => `${u}?token=t` }));
    expect(l[0].url.endsWith('?token=t')).toBe(true);
  });

  it('le livret Qobuz s’ouvre à son adresse https, une autre adresse est écartée', async () => {
    const l = await chargerLivrets({ kind: 'service', service: 'qobuz', albumId: '1' }, lecteurs({
      deService: async () => [
        { name: 'Livret Numérique', url: 'https://static.qobuz.com/goodies/42/000153842.pdf' },
        { name: 'piège', url: 'javascript:void(0)' },
        { name: 'clair', url: 'http://static.qobuz.com/a.pdf' },
      ],
    }));
    expect(l).toEqual([{ nom: 'Livret Numérique', url: 'https://static.qobuz.com/goodies/42/000153842.pdf' }]);
  });

  it('une panne ou un serveur ancien ne propose aucun livret', async () => {
    const panne = async () => { throw Object.assign(new Error('404'), { status: 404 }); };
    expect(await chargerLivrets({ kind: 'local', albumId: 64 }, lecteurs({ locaux: panne }))).toEqual([]);
    expect(await chargerLivrets({ kind: 'service', service: 'qobuz', albumId: '1' }, lecteurs({ deService: panne }))).toEqual([]);
  });
});
