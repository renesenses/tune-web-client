/**
 * #3729 — un cœur de radio ne doit pas remplir toute la station.
 *
 * Reivax66, 09/09/2026, ticket support 104 / fil forum 1729, Tune 0.9.143 :
 * « lors d'un clic pour ajouter un titre radio live aux favoris dans
 * l'historique tous les titres radio live sont sélectionnés ».
 *
 * La cause n'est pas dans l'écran : elle est dans l'IDENTIFIANT. Le serveur
 * republie le même `source_id` — l'URL du flux — à chaque changement de
 * morceau (`tune-core/src/poller/radio.rs`, `source_id: np.source_id.clone()`).
 * Le journal joint au ticket montre cinq changements de morceau sur la même
 * `url=https://icecast.radiofrance.fr/fip-hifi.aac`.
 *
 * Deux conséquences distinctes, deux gardes ici :
 *   A. la clé de favori `track:radio:<url>` est partagée par toute la station ;
 *   B. le surlignage « en lecture » se reconnaît au seul `source_id`.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { favKeyOf, isStreamingFavorite } from '../streamingFavorites';
import { estLaPisteEnLecture } from '../stores/nowPlaying';

const lire = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf-8');
const sansCommentaires = (s: string) =>
  s.replace(/<!--[\s\S]*?-->/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

/** L'URL du flux FIP, telle que le journal de Reivax66 la porte. */
const FLUX = 'https://icecast.radiofrance.fr/fip-hifi.aac';
const refRadio = (id: string = FLUX) =>
  ({ itemType: 'track' as const, service: 'radio', serviceId: id });

describe('A — la clé de favori d’un titre de radio', () => {
  it('n’existe PAS : l’URL du flux désigne la station, pas le morceau', () => {
    expect(favKeyOf(refRadio())).toBeNull();
  });

  it('ne peut donc pas être partagée par deux morceaux de la même station', () => {
    // Le défaut mesuré : les deux titres successifs de FIP produisaient LA
    // MÊME clé, et un seul favori remplissait les deux cœurs.
    const premier = favKeyOf(refRadio());
    const second = favKeyOf(refRadio());
    expect(premier).toBeNull();
    expect(second).toBeNull();
  });

  it('un favori déjà enregistré sous cette clé ne coche plus personne', () => {
    // La clé collective peut être RELUE du serveur : des clics passés en ont
    // écrit. Elle ne doit plus rien allumer.
    const clefsDejaEnBase = new Set([`track:radio:${FLUX}`]);
    expect(isStreamingFavorite(clefsDejaEnBase, refRadio())).toBe(false);
  });

  it('⚠️ n’ampute AUCUN autre service ni aucun autre type', () => {
    // Zéro régression : seul le couple (piste, radio) est écarté.
    expect(favKeyOf({ itemType: 'track', service: 'qobuz', serviceId: '103290597' }))
      .toBe('track:qobuz:103290597');
    expect(favKeyOf({ itemType: 'track', service: 'tidal', serviceId: '42' }))
      .toBe('track:tidal:42');
    // Une STATION de radio, elle, est bien identifiée par son flux : le garde
    // ne vise que le type `track`.
    expect(favKeyOf({ itemType: 'playlist', service: 'radio', serviceId: FLUX }))
      .toBe(`playlist:radio:${FLUX}`);
  });
});

describe('A (suite) — le garde est BRANCHÉ, pas seulement écrit', () => {
  /**
   * Le garde existait déjà pour l'identifiant VIDE, et `PisteActions` ne
   * l'appelait pas : il concaténait la clé lui-même. Un garde non appelé ne
   * garde rien — c'est ce contournement qui a laissé passer le défaut.
   */
  const src = sansCommentaires(lire('src/components/v2/PisteActions.svelte'));

  it('PisteActions passe par favKeyOf', () => {
    expect(src).toContain('favKeyOf({ itemType: \'track\'');
  });

  it('et n’appelle plus streamingFavKey en direct', () => {
    expect(src).not.toContain('streamingFavKey(');
  });
});

describe('B — le surlignage « en lecture » d’une ligne de radio', () => {
  const np = (titre: string) =>
    ({ title: titre, source: 'radio' as const, source_id: FLUX });

  it('ne suit PAS toutes les lignes de la station', () => {
    // Deux morceaux entendus sur FIP, même URL de flux, titres différents.
    const ligne = { title: 'Blue in Green', source: 'radio' as const, source_id: FLUX };
    expect(estLaPisteEnLecture(ligne, null, np('So What'))).toBe(false);
  });

  it('suit bien le morceau qui passe VRAIMENT', () => {
    const ligne = { title: 'So What', source: 'radio' as const, source_id: FLUX };
    expect(estLaPisteEnLecture(ligne, null, np('So What'))).toBe(true);
  });

  it('tolère la casse et les espaces, comme partout ailleurs', () => {
    const ligne = { title: '  so what ', source: 'radio' as const, source_id: FLUX };
    expect(estLaPisteEnLecture(ligne, null, np('So What'))).toBe(true);
  });

  it('n’invente pas une absence quand un titre manque', () => {
    // Rien n'a été mesuré : on ne retire pas le surlignage.
    const sansTitre = { source: 'radio' as const, source_id: FLUX };
    expect(estLaPisteEnLecture(sansTitre, null, np('So What'))).toBe(true);
  });

  it('⚠️ ne touche PAS les autres sources', () => {
    // Zéro régression : chez un service, `source_id` désigne bien la piste, et
    // un titre différent (édition, remaster) ne doit rien casser.
    const ligne = { title: 'Get Lucky (Radio Edit)', source: 'qobuz' as const, source_id: '9140031' };
    const enCours = { title: 'Get Lucky', source: 'qobuz' as const, source_id: '9140031' };
    expect(estLaPisteEnLecture(ligne, null, enCours)).toBe(true);
    // Et l'identifiant de bibliothèque reste la première clé.
    expect(estLaPisteEnLecture({ id: 7 }, 7, null)).toBe(true);
    expect(estLaPisteEnLecture({ id: 7 }, 8, null)).toBe(false);
  });
});
