import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { clePisteJumelee } from '../stores/profile';

const lire = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf-8');
const sansCommentaires = (s: string) =>
  s.replace(/<!--[\s\S]*?-->/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

describe('Favori jumelé : streaming ↔ local (Bertrand, 05/09/2026)', () => {
  it('la clé reproduit À L’IDENTIQUE la normalisation du serveur', () => {
    // Le serveur compare `lower(trim(...))` des deux côtés. Toute latitude
    // prise ici ferait diverger le cœur affiché de ce que retiennent les
    // règles.
    expect(clePisteJumelee('  So What ', 'Miles Davis')).toBe(clePisteJumelee('so what', 'miles davis'));
    expect(clePisteJumelee('So What', 'MILES DAVIS')).toBe(clePisteJumelee('so what', 'miles davis'));
  });

  it("elle n'approxime PAS — c'est assumé côté serveur", () => {
    // « Un titre orthographié différemment ne matche pas, c'est assumé »
    // (commentaire de `track_favorites_sub`).
    expect(clePisteJumelee('So What?', 'Miles Davis')).not.toBe(clePisteJumelee('So What', 'Miles Davis'));
  });

  it('un artiste absent ne confond pas deux titres homonymes', () => {
    // Le serveur passe par `coalesce(..., '')` : l'absence est une valeur, pas
    // un joker.
    expect(clePisteJumelee('Hallelujah', null)).not.toBe(clePisteJumelee('Hallelujah', 'Cohen'));
  });

  it('le titre et l’artiste sont CONSERVÉS au chargement', () => {
    // Ils étaient jetés : le client ne gardait que `type:service:id`, donc ne
    // pouvait pas rapprocher.
    const store = sansCommentaires(lire('src/lib/stores/profile.ts'));
    expect(store).toContain('favoriteStreamingTrackKeys');
    expect(store).toContain("f.item_type === 'track' && f.title");
    expect(store).toContain('clePisteJumelee(f.title, f.artist)');
    // Un favori sans titre ne rapproche personne — le serveur l'écarte aussi
    // (`sf9.title IS NOT NULL`).
    expect(store).toContain('&& f.title');
  });

  it('les deux cœurs suivent la même règle', () => {
    const pa = sansCommentaires(lire('src/components/v2/PisteActions.svelte'));
    expect(pa).toContain('$favoriteTrackIds.has(piste.id!) || parJumeau');
    expect(pa).toContain('clePisteJumelee(piste.title, piste.artist_name)');
    const hb = sansCommentaires(lire('src/components/HeartButton.svelte'));
    expect(hb).toContain('$favoriteStreamingTrackKeys.has(clePisteJumelee(titre, artiste))');
  });

  it('le jumelage ne vaut QUE pour les pistes locales', () => {
    // Une piste de service a sa propre clé `type:service:id` : la rapprocher
    // par le titre la ferait paraître favorite chez un autre service.
    const pa = sansCommentaires(lire('src/components/v2/PisteActions.svelte'));
    expect(pa).toContain('const parJumeau = $derived(\n    local &&');
  });

  it('un cœur vidé quand rien n’est chargé', () => {
    const store = sansCommentaires(lire('src/lib/stores/profile.ts'));
    // Changer de profil doit vider aussi ce nouvel ensemble, sinon les favoris
    // du profil précédent resteraient affichés.
    const i = store.indexOf('if (profileId === null)');
    expect(store.slice(i, i + 600)).toContain('favoriteStreamingTrackKeys.set(new Set())');
  });
});
