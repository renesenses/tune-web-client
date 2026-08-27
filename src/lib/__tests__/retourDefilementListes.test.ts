import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Playlists, Podcasts et Smart Collections : le retour depuis une fiche
 * repose la liste tout en haut, au lieu de la reposer là où on l'avait
 * laissée.
 *
 * Correctif d'origine : `0c1f144` (« Back restores list scroll in Playlists,
 * Podcasts, Smart Collections », 2026-07-14), avalé par la fusion `f14553f` du
 * 2026-07-23. Le mécanisme partagé `saveDetailScroll`/`restoreDetailScroll`,
 * lui, a survécu (`stores/navigation.ts`) et sert toujours Collections et
 * Serveurs multimédia — ce sont ses trois APPELANTS qui ont disparu.
 *
 * Ce qui est restauré n'est pas le diff d'origine : la leçon de la PR #615
 * (renesenses/tune-server-rust#2253) s'applique ici mot pour mot. La fonction
 * d'ouverture a plusieurs appelants et un seul part réellement d'une liste ;
 * mémoriser sans condition écrase la position à garder par le défilement d'une
 * fiche (≈ 0), et `restoreDetailScroll` ne fait rien pour une cible <= 0. La
 * garde `si aucune fiche n'est ouverte` est donc portée aux TROIS vues, alors
 * que `0c1f144` ne l'avait que pour les podcasts.
 */

// ---------------------------------------------------------------------------
// 1. Banc d'essai : la règle
// ---------------------------------------------------------------------------

const DEFILEMENT_LISTE = 4000;
const DEFILEMENT_FICHE = 0; // une fiche fraîchement ouverte est en haut

/**
 * Rejoue liste défilée → fiche → retour, et rend la position que la liste
 * retrouve. `memoriser` est la décision testée.
 */
function positionRetrouvee(
  memoriser: (etat: { ficheOuverte: boolean }) => boolean,
  options: { raccourciPendantLaFiche?: boolean } = {},
): number {
  let memorisee = 0;
  let ficheOuverte = false;
  let defilement = DEFILEMENT_LISTE;

  // `selectPlaylist` / `selectPodcast` / `openCollection`
  const ouvrirFiche = () => {
    if (memoriser({ ficheOuverte })) memorisee = defilement;
    ficheOuverte = true;
    defilement = DEFILEMENT_FICHE;
  };

  ouvrirFiche();

  // Le piège de la PR #615 : ces fonctions sont AUSSI appelées depuis une fiche
  // déjà ouverte (restauration d'un raccourci, rafraîchissement après édition
  // des règles, réentrée #1215). Sans garde, cet appel mémorise 0 et détruit la
  // seule position qu'il fallait garder.
  if (options.raccourciPendantLaFiche) ouvrirFiche();

  // `goBack()` : `restoreDetailScroll` ne fait rien pour une cible <= 0.
  ficheOuverte = false;
  return memorisee > 0 ? memorisee : 0;
}

/** La règle restaurée : ne mémoriser qu'en quittant réellement une liste. */
const memoriserSeulementDepuisLaListe = (etat: { ficheOuverte: boolean }) => !etat.ficheOuverte;

describe('Retour vers une liste : la position (0c1f144)', () => {
  it('forme fautive — ne rien mémoriser repose la liste en haut', () => {
    // L'état actuel des trois vues : aucun appel à saveDetailScroll.
    expect(positionRetrouvee(() => false)).toBe(0);
  });

  it('forme corrigée — mémoriser depuis la liste garde la position', () => {
    expect(positionRetrouvee(memoriserSeulementDepuisLaListe)).toBe(DEFILEMENT_LISTE);
  });

  it('mémoriser SANS garde se fait détruire par un appel depuis la fiche', () => {
    // La forme naïve — celle de `0c1f144` pour Playlists et Smart Collections.
    expect(positionRetrouvee(() => true, { raccourciPendantLaFiche: true })).toBe(0);
    // La forme gardée résiste au même appel.
    expect(
      positionRetrouvee(memoriserSeulementDepuisLaListe, { raccourciPendantLaFiche: true }),
    ).toBe(DEFILEMENT_LISTE);
  });
});

// ---------------------------------------------------------------------------
// 2. Gardes de code
// ---------------------------------------------------------------------------

function lire(chemin: string): string {
  const source = readFileSync(resolve(process.cwd(), chemin), 'utf-8');
  expect(source.length).toBeGreaterThan(1000);
  return source;
}

function corpsDe(source: string, declaration: string, taille = 2500): string {
  const debut = source.indexOf(declaration);
  expect(debut, `déclaration introuvable : ${declaration}`).toBeGreaterThan(-1);
  const corps = source.slice(debut, debut + taille);
  expect(corps.length).toBeGreaterThan(100);
  return corps;
}

describe('PlaylistsView mémorise et rétablit la position de sa liste', () => {
  const source = lire('src/components/PlaylistsView.svelte');

  it('importe le mécanisme partagé', () => {
    expect(source).toMatch(
      /import\s*\{[^}]*\bsaveDetailScroll\b[^}]*\brestoreDetailScroll\b[^}]*\}\s*from\s*'\.\.\/lib\/stores\/navigation'/,
    );
  });

  it('le conteneur `.playlists-view` est référencé', () => {
    expect(source).toMatch(/class="playlists-view"[^>]*bind:this=\{viewEl\}/);
  });

  it('`selectPlaylist` mémorise, sous garde', () => {
    const corps = corpsDe(source, 'async function selectPlaylist');
    expect(corps).toContain('api.getPlaylistTracks');
    expect(corps).toMatch(/if\s*\(!selectedPlaylist[^)]*\)\s*saveDetailScroll\('playlists', viewEl\)/);
  });

  it('`selectStreamingPlaylist` mémorise, sous garde', () => {
    const corps = corpsDe(source, 'async function selectStreamingPlaylist');
    expect(corps).toContain('api.getStreamingPlaylistTracks');
    expect(corps).toMatch(/saveDetailScroll\('playlists', viewEl\)/);
  });

  it('`goBack` rétablit', () => {
    const corps = corpsDe(source, 'function goBack');
    expect(corps).toContain('selectedPlaylist = null');
    expect(corps).toContain("restoreDetailScroll('playlists', viewEl)");
  });
});

describe('PodcastsView mémorise et rétablit la position de sa liste', () => {
  const source = lire('src/components/PodcastsView.svelte');

  it('importe le mécanisme partagé', () => {
    expect(source).toMatch(
      /import\s*\{[^}]*\bsaveDetailScroll\b[^}]*\brestoreDetailScroll\b[^}]*\}\s*from\s*'\.\.\/lib\/stores\/navigation'/,
    );
  });

  it('le conteneur `.podcasts-view` est référencé', () => {
    expect(source).toMatch(/class="podcasts-view"[^>]*bind:this=\{viewEl\}/);
  });

  it('`selectPodcast` mémorise, sous garde', () => {
    const corps = corpsDe(source, 'async function selectPodcast');
    expect(corps).toContain('api.getPodcastEpisodes');
    expect(corps).toMatch(/if\s*\(!selectedPodcast\)\s*saveDetailScroll\('podcasts', viewEl\)/);
  });

  it('`goBack` rétablit', () => {
    const corps = corpsDe(source, 'function goBack');
    expect(corps).toContain('selectedPodcast = null');
    expect(corps).toContain("restoreDetailScroll('podcasts', viewEl)");
  });
});

describe('SmartCollectionsView mémorise et rétablit la position de sa liste', () => {
  const source = lire('src/components/SmartCollectionsView.svelte');

  it('`openCollection` mémorise, sous garde', () => {
    const corps = corpsDe(source, 'async function openCollection');
    expect(corps).toContain('getSmartCollectionAlbums');
    expect(corps).toMatch(/if\s*\(!selected\)\s*saveDetailScroll\('smartcollections-liste', scrollContainer\(\)\)/);
  });

  it('le bouton Retour rétablit la position de la liste', () => {
    expect(source).toMatch(/class="back"[\s\S]{0,160}?backToList\b/);
    const corps = corpsDe(source, 'function backToList', 500);
    expect(corps).toContain('selected = null');
    expect(corps).toContain("restoreDetailScroll('smartcollections-liste', scrollContainer())");
  });

  it('la clé du retour de vue (#1215) reste DISTINCTE de celle de la liste', () => {
    // `smartcollections-back` mémorise le défilement de la GRILLE d'une
    // collection ouverte, avant de partir vers la fiche album de la
    // Bibliothèque. Les confondre ferait rétablir l'une à la place de l'autre.
    expect(source).toContain("saveDetailScroll('smartcollections-back'");
    expect(source).toContain("restoreDetailScroll('smartcollections-back'");
    expect(source).toContain("'smartcollections-liste'");
  });
});
