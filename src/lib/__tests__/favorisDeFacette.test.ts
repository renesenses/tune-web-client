/**
 * « Favoris : il manque les playlists, les collections, les instruments ?, les
 *  années ? » (Bertrand, 05/09/2026, v0.9.137).
 *
 * Les playlists et les collections sont traitées ailleurs (`retoursV1_0509`).
 * Ce fichier tient le dernier point : les FACETTES.
 *
 * Le constat mesuré sur le .18 : `/profiles/1/favorites/facets` rendait 0
 * entrée, et ce n'était pas une panne. Le cœur de facette n'existait QUE dans
 * l'ancien client (`LibraryView.svelte`), et seulement sur les labels (#2442).
 * Le nouveau client n'avait aucune surface pour en créer un — l'écran Favoris
 * ne pouvait donc rien montrer.
 *
 * ⚠️ « Instruments » n'a PAS de surface : aucun onglet, aucun champ, aucune
 * route ne rend d'instrument dans ce client. La garde du bas fige cet état de
 * fait pour qu'un ajout futur soit un geste conscient, pas un oubli comblé.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { get } from 'svelte/store';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const lire = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf-8');

/** Un garde qui lit du code doit lire le CODE, pas ce qu'on en dit. */
function sansCommentaires(src: string): string {
  return src
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

describe('bascule d un favori de facette', () => {
  beforeEach(() => { vi.resetModules(); });

  async function monter(echec = false) {
    const add = vi.fn(async () => { if (echec) throw new Error('boom'); return {}; });
    const rem = vi.fn(async () => { if (echec) throw new Error('boom'); });
    vi.doMock('../api', () => ({
      addFacetFavorite: add, removeFacetFavorite: rem,
      addFavorite: vi.fn(async () => ({})), removeFavorite: vi.fn(async () => {}),
    }));
    const prof = await import('../stores/profile');
    prof.currentProfileId.set(1);
    prof.favoriteFacetKeys.set(new Set());
    const { basculerFavoriFacette } = await import('../favorisLocaux');
    return { add, rem, prof, basculerFavoriFacette };
  }

  it('ajoute la valeur au magasin ET appelle la route des facettes', async () => {
    const { add, prof, basculerFavoriFacette } = await monter();
    const etat = await basculerFavoriFacette('genre', 'Jazz');
    expect(etat).toBe(true);
    expect(get(prof.favoriteFacetKeys).has('genre:Jazz')).toBe(true);
    expect(add).toHaveBeenCalledWith(1, 'genre', 'Jazz');
  });

  it('un second appel retire, par la route de retrait', async () => {
    const { rem, prof, basculerFavoriFacette } = await monter();
    await basculerFavoriFacette('year', '1971');
    expect(get(prof.favoriteFacetKeys).has('year:1971')).toBe(true);
    const etat = await basculerFavoriFacette('year', '1971');
    expect(etat).toBe(false);
    expect(get(prof.favoriteFacetKeys).has('year:1971')).toBe(false);
    expect(rem).toHaveBeenCalledWith(1, 'year', '1971');
  });

  it('revient en arrière si le serveur refuse : le magasin ne ment pas', async () => {
    const { prof, basculerFavoriFacette } = await monter(true);
    const etat = await basculerFavoriFacette('label', 'ECM');
    expect(etat).toBe(false);
    expect(get(prof.favoriteFacetKeys).has('label:ECM')).toBe(false);
  });

  it('sans profil, rien n est écrit ni appelé', async () => {
    const { add, prof, basculerFavoriFacette } = await monter();
    prof.currentProfileId.set(null);
    // `loadProfiles` n'est pas moqué : il échouera faute de `fetch`, et c'est
    // le cas qu'on veut — aucun profil obtenu, aucune écriture.
    const etat = await basculerFavoriFacette('genre', 'Rock');
    expect(etat).toBeNull();
    expect(add).not.toHaveBeenCalled();
    expect(get(prof.favoriteFacetKeys).size).toBe(0);
  });

  it('la valeur est ROGNÉE, comme la clé du magasin', async () => {
    const { add, prof, basculerFavoriFacette } = await monter();
    await basculerFavoriFacette('genre', '  Jazz  ');
    // `facetFavKey` rogne : envoyer la valeur brute au serveur écrirait une
    // entrée que le magasin ne saurait jamais rapprocher — cœur vide sur une
    // facette pourtant en favori.
    expect(add).toHaveBeenCalledWith(1, 'genre', 'Jazz');
    expect(get(prof.favoriteFacetKeys).has('genre:Jazz')).toBe(true);
  });
});

describe('un seul corps pour la bascule', () => {
  it('HeartButton délègue et ne rappelle plus la route lui-même', () => {
    const src = sansCommentaires(lire('src/components/HeartButton.svelte'));
    expect(src).toContain('basculerFavoriFacette(');
    expect(src, 'la mécanique est repartie dans le module partagé').not.toMatch(
      /api\.(add|remove)FacetFavorite\(/,
    );
  });

  it('la Bibliothèque passe par le même module', () => {
    const src = sansCommentaires(lire('src/components/v2/LibraryV2.svelte'));
    expect(src).toContain("import { basculerFavoriFacette } from '../../lib/favorisLocaux'");
    expect(src, 'aucun second chemin vers la route').not.toMatch(
      /api\.(add|remove)FacetFavorite\(/,
    );
  });
});

describe('le cœur de facette dans la Bibliothèque', () => {
  const src = sansCommentaires(lire('src/components/v2/LibraryV2.svelte'));

  it('les trois onglets de facette portent un cœur', () => {
    expect(src).toContain('class="fcoeur"');
    expect(src).toContain('basculerFacette(g.key)');
  });

  it('les noms envoyés au serveur sont au SINGULIER', () => {
    // L'onglet s'appelle « Genres », la table `genre`. Écrire le pluriel
    // produirait des favoris que `/library/facets` ne relirait jamais.
    expect(src).toMatch(/genres:\s*'genre'/);
    expect(src).toMatch(/years:\s*'year'/);
    expect(src).toMatch(/labels:\s*'label'/);
  });

  it("« Sans label » et « Année inconnue » n'ont pas de cœur", () => {
    // Une valeur de remplacement n'est pas une valeur : la mettre en favori
    // écrirait une facette que le serveur ne saurait pas sélectionner.
    expect(src).toContain('{#if facetteCourante && g.reel}');
    expect(src).toMatch(/if \(brut != null\) reels\.add\(k\)/);
  });

  it('un dépôt distant n en propose aucun', () => {
    // Le genre d'un catalogue tiers ne se reselectionne pas chez nous.
    expect(src).toMatch(/facetteCourante\s*=\s*\$derived\(depot \? null :/);
  });

  it('la section porte sa valeur, pour qu on puisse y sauter', () => {
    expect(src).toContain('data-facette={g.key}');
    expect(src).toContain("window.addEventListener('tune:v2-facette'");
    expect(src, "l'écouteur doit être retiré au démontage").toContain(
      "window.removeEventListener('tune:v2-facette'",
    );
  });

  it('le saut VIDE la recherche', () => {
    // Une recherche en cours ferait disparaître la section visée : on
    // arriverait sur un écran vide, ce qui se lit comme une panne.
    const i = src.indexOf("addEventListener('tune:v2-facette'");
    const bloc = src.slice(Math.max(0, i - 1200), i);
    expect(bloc).toMatch(/q = '';/);
  });
});

describe("l'onglet Facettes des Favoris", () => {
  const src = sansCommentaires(lire('src/components/v2/FavoritesV2.svelte'));

  it('existe et lit la route des favoris de facette', () => {
    expect(src).toMatch(/\{ id: 'facettes'/);
    expect(src).toContain('api.getFacetFavorites(pid)');
  });

  it('un échec de cette route ne vide pas le reste de l écran', () => {
    expect(src).toMatch(/getFacetFavorites\(pid\)\.catch\(/);
  });

  it('une facette décochée quitte l écran sans rechargement', () => {
    // Même règle que les playlists : le magasin porte la vérité. Le défaut
    // signalé le 05/09 (« après avoir enlevé le favori, l'objet ne disparaît
    // pas ») ne doit pas renaître sur ce nouvel onglet.
    expect(src).toMatch(/vFacettes = \$derived\([\s\S]{0,220}\$favoriteFacetKeys\.has\(/);
  });

  it('ouvrir une facette envoie vers la Bibliothèque, pas vers une liste', () => {
    expect(src).toContain("activeView.set('library')");
    expect(src).toContain("new CustomEvent('tune:v2-facette'");
    // `tick()` : l'écran cible n'est pas monté au moment du changement de vue,
    // son écouteur n'existe donc pas encore.
    const i = src.indexOf("new CustomEvent('tune:v2-facette'");
    expect(src.slice(Math.max(0, i - 300), i)).toContain('await tick()');
  });
});

describe('ce que ce client ne sait PAS faire', () => {
  it("« instruments » n'a aucune surface — et la garde le dit", () => {
    // Mesuré le 06/09/2026 : `/library/facets?facet=instrument` rend 200 avec
    // ZÉRO valeur sur le .18, aucun onglet ne l'expose, aucun champ d'album ne
    // le porte. Poser un cœur « instrument » aurait été inventer une donnée.
    const lib = sansCommentaires(lire('src/components/v2/LibraryV2.svelte'));
    expect(lib).not.toMatch(/instrument/i);
    const fav = sansCommentaires(lire('src/components/v2/FavoritesV2.svelte'));
    expect(fav).not.toMatch(/instrument/i);
  });
});
