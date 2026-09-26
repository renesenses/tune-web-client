// Bertrand, réunion avec Yves du 17/09/2026, point 4 : « Playlists ou Smart
// playlists, ajouter bouton lecture aléatoire ». Le mélange lui-même est
// éprouvé par `lectureEnMasse` ; ici on tient les TROIS points d'entrée.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const lire = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf-8');

describe('lecture aléatoire des playlists', () => {
  const grille = lire('src/components/v2/PlaylistsV2.svelte');

  /**
   * ⚠️ 26/09/2026 — les tableaux ne sont plus écrits dans le balisage : les
   * treize écrans puisent dans `lib/actionsPochette`, qui décide de la clé
   * (`library.shuffle`) et du rang. C'est ce catalogue qui a révélé que
   * `SmartPlaylistsView` montrait la MÊME playlist intelligente SANS cette
   * entrée — le point 4 de Bertrand n'était tenu qu'à moitié.
   *
   * Ce qui reste à tenir ici : chaque surface FOURNIT bien le geste, et le
   * mélange passe toujours par `lectureEnMasse`.
   */
  it('la vignette d’une playlist propose « Lecture aléatoire »', () => {
    expect(grille).toContain('lireAleatoire: () => void lireLocalAleatoire(pl)');
    expect(grille).toMatch(/lireListeAleatoire\(pistes, gestesDeLecture\(zid\)\)/);
  });

  it('la vignette d’une playlist intelligente aussi, et sa lecture accepte les favoris de service', () => {
    expect(grille).toContain('lireAleatoire: () => lireSmart(sp, true)');
    // Plus de `track_ids` seuls : une règle « Source = Qobuz » ramène des pistes sans id.
    expect(grille).not.toContain('track_ids: ids.slice(0, 500)');
  });

  it('🔴 et la vignette de l’écran d’héritage AUSSI — elle ne l’avait pas', () => {
    // La divergence que le catalogue referme : `PlaylistsV2` offrait
    // « Lire en aléatoire » sur la vignette d'une playlist intelligente,
    // `SmartPlaylistsView` non, alors que le geste y existait déjà deux fois
    // (`playShuffle` sur la fiche, `lireListeAleatoire` importé).
    const fiche = lire('src/components/v2-heritage/SmartPlaylistsView.svelte');
    expect(fiche).toContain('lireAleatoire: () => void lireSmartPlaylist(sp, true)');
    expect(fiche).toMatch(/aleatoire \? lireListeAleatoire\(pistes, gestes\) : lireListe\(pistes, gestes\)/);
  });

  it('la fiche d’une playlist intelligente a son bouton', () => {
    const fiche = lire('src/components/v2-heritage/SmartPlaylistsView.svelte');
    expect(fiche).toMatch(/<button class="edit-btn" onclick=\{playShuffle\}/);
    expect(fiche).toMatch(/await lireListeAleatoire\(spTracks,/);
  });
});
