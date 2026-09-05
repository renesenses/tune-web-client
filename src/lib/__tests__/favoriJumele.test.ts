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

describe('Reprise des favoris posés CHEZ les services', () => {
  const store = sansCommentaires(lire('src/lib/stores/profile.ts'));

  it('les favoris du service alimentent les DEUX index', () => {
    // Bertrand, 05/09/2026 : « le cœur ne rougit toujours pas sur Get Lucky ».
    // Ce titre est dans ses favoris Qobuz (`source_id 9140031`, parmi 14) mais
    // pas dans `streaming_favorites`, qui ne reçoit que les cœurs cliqués DANS
    // Tune.
    expect(store).toContain('reprendreFavorisDesServices');
    expect(store).toContain('api.getStreamingFavorites(svc, route)');
    // Les clés `type:service:id` — pour le cœur d'un objet de service.
    expect(store).toContain('set.add(streamingFavKey(type, svc, String(sid)))');
    // Les clés titre+artiste — pour le jumelage avec une piste locale.
    expect(store).toContain('set.add(clePisteJumelee(titre, it?.artist_name ?? it?.artist))');
  });

  it("elle ne RETARDE pas l'affichage des favoris locaux", () => {
    // Un service lent ne doit pas bloquer les ensembles principaux.
    expect(store).toContain('void reprendreFavorisDesServices();');
    expect(store).not.toContain('await reprendreFavorisDesServices()');
  });

  it('un service en échec ne prive pas des autres', () => {
    expect(store).toContain('Promise.allSettled(');
    expect(store).toContain('.filter(([, st]: [string, any]) => st?.authenticated)');
  });

  it('les ensembles sont RECOPIÉS, jamais mutés en place', () => {
    // Un `Set` mute en place ne notifie pas ses abonnés : les cœurs ne se
    // mettraient à jour qu'au prochain changement de profil.
    expect((store.match(/return new Set\(set\);/g) ?? []).length).toBe(2);
  });
});
