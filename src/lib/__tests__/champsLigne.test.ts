import { describe, expect, it } from 'vitest';
import { champsUtiles } from '../champsLigne';

/** Les quinze champs réellement actifs chez Bertrand, dans l'ordre. */
const SES_CHAMPS = [
  'album_artist', 'disc_number', 'track_number', 'genre', 'genres', 'year',
  'composer', 'label', 'isrc', 'format', 'sample_rate', 'bit_depth',
  'channels', 'duration', 'file_size', 'file_path',
];

const LIGNE = { artiste: true, album: true, duree: true, qualite: true, numero: true };

describe("Puces d'une ligne de piste : pas de doublon (Bertrand, 05/09/2026)", () => {
  it('retire tout ce que la ligne montre déjà ailleurs', () => {
    const restants = champsUtiles(SES_CHAMPS, LIGNE);
    // Ce qui apprend quelque chose reste.
    expect(restants).toEqual([
      'disc_number', 'genre', 'year', 'composer', 'label', 'isrc', 'channels', 'file_size',
    ]);
  });

  it("l'ordre choisi par l'utilisateur est conservé", () => {
    expect(champsUtiles(['label', 'year', 'composer'], LIGNE)).toEqual(['label', 'year', 'composer']);
  });

  it('`genres` cède devant `genre` — même mot, en JSON brut', () => {
    // Le serveur rend `["Classical"]`, crochets et guillemets compris.
    expect(champsUtiles(['genre', 'genres'], {})).toEqual(['genre']);
    // Seul, il reste : c'est un doublon, pas un champ interdit.
    expect(champsUtiles(['genres'], {})).toEqual(['genres']);
  });

  it('le nom de fichier ne va JAMAIS sur une ligne', () => {
    // Il reprend le numéro et le titre, qui sont le premier mot de la ligne.
    expect(champsUtiles(['file_path', 'label'], {})).toEqual(['label']);
  });

  it("ce que la ligne n'affiche pas redevient utile", () => {
    // Sur un écran sans badge de qualité, le format est une information.
    expect(champsUtiles(['format', 'sample_rate'], {})).toEqual(['format', 'sample_rate']);
    expect(champsUtiles(['format', 'sample_rate'], { qualite: true })).toEqual([]);
  });

  it("le numéro n'est retiré que s'il y a une colonne pour lui", () => {
    expect(champsUtiles(['track_number'], { numero: true })).toEqual([]);
    expect(champsUtiles(['track_number'], { numero: false })).toEqual(['track_number']);
  });

  it("l'album reste quand la ligne ne l'écrit pas", () => {
    // C'est le cas de la fiche d'album : le titre est en tête d'écran.
    expect(champsUtiles(['album_title'], { album: false })).toEqual(['album_title']);
    expect(champsUtiles(['album_title'], { album: true })).toEqual([]);
  });

  it('les trois formes du nom d’artiste sont couvertes', () => {
    expect(champsUtiles(['artist', 'artist_name', 'album_artist'], { artiste: true })).toEqual([]);
  });

  it('une liste vide reste vide, sans erreur', () => {
    expect(champsUtiles([], LIGNE)).toEqual([]);
  });
});
