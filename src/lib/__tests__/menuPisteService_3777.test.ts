// #3777 — « Menu "…" d'une piste de service : 3 entrées contre 9 ».
//
// FabienM, fil forum 1739 point 2 (09/09/2026) : « Menu historique, autres
// actions (...) sur les titres Qobuz ne proposent pas les mêmes fonctions que
// les titres locaux ». Et sa règle, point 3 : « les mêmes boutons / actions
// […] quelque soit la source (local / Streaming), à l'exception de l'édition ».
//
// 🔴 LES SIX ABSENCES SE RÉPARTISSENT EN TROIS FAMILLES, et les confondre
// serait l'erreur à ne pas commettre :
//
//   A. « Plus comme ça », « Autres versions », « Étiquettes » — les trois
//      routes prennent un `i64` de la table `tracks`. Une piste de service n'en
//      a pas. Refus assumé, pas oubli.
//   B. « Ajouter à une playlist » — tranché par #1848 :
//      `playlist_tracks.track_id` est `NOT NULL REFERENCES tracks(id)`. Le
//      client envoyait `streaming_tracks`, serde l'écartait EN SILENCE, la
//      route répondait 201 et la liste restait vide. Évolution de schéma, pas
//      correctif d'interface.
//   C. « Aller à l'artiste » et « Aller à l'album » — possibles, et simplement
//      pas branchées. C'est le seul volet que cette tranche ouvre.
//
// Ce témoin tient la frontière : il vérifie que C apparaît ET que A et B
// restent absentes. Sans la seconde moitié, « rendre les entrées » finirait par
// rouvrir la playlist qui annonce « ajoutée » sur une liste vide.
import { describe, expect, it } from 'vitest';
import { entreesMenuPiste } from '../menuPiste';

/** Tous les gestes fournis : on éprouve les CAPACITÉS, pas la surface. */
const TOUS = {
  lire: () => {}, ensuite: () => {}, aLaFile: () => {},
  plusCommeCa: () => {}, autresVersions: () => {}, ajouterAPlaylist: () => {},
  allerArtiste: () => {}, allerAlbum: () => {}, etiqueter: () => {},
};
const cles = (c: any) => entreesMenuPiste(c, TOUS).map((e) => e.cle);

const LOCALE = { jouable: true, idBibliotheque: 12, artistId: 7, albumId: 9 };
const SERVICE = {
  jouable: true, idBibliotheque: null, artistId: null, albumId: null,
  albumDeService: { service: 'qobuz', albumId: 'q-alb-7', titre: 'Malina' },
  artisteDeService: { service: 'qobuz', nom: 'Leprous' },
};

describe('#3777 — la famille C rejoint le menu, A et B restent dehors', () => {
  it('une piste LOCALE garde ses neuf entrées', () => {
    expect(cles(LOCALE)).toEqual([
      'common.play', 'v2.pa.next', 'queue.addToQueue',
      'library.playSimilar', 'library.otherVersions', 'nowplaying.addToPlaylist',
      'library.goToArtist', 'library.goToAlbum', 'v2.cover.tags',
    ]);
  });

  it("une piste de SERVICE gagne « aller à l'artiste » et « aller à l'album »", () => {
    const k = cles(SERVICE);
    expect(k).toContain('library.goToArtist');
    expect(k).toContain('library.goToAlbum');
    expect(k.length).toBe(5); // 3 de lecture + les 2 de la famille C
  });

  it('🔴 la famille A reste ABSENTE — les trois routes prennent un i64', () => {
    const k = cles(SERVICE);
    expect(k).not.toContain('library.playSimilar');
    expect(k).not.toContain('library.otherVersions');
    expect(k).not.toContain('v2.cover.tags');
  });

  it('🔴 la playlist reste ABSENTE — #1848, et la route répond 201 sur du vide', () => {
    expect(cles(SERVICE)).not.toContain('nowplaying.addToPlaylist');
  });

  it("sans gestes armés par la coquille, rien n'apparaît : absent, pas mort", () => {
    // C'est ce que voit l'ANCIENNE coquille, qui n'a pas ces écrans.
    const sansCoquille = { ...SERVICE, albumDeService: null, artisteDeService: null };
    const k = cles(sansCoquille);
    expect(k).not.toContain('library.goToArtist');
    expect(k).not.toContain('library.goToAlbum');
    expect(k.length).toBe(3);
  });

  it("une capacité sans son geste ne pousse rien — la surface décide aussi", () => {
    const sansGeste = entreesMenuPiste(SERVICE as any, { ...TOUS, allerAlbum: undefined });
    expect(sansGeste.map((e) => e.cle)).not.toContain('library.goToAlbum');
  });
});
