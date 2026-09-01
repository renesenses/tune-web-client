import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { actionRetour } from './streamingRetour';

/**
 * « Retour » depuis un album ouvert dans un service de streaming.
 *
 * Sandro, forum fil 1553 : dans Qobuz, chercher un artiste, ouvrir sa fiche,
 * ouvrir un album, puis « Retour » — l'interface retombe à la racine du
 * service au lieu de revenir à la discographie de l'artiste.
 *
 * Le bouton n'y est pour rien : `selectAlbum()` écrasait `selectedArtist` à
 * `null` au moment même où l'album s'ouvrait, si bien qu'au retour il n'y
 * avait plus aucun niveau intermédiaire à retrouver. `goBack()` remettait
 * ensuite les trois niveaux à `null` d'un coup, sans jamais dépiler.
 *
 * Deux choses à protéger, donc deux séries de tests :
 *  1. la DÉCISION — `actionRetour` remonte d'un seul niveau ;
 *  2. le CODE — `StreamingView` garde bien le niveau artiste à l'ouverture de
 *     l'album et s'en remet à cette décision. Sans le second, retirer une
 *     seule ligne du composant ramènerait le bug sans qu'un test bronche.
 */
describe('actionRetour', () => {
  it("remonte à la fiche artiste quand l'album a été ouvert depuis celle-ci", () => {
    // Le cas de Sandro, exactement.
    expect(actionRetour({ provenance: null, album: true, artiste: true })).toEqual({
      action: 'remonter-a-l-artiste',
    });
  });

  it("retombe à la racine du service pour un album ouvert hors fiche artiste", () => {
    // Album ouvert depuis les résultats de recherche, l'accueil ou un genre :
    // il n'y a pas de niveau artiste au-dessus, la racine est la bonne cible.
    expect(actionRetour({ provenance: null, album: true, artiste: false })).toEqual({
      action: 'racine-du-service',
    });
  });

  it('retombe à la racine du service depuis une fiche artiste', () => {
    // Deuxième « Retour » du parcours de Sandro : on quitte enfin l'artiste.
    expect(actionRetour({ provenance: null, album: false, artiste: true })).toEqual({
      action: 'racine-du-service',
    });
  });

  it('retombe à la racine du service depuis une playlist', () => {
    expect(actionRetour({ provenance: null, album: false, artiste: false })).toEqual({
      action: 'racine-du-service',
    });
  });

  it("une provenance externe ramène à l'écran d'origine", () => {
    // Une fiche ouverte depuis l'accueil (`streamingAlbumOrigin`) : le retour
    // ramène à l'écran d'origine au lieu d'atterrir sur la grille du service.
    expect(actionRetour({ provenance: 'home', album: true, artiste: false })).toEqual({
      action: 'quitter-la-vue',
      vers: 'home',
    });
    // Et depuis une fiche artiste ouverte par la recherche globale.
    expect(actionRetour({ provenance: 'search', album: false, artiste: true })).toEqual({
      action: 'quitter-la-vue',
      vers: 'search',
    });
  });

  it('dépile le niveau album AVANT de rendre la main à la provenance', () => {
    // Second parcours de Sandro (fil 1553) : la recherche globale entre dans
    // Qobuz par la fiche ARTISTE, et il descend ensuite d'un cran de plus.
    // Deux niveaux sont donc ouverts sous une provenance — ce que l'accueil,
    // qui n'ouvre que des albums, ne pouvait pas produire.
    //
    // Rendre la main tout de suite ferait sauter la discographie, c'est-à-dire
    // exactement le geste que le premier correctif de ce fil venait de réparer
    // pour l'onglet Qobuz : le même « Retour », sur le même écran, n'aurait pas
    // le même effet selon la porte d'entrée. On dépile d'abord, on sort après.
    expect(actionRetour({ provenance: 'search', album: true, artiste: true })).toEqual({
      action: 'remonter-a-l-artiste',
    });
    // Le Retour SUIVANT, lui, honore la provenance : les résultats de la
    // recherche globale reviennent.
    expect(actionRetour({ provenance: 'search', album: false, artiste: true })).toEqual({
      action: 'quitter-la-vue',
      vers: 'search',
    });
  });
});

describe('StreamingView applique le dépilage', () => {
  const source = readFileSync(
    resolve(process.cwd(), 'src/components/StreamingView.svelte'),
    'utf-8',
  );

  it("selectAlbum ne vide plus le niveau artiste sans condition", () => {
    const debut = source.indexOf('async function selectAlbum(');
    expect(debut).toBeGreaterThan(-1);
    const corps = source.slice(debut, source.indexOf('\n  }', debut));
    // La ligne fautive : `selectedArtist = null;` nue, en plein corps.
    expect(corps).not.toMatch(/^\s*selectedArtist = null;\s*$/m);
  });

  it("selectAlbum accepte de venir d'une fiche artiste", () => {
    expect(source).toMatch(/async function selectAlbum\(album: Album, depuisArtiste = false\)/);
  });

  it("la discographie de l'artiste ouvre les albums en gardant son niveau", () => {
    // La grille rendue sous `{:else if selectedArtist}` — et elle seule — doit
    // annoncer sa provenance. Sinon le dépilage n'a jamais lieu.
    // Ancré sur le gabarit et non sur la première occurrence du texte : la
    // documentation de `selectAlbum` cite la même condition, et s'y arrêter
    // ferait examiner un commentaire en croyant lire le rendu.
    const debut = source.indexOf('{:else if selectedArtist}\n    <!-- Artist detail -->');
    expect(debut).toBeGreaterThan(-1);
    const fin = source.indexOf('{:else if', debut + 10);
    expect(fin).toBeGreaterThan(debut);
    const bloc = source.slice(debut, fin);
    expect(bloc).toContain('selectAlbum(album, true)');
    // Aucun appel sans la provenance ne doit subsister dans cette grille.
    expect(bloc).not.toMatch(/selectAlbum\(album\)/);
  });

  it("goBack s'en remet à actionRetour plutôt qu'à ses propres conditions", () => {
    const debut = source.indexOf('function goBack()');
    expect(debut).toBeGreaterThan(-1);
    const corps = source.slice(debut, source.indexOf('\n  }', debut));
    expect(corps).toContain('actionRetour(');
    expect(corps).toContain("'remonter-a-l-artiste'");
  });

  it('actionRetour est bien importé par le composant', () => {
    expect(source).toMatch(/import\s*\{[^}]*\bactionRetour\b[^}]*\}\s*from\s*'\.\.\/lib\/streamingRetour'/);
  });
});
