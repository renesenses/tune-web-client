/**
 * #1222 — un album ne pouvait NI entrer dans un dossier de « Collections »,
 * NI en sortir, dans la nouvelle interface.
 *
 * Lulu (JLuc), fil 1844, 18/09/2026 : « un bouton permettant le transfert des
 * albums de la "Bibliothèque" vers les répertoires de "Collections" ».
 *
 * 🔴 Treizième « écrit mais pas branché » de ce client :
 * `api.addAlbumToCollection` et `api.removeAlbumFromCollection` existent, le
 * serveur expose les deux routes, et leurs SEULS appelants vivaient dans
 * l'ancienne interface — `LibraryView.svelte:144` et
 * `CollectionsView.svelte:210`.
 *
 * Forme réelle de `GET /library/collections`, mesurée sur le .18 le
 * 18/09/2026 :
 *
 * ```json
 * {"album_count":3,"album_ids":[1173,1879,2931],"id":1,"name":"favorites"}
 * ```
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { ciblesPourAlbum, contient, libelleCible } from '../collectionsCibles';

const DU_18 = [
  { id: 1, name: 'favorites', album_ids: [1173, 1879, 2931] },
  { id: 4, name: 'Jazz', album_ids: [] },
];

const traduire = (c: string) =>
  c === 'v2.col.alreadyIn' ? 'Déjà dans « {name} »' : c;

describe('#1222 — quelles collections proposer', () => {
  it('toutes les manuelles, avec leur identifiant et leur nom', () => {
    expect(ciblesPourAlbum(DU_18, 999)).toEqual([
      { id: 1, nom: 'favorites', deja: false },
      { id: 4, nom: 'Jazz', deja: false },
    ]);
  });

  it('🔴 celle qui contient déjà l\'album reste PROPOSÉE, mais le dit', () => {
    // La retirer se lirait comme « cette collection n'existe pas », alors que
    // la bonne information est « il y est déjà ».
    const cibles = ciblesPourAlbum(DU_18, 1879);
    expect(cibles).toHaveLength(2);
    expect(cibles.find((c) => c.id === 1)?.deja).toBe(true);
    expect(cibles.find((c) => c.id === 4)?.deja).toBe(false);
  });

  it('une entrée sans identifiant ou sans nom est écartée', () => {
    // 🔴 `id: null` : ce témoin a trouvé un vrai défaut. `Number(null)` vaut
    // 0, et 0 est FINI — la garde `Number.isFinite` seule laissait passer une
    // collection qui n'existe pas. C'est la même famille que « clef undefined
    // supprimée par stringify ».
    expect(ciblesPourAlbum([{ id: null, name: 'X' }, { id: 2, name: '  ' }, { id: 3, name: 'Ok' }], 1))
      .toEqual([{ id: 3, nom: 'Ok', deja: false }]);
    expect(ciblesPourAlbum([{ id: 0, name: 'Zéro' }], 1)).toEqual([]);
    expect(ciblesPourAlbum([{ name: 'Sans id' }], 1)).toEqual([]);
    expect(ciblesPourAlbum(null, 1)).toEqual([]);
    expect(ciblesPourAlbum(undefined, 1)).toEqual([]);
  });

  it('🔴 sans `album_ids`, on ne PRÉTEND pas savoir', () => {
    expect(contient({ id: 1, name: 'x' }, 5)).toBe(false);
    expect(contient({ id: 1, name: 'x', album_ids: 'oups' }, 5)).toBe(false);
    expect(contient({ id: 1, name: 'x', album_ids: [5] }, null)).toBe(false);
    // Et les identifiants peuvent arriver en chaîne selon la base.
    expect(contient({ id: 1, name: 'x', album_ids: ['5'] }, 5)).toBe(true);
  });

  it('le libellé nomme la collection', () => {
    expect(libelleCible({ id: 1, nom: 'Jazz', deja: true }, traduire))
      .toBe('Déjà dans « Jazz »');
  });
});

describe('#1222 — l\'ajout, depuis la Bibliothèque', () => {
  const vue = readFileSync('src/components/v2/LibraryV2.svelte', 'utf8');

  it('la vignette porte le menu, et il appelle la route', () => {
    expect(vue).toContain('menu={depot ? [] : entreesCollection(a)}');
    expect(vue).toContain('api.addAlbumToCollection(cible.id, a.id)');
    expect(vue).toContain('v2.col.addTo');
  });

  it('🔴 un album de DÉPÔT n\'a pas d\'entrée', () => {
    // `depot` est une source distante : il n'a pas d'identifiant de
    // bibliothèque à mettre dans une collection.
    const i = vue.indexOf('menu={depot ? [] : entreesCollection(a)}');
    expect(i).toBeGreaterThan(0);
  });

  it('la liste est RELUE après l\'ajout', () => {
    // Sans cela, la deuxième ouverture du menu dirait encore « ajouter »
    // pour une collection qui le contient désormais.
    const i = vue.indexOf('async function ajouterACollection(');
    const bloc = vue.slice(i, vue.indexOf('\n  }', i));
    expect(bloc).toContain('await api.getCollections()');
  });
});

describe('#1222 — le retrait, depuis la collection ouverte', () => {
  const vue = readFileSync('src/components/v2/CollectionsV2.svelte', 'utf8');

  it('la carte d\'album porte l\'entrée, en danger', () => {
    expect(vue).toContain('menu={entreesAlbum(a)}');
    expect(vue).toContain('v2.col.removeAlbum');
    expect(vue).toContain('api.removeAlbumFromCollection(e.id, a.id)');
    const i = vue.indexOf('function entreesAlbum(');
    const bloc = vue.slice(i, vue.indexOf('\n  }', i));
    expect(bloc).toContain('danger: true');
  });

  it('🔴 JAMAIS sur une collection INTELLIGENTE', () => {
    // Son contenu vient de ses règles : proposer le retrait promettrait un
    // effet que le prochain recalcul annulerait.
    for (const fn of ['function entreesAlbum(', 'async function retirerDeLaCollection(']) {
      const i = vue.indexOf(fn);
      const bloc = vue.slice(i, vue.indexOf('\n  }', i));
      expect(bloc, fn).toContain("sorte === 'smart'");
    }
  });

  it('la grille est mise à jour SUR PLACE, pas relue', () => {
    // Elle est déjà triée par le serveur ; une relecture la ferait sauter
    // sous le pointeur.
    const i = vue.indexOf('async function retirerDeLaCollection(');
    const bloc = vue.slice(i, vue.indexOf('\n  }', i));
    expect(bloc).toContain('albums.filter((x) => x?.id !== a.id)');
  });
});

describe('#1222 — les quatre clés dans les ONZE langues', () => {
  const CLES = ['v2.col.addTo', 'v2.col.alreadyIn', 'v2.col.removeAlbum', 'v2.col.removeAlbumFailed'];
  for (const l of ['fr', 'en', 'de', 'es', 'it', 'ja', 'ko', 'zh', 'ro', 'sv', 'hu']) {
    it(l, () => {
      const src = readFileSync(`src/lib/locales/${l}.ts`, 'utf8');
      for (const c of CLES) expect(src, `${l} / ${c}`).toContain(c);
      for (const c of ['v2.col.addTo', 'v2.col.alreadyIn']) {
        const ligne = src.split('\n').find((x) => x.includes(c)) ?? '';
        expect(ligne, `${l} / ${c} sans {name}`).toContain('{name}');
      }
    });
  }
});
