// 🔴 `renesenses/tune-web-client#852` — Pierre M, fil 1671, 10/09/2026 :
// « CD en 24/88 (SACD)... ». Sa fiche d'album porte le badge d'en-tête **CD**
// au-dessus d'un tableau qui affiche `HI-RES FLAC 88.2/24` sur chacune des
// douze pistes.
//
// DEUX VOIES POSSIBLES, ET LA FICHE NE TRANCHE PAS
//   · les colonnes de `albums` sont remplies UNE fois au scan et jamais
//     recalculées ;
//   · et quand `format` est nul, le client retombait sur la chaîne `'CD'`.
//
// On corrige ce qui est sûr des deux côtés : l'en-tête se calcule sur les
// PISTES — la source que le tableau affiche déjà — et l'absence n'est plus
// remplacée par une affirmation.
//
// ⚠️ MESURÉ sur la .18 le 12/09/2026, et ça n'appuie PAS le ticket :
//     150 albums recoupés avec leurs pistes → 0 désaccord
//     400 albums → 0 sans `format`, 0 sans `sample_rate`
// Le cas de Pierre M n'est pas reproductible sur cette bibliothèque. Ce qui
// l'est, c'est le repli qui invente — et c'est ce que cette garde tient.
//
// CONTRE-ÉPREUVE : la dernière épreuve rejoue le repli d'AVANT et exige qu'il
// produise bien « CD » là où la règle actuelle ne dit rien.
import { describe, expect, it } from 'vitest';
import { formatDominant, qualiteEnTeteAlbum } from '../qualiteEnTeteAlbum';

/** L'album de Pierre M : des colonnes qui disent CD, des pistes qui disent 88,2/24. */
const ALBUM_CD = { format: 'flac', sample_rate: 44100, bit_depth: 16 };
const PISTES_HIRES = Array.from({ length: 12 }, () => ({
  format: 'flac', sample_rate: 88200, bit_depth: 24,
}));

describe('#852 — l’en-tête croit les pistes, pas les colonnes de l’album', () => {
  it('🔴 le cas signalé : l’en-tête suit les pistes en 88,2/24', () => {
    const q = qualiteEnTeteAlbum(ALBUM_CD, PISTES_HIRES);
    expect(q).toEqual({ format: 'flac', sampleRate: 88200, bitDepth: 24 });
  });

  it('sans pistes chargées, on retombe sur les colonnes de l’album', () => {
    expect(qualiteEnTeteAlbum(ALBUM_CD, [])).toEqual({
      format: 'flac', sampleRate: 44100, bitDepth: 16,
    });
  });

  it('un album mélangé s’annonce par son MAXIMUM, comme le serveur', () => {
    // `COALESCE(albums.sample_rate, MAX(tracks…))` : un bonus en 44,1/16 ne
    // rétrograde pas un album hi-res.
    const q = qualiteEnTeteAlbum(ALBUM_CD, [
      { format: 'flac', sample_rate: 88200, bit_depth: 24 },
      { format: 'flac', sample_rate: 44100, bit_depth: 16 },
    ]);
    expect(q!.sampleRate).toBe(88200);
    expect(q!.bitDepth).toBe(24);
  });

  it('le format dominant l’emporte, et l’égalité garde l’ordre du disque', () => {
    expect(formatDominant(['flac', 'flac', 'mp3'])).toBe('flac');
    expect(formatDominant(['mp3', 'flac'])).toBe('mp3');
    expect(formatDominant([])).toBeNull();
  });

  it('🔴 rien de connu ⇒ AUCUN badge — jamais un « CD » inventé', () => {
    expect(qualiteEnTeteAlbum({}, [])).toBeNull();
    expect(qualiteEnTeteAlbum(null, null)).toBeNull();
    expect(qualiteEnTeteAlbum({ format: null, sample_rate: null, bit_depth: null }, [])).toBeNull();
  });

  it('une seule information suffit à annoncer quelque chose', () => {
    expect(qualiteEnTeteAlbum({ format: 'dsf' }, [])).toEqual({
      format: 'dsf', sampleRate: null, bitDepth: null,
    });
  });

  it('les valeurs absurdes des pistes sont ignorées, pas prises pour un maximum', () => {
    const q = qualiteEnTeteAlbum(ALBUM_CD, [
      { format: 'flac', sample_rate: 0, bit_depth: 0 },
      { format: 'flac', sample_rate: 96000, bit_depth: 24 },
    ]);
    expect(q!.sampleRate).toBe(96000);
    expect(q!.bitDepth).toBe(24);
  });

  it('CONTRE-ÉPREUVE : l’ancien repli produisait bien « CD » sur une absence', () => {
    const album: { format?: string | null } = { format: null };
    const ancien = album.format?.toUpperCase() ?? 'CD';
    expect(ancien, 'le témoin ne reproduit pas l’invention').toBe('CD');
    expect(qualiteEnTeteAlbum(album, []), 'la règle invente encore un format').toBeNull();
  });
});
