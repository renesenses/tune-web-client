// tune-server-rust#7215 — une radio de l'annuaire peut avoir PLUSIEURS genres
// (demande de Rémi du 27/10/2026) : « OuiFM Blues & Rock » est blues ET rock.
// Le client lit `genres`, avec repli sur `genre` (serveur plus ancien).
import { describe, expect, it } from 'vitest';
import { genresDeLaFiche } from '../api/annuaireRadios';
import { construireArbre, genresDe, proches, type ElementCarte } from '../carteDecouverte';

const el = (id: string, genre: string, pays: string, o: Partial<ElementCarte> = {}): ElementCarte => ({
  id, nom: id, genre, pays, reseau: null, texte: id, ...o,
});

describe('genresDeLaFiche', () => {
  it('lit genres, en minuscules, sans vide ni doublon', () => {
    expect(genresDeLaFiche({ genre: 'blues', genres: ['blues', 'Rock', ' ', 'rock'] })).toEqual(['blues', 'rock']);
  });
  it('se replie sur genre quand le serveur ne sert pas genres', () => {
    expect(genresDeLaFiche({ genre: 'Jazz' })).toEqual(['jazz']);
    expect(genresDeLaFiche({ genre: 'jazz', genres: [] })).toEqual(['jazz']);
    expect(genresDeLaFiche({ genre: null })).toEqual([]);
  });
});

describe('la carte range une station sous chacun de ses genres', () => {
  const ST = [
    el('OuiFM Blues & Rock', 'blues', 'FR', { genres: ['blues', 'rock'] }),
    el('FIP Metal', 'rock', 'FR', { genres: ['rock', 'metal'] }),
    el('Vieux Jazz', 'jazz', 'FR'),
  ];

  it('🔴 OuiFM Blues & Rock apparaît sous blues ET sous rock', () => {
    const r = construireArbre(ST, 'arbre', 'genre');
    const groupe = (cle: string) => r.enfants.find((n) => n.cle === cle);
    expect(r.enfants.map((n) => [n.cle, n.elements.length])).toEqual([
      ['rock', 2], ['blues', 1], ['jazz', 1], ['metal', 1],
    ]);
    expect(groupe('blues')!.elements.map((e) => e.id)).toEqual(['OuiFM Blues & Rock']);
    expect(groupe('rock')!.elements.map((e) => e.id)).toEqual(['OuiFM Blues & Rock', 'FIP Metal']);
    // l'axe pays aussi : FR → ses genres, la station dans chacun
    const fr = construireArbre(ST, 'arbre', 'pays').enfants[0];
    expect(fr.enfants.find((n) => n.cle === 'rock')!.elements.map((e) => e.id)).toContain('OuiFM Blues & Rock');
  });

  it('ancien format : sans genres, le seul genre ; contre-épreuve, pas de genre inventé', () => {
    expect(genresDe(ST[2])).toEqual(['jazz']);
    const r = construireArbre(ST, 'arbre', 'genre');
    expect(r.enfants.find((n) => n.cle === 'metal')!.elements.map((e) => e.id)).toEqual(['FIP Metal']);
    expect(r.enfants.find((n) => n.cle === 'blues')!.elements.map((e) => e.id)).not.toContain('FIP Metal');
  });

  it('un genre secondaire commun rend deux stations proches', () => {
    expect(proches(ST[1], ST).map((p) => p.element.id)).toEqual(['OuiFM Blues & Rock']);
  });
});
