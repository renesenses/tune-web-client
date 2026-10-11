// tune-server-rust#6123 (forum-hifi #792, PhilActiveAudio75) — la note que
// le FICHIER porte (Vorbis RATING, ID3 POPM, MP4 rate…), lue par le serveur
// dans `tracks.rating` (0 à 5), s'affiche par piste et se filtre.
//
// Jumelle serveur : renesenses/tune-server-rust, lot `batch/bugs-rc4-20261008`.
import { describe, expect, it } from 'vitest';
import { COLONNES, etoiles, valeurColonne } from '../colonnesPistes';
import { CHAMPS, champsSaisissables, operateursDe } from '../smartRegles';
import { COLONNES_TRIABLES } from '../pistesPaginees';
import { ONZE_LANGUES, dictionnaire } from './onzeDictionnaires';
import type { Track } from '../types';

const piste = (o: Partial<Track>) => ({ id: 1, title: 'x', ...o }) as unknown as Track;

describe('#6123 — la note de la piste', () => {
  it('s’affiche en étoiles, zéro compris, et rien quand le fichier n’en porte pas', () => {
    expect(etoiles(4)).toBe('★★★★☆');
    expect(etoiles(0)).toBe('☆☆☆☆☆');
    expect(etoiles(5)).toBe('★★★★★');
    for (const v of [null, undefined, 6, -1, 2.5, '3']) expect(etoiles(v), String(v)).toBeNull();
    expect(valeurColonne(piste({ rating: 3 }), 'rating')).toBe('★★★☆☆');
    expect(valeurColonne(piste({ rating: null }), 'rating')).toBeNull();
  });

  it('est une colonne du tableau, offerte dès Essentiel, et triable par le serveur', () => {
    const c = COLONNES.find((x) => x.cle === 'rating');
    expect(c, 'la colonne Note manque').toBeTruthy();
    expect(c!.cleI18n).toBe('v2.tcol.rating');
    expect(c!.min).toBeUndefined();
    expect(COLONNES_TRIABLES.has('rating')).toBe(true);
  });

  it('« Note de la piste » s’ajoute à « Note de l’album », qui garde son nom de règle', () => {
    const album = CHAMPS.find((c) => c.value === 'rating');
    const pisteC = CHAMPS.find((c) => c.value === 'track_rating');
    expect(album?.labelKey).toBe('smartCollection.fieldRating');
    expect(pisteC?.labelKey).toBe('smartCollection.fieldTrackRating');
    expect(pisteC?.type).toBe('int');
    expect(operateursDe('track_rating').map((o) => o.value)).toEqual(
      operateursDe('rating').map((o) => o.value),
    );
    for (const niveau of ['collection', 'playlist'] as const) {
      expect(champsSaisissables(niveau).some((c) => c.value === 'track_rating'), niveau).toBe(true);
    }
  });

  it('les deux libellés existent dans les onze langues', () => {
    for (const lg of ONZE_LANGUES) {
      const d = dictionnaire(lg);
      for (const cle of ['smartCollection.fieldTrackRating', 'v2.tcol.rating']) {
        expect(d[cle]?.trim(), `${lg} : ${cle}`).toBeTruthy();
      }
    }
  });
});
