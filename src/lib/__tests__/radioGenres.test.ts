import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  RADIO_GENRE_KEYS,
  radioGenreShelf,
  radioGenreShelves,
  radioGenreLabel,
} from '../radioGenres';
import * as locales from '../locales';

/**
 * Garde : un genre de radio = UN rayon, quelle que soit son orthographe, et un
 * libellé traduit dans les onze langues.
 *
 * Le défaut mesuré en production : vingt-six valeurs de genre pour une
 * quinzaine de genres réels. `eclectic` (8 occurrences) à côté de
 * `Éclectique` (3), `jazz`/`Jazz`, `rock`/`Rock`, `Classique`/`classical`,
 * `world`/`World`/`Monde`, `reggae`/`Reggae`, `electronic`/`Électronique`. La
 * page Radios dérivait sa liste de genres des chaînes brutes : chaque
 * variante fabriquait son rayon, et un clic sur « Jazz » laissait dehors la
 * moitié des stations de jazz.
 *
 * Relevé de contrôle du 30/08/2026, `GET https://mozaiklabs.fr/api/v1/radios` :
 * 51 stations, VINGT valeurs de genre distinctes, l'anglais minuscule et le
 * français capitalisé déjà mêlés dans l'annuaire lui-même. C'est de là que
 * vient la divergence, et c'est pourquoi la correction durable est une
 * édition de l'annuaire — celle-ci ne soigne que l'affichage.
 *
 * Ce que le contrôle i18n du dépôt ne peut pas voir, et que ce test tient à
 * sa place : `scripts/check-i18n.mjs` ne reconnaît que la forme littérale
 * `$t('…')` et ne cherche le français en dur que dans les `.svelte`. Les clés
 * déclarées dans `radioGenres.ts` et résolues indirectement lui échappent
 * doublement. Sans les assertions ci-dessous, un genre non traduit passerait
 * les portes et s'afficherait `radioGenre.blues` en toutes lettres.
 */

type Dict = Record<string, string | undefined>;
const LANGUES = locales as unknown as Record<string, Dict>;
const NOMS = Object.keys(LANGUES).filter((n) => n !== 'default');

describe('le vocabulaire est un ensemble de clés, jamais de libellés', () => {
  it('les onze langues sont bien chargées', () => {
    // Sans cette borne, les `it.each` plus bas pourraient passer à vide.
    expect(NOMS.length).toBe(11);
    expect(NOMS).toContain('fr');
    expect(NOMS).toContain('hu');
  });

  it('couvre les seize genres du catalogue livré', () => {
    expect(RADIO_GENRE_KEYS.length).toBe(16);
  });

  it('chaque clé est un identifiant ASCII, sans accent ni espace', () => {
    for (const cle of RADIO_GENRE_KEYS) {
      expect(cle, cle).toMatch(/^radioGenre\.[a-zA-Z]+$/);
    }
  });
});

describe('traductions', () => {
  it.each(NOMS)('les seize genres sont traduits en %s', (langue) => {
    const dico = LANGUES[langue];
    for (const cle of RADIO_GENRE_KEYS) {
      expect(dico[cle], `${langue} → ${cle}`).toBeTruthy();
    }
  });

  it('aucune langue non française ne recopie le français accentué', () => {
    // Repère grossier mais suffisant : « Éclectique », « Électronique »,
    // « Généraliste », « Contemporaine » sont les quatre libellés français
    // reconnaissables. Les retrouver ailleurs signalerait un copier-coller.
    const fr = LANGUES.fr;
    const suspects = [
      'radioGenre.eclectic',
      'radioGenre.electronic',
      'radioGenre.generalist',
      'radioGenre.contemporary',
      'radioGenre.world',
      'radioGenre.classical',
    ];
    for (const langue of NOMS) {
      if (langue === 'fr') continue;
      for (const cle of suspects) {
        expect(LANGUES[langue][cle], `${langue} → ${cle}`).not.toBe(fr[cle]);
      }
    }
  });
});

describe('repliement des variantes sur un rayon unique', () => {
  const paires: [string, string][] = [
    ['eclectic', 'Éclectique'],
    ['jazz', 'Jazz'],
    ['rock', 'Rock'],
    ['classical', 'Classique'],
    ['world', 'Monde'],
    ['World', 'world'],
    ['reggae', 'Reggae'],
    ['electronic', 'Électronique'],
  ];

  it.each(paires)('« %s » et « %s » tombent dans le même rayon', (a, b) => {
    const ra = radioGenreShelf(a);
    const rb = radioGenreShelf(b);
    expect(ra?.key, `${a} non reconnu`).toBeTruthy();
    expect(ra!.key).toBe(rb!.key);
  });

  it('deux genres réellement différents gardent deux rayons', () => {
    expect(radioGenreShelf('Jazz')!.key).not.toBe(radioGenreShelf('Rock')!.key);
    expect(radioGenreShelf('Classique')!.key).not.toBe(radioGenreShelf('Contemporaine')!.key);
  });

  it("une valeur vide ou absente ne fabrique pas de rayon « (vide) »", () => {
    expect(radioGenreShelf(null)).toBeNull();
    expect(radioGenreShelf(undefined)).toBeNull();
    expect(radioGenreShelf('')).toBeNull();
    expect(radioGenreShelf('   ')).toBeNull();
  });

  it("un genre inconnu n'est pas jeté : il garde son propre rayon et son mot", () => {
    const rayon = radioGenreShelf('Ambient');
    expect(rayon).not.toBeNull();
    expect(rayon!.i18nKey).toBeNull();
    expect(rayon!.raw).toBe('Ambient');
    expect(radioGenreLabel(rayon!, (k) => `TRADUIT:${k}`)).toBe('Ambient');
    // …et deux orthographes d'un même mot inconnu se rejoignent quand même.
    expect(radioGenreShelf('ambient')!.key).toBe(rayon!.key);
    // …sans jamais se faire passer pour une clé de traduction.
    expect(rayon!.key.startsWith('radioGenre.')).toBe(false);
  });

  it('le libellé passe par la traduction quand le genre est connu', () => {
    const rayon = radioGenreShelf('eclectic')!;
    expect(radioGenreLabel(rayon, (k) => LANGUES.fr[k] ?? k)).toBe('Éclectique');
    expect(radioGenreLabel(rayon, (k) => LANGUES.en[k] ?? k)).toBe('Eclectic');
    expect(radioGenreLabel(rayon, (k) => LANGUES.de[k] ?? k)).toBe('Eklektisch');
  });
});

describe('le relevé de production ne fabrique plus vingt-six rayons', () => {
  /**
   * Les vingt-six valeurs relevées : les quinze termes français du semis
   * serveur, plus les formes anglaises minuscules servies par l'annuaire.
   */
  const RELEVE = [
    'Éclectique', 'eclectic',
    'Jazz', 'jazz',
    'Rock', 'rock',
    'Classique', 'classical',
    'Monde', 'world', 'World',
    'Reggae', 'reggae',
    'Électronique', 'electronic',
    'Pop', 'Blues', 'blues',
    'Metal', 'Hip-Hop', 'Groove',
    'Chanson française', 'Culture',
    'Généraliste', 'Contemporaine',
    'Classic',
  ];

  it('vingt-six valeurs se rangent en seize rayons', () => {
    const stations = RELEVE.map((genre) => ({ genre }));
    expect(new Set(RELEVE).size).toBe(26);
    const rayons = radioGenreShelves(stations);
    expect(rayons.length).toBe(16);
    // …et aucun d'eux n'est un rayon « inconnu » : le vocabulaire couvre bien
    // tout le relevé.
    for (const rayon of rayons) {
      expect(rayon.i18nKey, `rayon inconnu pour « ${rayon.raw} »`).not.toBeNull();
    }
  });
});

describe('la page Radios regroupe et filtre sur la clé, pas sur la chaîne brute', () => {
  /**
   * Ce dépôt n'a pas de harnais de rendu Svelte : on lit la source, et la
   * propriété tenue est structurelle. Elle est nécessaire — le module
   * ci-dessus peut être parfait et la page continuer d'afficher `{g}` brut.
   */
  const SOURCE = readFileSync(
    resolve(__dirname, '../../components/RadiosView.svelte'),
    'utf-8',
  );

  it('la source est bien celle de la page Radios', () => {
    expect(SOURCE).toContain('filterGenre');
    expect(SOURCE.length).toBeGreaterThan(1000);
  });

  it("la liste des rayons ne se dérive plus d'un Set de chaînes brutes", () => {
    expect(SOURCE).not.toContain('new Set(radios.map(r => r.genre)');
    expect(SOURCE).toContain('radioGenreShelves(radios)');
  });

  it('le filtre compare des clés de rayon', () => {
    expect(SOURCE).not.toContain('r.genre === filterGenre');
    expect(SOURCE).toContain('radioGenreShelf(r.genre)?.key === filterGenre');
  });

  it('les pastilles affichent un libellé traduit', () => {
    // Deux occurrences attendues : la puce de filtre et la pastille de carte.
    expect(SOURCE.split('radioGenreLabel(').length - 1).toBeGreaterThanOrEqual(3);
    expect(SOURCE).not.toContain('>{radio.genre}<');
  });
});
