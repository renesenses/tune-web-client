/**
 * Favori de playlist de SERVICE — #2370 (Gros Bidon / Didier, fil forum 1541).
 *
 * > « On peut mettre un album Qobuz en favori par contre on ne peut pas mettre
 * >   une playlist Qobuz en favori. Est-il possible d'ajouter cette fonction ? »
 *
 * C'est la suite exacte du fil 1478 du même testeur : on savait LIRE les albums
 * Qobuz favoris, on ne savait pas les AJOUTER. La v0.9.88 a posé le cœur sur la
 * fiche album ; il n'a jamais été posé sur la fiche playlist.
 *
 * ## Ce que ce fichier verrouille, et ce qu'il ne prétend PAS résoudre
 *
 * Le favori de Tune est la VÉRITÉ, la recopie vers le service est au mieux :
 * `toggleStreamingFavorite` écrit d'abord dans `streaming_favorites` (côté
 * profil) et n'annule pas le cœur si l'appel au service échoue — le `.catch`
 * de fin de fonction est là pour ça, et il y est depuis #1478.
 *
 * C'est décisif ici : côté serveur, `favorite_key("playlists")` REFUSE
 * (`qobuz: favori de playlist non pris en charge`, cf. #2474) parce que l'appel
 * de souscription à une playlist tierce n'est établi nulle part contre l'API
 * Qobuz. Ce refus n'a pas à bloquer Didier : sa playlist entre dans SES favoris
 * Tune, exactement comme une playlist locale entre dans `favorites` (#2442).
 *
 * Le vrai piège, celui que ces tests visent, est l'autre moitié — celle que le
 * ticket #2370 nomme : « ajouter le type en écriture seule laisserait un favori
 * qu'aucun écran ne peut relire ». L'onglet Playlists de l'écran Favoris ne
 * lisait QUE `local.playlists` : une playlist Qobuz mise en favori était écrite
 * en base et n'était jamais réaffichée nulle part.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fusionnerPlaylistsFavorites } from '../streamingFavorites';

const qobuzPlaylist = {
  item_type: 'playlist' as const,
  service: 'qobuz',
  service_id: '77',
  title: 'Jazz du dimanche',
  cover_url: 'http://x/cover.jpg',
};

describe('fusionnerPlaylistsFavorites', () => {
  /** LE test du ticket : écrire sans pouvoir relire ne règle rien. */
  it('fait réapparaître une playlist Qobuz mise en favori', () => {
    const out = fusionnerPlaylistsFavorites([], [qobuzPlaylist]);

    expect(out).toHaveLength(1);
    expect(out[0].name).toBe('Jazz du dimanche');
    expect(out[0].source).toBe('qobuz');
    expect(out[0].source_id).toBe('77');
    // Pas d'identifiant local : la rouvrir par `playlists.id` viserait
    // n'importe quelle playlist locale portant ce numéro.
    expect(out[0].id).toBeNull();
  });

  it('garde la playlist locale, son identifiant et sa source', () => {
    const out = fusionnerPlaylistsFavorites(
      [{ id: 42, name: 'Dimanche matin', track_count: 12 }],
      [],
    );

    expect(out).toHaveLength(1);
    expect(out[0].id).toBe(42);
    expect(out[0].track_count).toBe(12);
    // La pastille de source lit ce champ : sans lui, une playlist Qobuz
    // s'afficherait « local » comme les autres.
    expect(out[0].source).toBe('local');
    expect(out[0].source_id).toBeUndefined();
  });

  it('range les locales et les playlists de service dans la même liste', () => {
    const out = fusionnerPlaylistsFavorites(
      [{ id: 42, name: 'Dimanche matin' }],
      [qobuzPlaylist],
    );
    expect(out.map((p) => p.source)).toEqual(['local', 'qobuz']);
  });

  /** Le magasin `streaming_favorites` mélange TOUS les types : le filtre est
   *  ce qui empêche un album favori d'atterrir dans l'onglet Playlists. */
  it('ne prend que le type playlist', () => {
    const out = fusionnerPlaylistsFavorites(
      [],
      [
        qobuzPlaylist,
        { item_type: 'album', service: 'qobuz', service_id: '999', title: 'Kind of Blue' },
        { item_type: 'track', service: 'qobuz', service_id: '12345', title: 'So What' },
        { item_type: 'artist', service: 'qobuz', service_id: '5', title: 'Miles Davis' },
      ],
    );
    expect(out.map((p) => p.name)).toEqual(['Jazz du dimanche']);
  });

  /** Une ligne sans identifiant de service n'ouvre rien et ne se lit pas comme
   *  un défaut : elle se lit comme un clic mort. */
  it('écarte une entrée sans identifiant ou sans service', () => {
    const out = fusionnerPlaylistsFavorites(
      [],
      [
        { item_type: 'playlist', service: 'qobuz', service_id: '', title: 'sans id' },
        { item_type: 'playlist', service: 'qobuz', service_id: '   ', title: 'que des espaces' },
        { item_type: 'playlist', service: '', service_id: '77', title: 'sans service' },
      ],
    );
    expect(out).toEqual([]);
  });

  /** Deux services numérotent leurs playlists chacun de leur côté : les
   *  confondre en cacherait une des deux. */
  it('ne confond pas deux services sur le même identifiant', () => {
    const out = fusionnerPlaylistsFavorites(
      [],
      [qobuzPlaylist, { ...qobuzPlaylist, service: 'tidal', title: 'Jazz du dimanche' }],
    );
    expect(out.map((p) => p.source)).toEqual(['qobuz', 'tidal']);
  });

  it("n'affiche qu'une fois la même playlist du même service", () => {
    const out = fusionnerPlaylistsFavorites([], [qobuzPlaylist, { ...qobuzPlaylist }]);
    expect(out).toHaveLength(1);
  });
});

/**
 * Garde de code : le mécanisme ci-dessus ne sert à rien si le bouton qui
 * alimente la table n'existe pas. C'est très exactement l'état que Didier
 * décrivait pour les albums avant la 0.9.88 — « la mécanique était déjà
 * générique : il manquait le bouton, pas le moteur ».
 */
describe("l'écran d'une playlist de service porte le cœur", () => {
  const source = readFileSync(
    resolve(process.cwd(), 'src/components/StreamingView.svelte'),
    'utf-8',
  );

  /** Le bloc de la fiche playlist, isolé — pour ne pas confondre avec le cœur
   *  de la fiche ALBUM, qui existe depuis la 0.9.88 et passerait sinon le test
   *  à la place de celui qu'on cherche. */
  const fichePlaylist = (() => {
    const debut = source.indexOf('<!-- Streaming playlist detail -->');
    expect(debut, 'la fiche playlist doit exister dans StreamingView').toBeGreaterThan(-1);
    const fin = source.indexOf('{:else if', debut);
    expect(fin, 'la fiche playlist doit être délimitée').toBeGreaterThan(debut);
    return source.slice(debut, fin);
  })();

  it('pose un HeartButton de type playlist sur la fiche', () => {
    expect(fichePlaylist).toContain('HeartButton');
    expect(fichePlaylist).toContain("itemType: 'playlist'");
  });

  it("désigne la playlist par son identifiant de service, pas par son rang", () => {
    expect(fichePlaylist).toContain('selectedStreamingPlaylist.source_id');
  });
});
