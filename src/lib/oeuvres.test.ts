import { describe, it, expect } from 'vitest';
import { regrouperAlbums, libelleVersion, resolution, type MembresOeuvre, type VersionAlbum } from './oeuvres';

const album = (id: number, title: string) => ({ id, title });

// « Abbey Road » en trois versions (CD, remaster Hi-Res, deluxe), la Hi-Res
// préférée ; « Blue Train » seul.
const membres: MembresOeuvre[] = [{ work_id: 'at:7:abbey road', preferred_id: 2, ids: [1, 2, 3] }];

describe('regrouperAlbums (tune-server-rust#7617)', () => {
  it('une seule carte par œuvre : la version préférée, avec son nombre de versions', () => {
    const l = [album(1, 'Abbey Road'), album(2, 'Abbey Road (2019 Remaster)'), album(3, 'Abbey Road (Deluxe)'), album(9, 'Blue Train')];
    const r = regrouperAlbums(l, membres);
    expect(r.albums.map((a) => a.id)).toEqual([2, 9]);
    expect(r.versions.get(2)).toBe(3);
    expect(r.versions.has(9)).toBe(false);
  });

  it("la carte gardée reste à SA place dans l'ordre reçu (le tri de la grille vaut pour ce qu'elle montre)", () => {
    const l = [album(9, 'Blue Train'), album(3, 'Abbey Road (Deluxe)'), album(8, 'Help!'), album(2, 'Abbey Road (2019 Remaster)')];
    expect(regrouperAlbums(l, membres).albums.map((a) => a.id)).toEqual([9, 8, 2]);
  });

  it('la préférée écartée par un filtre : le premier membre présent la remplace', () => {
    const l = [album(3, 'Abbey Road (Deluxe)'), album(1, 'Abbey Road')];
    const r = regrouperAlbums(l, membres);
    expect(r.albums.map((a) => a.id)).toEqual([3]);
    expect(r.versions.get(3)).toBe(3);
  });

  it('sans œuvre de plusieurs versions (serveur ancien ou réglage désactivé) : la liste intacte', () => {
    const l = [album(1, 'Abbey Road'), album(2, 'Abbey Road (2019 Remaster)')];
    const r = regrouperAlbums(l, []);
    expect(r.albums).toBe(l);
    expect(r.versions.size).toBe(0);
  });
});

describe('libelleVersion', () => {
  const v = (p: Partial<VersionAlbum>): VersionAlbum => ({
    id: 1, title: 'Abbey Road', version_name: null, year: null, label: null,
    format: null, sample_rate: null, bit_depth: null, source: 'local', ...p,
  });

  it('nom, année, label, format et résolution', () => {
    expect(libelleVersion(v({ version_name: '2019 Remaster', year: 2019, label: 'Apple', format: 'flac', sample_rate: 96000, bit_depth: 24 })))
      .toBe('2019 Remaster · 2019 · Apple · FLAC · 24/96');
  });

  it('une version sans rien de connu garde son titre', () => {
    expect(libelleVersion(v({}))).toBe('Abbey Road');
  });

  it('résolution en kHz décimaux', () => {
    expect(resolution({ sample_rate: 44100, bit_depth: 16 })).toBe('16/44.1');
    expect(resolution({ sample_rate: null, bit_depth: 16 })).toBe('');
  });
});
