/**
 * #3466 — le Convertisseur doit dire DEPUIS QUOI il convertit.
 *
 * Tades, 06/09/2026, ticket support 83, fil forum 1677, Tune 0.9.137 · Windows :
 * « Dans l'onglet convertisseur, on me montre des albums (par exemple Elvis
 * Presley) qu'on me propose de convertir. Difficile de savoir le format
 * d'origine : Alac ? »
 *
 * Les deux écrans du convertisseur — l'actuel et le nouveau — offraient six
 * formats de SORTIE et taisaient celui d'ENTRÉE. La donnée était pourtant déjà
 * dans le client : le magasin `albums` porte `format`, `sample_rate` et
 * `bit_depth`, et c'est LE MÊME magasin qui alimente la grille de la
 * Bibliothèque, où le badge est affiché depuis toujours.
 *
 * Épreuves de source : ce que ces écrans rendent tient à une seule ligne de
 * gabarit, et jsdom n'injecte pas le CSS scopé d'un composant Svelte — une
 * assertion de style calculé ou de largeur n'aurait ici aucun sens.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const lire = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf-8');
const sansCommentaires = (s: string) =>
  s.replace(/<!--[\s\S]*?-->/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const ECRANS = [
  { nom: 'nouveau client', fichier: 'src/components/v2/ConverterV2.svelte', album: 'a' },
  { nom: 'client actuel', fichier: 'src/components/ConverterView.svelte', album: 'album' },
];

describe.each(ECRANS)('Convertisseur — $nom', ({ fichier, album }) => {
  const src = sansCommentaires(lire(fichier));

  it('importe le badge de qualité plutôt que d’en redessiner un', () => {
    // DRY : le badge que l'utilisateur lit déjà partout ailleurs. Un libellé
    // maison ici divergerait du reste de l'application au premier changement.
    expect(src).toMatch(/import QualityBadge from '\.{1,2}\/(\.\.\/)?QualityBadge\.svelte'/);
  });

  it('affiche le format D’ORIGINE de l’album, pas celui de sortie', () => {
    expect(src).toContain('<QualityBadge');
    // Les trois champs qui font la qualité de la SOURCE. Le préréglage de
    // sortie, lui, vit dans `preset` / `selectedPreset` : ne pas les confondre.
    expect(src).toContain(`format={${album}.format}`);
    expect(src).toContain(`sampleRate={${album}.sample_rate}`);
    expect(src).toContain(`bitDepth={${album}.bit_depth}`);
  });

  it('le badge est posé sur la CARTE d’album, pas dans l’en-tête', () => {
    // Sinon il annoncerait un format pour toute la grille — exactement
    // l'ambiguïté que le testeur signale.
    const i = src.indexOf('<QualityBadge');
    const debutGrille = src.search(/\{#each (filteredAlbums|shown) as/);
    expect(debutGrille).toBeGreaterThan(-1);
    expect(i).toBeGreaterThan(debutGrille);
  });
});
