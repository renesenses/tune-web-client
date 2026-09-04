/**
 * L'onglet Titres ne porte pas les commandes des ALBUMS.
 *
 * `visibleTracks` ne filtre que sur la recherche : ni la qualité, ni la
 * fréquence, ni le format, ni la profondeur, ni l'année ne touchent la liste
 * des titres. Ces puces restaient pourtant affichées en passant sur Titres, et
 * le compteur « Tout (n) » y annonçait un nombre d'ALBUMS — 55 albums de 2026
 * au-dessus de 46 877 titres. L'écran gardait l'habillage de l'onglet
 * précédent : « la vue n'est pas bien rafraîchie » (Bertrand, 04/09/2026).
 *
 * La règle existait déjà, appliquée à un seul contrôle sur cinq : le tri était
 * masqué par `showTools && tab !== 'tracks'`. Ce test l'étend aux autres.
 *
 * CE QU'IL NE PROUVE PAS : que rien ne s'affiche à l'écran. Il prouve que les
 * deux gardes qui commandent cet affichage excluent l'onglet — c'est ce qui a
 * lâché.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ECRAN = fileURLToPath(new URL('../../components/v2/LibraryV2.svelte', import.meta.url));
const source = () => readFileSync(ECRAN, 'utf8');

/** Le corps d'un `const <nom> = $derived(…)`, sur une seule ligne logique. */
function derive(nom: string): string {
  const src = source();
  const debut = src.indexOf(`const ${nom} = $derived(`);
  expect(debut, `\`${nom}\` a disparu ou changé de forme`).toBeGreaterThan(-1);
  return src.slice(debut, src.indexOf(';', debut));
}

describe('Bibliothèque — l’onglet Titres', () => {
  it('n’affiche pas les filtres d’album', () => {
    expect(
      derive('showFilters').includes("tab !== 'tracks'"),
      'les puces Qualité/Fréquence/Format/Profondeur reviendraient sur Titres, ' +
        'où elles ne filtrent rien',
    ).toBe(true);
  });

  it('n’affiche ni frise, ni rail A–Z, ni choix de l’année', () => {
    expect(
      derive('showTimeline').includes("tab !== 'tracks'"),
      'la navigation par année reviendrait sur Titres : elle parcourt les ALBUMS',
    ).toBe(true);
  });

  it('porte un compteur de TITRES, pas d’albums', () => {
    const src = source();
    // `matchCount` compte `affiches`, c'est-à-dire des albums. L'afficher ici
    // était le symptôme le plus visible.
    expect(src.includes("v2.lib.trackCount"), 'le compteur de titres a disparu').toBe(true);
    const bloc = src.slice(src.indexOf('<div class="filters">'), src.indexOf('{#if showFilters}'));
    expect(
      bloc.includes('matchCount'),
      'le compteur d’albums est revenu au-dessus de la liste des titres',
    ).toBe(false);
  });

  it('garde la recherche, qui elle agit vraiment', () => {
    // `visibleTracks` filtre sur `q` : c'est le seul contrôle qui a un effet
    // ici, et le masquer priverait l'onglet de tout moyen de chercher.
    const src = source();
    const debut = src.indexOf('const visibleTracks');
    expect(debut, '`visibleTracks` a disparu').toBeGreaterThan(-1);
    const bloc = src.slice(debut, src.indexOf('function playTrack', debut));
    expect(bloc.includes('fold(q)'), 'la recherche ne s’applique plus aux titres').toBe(true);
    // Et elle reste le SEUL filtre : le jour où les puces d'album agiront sur
    // les titres, il faudra les réafficher — et ce test le rappellera.
    expect(bloc.includes('matches('), 'les filtres d’album agissent désormais sur les titres : les réafficher').toBe(false);
  });
});
