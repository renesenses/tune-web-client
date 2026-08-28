import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { reconcilierFiche, type CtxHistorique } from '../reconciliationFiche';

/**
 * « Collections → Smart Collections → Pop → artiste → retour » : un niveau de
 * navigation sauté (renesenses/tune-server-rust#2252, Jean Valjean, fil 1187).
 *
 * ARBITRAGE, d'abord. Le chemin littéral du signalement — une collection qui
 * mènerait à un ARTISTE — n'existe pas : `SmartCollectionsView` n'a qu'une
 * sortie, `navigateToAlbum`, et le nom d'artiste d'une vignette y est un
 * `<span>` non cliquable. Le seul chemin réel est
 *
 *     collection → fiche ALBUM (Bibliothèque) → lien artiste de la fiche → retour
 *
 * et sur celui-là un niveau EST bel et bien sauté, pour une raison qui n'est
 * pas propre aux collections : le gestionnaire `popstate` d'`App.svelte` ne
 * fait que NETTOYER l'état de fiche (`if (!ctx?.albumId) selectedAlbum.set(null)`),
 * il ne le RÉTABLIT jamais. Revenir sur une entrée d'historique qui portait
 * `albumId` affiche donc la GRILLE de la Bibliothèque — un écran où
 * l'utilisateur n'est jamais passé — au lieu de la fiche album d'où il venait.
 *
 * Trois séries :
 *
 *  1. la DÉCISION seule (`reconcilierFiche`), sans navigateur ;
 *  2. un BANC D'ESSAI qui rejoue la pile d'historique réelle sur le chemin
 *     exact du signalement, avec la FORME FAUTIVE gardée à côté de la corrigée
 *     — sans elle, rien ne montrerait que le banc sait distinguer les deux ;
 *  3. une GARDE DE CODE qui prouve que la règle est encore APPLIQUÉE dans
 *     `App.svelte`, et que le stash de la collection est toujours posé dans
 *     `SmartCollectionsView`.
 */

// ---------------------------------------------------------------------------
// 1. La décision, seule
// ---------------------------------------------------------------------------

describe('reconcilierFiche — ce qu’il faut faire de la fiche en revenant en arrière', () => {
  const rien = { album: null, artiste: null };

  it('une entrée sans fiche vide la fiche ouverte', () => {
    const ctx: CtxHistorique = { view: 'library', albumId: null, artistId: null, tab: 'albums' };
    expect(reconcilierFiche(ctx, { album: 42, artiste: null })).toEqual({
      album: 'vider',
      artiste: 'vider',
    });
  });

  it('un état nul (entrée initiale Safari) vide aussi', () => {
    expect(reconcilierFiche(null, { album: 42, artiste: 7 })).toEqual({
      album: 'vider',
      artiste: 'vider',
    });
  });

  it('une entrée qui portait un album le fait RECHARGER — c’est le niveau sauté', () => {
    const ctx: CtxHistorique = { view: 'library', albumId: 301, artistId: null, tab: 'albums' };
    expect(reconcilierFiche(ctx, rien)).toEqual({ album: 301, artiste: 'vider' });
  });

  it('la fiche déjà à l’écran est gardée — pas de rechargement inutile', () => {
    const ctx: CtxHistorique = { view: 'library', albumId: 301, artistId: null, tab: 'albums' };
    expect(reconcilierFiche(ctx, { album: 301, artiste: null })).toEqual({
      album: 'garder',
      artiste: 'vider',
    });
  });

  it('une entrée hors Bibliothèque ne recharge RIEN, même si elle porte des id', () => {
    // `activeView.subscribe` empile l'entrée d'une AUTRE vue avec l'album encore
    // ouvert derrière ; la Bibliothèque n'y est pas montée, il n'y a rien à
    // rouvrir. Comportement d'origine conservé : on ne vide pas non plus.
    const ctx: CtxHistorique = { view: 'collections', albumId: 301, artistId: 7, tab: 'albums' };
    expect(reconcilierFiche(ctx, rien)).toEqual({ album: 'garder', artiste: 'garder' });
  });

  it('la fiche artiste suit exactement la même règle', () => {
    const ctx: CtxHistorique = { view: 'library', albumId: null, artistId: 7, tab: 'artists' };
    expect(reconcilierFiche(ctx, rien)).toEqual({ album: 'vider', artiste: 7 });
    expect(reconcilierFiche(ctx, { album: null, artiste: 7 })).toEqual({
      album: 'vider',
      artiste: 'garder',
    });
  });
});

// ---------------------------------------------------------------------------
// 2. Banc d'essai : le chemin du signalement, pile d'historique comprise
// ---------------------------------------------------------------------------

interface Ctx {
  view: string;
  albumId: number | null;
  artistId: number | null;
  tab: string | null;
}

/** Pile d'historique minimale, fidèle à `pushState`/`replaceState`/`back`/`forward`. */
class Historique {
  entrees: Ctx[] = [];
  index = -1;

  pushState(ctx: Ctx) {
    this.entrees = this.entrees.slice(0, this.index + 1);
    this.entrees.push(ctx);
    this.index = this.entrees.length - 1;
  }

  replaceState(ctx: Ctx) {
    if (this.index < 0) this.pushState(ctx);
    else this.entrees[this.index] = ctx;
  }

  back(): Ctx | null {
    if (this.index <= 0) return null;
    this.index -= 1;
    return this.entrees[this.index];
  }

  forward(): Ctx | null {
    if (this.index >= this.entrees.length - 1) return null;
    this.index += 1;
    return this.entrees[this.index];
  }
}

const COLLECTION_POP = 12;
const ALBUM = 301;
const ARTISTE = 77;

/**
 * Rejoue l'application sur le chemin du signalement.
 *
 * `reconciliationAncienne` est le SEUL point qui change entre la forme fautive
 * et la forme corrigée : c'est la règle « nettoyer, jamais rétablir » que le
 * gestionnaire `popstate` appliquait (`App.svelte`, l. 686-687).
 */
function application(reconciliationAncienne: boolean) {
  const h = new Historique();
  let activeView = 'library';
  let selectedAlbum: number | null = null;
  let selectedArtist: number | null = null;
  let libraryTab: string | null = 'albums';

  // `viewStateStash` (stores/navigation.ts) et la collection ouverte dans
  // `SmartCollectionsView`, qui est démontée dès qu'on quitte la vue.
  const stash = new Map<string, { id: number }>();
  let collectionOuverte: number | null = null;

  let pushingState = false;

  h.replaceState({ view: 'library', albumId: null, artistId: null, tab: libraryTab });

  /** Montage / démontage des vues par la chaîne `{#if activeView === …}`. */
  function appliquerVue(vue: string) {
    const avant = activeView;
    activeView = vue;
    if (avant === 'collections' && vue !== 'collections') collectionOuverte = null;
    if (avant !== 'collections' && vue === 'collections') {
      // `SmartCollectionsView.onMount` : takeViewState puis openCollection.
      const st = stash.get('smartcollections');
      stash.delete('smartcollections');
      collectionOuverte = st ? st.id : null;
    }
  }

  /** Abonnement `activeView` d'App.svelte (l. 586). */
  function setActiveView(vue: string) {
    if (vue === activeView) return;
    appliquerVue(vue);
    if (!pushingState) {
      h.pushState({ view: vue, albumId: selectedAlbum, artistId: selectedArtist, tab: libraryTab });
    }
  }

  /** Abonnement `selectedAlbum` d'App.svelte (l. 623). */
  function setSelectedAlbum(album: number | null) {
    if (album === selectedAlbum) return;
    selectedAlbum = album;
    if (pushingState || activeView !== 'library') return;
    const ctx: Ctx = { view: 'library', albumId: album, artistId: selectedArtist, tab: libraryTab };
    if (album !== null) h.pushState(ctx);
    else h.replaceState(ctx);
  }

  /** Abonnement `selectedArtist` d'App.svelte (l. 651). */
  function setSelectedArtist(artist: number | null) {
    if (artist === selectedArtist) return;
    selectedArtist = artist;
    if (pushingState || activeView !== 'library') return;
    const ctx: Ctx = { view: 'library', albumId: selectedAlbum, artistId: artist, tab: libraryTab };
    if (artist !== null) h.pushState(ctx);
    else h.replaceState(ctx);
  }

  /** Gestionnaire `popstate` d'App.svelte (l. 673). */
  function reconcilier(ctx: Ctx | null) {
    pushingState = true;
    if (ctx?.view) {
      appliquerVue(ctx.view);
      if (ctx.view === 'library' && ctx.tab) libraryTab = ctx.tab;
    }
    if (reconciliationAncienne) {
      // La forme fautive, telle quelle : elle NETTOIE, elle ne rétablit rien.
      if (!ctx?.albumId) selectedAlbum = null;
      if (!ctx?.artistId) selectedArtist = null;
    } else {
      const plan = reconcilierFiche(ctx, { album: selectedAlbum, artiste: selectedArtist });
      if (plan.album === 'vider') selectedAlbum = null;
      else if (typeof plan.album === 'number') selectedAlbum = plan.album;
      if (plan.artiste === 'vider') selectedArtist = null;
      else if (typeof plan.artiste === 'number') selectedArtist = plan.artiste;
    }
    pushingState = false;
  }

  return {
    historique: h,

    /** L'écran réellement affiché. */
    ecran(): string {
      if (activeView === 'collections') {
        return collectionOuverte != null ? `collection:${collectionOuverte}` : 'collections:liste';
      }
      if (activeView === 'library') {
        if (selectedArtist != null) return `artiste:${selectedArtist}`;
        if (selectedAlbum != null) return `album:${selectedAlbum}`;
        return 'bibliotheque:grille';
      }
      return activeView;
    },

    /** Clic sur « Collections » dans la barre latérale. */
    allerAuxCollections() {
      setActiveView('collections');
    },

    /** `SmartCollectionsView.openCollection` — aucune entrée d'historique. */
    ouvrirCollection(id: number) {
      collectionOuverte = id;
    },

    /** `SmartCollectionsView.navigateToAlbum` (l. 15). */
    ouvrirAlbumDeLaCollection(id: number) {
      if (collectionOuverte != null) stash.set('smartcollections', { id: collectionOuverte });
      setSelectedAlbum(id);
      // …puis, au retour de `getAlbumTracks` : libraryTab + activeView.
      libraryTab = 'albums';
      setActiveView('library');
    },

    /** Lien artiste de la fiche album — `LibraryView.selectArtistDetail` (l. 1510). */
    ouvrirArtisteDeLaFicheAlbum(id: number) {
      setSelectedArtist(id);
      setSelectedAlbum(null);
    },

    /** `LibraryView.goBack` (l. 1769). */
    retourInterface() {
      if (selectedAlbum != null && selectedArtist != null) {
        setSelectedAlbum(null);
      } else {
        setSelectedAlbum(null);
        setSelectedArtist(null);
      }
      reconcilier(h.back());
    },

    /** Bouton « Précédent » du NAVIGATEUR. */
    precedentNavigateur() {
      reconcilier(h.back());
    },

    /** Bouton « Suivant » du NAVIGATEUR. */
    suivantNavigateur() {
      reconcilier(h.forward());
    },
  };
}

/** Le chemin exact du signalement, jusqu'à la fiche artiste. */
function cheminDuSignalement(reconciliationAncienne: boolean) {
  const app = application(reconciliationAncienne);
  app.allerAuxCollections();
  app.ouvrirCollection(COLLECTION_POP);
  app.ouvrirAlbumDeLaCollection(ALBUM);
  app.ouvrirArtisteDeLaFicheAlbum(ARTISTE);
  return app;
}

describe('Le chemin du signalement mène bien à une fiche artiste', () => {
  it('collection → album → artiste', () => {
    // Contre-épreuve du banc : s'il n'arrivait pas à la fiche artiste, tout ce
    // qui suit mesurerait autre chose.
    expect(cheminDuSignalement(true).ecran()).toBe(`artiste:${ARTISTE}`);
    expect(cheminDuSignalement(false).ecran()).toBe(`artiste:${ARTISTE}`);
  });
});

describe('Retour depuis l’artiste : le niveau album ne doit plus être sauté (#2252)', () => {
  it('forme fautive — le retour dépose sur la GRILLE, un écran jamais visité', () => {
    const app = cheminDuSignalement(true);
    app.retourInterface();
    expect(app.ecran()).toBe('bibliotheque:grille');
  });

  it('forme corrigée — le retour revient à la fiche album de la collection', () => {
    const app = cheminDuSignalement(false);
    app.retourInterface();
    expect(app.ecran()).toBe(`album:${ALBUM}`);
  });

  it('forme corrigée — le retour suivant rentre dans la collection, pas sur sa liste', () => {
    const app = cheminDuSignalement(false);
    app.retourInterface();
    app.retourInterface();
    expect(app.ecran()).toBe(`collection:${COLLECTION_POP}`);
  });

  it('la forme fautive saute un cran : deux appuis pour la collection au lieu de trois', () => {
    const fautive = cheminDuSignalement(true);
    const ecransFautifs: string[] = [];
    fautive.retourInterface();
    ecransFautifs.push(fautive.ecran());
    fautive.precedentNavigateur();
    ecransFautifs.push(fautive.ecran());
    expect(ecransFautifs).toEqual(['bibliotheque:grille', `collection:${COLLECTION_POP}`]);

    const corrigee = cheminDuSignalement(false);
    const ecransCorriges: string[] = [];
    corrigee.retourInterface();
    ecransCorriges.push(corrigee.ecran());
    corrigee.retourInterface();
    ecransCorriges.push(corrigee.ecran());
    expect(ecransCorriges).toEqual([`album:${ALBUM}`, `collection:${COLLECTION_POP}`]);
  });
});

describe('Cas symétrique : les boutons Précédent / Suivant du NAVIGATEUR', () => {
  it('« Précédent » du navigateur revient lui aussi à la fiche album', () => {
    const fautive = cheminDuSignalement(true);
    fautive.precedentNavigateur();
    expect(fautive.ecran()).toBe('bibliotheque:grille');

    const corrigee = cheminDuSignalement(false);
    corrigee.precedentNavigateur();
    expect(corrigee.ecran()).toBe(`album:${ALBUM}`);
  });

  it('« Suivant » repart en avant sans rien perdre', () => {
    const app = cheminDuSignalement(false);
    app.precedentNavigateur();
    expect(app.ecran()).toBe(`album:${ALBUM}`);
    app.precedentNavigateur();
    expect(app.ecran()).toBe(`collection:${COLLECTION_POP}`);
    app.suivantNavigateur();
    expect(app.ecran()).toBe(`album:${ALBUM}`);
    app.suivantNavigateur();
    expect(app.ecran()).toBe(`artiste:${ARTISTE}`);
  });

  it('la forme fautive perd les deux sens', () => {
    const app = cheminDuSignalement(true);
    app.precedentNavigateur();
    app.precedentNavigateur();
    expect(app.ecran()).toBe(`collection:${COLLECTION_POP}`);
    app.suivantNavigateur();
    // On remonte sur l'entrée qui portait l'album… et on voit la grille.
    expect(app.ecran()).toBe('bibliotheque:grille');
  });

  it('la grille de la Bibliothèque reste atteignable en remontant tout en haut', () => {
    // Garde-fou de non-régression : rétablir les fiches ne doit pas emprisonner
    // l'utilisateur dans une fiche à chaque appui.
    const app = cheminDuSignalement(false);
    app.precedentNavigateur();
    app.precedentNavigateur();
    app.precedentNavigateur();
    expect(app.ecran()).toBe('bibliotheque:grille');
  });
});

// ---------------------------------------------------------------------------
// 3. Gardes de code
// ---------------------------------------------------------------------------

function lire(chemin: string): string {
  const source = readFileSync(resolve(process.cwd(), chemin), 'utf-8');
  // Une source vide se laisserait « trouver » n'importe quoi par absence.
  expect(source.length).toBeGreaterThan(1000);
  return source;
}

/**
 * Tranche bornée, jamais vide.
 *
 * `fin` est OBLIGATOIRE dès qu'un voisin porte les mêmes mots : une fenêtre
 * « les 3000 caractères qui suivent » avalait le gestionnaire `popstate`, si
 * bien que la garde sur `_pushingState` restait verte alors même que la
 * fonction surveillée l'avait perdu (constaté par mutation).
 */
function tranche(source: string, declaration: string, fin?: string, taille = 3000): string {
  const debut = source.indexOf(declaration);
  expect(debut, `déclaration introuvable : ${declaration}`).toBeGreaterThan(-1);
  let borne = debut + taille;
  if (fin !== undefined) {
    const apres = source.indexOf(fin, debut + declaration.length);
    expect(apres, `borne introuvable : ${fin}`).toBeGreaterThan(debut);
    borne = apres;
  }
  const corps = source.slice(debut, borne);
  expect(corps.length).toBeGreaterThan(200);
  return corps;
}

describe('App.svelte : `popstate` rétablit la fiche au lieu de seulement la vider', () => {
  const source = lire('src/App.svelte');

  /** Le gestionnaire `popstate`, borné à la fin de son `addEventListener`. */
  const gestionnaire = () =>
    tranche(source, "window.addEventListener('popstate'", "\n    });\n");
  /** Le rechargeur, borné AVANT le gestionnaire — qui porte les mêmes mots. */
  const rechargeur = () =>
    tranche(
      source,
      'async function rechargerFicheDepuisHistorique',
      "window.addEventListener('popstate'",
    );

  it('le gestionnaire s’en remet à `reconcilierFiche`', () => {
    const corps = gestionnaire();
    // Repère connu : sans lui, l'absence de la forme fautive ne prouverait rien.
    expect(corps).toContain('activeView.set(ctx.view)');
    expect(corps).toContain('reconcilierFiche(');
  });

  it('la règle « nettoyer sans jamais rétablir » a bien disparu', () => {
    const corps = gestionnaire();
    expect(corps).toContain('activeView.set(ctx.view)');
    expect(corps).not.toMatch(/if \(!ctx\?\.albumId\) selectedAlbum\.set\(null\);/);
    expect(corps).not.toMatch(/if \(!ctx\?\.artistId\) selectedArtist\.set\(null\);/);
  });

  it('le vidage, lui, est CONSERVÉ — la fiche fantôme de Safari', () => {
    const corps = gestionnaire();
    expect(corps).toContain("if (plan.album === 'vider') selectedAlbum.set(null);");
    expect(corps).toContain("if (plan.artiste === 'vider') selectedArtist.set(null);");
  });

  it('le rechargement ne ré-empile pas d’entrée d’historique', () => {
    const corps = rechargeur();
    expect(corps).toContain('api.getAlbum(');
    expect(corps).toContain('api.getArtist(');
    // Les `set` de rétablissement doivent être couverts par le drapeau, sinon
    // chaque retour empilerait une entrée de plus. Quatre points exactement :
    // ouverture et fermeture, pour l'artiste comme pour l'album.
    expect(corps.match(/_pushingState = true;/g) ?? []).toHaveLength(2);
    expect(corps.match(/_pushingState = false;/g) ?? []).toHaveLength(3);
    for (const set of ['selectedArtist.set(fiche)', 'selectedAlbum.set(fiche)']) {
      const avant = corps.slice(0, corps.indexOf(set));
      expect(corps.indexOf(set), `introuvable : ${set}`).toBeGreaterThan(-1);
      // Le dernier basculement du drapeau avant ce `set` doit l'AVOIR ARMÉ.
      expect(avant.lastIndexOf('_pushingState = true;')).toBeGreaterThan(
        avant.lastIndexOf('_pushingState = false;'),
      );
    }
  });

  it('une fiche périmée n’est pas plaquée sur un écran que l’utilisateur a quitté', () => {
    const corps = rechargeur();
    expect(corps).toContain('window.history.state');
  });
});

describe('SmartCollectionsView : le jalon de la collection reste posé (f3c870e / #1215)', () => {
  const source = lire('src/components/SmartCollectionsView.svelte');

  it('`navigateToAlbum` mémorise la collection ouverte', () => {
    const corps = tranche(source, 'function navigateToAlbum', 'let shuffleLoading');
    expect(corps).toContain('selectedAlbum.set(album)');
    expect(corps).toContain("stashViewState('smartcollections'");
  });

  it('le montage la ré-ouvre', () => {
    const corps = tranche(source, 'onMount(async () => {', '</script>');
    expect(corps).toContain("takeViewState<{ id: number }>('smartcollections')");
    expect(corps).toContain('openCollection(col)');
  });
});
