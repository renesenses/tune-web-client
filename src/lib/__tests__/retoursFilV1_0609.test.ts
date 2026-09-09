/**
 * Deux retours du fil « Essayez l'interface de la future V1 » (forum 1671).
 *
 * ## eric, 06/09/2026 — les genres se parcourent en LISTE
 *
 * « Dans la biblio, après avoir cliqué sur "Genres", la présentation par ordre
 * alphabétique avec les pochettes d'album affichées oblige à scroller
 * longuement pour atteindre le genre souhaité. Une simple liste cliquable est
 * beaucoup plus rapide, quitte à afficher les pochettes après le choix. »
 *
 * L'onglet empilait toutes les valeurs avec leurs grilles : atteindre « Rock »
 * demandait de traverser les albums de tous les genres précédents.
 *
 * ## Lulu, 05 et 06/09/2026 — l'ascenseur suit le tri
 *
 * « L'ascenseur alphabétique de la Bibliothèque ne fonctionne pas
 * normalement », puis « pourrait-il tenir compte du choix fait sur le tri des
 * albums : Titre / Artiste / Année / Ajout récent ».
 *
 * Il lisait `a.title` en toutes circonstances. Trié par artiste, cliquer « M »
 * cherchait le premier album dont le TITRE commence par M — quelque part au
 * milieu, sans rapport avec l'ordre affiché. Ce n'était pas un rail imprécis,
 * c'était un rail qui visait autre chose.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const lire = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf-8');
function sansCommentaires(src: string): string {
  return src
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}
const src = () => sansCommentaires(lire('src/components/v2/LibraryV2.svelte'));

describe('le rail A–Z suit le tri', () => {
  it('il lit l’ARTISTE quand on trie par artiste', () => {
    expect(src()).toMatch(
      /sortKey === 'artist' \? \(a\.artist_name \?\? ''\) : \(a\.title \?\? ''\)/,
    );
  });

  it('🔴 il DISPARAÎT sur un tri chronologique', () => {
    // Trié par année ou par ajout, aucune lettre ne correspond à une
    // position : les initiales sont dispersées dans toute la liste. Un rail
    // qui promet un saut et atterrit au hasard est pire qu'un rail absent.
    expect(src()).toMatch(/const railUtile = \$derived\(sortKey === 'title' \|\| sortKey === 'artist'\)/);
    expect(src()).toMatch(/\{#if navMode === 'alpha' && tab === 'albums' && railUtile\}/);
  });

  it('les lettres proposées restent celles de ce qui est AFFICHÉ', () => {
    expect(src()).toMatch(/present = \$derived\([^;]*affiches\.map\(firstLetter\)/);
  });
});

describe('les facettes s’ouvrent sur une liste', () => {
  it('la liste existe, et le clic ouvre la valeur', () => {
    expect(src()).toContain('class="fliste"');
    expect(src()).toContain('onclick={() => (facetteOuverte = g.key)}');
    expect(src()).toMatch(/\{#if groupeOuvert == null\}/);
  });

  it('la liste porte le COMPTE de chaque valeur', () => {
    // Sans lui, on choisit à l'aveugle : un genre à deux albums et un genre à
    // trois cents se ressemblent.
    const i = src().indexOf('class="fliste"');
    expect(src().slice(i, i + 700)).toMatch(/class="fc">\{g\.albums\.length\}/);
  });

  it('🔴 on peut REVENIR à la liste', () => {
    // Sans retour, on entre dans un genre sans pouvoir en sortir autrement
    // qu'en changeant d'onglet.
    expect(src()).toContain('class="fretour"');
    expect(src()).toContain('onclick={() => (facetteOuverte = null)}');
  });

  it('changer d’onglet ou de recherche REFERME la valeur ouverte', () => {
    // Rester sur un genre en passant aux Labels montrerait une valeur absente
    // de la nouvelle famille : un écran vide, sans explication.
    expect(src()).toMatch(/\$effect\(\(\) => \{ void tab; void q; facetteOuverte = null; \}\);/);
  });

  it('le cœur de facette survit au changement de présentation', () => {
    // Il vivait sur l'en-tête de section. La liste est devenue le premier
    // écran : l'y perdre aurait rendu les favoris de facette inatteignables,
    // deux jours après les avoir branchés.
    const i = src().indexOf('class="fliste"');
    expect(src().slice(i, i + 1400)).toContain('basculerFacette(g.key)');
  });
});
