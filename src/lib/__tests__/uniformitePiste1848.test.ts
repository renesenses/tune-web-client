// 🔴 #872 — `TrackContextMenu` est désormais PORTÉ à la racine du document
// (`lib/portail`), pour échapper à la contention de peinture de la ligne qui
// l'ouvre. Le panneau n'est donc plus un descendant de l'hôte monté : on
// l'interroge depuis `document`. Les assertions elles-mêmes n'ont pas bougé.
// @vitest-environment jsdom
//
// jsdom, et pas `node` : ce fichier MONTE les deux menus réels. Sans `window`,
// le runtime client de Svelte n'installe pas son ordonnanceur et chaque
// assertion « le menu propose… » passerait au vert sans avoir rien rendu.
//
// ─────────────────────────────────────────────────────────────────────────────
//
// `renesenses/tune-server-rust#1848` — « uniformiser les actions sur une piste :
// le menu contextuel n'existe que dans la bibliothèque, jamais sur une piste de
// service » (Dominique Comet).
//
// Relevé sur la tête de `main` avant ce lot, le 07/09/2026 :
//
//     git grep -c '<TrackContextMenu' -- src/components
//       → LibraryView.svelte : 3        (et rien d'autre)
//
// Streaming, recherche, file d'attente, listes de lecture, favoris et lecture
// en cours n'ouvraient AUCUN menu ; leurs lignes portaient deux ou trois
// icônes, différentes d'un écran à l'autre. Le nouveau client, lui, a gagné le
// sien le 07/09 (#765) — et les deux listes avaient déjà divergé.
//
// Ce que ce fichier tient, EN MONTANT les composants :
//
//   1. le menu du client actuel rend exactement ce que `lib/menuPiste` dit —
//      plus de liste en dur, donc plus de dérive possible entre les deux ;
//   2. une piste de SERVICE n'ouvre pas « Ajouter à une liste de lecture » ;
//   3. une piste de la BIBLIOTHÈQUE l'ouvre, avec les gestes de bibliothèque ;
//   4. chaque entrée déclenche SON geste, et lui seul ;
//   5. les six surfaces qui n'avaient aucun menu en montent un.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { flushSync, mount, unmount } from 'svelte';
import TrackContextMenu from '../../components/partages/TrackContextMenu.svelte';
import MenuPisteV1 from '../../components/partages/MenuPisteV1.svelte';
import PisteActions from '../../components/v2/PisteActions.svelte';
import { entreesMenuPiste, type CapacitesPiste, type GestesPiste } from '../menuPiste';
import { rangeableEnPlaylist } from '../pisteFile';
import lFr from '../locales/fr';
import type { Track } from '../types';
/** Boîte écran du bouton : jsdom n'a pas de mise en page, zéro suffit (#872). */
const ANCRE = { top: 0, bottom: 0, right: 0 };
const fr: Record<string, string> = lFr as any;
let monte: any = null;
let hote: HTMLElement | null = null;
afterEach(() => {
  if (monte) unmount(monte, { outro: false });
  monte = null;
  if (hote) hote.remove();
  hote = null;
});
function poser(composant: any, props: Record<string, any>) {
  // 🔴 #872 — deux épreuves posent DEUX fois dans le même cas. `poser`
  // écrasait `monte` sans démonter : l'hôte orphelin partait avec le nœud,
  // personne ne s'en apercevait. Depuis que le panneau est porté à la racine
  // du document, il y SURVIT — et l'épreuve suivante compte les entrées du
  // menu fantôme. On démonte ce qui précède.
  if (monte) unmount(monte, { outro: false });
  if (hote) hote.remove();
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(composant, { target: hote, props });
  flushSync();
  return hote;
}
/** Les libellés RENDUS par le menu, dans l'ordre où ils apparaissent. */
function libelles(_racine: HTMLElement): string[] {
  return [...document.querySelectorAll('.track-menu-item')]
    .map((b) => (b.textContent ?? '').trim());
}
/** Une piste de la BIBLIOTHÈQUE. */
const LOCALE: Track = {
  id: 2450, title: 'La fleur', artist_id: 125, artist_name: 'M',
  album_id: 259, album_title: 'Je dis aime', source: 'local',
};
/** Une piste de SERVICE : aucun identifiant de bibliothèque. Qobuz sait
 *  écrire ses playlists (#1268) et la paire `source` + `source_id` suffit aux
 *  étiquettes (#1238). */
const SERVICE: Track = {
  id: null, title: 'Alone Again', artist_name: 'Gilbert O’Sullivan',
  album_title: 'Back to Front', source: 'qobuz', source_id: '9876543',
};
/** Une piste de service dont le service n'ÉCRIT pas de playlist
 *  (`SERVICES_PLAYLIST_ECRITURE`) : étiquetable, mais sans liste. */
const SERVICE_SANS_ECRITURE: Track = {
  id: null, title: 'Alone Again', artist_name: 'Gilbert O’Sullivan',
  album_title: 'Back to Front', source: 'youtube', source_id: 'dQw4w9WgXcQ',
};
describe('#1848 — le menu du client actuel ne décide plus de son contenu', () => {
  /**
   * 🔴 On MONTE le composant et on lit ce qu'il a rendu.
   *
   * La garde qui a précédé celle-ci lisait les `$tr('…')` littéraux du fichier.
   * Elle restait verte quand une entrée était neutralisée, parce que son texte
   * était toujours là — c'est le piège attrapé deux fois le 07/09/2026. Ici, le
   * menu est monté, et la liste attendue vient de l'appel au module.
   */
  it('il rend EXACTEMENT ce que `entreesMenuPiste` produit', () => {
    const rien = () => {};
    const capacites: CapacitesPiste = { jouable: true, idBibliotheque: 1, artistId: 1, albumId: 1 };
    const racine = poser(TrackContextMenu, { ancre: ANCRE,
      onClose: rien, onPlay: rien, onAddToQueue: rien, onPlayNext: rien,
      onPlaySimilar: rien, onOtherVersions: rien, onAddToPlaylist: rien,
      onGoToArtist: rien, onGoToAlbum: rien, onTag: rien,
    });
    const attendus = entreesMenuPiste(capacites, {
      lire: rien, ensuite: rien, aLaFile: rien, plusCommeCa: rien,
      autresVersions: rien, ajouterAPlaylist: rien, allerArtiste: rien,
      allerAlbum: rien, etiqueter: rien,
    } as GestesPiste).map((e) => fr[e.cle]);
    expect(attendus.length, 'le module ne rend plus les neuf gestes').toBe(9);
    expect(libelles(racine)).toEqual(attendus);
  });
  it('une entrée sans geste ne se rend pas — pas de geste muet', () => {
    // L'onglet « Titres » n'a pas la ligne dépliante des autres versions : il
    // ne passe pas `onOtherVersions`, et l'entrée doit disparaître. Une entrée
    // muette est pire qu'une entrée absente (garde #2574).
    const rien = () => {};
    const racine = poser(TrackContextMenu, { ancre: ANCRE,
      onClose: rien, onPlay: rien, onAddToQueue: rien,
    });
    expect(libelles(racine)).toEqual([fr['common.play'], fr['queue.addToQueue']]);
  });
  it('chaque entrée déclenche SON geste, et lui seul', () => {
    const appels: string[] = [];
    const g = (nom: string) => () => appels.push(nom);
    const racine = poser(TrackContextMenu, {
      ancre: ANCRE,
      onClose: () => {}, onPlay: g('lire'), onPlayNext: g('ensuite'),
      onAddToQueue: g('aLaFile'), onPlaySimilar: g('plusCommeCa'),
      onOtherVersions: g('autresVersions'), onAddToPlaylist: g('ajouterAPlaylist'),
      onGoToArtist: g('allerArtiste'), onGoToAlbum: g('allerAlbum'), onTag: g('etiqueter'),
    });
    for (const b of [...document.querySelectorAll('.track-menu-item')]) (b as HTMLElement).click();
    flushSync();
    expect(appels).toEqual([
      'lire', 'ensuite', 'aLaFile', 'plusCommeCa', 'autresVersions',
      'ajouterAPlaylist', 'allerArtiste', 'allerAlbum', 'etiqueter',
    ]);
  });
});
describe('#1848 — le menu posable partout, monté sur une vraie piste', () => {
  function ouvrir(piste: Track, props: Record<string, any> = {}) {
    const racine = poser(MenuPisteV1, { piste, ...props });
    const bouton = racine.querySelector('.track-more-btn') as HTMLElement;
    expect(bouton, 'aucun bouton « … » rendu').toBeTruthy();
    bouton.click();
    flushSync();
    return racine;
  }
  /**
   * 🔴 Le cœur du ticket, et la moitié qui n'était pas traitée.
   *
   * Le serveur ne peut pas ranger une piste de service dans une liste locale :
   * `struct AddTracks { track_ids: Vec<i64>, position: Option<i64> }`, et
   * `add_tracks` ne lit que `body.track_ids` (`routes/playlists.rs`, tête de
   * `renesenses/tune-server-rust` au 07/09/2026). Le client envoyait pourtant
   * `streaming_tracks` : serde l'écartait, la route répondait 201, et le modal
   * annonçait « ajoutée » sur une liste restée vide.
   */
  it('une piste de SERVICE sans écriture n’ouvre pas « Ajouter à une liste de lecture »', () => {
    const rendus = libelles(ouvrir(SERVICE_SANS_ECRITURE));
    expect(rendus).not.toContain(fr['nowplaying.addToPlaylist']);
    // Les routes de bibliothèque prennent un `i64` : gestes morts, donc absents.
    expect(rendus).not.toContain(fr['library.playSimilar']);
    expect(rendus).not.toContain(fr['trackTags.title']);
    // « Autres versions », SI : depuis le 23/09/2026 elle se rapproche par
    // titre + artiste pour une piste de service (`lib/versionsParTitre`).
    expect(rendus).toContain(fr['library.otherVersions']);
    // Ce qu'elle sait faire, elle le propose — c'est ce qui manquait. Les
    // étiquettes, oui : la paire `source` + `source_id` suffit (#1238).
    expect(rendus).toEqual([
      fr['common.play'], fr['v2.pa.next'], fr['queue.addToQueue'],
      fr['library.otherVersions'], fr['v2.cover.tags'],
    ]);
  });
  /**
   * 🔴 #1268 + #1238, réunion du 23/09/2026 (« toutes les pistes ont le menu
   * complet ») : une piste Qobuz rejoint une playlist DE SON SERVICE, et se
   * laisse étiqueter par sa paire `source` + `source_id`. `PisteActions` le
   * savait ; ce menu passait `idBibliotheque` seul et les deux entrées
   * manquaient dans le tiroir de file du NowPlaying.
   */
  it('une piste Qobuz ouvre la playlist de SON service et les étiquettes — jamais une liste locale', () => {
    const rendus = libelles(ouvrir(SERVICE));
    expect(rendus).toEqual([
      fr['common.play'], fr['v2.pa.next'], fr['queue.addToQueue'],
      // 23/09/2026 — « Autres versions » par titre + artiste, même libellé,
      // même place que pour une piste de la bibliothèque.
      fr['library.otherVersions'],
      fr['nowplaying.addToPlaylist'], fr['v2.cover.tags'],
    ]);
  });
  it('une piste de la BIBLIOTHÈQUE ouvre les onze gestes', () => {
    expect(libelles(ouvrir(LOCALE))).toEqual([
      fr['common.play'], fr['v2.pa.next'], fr['queue.addToQueue'],
      fr['library.playSimilar'], fr['library.otherVersions'],
      fr['nowplaying.addToPlaylist'], fr['library.goToArtist'],
      fr['library.goToAlbum'], fr['v2.cover.tags'],
      // #851 — « Tous les champs piste », que seul `MenuPisteV2` rendait.
      fr['trackTags.title'],
      // #4806 — « Bannir ce titre », bibliothèque seule ; le témoin de
      // service juste au-dessus prouve qu'il n'y est pas.
      fr['ban.ban'],
    ]);
  });
  it('« Aller à l’artiste » apparaît sur une piste de service SI l’écran sait le faire', () => {
    // Une piste de service ne porte pas d'`artist_id` numérique : sans relais
    // de l'écran, l'entrée reste absente plutôt que d'ouvrir sur rien.
    expect(libelles(ouvrir(SERVICE))).not.toContain(fr['library.goToArtist']);
    let vu = 0;
    const racine = ouvrir(SERVICE, { onAllerArtiste: () => vu++ });
    expect(libelles(racine)).toContain(fr['library.goToArtist']);
    const entree = [...document.querySelectorAll('.track-menu-item')]
      .find((b) => (b.textContent ?? '').trim() === fr['library.goToArtist']) as HTMLElement;
    entree.click();
    flushSync();
    expect(vu, 'l’entrée est rendue mais son geste n’est pas branché').toBe(1);
  });
  it('le menu se referme quand on choisit', () => {
    const racine = ouvrir(LOCALE);
    (document.querySelector('.track-menu-item') as HTMLElement).click();
    flushSync();
    expect(document.querySelectorAll('.track-menu-item')).toHaveLength(0);
  });
});
describe('#1848 — une piste de service n’entre pas dans une liste locale', () => {
  it('`rangeableEnPlaylist` tranche sur la piste, pas sur l’écran', () => {
    expect(rangeableEnPlaylist(LOCALE)).toBe(true);
    expect(rangeableEnPlaylist(SERVICE)).toBe(false);
    // Une piste locale porteuse d'un identifiant de service reste locale.
    expect(rangeableEnPlaylist({ id: 4, source: 'local' })).toBe(true);
    expect(rangeableEnPlaylist({ id: 4, source: 'qobuz' })).toBe(false);
  });
});
const lire = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf-8');
const sansCommentaires = (s: string) =>
  s.replace(/<!--[\s\S]*?-->/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
/**
 * Le seul point que le montage ne peut pas tenir : ces écrans font des centaines
 * de lignes et dépendent de leur coquille. On garde donc le CÂBLAGE — la balise
 * est là, et l'import qui va avec. Ce que fait la balise, les tests montés
 * ci-dessus le prouvent.
 */
describe('#1848 — les surfaces qui n’avaient aucun menu en montent un', () => {
  // Cinq de ces six surfaces étaient des vues de l'ancienne interface, partie
  // avec la phase 5. La règle tient sur celle qui reste, et sur toute surface
  // qui rejoindrait cette liste.
  const SURFACES: [string, string][] = [
    ['partages/NowPlaying', 'piste={queueTrack}'],
  ];
  for (const [ecran, prop] of SURFACES) {
    it(`${ecran} monte le menu partagé`, () => {
      const src = sansCommentaires(lire(`src/components/${ecran}.svelte`));
      expect(src, `${ecran} n’importe pas le menu`)
        // `MenuPisteV1` a rejoint `partages/` : un écran resté à la racine
        // l'atteint par `./partages/`, une brique de `partages/` par `./`.
        // La garde porte sur l'IMPORT, pas sur le chemin qui y mène.
        .toMatch(/import MenuPisteV1 from '\.{1,2}\/(partages\/)?MenuPisteV1\.svelte'/);
      expect(src, `${ecran} importe le menu sans le monter`)
        .toContain(`<MenuPisteV1 ${prop} />`);
    });
    it(`${ecran} n’offre plus « ajouter à une playlist » à une piste de service`, () => {
      const src = sansCommentaires(lire(`src/components/${ecran}.svelte`));
      expect(src, `${ecran} teste encore \`|| source_id\` pour l’ajout à une liste`)
        .not.toMatch(/onAddToPlaylist && \([a-zA-Z?.]+\.id \|\| [a-zA-Z?.]+\.source_id\)/);
      expect(src).toContain('rangeableEnPlaylist');
    });
  }
  /**
   * 🔴 #1430 — le tiroir de file du NowPlaying itérait `$queueTracks` BRUT.
   * `id` d'une ligne de file est `queue_items.id`, la piste est `track_id` :
   * « Autres versions », « Plus comme ça », « Étiquettes » et le bouton
   * playlist visaient une AUTRE piste (mesuré sur le .18 : `{ id: 26070,
   * track_id: 32764 }`). `QueueV2` passait déjà par `pisteDeFile` ; la
   * balise doit recevoir la ligne REMPLACÉE, pas la ligne de file.
   */
  it('partages/NowPlaying donne au menu la piste de la ligne de file, pas la ligne (#1430)', () => {
    const src = sansCommentaires(lire('src/components/partages/NowPlaying.svelte'));
    expect(src).toMatch(/import \{ pisteDeFile \} from '\.\.\/\.\.\/lib\/pisteDeFile'/);
    const boucle = src.indexOf('{#each $queueTracks as ligneDeFile, index}');
    const remplacement = src.indexOf('{@const queueTrack = pisteDeFile(ligneDeFile)}');
    const menu = src.indexOf('<MenuPisteV1 piste={queueTrack} />');
    // 🔴 Chacun doit EXISTER avant qu'un ordre ait un sens : `-1 < n` passe.
    expect(boucle, 'la boucle itère encore la ligne de file sous le nom de la piste').toBeGreaterThan(-1);
    expect(remplacement, 'aucun `pisteDeFile` dans la boucle').toBeGreaterThan(-1);
    expect(menu).toBeGreaterThan(-1);
    expect(boucle).toBeLessThan(remplacement);
    expect(remplacement).toBeLessThan(menu);
    expect(src, 'la boucle itère encore `$queueTracks` brut').not.toContain('{#each $queueTracks as queueTrack');
  });
  /**
   * Les surfaces de la NOUVELLE interface qui rendent une piste. Chacune passe
   * par `PisteActions` — directement, ou par `ListePistesV2` qui le monte sur
   * chaque ligne. `PlaylistManagerView` (ancienne interface) y est entré avec
   * la liste commune (#1524, 23/09/2026) : il monte `ListePistesV2` depuis
   * `../v2/`. `YouTubeDecouverteV2`, `MediaServersV2` et `PageWidgets` sont
   * hors liste : décision produit en attente (23/09/2026).
   */
  const SURFACES_V2: [string, RegExp][] = [
    ['v2/ListePistesV2', /<PisteActions /],
    ['v2/LignePisteV2', /<PisteActions /],
    ['v2/QueueV2', /<PisteActions /],
    ['v2/SearchV2', /<ListePistesV2 /],
    ['v2/StreamingV2', /<ListePistesV2 /],
    ['v2/HistoriqueV2', /<ListePistesV2\b/],
    ['v2/FavoritesV2', /<ListePistesV2 /],
    ['v2/PlaylistDetailV2', /<ListePistesV2 /],
    ['v2/EtiquettesV2', /<ListePistesV2 /],
    ['v2/BioEtTitresPhares', /<ListePistesV2 /],
    ['v2-heritage/PlaylistManagerView', /<ListePistesV2 /],
  ];
  for (const [ecran, balise] of SURFACES_V2) {
    it(`${ecran} rend ses pistes par PisteActions ou ListePistesV2`, () => {
      const src = sansCommentaires(lire(`src/components/${ecran}.svelte`));
      expect(src, `${ecran} n’importe ni PisteActions ni ListePistesV2`)
        .toMatch(/import (PisteActions|ListePistesV2)(, \{[^}]*\})? from '(\.\/|\.\.\/v2\/)(PisteActions|ListePistesV2)\.svelte'/);
      expect(src, `${ecran} importe la brique sans la monter`).toMatch(balise);
      // Aucune de ces surfaces ne porte son propre menu de piste.
      expect(src).not.toMatch(/<(TrackContextMenu|MenuPisteV1|MenuPisteV2) /);
    });
  }
});
/**
 * 🔴 PARITÉ DES DEUX MENUS, MONTÉS — réunion du 23/09/2026.
 *
 * « S'assurer que toutes les pistes ont le menu complet » et « Autres
 * versions absente du menu ». `MenuPisteV1` (tiroir de file du NowPlaying) et
 * `PisteActions` → `MenuPisteV2` (toute la nouvelle interface) lisent le même
 * module, mais chacun lui passe SES capacités : le premier oubliait
 * `etiquetable`, `playlistDeService` et le geste `champsDuFichier`. Sur la tête
 * de `main` au 23/09 :
 *
 *     piste locale  — V1 : 9 entrées, V2 : 10 (« Tous les champs piste »)
 *     piste Qobuz   — V1 : 3 entrées, V2 : 5 (playlist du service, étiquettes)
 *
 * Ici on MONTE les deux, on ouvre leur « … » et on compare les libellés rendus.
 * Un module partagé ne suffit pas : c'est l'appelant qui décide, donc c'est
 * l'appelant qu'on compare.
 */
describe('parité des menus — MenuPisteV1 et PisteActions rendent la même liste', () => {
  class ObservateurInerte { observe() {} unobserve() {} disconnect() {} }
  beforeEach(() => {
    vi.stubGlobal('ResizeObserver', ObservateurInerte);
    vi.stubGlobal('IntersectionObserver', ObservateurInerte);
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true, status: 200,
      headers: new Headers({ 'Content-Type': 'application/json' }),
      text: async () => '{}', json: async () => ({}),
    }) as unknown as Response));
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    document.querySelectorAll('.fond, .track-menu-backdrop').forEach((e) => e.remove());
  });
  /** Ouvre le « … » du composant monté et lit les libellés de son menu. */
  function menuDe(composant: any, piste: Track): string[] {
    const racine = poser(composant, { piste });
    // `poser` a démonté le précédent ; un panneau porté à la racine qui aurait
    // survécu compterait ses entrées avec les nôtres. On nettoie AVANT le clic.
    document.querySelectorAll('.fond, .track-menu-backdrop').forEach((e) => e.remove());
    const bouton = racine.querySelector('button[aria-haspopup="menu"]') as HTMLElement | null;
    expect(bouton, 'aucun bouton « … » rendu').toBeTruthy();
    bouton!.click();
    flushSync();
    return [...document.querySelectorAll('[role="menuitem"]')]
      .map((b) => (b.textContent ?? '').trim());
  }
  for (const [nom, piste] of [
    ['une piste de la bibliothèque', LOCALE],
    ['une piste Qobuz', SERVICE],
    ['une piste de service sans playlist', SERVICE_SANS_ECRITURE],
  ] as [string, Track][]) {
    it(`${nom} : même liste d’entrées dans les deux menus`, () => {
      const v1 = menuDe(MenuPisteV1, piste);
      const v2 = menuDe(PisteActions, piste);
      expect(v1.length, 'le menu V1 est vide').toBeGreaterThan(0);
      expect(v1, `V1 ${JSON.stringify(v1)} ≠ V2 ${JSON.stringify(v2)}`).toEqual(v2);
    });
  }
  it('la piste de la bibliothèque a ses onze gestes dans les deux menus, « Autres versions » compris', () => {
    for (const composant of [MenuPisteV1, PisteActions]) {
      const rendus = menuDe(composant, LOCALE);
      expect(rendus).toContain(fr['library.otherVersions']);
      expect(rendus).toContain(fr['trackTags.title']);
      // #4806 — « Bannir ce titre », bibliothèque seule, dans les DEUX menus.
      expect(rendus).toContain(fr['ban.ban']);
      expect(rendus).toHaveLength(11);
    }
  });
});
