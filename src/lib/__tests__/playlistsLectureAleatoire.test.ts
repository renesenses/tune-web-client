// Bertrand, réunion avec Yves du 17/09/2026, point 4 : « Playlists ou Smart
// playlists, ajouter bouton lecture aléatoire ». Le mélange lui-même est
// éprouvé par `lectureEnMasse` ; ici on tient les TROIS points d'entrée.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const lire = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf-8');

describe('lecture aléatoire des playlists', () => {
  const grille = lire('src/components/v2/PlaylistsV2.svelte');

  it('la vignette d’une playlist propose « Lecture aléatoire »', () => {
    expect(grille).toContain("{ libelle: $t('library.shuffle' as any), faire: () => void lireLocalAleatoire(pl) }");
    expect(grille).toMatch(/lireListeAleatoire\(pistes, gestesDeLecture\(zid\)\)/);
  });

  it('la vignette d’une playlist intelligente aussi, et sa lecture accepte les favoris de service', () => {
    expect(grille).toContain("menu={[{ libelle: $t('library.shuffle' as any), faire: () => lireSmart(sp, true) }]}");
    // Plus de `track_ids` seuls : une règle « Source = Qobuz » ramène des pistes sans id.
    expect(grille).not.toContain('track_ids: ids.slice(0, 500)');
  });

  it('la fiche d’une playlist intelligente a son bouton', () => {
    const fiche = lire('src/components/v2-heritage/SmartPlaylistsView.svelte');
    expect(fiche).toMatch(/<button class="edit-btn" onclick=\{playShuffle\}/);
    expect(fiche).toMatch(/await lireListeAleatoire\(spTracks,/);
  });
});
