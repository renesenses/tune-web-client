import { describe, it, expect } from 'vitest';
import { trier, valeurDeTri, clesPourOnglet } from './favoritesSort';

const piste = (title: string, artist_name = '', album_title = '') => ({
  title,
  artist_name,
  album_title,
});

describe('trier', () => {
  it("« defaut » rend la liste intacte, et le MÊME objet", () => {
    // L'ordre d'ajout est celui d'avant ce correctif : le tri est une option,
    // pas un changement imposé.
    const l = [piste('Zorro'), piste('Alpha')];
    expect(trier(l, 'defaut')).toBe(l);
  });

  it('ne modifie jamais la liste reçue', () => {
    const l = [piste('Zorro'), piste('Alpha')];
    const copie = [...l];
    trier(l, 'titre');
    expect(l).toEqual(copie);
  });

  it('trie par titre, croissant puis décroissant', () => {
    const l = [piste('Charlie'), piste('Alpha'), piste('Bravo')];
    expect(trier(l, 'titre').map((t) => t.title)).toEqual(['Alpha', 'Bravo', 'Charlie']);
    expect(trier(l, 'titre', true).map((t) => t.title)).toEqual(['Charlie', 'Bravo', 'Alpha']);
  });

  it("range les accents avec leur lettre, pas en fin de liste", () => {
    // Sans `sensitivity: 'base'`, un tri français relègue Édith après Zorro —
    // ce qu'aucun utilisateur ne comprend.
    const l = [piste('Zorro'), piste('Édith'), piste('Alpha')];
    expect(trier(l, 'titre').map((t) => t.title)).toEqual(['Alpha', 'Édith', 'Zorro']);
  });

  it('compare les nombres comme des nombres', () => {
    const l = [piste('Volume 10'), piste('Volume 2')];
    expect(trier(l, 'titre').map((t) => t.title)).toEqual(['Volume 2', 'Volume 10']);
  });

  it("un champ absent finit la liste, même en ordre décroissant", () => {
    // En décroissant, une poignée de titres vides ouvrant la liste ressemble à
    // une liste cassée.
    const l = [piste('Bravo', ''), piste('Alpha', 'Zorro'), piste('Charlie', 'Aline')];
    expect(trier(l, 'artiste').map((t) => t.title)).toEqual(['Charlie', 'Alpha', 'Bravo']);
    expect(trier(l, 'artiste', true).map((t) => t.title)).toEqual(['Alpha', 'Charlie', 'Bravo']);
  });

  it("un champ fait d'espaces compte comme absent", () => {
    const l = [piste('Alpha', '   '), piste('Bravo', 'Aline')];
    expect(trier(l, 'artiste').map((t) => t.title)).toEqual(['Bravo', 'Alpha']);
  });

  it('trie une liste mixte local / service sans distinction', () => {
    // Le cas de Tades : ses favoris mêlent bibliothèque locale et Qobuz. Le
    // tri ne doit pas les séparer — il ne regarde que le texte.
    const l = [
      { id: 3, title: 'Zorro' },
      { id: null, source: 'qobuz', source_id: 'x', title: 'Alpha' },
      { id: 7, title: 'Bravo' },
    ];
    expect(trier(l, 'titre').map((t) => t.title)).toEqual(['Alpha', 'Bravo', 'Zorro']);
  });
});

describe('valeurDeTri', () => {
  it("retombe sur `name` pour un artiste, qui n'a ni titre ni artiste", () => {
    expect(valeurDeTri({ name: 'Bowie' }, 'titre')).toBe('Bowie');
    expect(valeurDeTri({ name: 'Bowie' }, 'artiste')).toBe('Bowie');
  });

  it("retombe sur le titre de l'album pour un album, qui n'a pas d'album_title", () => {
    expect(valeurDeTri({ title: 'Blackstar' }, 'album')).toBe('Blackstar');
  });

  it('ne rend jamais autre chose qu’une chaîne', () => {
    // Un champ numérique ou nul ne doit pas faire exploser localeCompare.
    expect(valeurDeTri({ title: 42 }, 'titre')).toBe('');
    expect(valeurDeTri({ title: null }, 'titre')).toBe('');
    expect(valeurDeTri(null, 'titre')).toBe('');
    expect(valeurDeTri(undefined, 'album')).toBe('');
  });
});

describe('clesPourOnglet', () => {
  it("n'offre que ce qui trie vraiment quelque chose", () => {
    expect(clesPourOnglet('tracks')).toContain('album');
    expect(clesPourOnglet('albums')).not.toContain('album');
    // « ajout » s'ajoute aux CINQ onglets depuis le second volet de #2001 :
    // tout favori a une date de pose, y compris un artiste. Le contrat que ce
    // test verrouille — ne pas offrir une clé qui ne trierait rien — est
    // intact : « album » reste absent des albums.
    expect(clesPourOnglet('artists')).toEqual(['defaut', 'titre', 'ajout']);
    expect(clesPourOnglet('albums')).toContain('ajout');
  });

  it('propose toujours le retour à l’ordre d’ajout', () => {
    for (const onglet of ['tracks', 'albums', 'artists'] as const) {
      expect(clesPourOnglet(onglet)[0]).toBe('defaut');
    }
  });
});
