/**
 * Réunion du 23/09/2026 : « Album : manque le bouton "Ajouter à une
 * collection" ».
 *
 * Sur `main` (4a55356), la fiche album avait sept boutons — lire, aléatoire,
 * lire ensuite, file, localiser, cœur, étiquettes — et AUCUN pour ranger
 * l'album dans un dossier de « Collections ». Le geste (#1222) n'existait
 * que sur la vignette de la Bibliothèque, par le menu de `PochetteActions`,
 * et encore : sur DEUX de ses trois rendus. La grille PAR DÉFAUT — celle que
 * tout le monde voit — ne passait pas `menu`.
 *
 * Le correctif tient en un module : `lib/albumVersCollection` porte le geste
 * (chargement, route, notifications, relecture) ; `LibraryV2` et
 * `AlbumDetailV2` l'appellent. Trois témoins :
 *
 *  1. le MODULE, mesuré avec l'API et les notifications remplacées ;
 *  2. le BRANCHEMENT — les deux écrans passent par le module, aucune copie ;
 *  3. les clés dans les ONZE langues.
 *
 * La fiche MONTÉE (clic ⇒ `POST /library/collections/{id}/albums/{album_id}`)
 * est dans `ficheAlbumAjouterCollection.svelte.test.ts`.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';

const getCollections = vi.fn<() => Promise<any[]>>();
const addAlbumToCollection = vi.fn<(c: number, a: number) => Promise<any>>();
const success = vi.fn<(m: string) => void>();
const error = vi.fn<(m: string) => void>();

vi.mock('../api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../api')>()),
  getCollections: () => getCollections(),
  addAlbumToCollection: (c: number, a: number) => addAlbumToCollection(c, a),
}));
vi.mock('../stores/notifications', () => ({
  notifications: {
    success: (m: string) => success(m),
    error: (m: string) => error(m),
    info: () => {},
    warning: () => {},
  },
}));

import {
  ajouterAlbumACollection,
  chargerCollectionsCibles,
  entreesAjoutCollection,
} from '../albumVersCollection';

/** Forme réelle de `GET /library/collections` (le .18, 18/09/2026). */
const MANUELLES = [
  { id: 1, name: 'favorites', album_ids: [1173, 1879, 2931] },
  { id: 4, name: 'Jazz', album_ids: [] },
];
const traduire = (c: string) =>
  c === 'v2.col.addTo' ? 'Ajouter à « {name} »'
  : c === 'v2.col.alreadyIn' ? 'Déjà dans « {name} »'
  : c;
const respirer = async () => { for (let i = 0; i < 4; i++) await Promise.resolve(); };

beforeEach(() => {
  getCollections.mockReset();
  addAlbumToCollection.mockReset();
  success.mockReset();
  error.mockReset();
  getCollections.mockResolvedValue(MANUELLES);
  addAlbumToCollection.mockResolvedValue({});
});

describe('lib/albumVersCollection — le geste partagé', () => {
  it('charge les manuelles, et rend [] quand la route échoue', async () => {
    expect(await chargerCollectionsCibles()).toEqual(MANUELLES);
    getCollections.mockRejectedValueOnce(new Error('500'));
    expect(await chargerCollectionsCibles()).toEqual([]);
    expect(error).not.toHaveBeenCalled();
  });

  it('une entrée par manuelle ; « déjà » pour celle qui le contient', () => {
    const entrees = entreesAjoutCollection(MANUELLES, 1879, traduire, () => {});
    expect(entrees.map((e) => [e.id, e.libelle, e.deja])).toEqual([
      [1, 'Déjà dans « favorites »', true],
      [4, 'Ajouter à « Jazz »', false],
    ]);
  });

  it('🔴 aucune entrée sans identifiant d’album (service, dépôt distant)', () => {
    expect(entreesAjoutCollection(MANUELLES, null, traduire, () => {})).toEqual([]);
    expect(entreesAjoutCollection(MANUELLES, undefined, traduire, () => {})).toEqual([]);
  });

  it('`faire` appelle la route avec LE BON identifiant, prévient, puis rend la liste RELUE', async () => {
    const apres = vi.fn();
    const relues = [...MANUELLES, { id: 9, name: 'Nouvelle', album_ids: [] }];
    getCollections.mockResolvedValueOnce(relues);
    const jazz = entreesAjoutCollection(MANUELLES, 1879, traduire, apres).find((e) => e.id === 4)!;
    jazz.faire();
    await respirer();
    expect(addAlbumToCollection).toHaveBeenCalledWith(4, 1879);
    expect(success).toHaveBeenCalledTimes(1);
    // Traduit, jamais la clé brute.
    expect(success.mock.calls[0][0]).not.toBe('library.albumAddedToCollection');
    expect(apres).toHaveBeenCalledWith(relues);
  });

  it('un échec prévient et NE relit PAS', async () => {
    addAlbumToCollection.mockRejectedValueOnce(new Error('404'));
    expect(await ajouterAlbumACollection(1879, { id: 4 })).toBeNull();
    expect(error).toHaveBeenCalledTimes(1);
    expect(error.mock.calls[0][0]).not.toBe('library.collectionAddError');
    expect(getCollections).not.toHaveBeenCalled();
  });
});

describe('le branchement — une seule implémentation, deux écrans', () => {
  const fiche = readFileSync('src/components/v2/AlbumDetailV2.svelte', 'utf8');
  const grille = readFileSync('src/components/v2/LibraryV2.svelte', 'utf8');

  it('la fiche album importe le module et porte le bouton sous la garde du bloc local', () => {
    expect(fiche).toContain("from '../../lib/albumVersCollection'");
    expect(fiche).toContain('v2.album.addToCollection');
    // Le bouton est SOUS la même garde que le bloc local : un album de la
    // bibliothèque, jamais un dépôt distant ni un album de service.
    const i = fiche.indexOf('v2.album.addToCollection');
    const avant = fiche.slice(fiche.lastIndexOf('{#if', i), i);
    expect(avant).toContain('album.id != null && !depot');
    // Et il vient APRÈS Étiquettes.
    const etiquettes = fiche.indexOf("{$tr('v2.cover.tags' as any)}");
    expect(etiquettes).toBeGreaterThan(-1);
    expect(i).toBeGreaterThan(etiquettes);
  });

  it('la fiche mène à l’écran Collections quand il n’y en a aucune', () => {
    expect(fiche).toContain('v2.album.noCollection');
    expect(fiche).toContain("activeView.set('collections')");
  });

  it('🔴 la grille PAR DÉFAUT passe le menu, comme les deux autres rendus', () => {
    const rendus = grille.match(/<PochetteActions\b/g)?.length ?? 0;
    const menus = grille.match(/menu=\{depot \? \[\] : entreesCollection\(a\)\}/g)?.length ?? 0;
    expect(rendus).toBeGreaterThanOrEqual(3);
    expect(menus, 'un rendu de PochetteActions sans menu de collections').toBe(rendus);
    expect(grille).toContain("from '../../lib/albumVersCollection'");
  });

  it('🔴 aucune copie du geste : la route n’est appelée QUE par le module', () => {
    for (const [nom, src] of [['fiche', fiche], ['grille', grille]] as const) {
      expect(src, `${nom} appelle la route directement`).not.toContain('api.addAlbumToCollection(');
    }
  });
});

describe('les deux clés dans les ONZE langues', () => {
  for (const l of ['fr', 'en', 'de', 'es', 'it', 'ja', 'ko', 'zh', 'ro', 'sv', 'hu']) {
    it(l, () => {
      const src = readFileSync(`src/lib/locales/${l}.ts`, 'utf8');
      for (const c of ['v2.album.addToCollection', 'v2.album.noCollection']) {
        expect(src, `${l} / ${c}`).toContain(`"${c}":`);
      }
      // Le double encodage laisse des « Ã » : aucun ne doit apparaître.
      expect(src).not.toContain('Ã©');
    });
  }
});
