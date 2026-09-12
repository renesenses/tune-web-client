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
import { afterEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { flushSync, mount, unmount } from 'svelte';
import TrackContextMenu from '../../components/TrackContextMenu.svelte';
import MenuPisteV1 from '../../components/MenuPisteV1.svelte';
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
/** Une piste de SERVICE : aucun identifiant de bibliothèque. */
const SERVICE: Track = {
  id: null, title: 'Alone Again', artist_name: 'Gilbert O’Sullivan',
  album_title: 'Back to Front', source: 'qobuz', source_id: '9876543',
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
  it('une piste de SERVICE n’ouvre pas « Ajouter à une liste de lecture »', () => {
    const rendus = libelles(ouvrir(SERVICE));
    expect(rendus).not.toContain(fr['nowplaying.addToPlaylist']);
    // Les trois routes de bibliothèque prennent un `i64` : trois gestes morts.
    expect(rendus).not.toContain(fr['library.playSimilar']);
    expect(rendus).not.toContain(fr['library.otherVersions']);
    expect(rendus).not.toContain(fr['v2.cover.tags']);
    // Ce qu'elle sait faire, elle le propose — c'est ce qui manquait.
    expect(rendus).toEqual([fr['common.play'], fr['v2.pa.next'], fr['queue.addToQueue']]);
  });
  it('une piste de la BIBLIOTHÈQUE ouvre les neuf gestes', () => {
    expect(libelles(ouvrir(LOCALE))).toEqual([
      fr['common.play'], fr['v2.pa.next'], fr['queue.addToQueue'],
      fr['library.playSimilar'], fr['library.otherVersions'],
      fr['nowplaying.addToPlaylist'], fr['library.goToArtist'],
      fr['library.goToAlbum'], fr['v2.cover.tags'],
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
  const SURFACES: [string, string][] = [
    ['StreamingView', 'piste={t}'],
    ['SearchView', 'piste={track}'],
    ['QueueView', 'piste={queueTrack}'],
    ['PlaylistsView', 'piste={t}'],
    ['FavoritesView', 'piste={t}'],
    ['NowPlaying', 'piste={queueTrack}'],
  ];
  for (const [ecran, prop] of SURFACES) {
    it(`${ecran} monte le menu partagé`, () => {
      const src = sansCommentaires(lire(`src/components/${ecran}.svelte`));
      expect(src, `${ecran} n’importe pas le menu`)
        .toContain("import MenuPisteV1 from './MenuPisteV1.svelte'");
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
  it('la Bibliothèque a gagné « Lire ensuite » sur ses trois menus', () => {
    const src = sansCommentaires(lire('src/components/LibraryView.svelte'));
    expect(src.split('<TrackContextMenu').length - 1, 'le nombre de menus a changé').toBe(3);
    expect(src.split('onPlayNext={() => playNext(t)}').length - 1,
      'les trois menus de la Bibliothèque n’offrent pas tous « Lire ensuite »').toBe(3);
  });
});
