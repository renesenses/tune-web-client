// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import DiscographieCommune from '../../components/v2/DiscographieCommune.svelte';
import { fusionnerDiscographie, partagerParTypeDeSortie } from '../discographieCommune';
import type { Album } from '../types';

const album = (id: number, title: string, release_type?: string | null): Album =>
  ({ id, title, release_type });

describe('#1682 — sections de sortie de la page artiste', () => {
  it('sépare les EP et singles déclarés sans déplacer les albums non renseignés', () => {
    const entrees = fusionnerDiscographie([
      album(1, 'Album sans type'),
      album(2, 'EP connu', 'ep'),
      album(3, 'Album connu', 'album'),
      album(4, 'Single connu', 'single'),
      album(5, 'Type non reconnu', 'epMini'),
    ], []);

    const sections = partagerParTypeDeSortie(entrees);
    expect(sections.albums.map((e) => e.principal.album.title))
      .toEqual(['Album sans type', 'Album connu', 'Type non reconnu']);
    expect(sections.eps.map((e) => e.principal.album.title)).toEqual(['EP connu']);
    expect(sections.singles.map((e) => e.principal.album.title)).toEqual(['Single connu']);
  });

  it('garde les éditions fusionnées avec type manquant ou contradictoire dans Albums', () => {
    const entrees = fusionnerDiscographie(
      [album(1, 'Copie locale', null), album(2, 'Edition contradictoire', 'album'), album(5, 'EP partagé', 'ep')],
      [{ service: 'qobuz', albums: [
        album(3, 'Copie locale', 'EP'),
        album(4, 'Edition contradictoire', 'single'),
        album(6, 'EP partagé', 'ep'),
      ] }],
    );

    const sections = partagerParTypeDeSortie(entrees);
    expect(sections.eps.map((e) => e.principal.album.title)).toEqual(['EP partagé']);
    expect(sections.singles).toEqual([]);
    expect(sections.albums.map((e) => e.principal.album.title))
      .toEqual(['Copie locale', 'Edition contradictoire']);
    expect([...sections.albums, ...sections.eps, ...sections.singles]).toHaveLength(entrees.length);
  });

  it('rend les deux sections sur la fiche sans perdre une édition de type inconnu', () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({}), text: async () => '{}' })));
    vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
    const hote = document.createElement('div');
    document.body.appendChild(hote);
    const composant = mount(DiscographieCommune, {
      target: hote,
      props: {
        locaux: [album(1, 'Sans type'), album(2, 'EP certain', 'ep')],
        onOuvrir: () => {},
        onLire: () => {},
      },
    });
    try {
      flushSync();
      expect(hote.querySelector('[data-section="albums-principaux"] .ct')?.textContent).toBe('Sans type');
      expect(hote.querySelector('[data-section="eps"] .ct')?.textContent).toBe('EP certain');
      expect(hote.querySelector('[data-section="singles"]')).toBeNull();
      expect(hote.querySelector('[data-section="ep-singles"]')).toBeNull();
    } finally {
      unmount(composant);
      hote.remove();
      vi.unstubAllGlobals();
    }
  });
});
