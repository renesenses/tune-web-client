import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * Import d'une playlist Linn (`.dpl`, Pierre Mack) — porté de l'ancienne
 * interface, seul écran qui savait l'envoyer à `POST /playlists/import/linn`.
 * Il rejoint le bouton « Importer » de l'écran Playlists, à côté du M3U.
 *
 * (Les autres imports de l'ancien écran ne sont PAS portés, et c'est voulu :
 * `/system/import/playlists` est un bouchon côté serveur — « not yet
 * implemented » — et Roon/Plex n'ont jamais pu marcher, contrat rompu des deux
 * côtés, mis de côté le 01/09/2026.)
 */
const V2 = readFileSync('src/components/v2/PlaylistsV2.svelte', 'utf8');
const debut = V2.indexOf('async function importer(');
const corps = V2.slice(debut, V2.indexOf('\n  }\n', debut));

describe('le bouton Importer de Playlists accepte une playlist Linn', () => {
  it('le sélecteur de fichier propose `.dpl`', () => {
    expect(V2).toMatch(/<input type="file" accept="[^"]*\.dpl[^"]*" onchange=\{importer\}/);
  });

  it('un `.dpl` part vers la route Linn, AVANT le chemin M3U', () => {
    const linn = corps.indexOf('api.importLinnPlaylist(f)');
    expect(linn, 'un .dpl n’est pas envoyé à la route Linn').toBeGreaterThan(-1);
    expect(corps.slice(0, linn)).toMatch(/\.endsWith\('\.dpl'\)/);
    expect(linn).toBeLessThan(corps.indexOf('api.importPlaylistFile(f)'));
  });

  it('le bouton se libère aussi après un import Linn (qui sort par `return`)', () => {
    expect(corps).toMatch(/\} finally \{\s*importEnCours = false;\s*\}/);
  });
});
