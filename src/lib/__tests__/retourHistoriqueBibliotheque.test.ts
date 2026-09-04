import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Bibliothèque : le premier appui sur « Précédent » du navigateur reste sans
 * effet, parce qu'ouvrir un album ou un artiste empile DEUX entrées
 * d'historique pour une seule navigation.
 *
 * Correctif d'origine : `5c420af` (« browser Back returns to grid in one press
 * + own URL for detail », 2026-07-13), avalé par la fusion `f14553f` du
 * 2026-07-23 — les deux lignes du commit ont disparu du fichier final sans que
 * le commit sorte de l'histoire.
 *
 * Le défaut a été re-constaté indépendamment, par lecture, dans le corps de la
 * PR #615 (« Un point voisin que je ne touche pas ici ») : « `selectArtistDetail`
 * fait `selectedArtist.set(artist)` — ce qui déclenche déjà un `pushState` dans
 * l'abonnement de `App.svelte` — **puis** son propre `window.history.pushState`.
 * Deux entrées d'historique pour une seule navigation. […] À instruire
 * séparément. » C'est cette instruction-ci.
 *
 * Deux séries, et il faut les deux :
 *
 * 1. un BANC D'ESSAI qui rejoue la pile d'historique réelle et compte les
 *    appuis nécessaires pour retrouver la grille. La FORME FAUTIVE y est
 *    gardée à côté de la corrigée : sans elle, rien ne montrerait que le banc
 *    sait distinguer les deux ;
 * 2. une GARDE DE CODE qui prouve que la règle est encore APPLIQUÉE dans
 *    `LibraryView.svelte` et `App.svelte`. Sans elle, remettre le `pushState`
 *    ramènerait le bug sans qu'aucun test ne bronche.
 */

// ---------------------------------------------------------------------------
// 1. Banc d'essai : la pile d'historique du navigateur
// ---------------------------------------------------------------------------

interface Ctx {
  view: string;
  albumId: number | null;
  artistId: number | null;
  tab: string | null;
}

/** Pile d'historique minimale, fidèle à `pushState`/`replaceState`/`back`. */
class Historique {
  entrees: Ctx[] = [];
  index = -1;

  pushState(ctx: Ctx) {
    // Empiler tronque la branche « en avant », comme le navigateur.
    this.entrees = this.entrees.slice(0, this.index + 1);
    this.entrees.push(ctx);
    this.index = this.entrees.length - 1;
  }

  replaceState(ctx: Ctx) {
    if (this.index < 0) this.pushState(ctx);
    else this.entrees[this.index] = ctx;
  }

  /** Rend l'entrée atteinte, ou `null` si l'on est déjà au fond. */
  back(): Ctx | null {
    if (this.index <= 0) return null;
    this.index -= 1;
    return this.entrees[this.index];
  }
}

/**
 * Rejoue la Bibliothèque : les abonnements `selectedAlbum`/`selectedArtist` de
 * `App.svelte`, la fonction `selectAlbumDetail`/`selectArtistDetail` de
 * `LibraryView.svelte`, et le gestionnaire `popstate`.
 *
 * `poussoirRedondant` est le seul point qui change entre la forme fautive et
 * la forme corrigée : c'est le `window.history.pushState` que `LibraryView`
 * exécutait EN PLUS de celui de l'abonnement.
 */
function bibliotheque(poussoirRedondant: boolean) {
  const h = new Historique();
  let selectedAlbum: number | null = null;
  let selectedArtist: number | null = null;
  const tab = 'albums';

  // Entrée initiale : la grille (`activeView` s'installe en `#library`).
  h.replaceState({ view: 'library', albumId: null, artistId: null, tab });

  /** Abonnement `selectedAlbum` d'App.svelte (l. 623). */
  const majAlbum = (album: number | null) => {
    const ctx: Ctx = { view: 'library', albumId: album, artistId: selectedArtist, tab };
    if (album !== null) h.pushState(ctx);
    else h.replaceState(ctx);
  };

  /** Abonnement `selectedArtist` d'App.svelte (l. 645). */
  const majArtiste = (artist: number | null) => {
    const ctx: Ctx = { view: 'library', albumId: selectedAlbum, artistId: artist, tab };
    if (artist !== null) h.pushState(ctx);
    else h.replaceState(ctx);
  };

  return {
    historique: h,
    get album() { return selectedAlbum; },
    get artiste() { return selectedArtist; },

    /** `LibraryView.selectAlbumDetail` */
    ouvrirAlbum(id: number) {
      selectedAlbum = id;
      majAlbum(id);
      if (poussoirRedondant) {
        // La ligne fautive, telle quelle : notez qu'elle ne reporte PAS
        // `artistId`, si bien qu'elle écrase aussi le niveau artiste.
        h.pushState({ view: 'library', albumId: id, artistId: null, tab });
      }
    },

    /** `LibraryView.selectArtistDetail` */
    ouvrirArtiste(id: number) {
      selectedArtist = id;
      majArtiste(id);
      if (poussoirRedondant) {
        h.pushState({ view: 'library', albumId: null, artistId: id, tab });
      }
      selectedAlbum = null;
      majAlbum(null);
    },

    /** Gestionnaire `popstate` d'App.svelte (l. 665). */
    appuyerPrecedent(): boolean {
      const ctx = h.back();
      if (ctx === null) return false;
      if (!ctx.albumId) selectedAlbum = null;
      if (!ctx.artistId) selectedArtist = null;
      return true;
    },
  };
}

/** Nombre d'appuis « Précédent » pour que la grille réapparaisse. */
function appuisPourRetrouverLaGrille(
  poussoirRedondant: boolean,
  chemin: (vue: ReturnType<typeof bibliotheque>) => void = (v) => v.ouvrirAlbum(42),
): number {
  const vue = bibliotheque(poussoirRedondant);
  chemin(vue);
  let appuis = 0;
  while (appuis < 10) {
    appuis += 1;
    if (!vue.appuyerPrecedent()) break;
    if (vue.album === null && vue.artiste === null) return appuis;
  }
  return appuis;
}

describe('Bibliothèque : « Précédent » retrouve la grille en UN appui (5c420af)', () => {
  it('forme fautive — le poussoir redondant demande DEUX appuis', () => {
    // Le premier appui atterrit sur l'entrée jumelle, qui porte encore
    // `albumId` : le gestionnaire `popstate` laisse la fiche affichée, et
    // l'utilisateur voit… rien.
    expect(appuisPourRetrouverLaGrille(true)).toBe(2);
  });

  it('forme corrigée — une seule entrée, donc UN appui', () => {
    expect(appuisPourRetrouverLaGrille(false)).toBe(1);
  });

  it('le premier appui de la forme fautive est bien un appui MORT', () => {
    const vue = bibliotheque(true);
    vue.ouvrirAlbum(42);
    vue.appuyerPrecedent();
    // Toujours dans la fiche : c'est le symptôme rapporté.
    expect(vue.album).toBe(42);
  });

  it('la fiche artiste souffre du même appui mort', () => {
    // `selectArtistDetail` empile l'entrée de l'abonnement puis la sienne ;
    // le `selectedAlbum.set(null)` qui suit ne fait que REMPLACER la dernière.
    // Il reste donc deux entrées jumelles portant `artistId`, et un appui pour
    // rien avant que la liste ne revienne.
    expect(appuisPourRetrouverLaGrille(true, (v) => v.ouvrirArtiste(7))).toBe(2);
    expect(appuisPourRetrouverLaGrille(false, (v) => v.ouvrirArtiste(7))).toBe(1);
  });

  it('l’entrée jumelle porte le même `albumId` — d’où l’appui sans effet', () => {
    // La cause exacte : le gestionnaire `popstate` ne remet la grille que
    // lorsque l'entrée atteinte n'a PAS d'`albumId`. Deux entrées identiques,
    // donc un appui pour rien.
    const vue = bibliotheque(true);
    vue.ouvrirAlbum(42);
    const { entrees, index } = vue.historique;
    expect(entrees[index].albumId).toBe(42);
    expect(entrees[index - 1].albumId).toBe(42);
  });
});

// ---------------------------------------------------------------------------
// 2. Gardes de code
// ---------------------------------------------------------------------------

function lire(chemin: string): string {
  const source = readFileSync(resolve(process.cwd(), chemin), 'utf-8');
  // Une source vide se laisserait « trouver » n'importe quoi par absence.
  expect(source.length).toBeGreaterThan(1000);
  return source;
}

/** Corps d'une fonction, borné par la déclaration suivante au même niveau. */
function corpsDe(source: string, declaration: string): string {
  const debut = source.indexOf(declaration);
  // Sans cette borne, une tranche vide passerait toutes les assertions
  // « ne contient pas » sans avoir rien examiné.
  expect(debut, `déclaration introuvable : ${declaration}`).toBeGreaterThan(-1);
  const corps = source.slice(debut, debut + 4000);
  expect(corps.length).toBeGreaterThan(200);
  return corps;
}

describe('LibraryView n’empile plus sa propre entrée (5c420af)', () => {
  const source = lire('src/components/LibraryView.svelte');

  it('`selectAlbumDetail` ne pousse plus d’entrée d’historique', () => {
    const corps = corpsDe(source, 'async function selectAlbumDetail');
    // Contre-épreuve du test lui-même : la tranche doit bien contenir le code
    // attendu, sinon l'absence de `pushState` ne prouverait rien.
    expect(corps).toContain('albumTracks.set(');
    expect(corps).not.toMatch(/history\.pushState/);
  });

  it('`selectArtistDetail` ne pousse plus d’entrée d’historique', () => {
    const corps = corpsDe(source, 'async function selectArtistDetail');
    expect(corps).toContain('selectedArtist.set(artist)');
    expect(corps).not.toMatch(/history\.pushState/);
  });

  it('la raison reste écrite sur place, pour ne pas la remettre', () => {
    expect(source).toMatch(/App\.svelte[\s\S]{0,200}?(seule source|source unique)/i);
  });
});

describe('App.svelte reste la seule source de vérité de l’historique (5c420af)', () => {
  const source = lire('src/App.svelte');

  it('la fiche album a sa propre adresse `#album/{id}`', () => {
    expect(source).toMatch(/pushState\(ctx, '', `#album\/\$\{album\.id\}`\)/);
  });

  it('la fiche artiste a sa propre adresse `#artist/{id}`', () => {
    expect(source).toMatch(/pushState\(ctx, '', `#artist\/\$\{artist\.id\}`\)/);
  });

  it('le retour à la grille remplace l’entrée au lieu d’en empiler une', () => {
    const corps = corpsDe(source, 'selectedAlbum.subscribe(album =>');
    expect(corps).toContain('replaceState');
  });
});
