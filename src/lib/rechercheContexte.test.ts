import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { requeteAuMontage } from './rechercheContexte';

/**
 * Le second parcours de Sandro (fil 1553), celui qui restait ouvert.
 *
 *   loupe → « Leprous » → résultats mixtes → on choisit le Qobuz
 *         → discographie → album → Retour
 *
 * Trois manques distincts s'additionnaient pour donner ce qu'il décrit — « je
 * me retrouve sur la page d'accueil principale de Qobuz, les résultats de la
 * recherche globale ont complètement disparu » :
 *
 *  1. la vue Recherche ne survivait pas à son démontage — ici ;
 *  2. elle n'annonçait pas d'où l'on venait (`streamingAlbumOrigin`) — ici
 *     aussi, par une garde sur le code ;
 *  3. `selectArtist` effaçait cette annonce à la seconde où elle arrivait —
 *     garde sur `StreamingView`, plus bas.
 *
 * Le quatrième point, l'ordre entre dépilage et provenance, est prouvé dans
 * `streamingRetour.test.ts`.
 */
describe('requeteAuMontage', () => {
  it('rejoue la recherche du passage précédent', () => {
    // Le retour de Sandro : rien de neuf n'est demandé, mais il avait une
    // recherche en cours avant d'entrer dans Qobuz.
    expect(requeteAuMontage('', 'Leprous')).toBe('Leprous');
  });

  it("une demande venue d'un autre écran prime sur le contexte", () => {
    // La loupe, ou « rechercher cet artiste » depuis le lecteur : c'est un
    // geste que l'utilisateur vient de faire, il ne doit pas être recouvert
    // par la recherche d'avant.
    expect(requeteAuMontage('Opeth', 'Leprous')).toBe('Opeth');
  });

  it('laisse la vue à son écran de découverte quand il n’y a rien à rejouer', () => {
    expect(requeteAuMontage('', '')).toBeNull();
    expect(requeteAuMontage(null, undefined)).toBeNull();
  });

  it('ignore une requête qui ne contient que des espaces', () => {
    // `searchQuery` est enregistré à chaque frappe : un contexte réduit à des
    // espaces ne doit pas déclencher de recherche au montage.
    expect(requeteAuMontage('   ', '  ')).toBeNull();
    expect(requeteAuMontage('   ', 'Leprous')).toBe('Leprous');
  });
});

describe('SearchView conserve et annonce son contexte', () => {
  const source = readFileSync(
    resolve(process.cwd(), 'src/components/SearchView.svelte'),
    'utf-8',
  );

  it('enregistre un instantané de sa requête à chaque changement', () => {
    // Sans `saveViewContext`, quitter la vue efface la requête ET la grille :
    // c'est la disparition que Sandro décrit.
    expect(source).toMatch(/saveViewContext\(\s*'search'/);
  });

  it('relit cet instantané à son montage, via la décision isolée', () => {
    expect(source).toMatch(/loadViewContext<[^>]*>\(\s*'search'\s*\)/);
    expect(source).toContain('requeteAuMontage(');
  });

  it("annonce la recherche globale comme provenance en ouvrant un album de service", () => {
    // Symétrique de `HomeView.svelte`, qui pose déjà `streamingAlbumOrigin`.
    // Sans elle, `actionRetour` ne peut STRUCTURELLEMENT pas ramener aux
    // résultats : la provenance vaut `null` et le retour reste dans Qobuz.
    const debut = source.indexOf('function openAlbum(');
    expect(debut).toBeGreaterThan(-1);
    const corps = source.slice(debut, source.indexOf('\n  }', debut));
    expect(corps).toContain("streamingAlbumOrigin.set('search')");
  });

  it("annonce la même provenance en ouvrant une fiche artiste de service", () => {
    // Le chemin EXACT de Sandro : il choisit l'artiste, pas l'album.
    const debut = source.indexOf('async function selectArtist(');
    expect(debut).toBeGreaterThan(-1);
    const corps = source.slice(debut, source.indexOf('\n  }', debut));
    expect(corps).toContain("streamingAlbumOrigin.set('search')");
  });
});

describe('StreamingView ne jette pas la provenance annoncée', () => {
  const source = readFileSync(
    resolve(process.cwd(), 'src/components/StreamingView.svelte'),
    'utf-8',
  );

  it("selectArtist n'efface plus la provenance sans condition", () => {
    // La ligne qui rendait inopérante la déclaration de `SearchView` : ouvrir
    // la fiche remettait `streamingAlbumOrigin` à `null` dans la foulée.
    const debut = source.indexOf('async function selectArtist(');
    expect(debut).toBeGreaterThan(-1);
    const corps = source.slice(debut, source.indexOf('\n  }', debut));
    expect(corps).not.toMatch(/^\s*streamingAlbumOrigin\.set\(null\);\s*$/m);
  });

  it("selectArtist accepte de conserver la provenance de l'écran d'appel", () => {
    expect(source).toMatch(
      /async function selectArtist\(artist: Artist, conserverProvenance = false\)/,
    );
  });

  it("l'entrée par un autre écran conserve la provenance", () => {
    // L'effet qui consomme `pendingStreamingArtist` : c'est par lui que la
    // recherche globale entre dans la vue.
    const debut = source.indexOf('const artist = $pendingStreamingArtist;');
    expect(debut).toBeGreaterThan(-1);
    const bloc = source.slice(debut, source.indexOf('\n  });', debut));
    expect(bloc).toContain('selectArtist(artist, true)');
  });

  it('la restauration de position conserve elle aussi la provenance', () => {
    // Sinon le défaut revient au premier aller-retour par la file d'attente ou
    // le lecteur — le même piège que celui refermé par
    // `streamingRetourRestauration.test.ts` pour le niveau artiste.
    const debut = source.indexOf('async function restaurerContexte(');
    expect(debut).toBeGreaterThan(-1);
    const corps = source.slice(debut, source.indexOf('\n  }', debut));
    expect(corps).toContain('selectArtist(ctx.selectedArtist, true)');
  });
});
