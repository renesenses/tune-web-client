import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { gabarit } from './ancrageDefilement';

/**
 * web#2138 — fil 2250 (rc4, Windows 11, Firefox) : « Bibliothèque → Genres ou
 * Labels → choix d'un genre avec un nombre important d'albums → lors du
 * défilement, on perd la fonction retour (en haut) ».
 *
 * Le « Retour » (`.fretour`) de la facette ouverte était le premier enfant de
 * `.facets`, le conteneur qui DÉFILE : il partait avec la grille, et seul le
 * titre collant (`.facet h2`) restait. Même défaut que #907 dans les
 * Collections, même remède : le Retour sort du conteneur qui défile.
 *
 * jsdom ne met rien en page : on lit le gabarit et la feuille, comme la garde
 * de #907 (`collectionsEntete855_907_favoriService1070`).
 */
const SRC = readFileSync('src/components/v2/LibraryV2.svelte', 'utf8');
const GAB = gabarit(SRC);
const CSS = SRC.slice(SRC.indexOf('<style>')).replace(/\/\*[\s\S]*?\*\//g, ' ');

describe('web#2138 — le Retour d\'un genre ou d\'un label ouvert reste à l\'écran', () => {
  it('🔴 le Retour est AVANT `.facets`, pas dedans', () => {
    const retour = GAB.indexOf('class="fretour"');
    const facets = GAB.indexOf('<div class="facets">');
    expect(retour).toBeGreaterThan(-1);
    expect(facets).toBeGreaterThan(retour);
    // Et c'est bien le Retour de la facette ouverte, juste avant elle.
    const entre = GAB.slice(retour, facets);
    expect(entre).toContain('facetteOuverte = null');
    expect(entre).not.toMatch(/<div\b/);
  });

  it('la facette (titre collant compris) est dans `.facets`, qui défile', () => {
    const facets = GAB.indexOf('<div class="facets">');
    expect(GAB.indexOf('<section class="facet" data-facette={g.key}>')).toBeGreaterThan(facets);
    expect(CSS).toMatch(/\.facets\{[^}]*overflow-y:\s*auto/);
  });

  it('Retour et `.facets` partagent une COLONNE (`.body` est une rangée flex)', () => {
    const colonne = GAB.indexOf('<div class="facette-ouverte">');
    expect(colonne).toBeGreaterThan(-1);
    expect(GAB.indexOf('class="fretour"')).toBeGreaterThan(colonne);
    expect(CSS).toMatch(/\.body\{[^}]*display:\s*flex/);
    const regle = CSS.match(/\.facette-ouverte\{[^}]*\}/)![0];
    expect(regle).toMatch(/flex-direction:\s*column/);
    expect(regle).toMatch(/min-height:\s*0/);
  });

  it('dans la colonne flex, le Retour ne s\'étire ni ne rétrécit', () => {
    const regle = CSS.match(/\.fretour\{[^}]*\}/)![0];
    expect(regle).toMatch(/flex:\s*none/);
    expect(regle).toMatch(/align-self:\s*flex-start/);
  });
});
