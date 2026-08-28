import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { doitMemoriserPositionListe } from '../libraryNavScroll';

/**
 * Vue Artiste : la position de défilement perdue au retour.
 * Pierre M, forum fil 1177, réponse 4769 (2026-07-25) —
 * renesenses/tune-server-rust#2253.
 *
 * Deux tests, et il faut les deux :
 *
 * 1. le BANC D'ESSAI ci-dessous rejoue la chaîne de navigation réelle et
 *    prouve la RÈGLE — capturer sans condition perd la position, capturer
 *    seulement en quittant une liste la garde. La « forme fautive » y est
 *    conservée volontairement : sans elle, rien ne montrerait que le banc
 *    sait distinguer les deux, et un test toujours vert ne prouverait rien ;
 * 2. la GARDE DE CODE prouve que la règle est encore APPLIQUÉE dans
 *    `LibraryView.svelte`. Sans elle, supprimer la condition ramènerait le
 *    bug sans qu'aucun test ne bronche.
 *
 * Environnement `node` : ni DOM ni réactivité ici, seulement de la décision
 * pure et de la lecture de texte.
 */

/** Position de `.library-scroller` selon l'écran affiché. */
const DEFILEMENT_LISTE = 4000;
const DEFILEMENT_FICHE = 0; // une fiche fraîchement ouverte est en haut

/**
 * Rejoue la chaîne signalée : liste d'artistes défilée → fiche d'un artiste →
 * un artiste similaire → retour → retour. Rend la position que la liste
 * retrouverait au bout du compte.
 *
 * `capture` est la décision testée : c'est le seul point qui change entre la
 * forme fautive et la forme corrigée.
 */
function positionRetrouveeApresChaine(
  capture: (etat: { albumOuvert: boolean; artisteOuvert: boolean }) => boolean,
): number {
  let positionMemorisee = 0;
  let albumOuvert = false;
  let artisteOuvert = false;
  let defilementCourant = DEFILEMENT_LISTE;

  // `selectArtistDetail` : mémorise (ou non) puis ouvre la fiche.
  const ouvrirArtiste = () => {
    if (capture({ albumOuvert, artisteOuvert })) positionMemorisee = defilementCourant;
    artisteOuvert = true;
    defilementCourant = DEFILEMENT_FICHE;
  };

  // 1. depuis la liste défilée, on ouvre un artiste
  ouvrirArtiste();
  // 2. depuis sa fiche, on suit un « artiste similaire »
  ouvrirArtiste();
  // 3. retour : `goBack()` dépile le fil et rappelle `selectArtistDetail`
  ouvrirArtiste();
  // 4. retour : on revient à la liste
  artisteOuvert = false;
  albumOuvert = false;

  // `restoreArtistScrollWhenReady` ne fait rien pour une cible <= 0 : la liste
  // reste alors tout en haut.
  return positionMemorisee > 0 ? positionMemorisee : 0;
}

describe('Retour depuis une fiche artiste : la position de la liste (#2253)', () => {
  it('forme fautive — capturer sans condition ramène en début de liste', () => {
    // Le comportement signalé par Pierre M, reproduit.
    expect(positionRetrouveeApresChaine(() => true)).toBe(0);
  });

  it('forme corrigée — ne mémoriser qu’en quittant une liste garde la position', () => {
    expect(positionRetrouveeApresChaine(doitMemoriserPositionListe)).toBe(DEFILEMENT_LISTE);
  });

  it('la décision elle-même : depuis une liste oui, depuis une fiche non', () => {
    // Sans ceci, vider `doitMemoriserPositionListe` laisserait le test
    // précédent au vert par accident (0 === 0 est déjà faux, mais la garde
    // coûte peu et ferme la porte).
    expect(doitMemoriserPositionListe({ albumOuvert: false, artisteOuvert: false })).toBe(true);
    expect(doitMemoriserPositionListe({ albumOuvert: true, artisteOuvert: false })).toBe(false);
    expect(doitMemoriserPositionListe({ albumOuvert: false, artisteOuvert: true })).toBe(false);
    expect(doitMemoriserPositionListe({ albumOuvert: true, artisteOuvert: true })).toBe(false);
  });
});

describe('LibraryView applique encore la règle (#2253)', () => {
  const source = readFileSync(
    resolve(process.cwd(), 'src/components/LibraryView.svelte'),
    'utf-8',
  );

  it('la règle est importée depuis le module partagé', () => {
    expect(source).toMatch(
      /import\s*\{[^}]*\bdoitMemoriserPositionListe\b[^}]*\}\s*from\s*'\.\.\/lib\/libraryNavScroll'/,
    );
  });

  it('la capture de `savedArtistScrollTop` est gardée par la règle', () => {
    const debut = source.indexOf('async function selectArtistDetail');
    // Sans cette borne la tranche serait vide et l'assertion passerait sans
    // rien avoir examiné.
    expect(debut).toBeGreaterThan(-1);
    const corps = source.slice(debut, debut + 3000);
    expect(corps).toContain('savedArtistScrollTop');
    // La capture doit être SOUS la garde, pas à côté.
    expect(corps).toMatch(
      /doitMemoriserPositionListe\([\s\S]{0,200}?\)\s*\)\s*\{[\s\S]{0,400}?savedArtistScrollTop\s*=/,
    );
  });

  it('la capture du défilement des genres est gardée elle aussi', () => {
    // Même conteneur `.library-scroller`, même écrasement, même symptôme sur
    // l'onglet Genres.
    const debut = source.indexOf('async function selectArtistDetail');
    const corps = source.slice(debut, debut + 3000);
    expect(corps).toMatch(
      /doitMemoriserPositionListe\([\s\S]{0,200}?\)\s*\)\s*\{[\s\S]{0,400}?savedGenreScrollTop\s*=/,
    );
  });
});
