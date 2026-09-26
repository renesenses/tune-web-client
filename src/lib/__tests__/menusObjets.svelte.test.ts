// @vitest-environment jsdom
/**
 * Les menus « … » des OBJETS — album, artiste, playlist, playlist intelligente,
 * collection, collection intelligente, label. Bertrand, 26/09/2026 : « Il doit y
 * avoir un menu contextuel pour : artistes, playlists, collections, labels » —
 * puis les albums, avec la même règle et le même composant.
 *
 * Ces cas MONTENT le menu (`MenuObjetV2` sur une ligne, `PochetteActions` sur une
 * vignette) avec des réponses serveur simulées, cliquent ses entrées, et
 * regardent ce qui part :
 *
 *  1. les entrées de chaque type, selon ce que l'objet permet — local ou de
 *     service, simple ou intelligent, greffon présent ou absent ;
 *  2. chaque geste appelle la BONNE route, ou ouvre le bon écran ;
 *  3. « Supprimer » demande confirmation, et annuler ne supprime rien ;
 *  4. la PARITÉ : le même objet rend les mêmes entrées sur une vignette et sur
 *     une ligne, quel que soit l'écran qui fournit le chemin d'« Ouvrir ».
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRawSnippet, flushSync, mount, tick, unmount } from 'svelte';
import { get } from 'svelte/store';

vi.mock('../api', async (orig) => {
  const vrai = await orig<typeof import('../api')>();
  const piste = (id: number) => ({ id, title: `T${id}`, source: 'local' });
  return {
    ...vrai,
    getAlbumTracks: vi.fn(async () => [piste(71), piste(72)]),
    getAlbumTracksBatch: vi.fn(async (ids: number[]) => ({ tracks: ids.map((i) => piste(i * 10)), failedAlbums: 0 })),
    getArtistTracks: vi.fn(async () => [piste(31)]),
    getPlaylistTracks: vi.fn(async () => [piste(51), { id: null, title: 'Q', source: 'qobuz', source_id: 'q1' }, piste(52)]),
    getSmartPlaylistTracks: vi.fn(async () => [piste(41)]),
    getCollectionAlbums: vi.fn(async () => [{ id: 1 }, { id: 2 }]),
    getSmartCollectionAlbums: vi.fn(async () => [{ id: 3 }]),
    getFilteredTracks: vi.fn(async () => ({ items: [piste(81), piste(82)], total: 2 })),
    getStreamingAlbumTracks: vi.fn(async () => [{ id: null, title: 'S', source: 'qobuz', source_id: 's1' }]),
    getStreamingPlaylistTracks: vi.fn(async () => []),
    getStreamingArtistTopTracks: vi.fn(async () => []),
    addToQueue: vi.fn(async () => ({})),
    shuffleAll: vi.fn(async () => ({})),
    deletePlaylist: vi.fn(async () => undefined),
    deleteSmartPlaylist: vi.fn(async () => ({ deleted: 1 })),
    deleteCollection: vi.fn(async () => ({})),
    deleteSmartCollection: vi.fn(async () => ({})),
    updatePlaylist: vi.fn(async () => ({})),
    updateCollection: vi.fn(async () => ({})),
    getCollections: vi.fn(async () => [
      { id: 4, name: 'Jazz', description: 'nuit', album_ids: [] },
      { id: 9, name: 'Rock', description: null, album_ids: [7] },
    ]),
    createPlaylist: vi.fn(async (name: string) => ({ id: 60, name })),
    addPlaylistTracks: vi.fn(async () => ({})),
    exportPlaylist: vi.fn(async () => 'liste.m3u'),
    getCollectionFolders: vi.fn(async () => ({
      max_depth: 3,
      folders: [{ id: 2, name: 'Étagère', parent_id: null, position: 0, depth: 1, folders: [],
        collections: [{ kind: 'collection', id: 4, name: 'Jazz', description: null, icon: null, color: null, folder_id: 2, position: 0 }] }],
      collections: [{ kind: 'collection', id: 9, name: 'Rock', description: null, icon: null, color: null, folder_id: null, position: null }],
    })),
    placeCollectionInFolder: vi.fn(async () => ({})),
    addAlbumToCollection: vi.fn(async () => ({})),
  };
});
vi.mock('../stores/zones', async (orig) => {
  const vrai = await orig<typeof import('../stores/zones')>();
  return { ...vrai, playAndSync: vi.fn(async () => ({})) };
});

import * as api from '../api';
import { playAndSync, currentZoneId } from '../stores/zones';
import { locale } from '../i18n';
import { dialogs } from '../stores/dialogs';
import { activeView, pendingLibraryAlbum, pendingModeModifier } from '../stores/navigation';
import { pendingPlaylistId } from '../stores/playlists';
import { concertsPlugin } from '../stores/concerts';
import { convertisseurGreffon } from '../stores/convertisseurPlaylists';
import { objetAlbum, objetArtiste, objetCollection, objetLabel, objetPlaylist, type ObjetMenu } from '../gestesObjet';
import type { GestesPochette } from '../actionsPochette';
import MenuObjetV2 from '../../components/v2/MenuObjetV2.svelte';
import PochetteActions from '../../components/v2/PochetteActions.svelte';

const ALBUM_LOCAL = objetAlbum({ id: 7, title: 'Requiem', artist_id: 3, artist_name: 'Mozart' });
const ALBUM_QOBUZ = objetAlbum({ source: 'qobuz', source_id: 'atua1', title: 'Second Song', artist_name: 'Neil Young', artist_id: '35865' });
const ARTISTE = objetArtiste({ id: 3, name: 'Mozart' });
const PLAYLIST = objetPlaylist({ id: 5, name: 'Dimanche' });
const PLAYLIST_QOBUZ = objetPlaylist({ source: 'qobuz', source_id: 'p9', name: 'Découvertes' });
const SMART_PLAYLIST: ObjetMenu = { type: 'playlistIntelligente', id: 5, nom: 'Jamais jouées' };
const COLLECTION = objetCollection({ id: 9, name: 'Rock' }, false);
const SMART_COLLECTION = objetCollection({ id: 9, name: 'Audiophile' }, true);
const LABEL = objetLabel('ECM');

let hote: HTMLDivElement;
let monte: Record<string, unknown> | null = null;

beforeEach(() => {
  locale.set('fr');
  currentZoneId.set(1);
  activeView.set('home');
  pendingLibraryAlbum.set(null);
  pendingModeModifier.set(null);
  pendingPlaylistId.set(null);
  concertsPlugin.set({ name: 'concerts', installed: true, enabled: true });
  convertisseurGreffon.set({ name: 'playlists-converter', installed: true, enabled: true, loaded: true });
  vi.clearAllMocks();
  hote = document.createElement('div');
  document.body.appendChild(hote);
});
afterEach(() => {
  if (monte) { try { unmount(monte); } catch { /* déjà démonté */ } monte = null; }
  hote.remove();
  document.querySelectorAll('.fond').forEach((n) => n.remove());
  for (const d of get(dialogs)) dialogs.settle(d.id, null);
});

const attendre = async (ms = 0) => {
  await tick();
  await new Promise((r) => setTimeout(r, ms));
  await tick();
  flushSync();
};

/** Monte le menu d'une LIGNE (son propre bouton « … ») et l'ouvre. */
function ouvrirLigne(objet: ObjetMenu, gestes: GestesPochette = {}, rafraichir?: () => void): string[] {
  if (monte) unmount(monte);
  document.querySelectorAll('.fond').forEach((n) => n.remove());
  monte = mount(MenuObjetV2, { target: hote, props: { objet, gestes, rafraichir } });
  flushSync();
  const b = hote.querySelector<HTMLButtonElement>('button.mo-bouton');
  expect(b, `la ligne ${objet.type} n’a pas de bouton « … »`).not.toBeNull();
  b!.click();
  flushSync();
  return cles();
}

/** Monte la pochette d'une VIGNETTE et ouvre son menu (coin bas-gauche). */
const pochette = createRawSnippet(() => ({ render: () => '<i data-pochette></i>' }));
function ouvrirVignette(objet: ObjetMenu, gestesMenu: GestesPochette = {}, onOuvrir: (() => void) | null = null): string[] {
  if (monte) unmount(monte);
  document.querySelectorAll('.fond').forEach((n) => n.remove());
  monte = mount(PochetteActions, { target: hote, props: { children: pochette, objet, gestesMenu, onOuvrir } });
  flushSync();
  const b = hote.querySelector<HTMLButtonElement>('button.coin.bl');
  expect(b, `la vignette ${objet.type} n’a pas de menu`).not.toBeNull();
  b!.click();
  flushSync();
  return cles();
}

const entrees = () => [...document.querySelectorAll<HTMLButtonElement>('.fond .menu button[role="menuitem"]')];
const cles = () => entrees().map((b) => b.dataset.cle ?? '');
const cliquer = (cle: string) => {
  const b = entrees().find((x) => x.dataset.cle === cle);
  expect(b, `pas d’entrée ${cle}`).toBeTruthy();
  b!.click();
  flushSync();
};

const LIRE = ['common.play', 'library.shuffle', 'v2.pa.next', 'queue.addToQueue'];

describe('1. Les entrées de chaque type, selon ce que l’objet permet', () => {
  it('album de la BIBLIOTHÈQUE : lecture, fiche, artiste, ranger, corriger', () => {
    expect(ouvrirLigne(ALBUM_LOCAL)).toEqual([
      ...LIRE, 'common.open', 'library.goToArtist', 'v2.cover.favorite', 'v2.cover.tags',
      'v2.album.addToCollection', 'credits.see', 'v2.cover.edit', 'library.reidentify', 'v2.album.locate',
    ]);
  });

  it('album de SERVICE (Qobuz) : rien de ce qui prend un `i64`, les crédits parce que Qobuz en rend', () => {
    expect(ouvrirLigne(ALBUM_QOBUZ)).toEqual([
      ...LIRE, 'common.open', 'library.goToArtist', 'v2.cover.favorite', 'v2.cover.tags', 'credits.see',
    ]);
  });

  it('artiste : « Concerts » avec le greffon, absent sans lui', () => {
    expect(ouvrirLigne(ARTISTE)).toEqual([...LIRE, 'common.open', 'v2.cover.favorite', 'v2.cover.tags', 'nav.concerts']);
    concertsPlugin.set('absent');
    expect(ouvrirLigne(ARTISTE)).not.toContain('nav.concerts');
  });

  it('playlist LOCALE : organiser, partager, supprimer — et « Transférer » avec le greffon seulement', () => {
    expect(ouvrirLigne(PLAYLIST)).toEqual([
      ...LIRE, 'common.open', 'v2.cover.favorite', 'v2.cover.tags', 'v2.pl.rename', 'menuObjet.duplicate',
      'v2.pl.export', 'menuObjet.transfer', 'v2.pl.share', 'common.delete',
    ]);
    convertisseurGreffon.set('absent');
    expect(ouvrirLigne(PLAYLIST)).not.toContain('menuObjet.transfer');
  });

  it('playlist de SERVICE : ni renommer, ni supprimer, ni partager', () => {
    expect(ouvrirLigne(PLAYLIST_QOBUZ, { ouvrir: () => {} })).toEqual([
      ...LIRE, 'common.open', 'v2.cover.favorite', 'v2.cover.tags',
    ]);
  });

  it('playlist INTELLIGENTE : ses règles, pas de renommage à part', () => {
    expect(ouvrirLigne(SMART_PLAYLIST)).toEqual([
      ...LIRE, 'common.open', 'v2.cover.favorite', 'v2.cover.tags', 'menuObjet.editRules', 'common.delete',
    ]);
  });

  it('collection SIMPLE et INTELLIGENTE : renommer l’une, les règles de l’autre, les rayons pour les deux', () => {
    expect(ouvrirLigne(COLLECTION)).toEqual([
      ...LIRE, 'common.open', 'v2.cover.favorite', 'v2.cover.tags', 'v2.pl.rename', 'v2.rayons.move', 'common.delete',
    ]);
    expect(ouvrirLigne(SMART_COLLECTION)).toEqual([
      ...LIRE, 'common.open', 'v2.cover.favorite', 'v2.cover.tags', 'menuObjet.editRules', 'v2.rayons.move', 'common.delete',
    ]);
  });

  it('label : lire et ouvrir, rien d’autre', () => {
    expect(ouvrirLigne(LABEL)).toEqual([...LIRE, 'common.open']);
  });

  it('un album de la collection MANUELLE ouverte peut en être retiré, pas celui d’une intelligente', () => {
    monte = mount(PochetteActions, {
      target: hote,
      props: { children: pochette, objet: ALBUM_LOCAL, dansCollectionManuelle: true, gestesMenu: { retirerDeCollection: () => {} } },
    });
    flushSync();
    hote.querySelector<HTMLButtonElement>('button.coin.bl')!.click();
    flushSync();
    expect(cles()).toContain('v2.col.removeAlbum');
    expect(ouvrirVignette(ALBUM_LOCAL, { retirerDeCollection: () => {} })).not.toContain('v2.col.removeAlbum');
  });
});

describe('2. Chaque geste appelle la bonne route, ou ouvre le bon écran', () => {
  it('Lire une playlist locale : `playlist_id`, la route qui la lit d’un coup', async () => {
    ouvrirLigne(PLAYLIST);
    cliquer('common.play');
    await attendre();
    expect(playAndSync).toHaveBeenCalledWith(1, { playlist_id: 5 });
  });

  it('Lire un album de service : `streaming_album_id` TOUJOURS avec `source`', async () => {
    ouvrirLigne(ALBUM_QOBUZ);
    cliquer('common.play');
    await attendre();
    expect(playAndSync).toHaveBeenCalledWith(1, { streaming_album_id: 'atua1', source: 'qobuz' });
  });

  it('Lire en aléatoire un artiste : le mélange du SERVEUR (`shuffleAll`)', async () => {
    ouvrirLigne(ARTISTE);
    cliquer('library.shuffle');
    await attendre();
    expect(api.shuffleAll).toHaveBeenCalledWith(1, { artist_id: 3 });
  });

  it('Lire ensuite un album : `album_id` AVEC un rang ; Ajouter à la file : sans', async () => {
    ouvrirLigne(ALBUM_LOCAL);
    cliquer('v2.pa.next');
    await attendre();
    const [zid, corps] = vi.mocked(api.addToQueue).mock.calls[0] as [number, any];
    expect(zid).toBe(1);
    expect(corps.album_id).toBe(7);
    expect(typeof corps.position).toBe('number');
    ouvrirLigne(ALBUM_LOCAL);
    cliquer('queue.addToQueue');
    await attendre();
    expect(vi.mocked(api.addToQueue).mock.calls[1]).toEqual([1, { album_id: 7 }]);
  });

  it('Ajouter un label à la file : ses pistes par le filtre Label (`/library/tracks?label=`)', async () => {
    ouvrirLigne(LABEL);
    cliquer('queue.addToQueue');
    await attendre();
    expect(api.getFilteredTracks).toHaveBeenCalledWith({ label: 'ECM', limit: 2000 });
    expect(api.addToQueue).toHaveBeenCalledWith(1, { track_ids: [81, 82] });
  });

  it('Lire une collection : ses albums, puis leurs pistes, en une file', async () => {
    ouvrirLigne(COLLECTION);
    cliquer('common.play');
    await attendre();
    expect(api.getCollectionAlbums).toHaveBeenCalledWith(9);
    expect(api.getAlbumTracksBatch).toHaveBeenCalledWith([1, 2]);
    expect(playAndSync).toHaveBeenCalledWith(1, { track_ids: [10, 20] });
    // Et une INTELLIGENTE passe par SA route — les espaces d'ids se recouvrent.
    ouvrirLigne(SMART_COLLECTION);
    cliquer('common.play');
    await attendre();
    expect(api.getSmartCollectionAlbums).toHaveBeenCalledWith(9);
  });

  it('Ouvrir : la collection intelligente sous SA clé, le label dans l’onglet Labels', async () => {
    const vus: string[] = [];
    const suivre = (e: Event) => vus.push(JSON.stringify((e as CustomEvent).detail));
    window.addEventListener('tune:shortcut-restore', suivre);
    window.addEventListener('tune:v2-facette', suivre);
    try {
      ouvrirLigne(SMART_COLLECTION);
      cliquer('common.open');
      await attendre();
      expect(get(activeView)).toBe('collections');
      expect(vus.join()).toContain('smartcollections:9');
      ouvrirLigne(LABEL);
      cliquer('common.open');
      await attendre();
      expect(get(activeView)).toBe('library');
      expect(vus.join()).toContain('"onglet":"labels","valeur":"ECM"');
    } finally {
      window.removeEventListener('tune:shortcut-restore', suivre);
      window.removeEventListener('tune:v2-facette', suivre);
    }
  });

  it('Modifier un album : la FICHE, en mode Modifier (web#1599)', () => {
    ouvrirLigne(ALBUM_LOCAL);
    cliquer('v2.cover.edit');
    expect(get(pendingModeModifier)).toBe(7);
    expect(get(pendingLibraryAlbum)).toBe(7);
    expect(get(activeView)).toBe('library');
  });

  it('Transférer une playlist : l’écran du greffon, ouvert sur elle', () => {
    ouvrirLigne(PLAYLIST);
    cliquer('menuObjet.transfer');
    expect(get(pendingPlaylistId)).toBe(5);
    expect(get(activeView)).toBe('playlistmanager');
  });

  it('Renommer : le nom STOCKÉ proposé, la route de SA sorte, puis la liste relue', async () => {
    const relire = vi.fn();
    ouvrirLigne(COLLECTION, {}, relire);
    cliquer('v2.pl.rename');
    await attendre();
    const [d] = get(dialogs);
    expect(d.kind).toBe('prompt');
    expect(d.initial).toBe('Rock');
    dialogs.settle(d.id, 'Rock 70');
    await attendre(5);
    // La description part avec le nom, pour ne pas l'effacer.
    expect(api.updateCollection).toHaveBeenCalledWith(9, { name: 'Rock 70', description: null });
    expect(relire).toHaveBeenCalled();
  });

  it('Dupliquer : une playlist neuve, les pistes dans le MÊME ordre (locales et de service)', async () => {
    ouvrirLigne(PLAYLIST);
    cliquer('menuObjet.duplicate');
    await attendre(5);
    expect(api.createPlaylist).toHaveBeenCalledWith('Dimanche (copie)');
    const appels = vi.mocked(api.addPlaylistTracks).mock.calls.map((c) => [c[1], (c[3] ?? []).map((s: any) => s.source_id)]);
    expect(appels).toEqual([[[51], []], [[], ['q1']], [[52], []]]);
  });

  it('Ajouter à une collection : un SOUS-MENU rangé par rayons, et la route de l’album', async () => {
    ouvrirLigne(ALBUM_LOCAL);
    cliquer('v2.album.addToCollection');
    await attendre(5);
    const lignes = [...document.querySelectorAll<HTMLElement>('.fond .menu > *')].map((n) => n.textContent?.trim());
    // Le rayon « Étagère » en intertitre, Jazz sous lui ; Rock hors rayon, et
    // il dit qu'il contient déjà l'album.
    expect(lignes.join(' | ')).toMatch(/Étagère.*Jazz.*Rock/);
    const jazz = entrees().find((b) => b.textContent?.includes('Jazz'))!;
    jazz.click();
    await attendre(5);
    expect(api.addAlbumToCollection).toHaveBeenCalledWith(4, 7);
  });

  it('Déplacer vers un rayon : les destinations de l’arbre, avec la SORTE de la collection', async () => {
    ouvrirLigne(COLLECTION);
    cliquer('v2.rayons.move');
    await attendre(5);
    const etagere = entrees().find((b) => b.textContent?.includes('Étagère'))!;
    expect(etagere).toBeTruthy();
    etagere.click();
    await attendre(5);
    expect(api.placeCollectionInFolder).toHaveBeenCalledWith('collection', 9, 2);
  });
});

describe('3. « Supprimer » demande confirmation', () => {
  it('ANNULER ne supprime rien', async () => {
    ouvrirLigne(PLAYLIST);
    cliquer('common.delete');
    await attendre();
    const [d] = get(dialogs);
    expect(d.kind).toBe('confirm');
    expect(d.danger).toBe(true);
    expect(d.message).toContain('Dimanche');
    dialogs.settle(d.id, false);
    await attendre(5);
    expect(api.deletePlaylist).not.toHaveBeenCalled();
  });

  it('CONFIRMER supprime la collection INTELLIGENTE — jamais la simple de même identifiant', async () => {
    const relire = vi.fn();
    ouvrirLigne(SMART_COLLECTION, {}, relire);
    cliquer('common.delete');
    await attendre();
    const [d] = get(dialogs);
    dialogs.settle(d.id, true);
    await attendre(5);
    expect(api.deleteSmartCollection).toHaveBeenCalledWith(9);
    expect(api.deleteCollection).not.toHaveBeenCalled();
    expect(relire).toHaveBeenCalled();
  });
});

describe('4. La parité : même objet, mêmes entrées, quelle que soit la surface', () => {
  const OBJETS: [string, ObjetMenu][] = [
    ['album local', ALBUM_LOCAL],
    ['album de service', ALBUM_QOBUZ],
    ['artiste', ARTISTE],
    ['playlist', PLAYLIST],
    ['playlist intelligente', SMART_PLAYLIST],
    ['collection', COLLECTION],
    ['collection intelligente', SMART_COLLECTION],
    ['label', LABEL],
  ];
  for (const [nom, objet] of OBJETS) {
    it(`${nom} : la vignette et la ligne montrent le même menu`, () => {
      // La vignette ouvre la fiche dans le calque de SON écran (`onOuvrir`) ; la
      // ligne n'en dit rien et prend le chemin commun. Le CHEMIN diffère, la
      // LISTE non.
      const vignette = ouvrirVignette(objet, {}, () => {});
      const ligne = ouvrirLigne(objet);
      expect(vignette.length).toBeGreaterThan(0);
      expect(ligne).toEqual(vignette);
    });
  }

  it('« Ouvrir » suit le chemin de la surface — et c’est bien la même entrée', () => {
    const calque = vi.fn();
    ouvrirVignette(ALBUM_LOCAL, {}, calque);
    cliquer('common.open');
    expect(calque).toHaveBeenCalledTimes(1);
    expect(get(pendingLibraryAlbum), 'la vignette a pris le chemin commun au lieu du sien').toBeNull();
    ouvrirLigne(ALBUM_LOCAL);
    cliquer('common.open');
    expect(get(pendingLibraryAlbum)).toBe(7);
  });
});
