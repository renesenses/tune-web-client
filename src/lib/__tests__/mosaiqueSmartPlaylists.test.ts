import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Demande de Bertrand (22/09/2026) : l'onglet Smart playlists montre la même
 * représentation que les autres listes — une mosaïque de quatre pochettes.
 *
 * Une playlist intelligente n'a pas de pochette à elle : son contenu est
 * calculé. Les images viennent donc de ses pistes, comme dans `PlaylistsV2` et
 * le gestionnaire de playlists.
 */
describe('Smart playlists : la carte porte la mosaïque de quatre pochettes', () => {
  const vue = readFileSync(
    resolve(__dirname, '../../components/v2-heritage/SmartPlaylistsView.svelte'),
    'utf-8',
  );

  it('la carte monte MosaiquePochettes, avec l’étoile en repli', () => {
    expect(vue).toContain("import MosaiquePochettes from '../v2/MosaiquePochettes.svelte'");
    expect(vue).toMatch(/\{#if sp\.id != null && mosaiques\[sp\.id\]\}/);
    expect(vue).toContain('<MosaiquePochettes pochettes={mosaiques[sp.id]}');
    // Le repli : sans pochettes chargées, la carte garde son étoile.
    const bloc = vue.slice(vue.indexOf('{#if sp.id != null && mosaiques[sp.id]}'));
    expect(bloc.slice(0, bloc.indexOf('{/if}'))).toContain('card-icon');
  });

  it('les pochettes viennent des PISTES, dédoublonnées par le même utilitaire', () => {
    expect(vue).toContain("import { quatreDistinctes } from '../../lib/mosaique'");
    expect(vue).toContain('api.getSmartPlaylistTracks(id)');
    expect(vue).toContain('quatreDistinctes(');
  });

  it('elles se chargent APRÈS la liste, et une seule fois par playlist', () => {
    // Chaque vignette recalcule la sélection côté serveur : la grille ne doit
    // rien attendre, et une playlist ne doit pas être redemandée à chaque
    // re-rendu.
    expect(vue).toContain('void chargerMosaiques(smartPlaylists)');
    expect(vue).toContain('mosaiquesDemandees');
    expect(vue).toContain('Promise.allSettled');
    const charge = vue.indexOf('smartPlaylists = await api.getSmartPlaylists()');
    const mosaique = vue.indexOf('void chargerMosaiques(smartPlaylists)');
    expect(charge).toBeGreaterThan(-1);
    expect(mosaique).toBeGreaterThan(charge);
  });
});
