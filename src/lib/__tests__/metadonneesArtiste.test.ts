import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { normaliserMetadonnees, bioDans, bilanEnrichissement } from '../metadonneesArtiste';

describe('normaliserMetadonnees', () => {
  it('déballe `data` et remonte le statut', () => {
    const m: any = normaliserMetadonnees({ data: { bio: 'x' }, enrichment_status: 'done' });
    expect(m.bio).toBe('x');
    expect(m.enrichment_status).toBe('done');
  });
  it('la bio française l’emporte, le résumé sert de repli', () => {
    expect(normaliserMetadonnees({ bio: 'en', bio_fr: 'fr' }).bio).toBe('fr');
    expect(normaliserMetadonnees({ bio_summary: 'court' }).bio).toBe('court');
  });
  it('les étiquettes deviennent des genres', () => {
    expect((normaliserMetadonnees({ tags: ['jazz'] }) as any).genres).toEqual(['jazz']);
  });
});

describe('bioDans / bilanEnrichissement', () => {
  it('prend la bio anglaise pour l’anglais', () => {
    expect(bioDans({ bio: 'fr', bio_en: 'en' } as any, 'en')).toBe('en');
    expect(bioDans({ bio: 'fr', bio_en: 'en' } as any, 'fr')).toBe('fr');
  });
  it('🔴 « rien trouvé » est une réponse, pas un silence', () => {
    expect(bilanEnrichissement({} as any)).toBe('library.noInfoFound');
    expect(bilanEnrichissement({ bio: 'x' } as any)).toBe('library.bioEnriched');
    expect(bilanEnrichissement({ similar_artists: [{ name: 'a', reason: '' }] } as any)).toBe('library.similarAndTagsFound');
  });
});

describe('fiche artiste v2 : enrichissement, similaires, membres, crédits', () => {
  const A = readFileSync('src/components/v2/ArtistesV2.svelte', 'utf8');
  it('l’enrichissement est offert, passe par la route et dit son bilan', () => {
    expect(A).toContain('onclick={enrichir}');
    const i = A.indexOf('async function enrichir(');
    const c = A.slice(i, A.indexOf('\n  }\n', i));
    expect(c).toContain('api.enrichArtist(');
    expect(c).toContain('bilanEnrichissement(');
  });
  it('métadonnées et crédits sont lus à l’ouverture de la fiche', () => {
    expect(A).toContain('api.getArtistMetadata(');
    expect(A).toContain('api.getArtistCredits(');
  });
  it('similaires, membres et instruments sont affichés', () => {
    expect(A).toContain('{#each metaFiche.similar_artists as sa (sa.name)}');
    expect(A).toContain('{#each metaFiche.members as m (m.name)}');
    expect(A).toContain('uniqueInstruments(creditsFiche)');
  });
});

describe('onglet « Ajouts récents » (#3039) porté dans la Bibliothèque v2', () => {
  const L = readFileSync('src/components/v2/LibraryV2.svelte', 'utf8');
  const R = readFileSync('src/components/v2/AjoutsRecentsV2.svelte', 'utf8');
  it('l’onglet existe et monte le composant, qui ouvre la fiche album', () => {
    expect(L).toContain("{ id: 'recent', label: 'library.recentlyAdded' }");
    // #1367 — la balise n'est plus auto-fermée nue : la bascule grille/liste
    // lui descend désormais `vue`. On garde la garde sur ce qui compte (le
    // composant est monté, et il reçoit de quoi ouvrir la fiche) sans figer
    // la liste de ses props, qui a déjà cassé cette ligne une fois. Le
    // comportement, lui, est mesuré sur l'écran monté par
    // `ajoutsRecentsCommandesInertes1367.test.ts`.
    const balise = L.match(/<AjoutsRecentsV2\b[^>]*\/>/)?.[0];
    expect(balise, '<AjoutsRecentsV2 …/> n’est plus monté dans LibraryV2').toBeTruthy();
    expect(balise).toContain('onOuvrir={ouvrirCalqueAlbum}');
    // #929 — la bascule a désormais un TROISIÈME cran, le carrousel, que cet
    // écran ne sait pas rendre : il reçoit le mode RABATTU sur la grille. La
    // garde porte donc sur ce qui compte — le mode de l'écran lui est bien
    // descendu — et non sur la forme exacte de l'expression, qui a déjà cassé
    // cette ligne une fois. Qu'il ne reçoive jamais `carousel` est mesuré sur
    // l'écran monté, par `carrouselAlbums929.test.ts`.
    expect(balise).toMatch(/vue=\{[^}]*\bdisplay\b/);
  });
  it('🔴 liste et décompte portent sur la MÊME fenêtre, et un résultat périmé est jeté', () => {
    expect(R).toContain('api.getRecentlyAdded(fenetre, PLAFOND)');
    expect(R).toContain('api.getRecentlyAddedSummary(fenetre)');
    expect(R.match(/if \(jours !== fenetre\) return;/g)?.length).toBe(2);
  });
  it('un échec vide la liste et le dit', () => {
    expect(R).toContain("notifications.error($tr('library.recentLoadError'");
  });
});
