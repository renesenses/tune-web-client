import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { CHAMPS_DU_TEXTE_LIBRE, normaliserTexteLibre, pisteRepondAuTexteLibre } from '../texteLibreOxygen';
import type { Track } from '../types';

/**
 * tune-server-rust#5192 (fil 1966) — le texte libre d'Oxygen trouve une piste
 * par le nom de son DERNIER DOSSIER et celui de son FICHIER, avec les mêmes
 * champs que le serveur.
 */
const piste = (champs: Partial<Track>): Track => ({ id: 1, title: 'Langsam, schleppend', ...champs });

describe('texte libre d\'Oxygen (#5192)', () => {
  it('trouve une piste par le nom de son dossier, qu\'aucune balise ne porte', () => {
    const p = piste({
      artist_name: 'Gustav Mahler',
      album_title: 'Symphonie n°1',
      file_path: '/music/Classique/Mahler_Kondrashin/01-Langsam.flac',
      // Ce que sert le serveur : `_ - .` en espaces, extension ôtée.
      path_terms: 'Mahler Kondrashin 01 Langsam',
    });
    expect(pisteRepondAuTexteLibre(p, 'Mahler Kondrashin')).toBe(true);
    expect(pisteRepondAuTexteLibre(p, 'kondrashin 01')).toBe(true);
    expect(pisteRepondAuTexteLibre(p, 'Karajan')).toBe(false);
  });

  it('lit les termes SERVIS, sans redécouper file_path', () => {
    // Un serveur sans #5192 ne sert pas `path_terms` : le chemin brut ne
    // compte pas, sinon client et serveur ne rendraient pas la même liste.
    const p = piste({ file_path: '/music/Mahler Kondrashin/01.flac' });
    expect(pisteRepondAuTexteLibre(p, 'Kondrashin')).toBe(false);
  });

  it('compare, comme le serveur, titre, artiste, album, label, termes de chemin et compositeur', () => {
    // Jumeau de `CHAMPS_DU_TEXTE_LIBRE` dans tune-core/src/db/facet_filter.rs.
    expect([...CHAMPS_DU_TEXTE_LIBRE]).toEqual(['title', 'artist_name', 'album_title', 'label', 'path_terms', 'composer']);
    for (const [champ, valeur] of [
      ['title', 'Titan'], ['artist_name', 'Kondrashin'], ['album_title', 'Symphonie Titan'],
      ['label', 'Melodiya'], ['path_terms', 'Mahler Kondrashin 01'], ['composer', 'Maurice Ravel'],
    ] as const) {
      const p = { id: 1, title: '', [champ]: valeur } as Track;
      expect(pisteRepondAuTexteLibre(p, valeur), champ).toBe(true);
    }
  });

  it('saisie littérale : accents et casse repliés, guillemets ôtés, `_` n\'est pas un joker', () => {
    const p = piste({ path_terms: 'Beyoncé Déjà Vu' });
    expect(pisteRepondAuTexteLibre(p, 'beyonce deja')).toBe(true);
    expect(pisteRepondAuTexteLibre(p, '"deja vu"')).toBe(true);
    expect(pisteRepondAuTexteLibre(p, 'deja_vu')).toBe(false);
    expect(normaliserTexteLibre('  "Déjà"  ')).toBe('deja');
    expect(pisteRepondAuTexteLibre(p, '   ')).toBe(true);
  });
});

describe('OxygenView branche le texte libre partagé (#5192)', () => {
  const source = readFileSync(resolve(__dirname, '../../components/v2-heritage/OxygenView.svelte'), 'utf8');
  const ancre = (motif: RegExp, quoi: string): string => {
    const m = source.match(motif);
    // Une garde qui ne trouve plus son ancre passerait à vide.
    expect(m, `ancre introuvable dans OxygenView.svelte : ${quoi}`).not.toBeNull();
    return m![0];
  };

  it('le filtre de la fenêtre passe par pisteRepondAuTexteLibre', () => {
    const visible = ancre(/let visible = \$derived\.by\(\(\) => \{[\s\S]*?\n {2}\}\);/, 'visible');
    expect(visible).toContain('pisteRepondAuTexteLibre(t, query)');
    expect(visible).not.toMatch(/fold\(t\./);
  });

  it('la saisie part aussi au serveur, au chargement comme à la suite', () => {
    const charger = ancre(/async function loadTracks\(\) \{[\s\S]*?\n {2}\}/, 'loadTracks');
    expect(charger).toMatch(/getFilteredTracks\(\{[^}]*\.\.\.texteLibreParam\(\)/);
    const suite = ancre(/async function loadMore\(\) \{[\s\S]*?\n {2}\}/, 'loadMore');
    expect(suite).toMatch(/getFilteredTracks\(\{[^}]*\.\.\.texteLibreParam\(\)/);
    // Et le rechargement suit la saisie (après son délai).
    expect(source).toMatch(/\$effect\(\(\) => \{ void JSON\.stringify\(facetSels\); void texteServeur; loadTracks\(\); \}\);/);
  });
});
