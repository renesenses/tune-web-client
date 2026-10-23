import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

// Retour d'Alex Campbell (22/10/2026) : sur les enceintes AirPlay, le bouton
// « Appairer » ajoutait une colonne et la croix passait à la ligne suivante.
describe('Réglages › Appareils réseau : la croix reste sur la ligne de son appareil', () => {
  const src = readFileSync('src/components/v2/SettingsV2.svelte', 'utf8');

  it("la ligne d'appareil réseau n'est plus une grille à colonnes fixes", () => {
    expect(src).not.toContain('.dev.net{grid-template-columns:auto minmax(0,1fr) auto auto auto');
    expect(src).toMatch(/\.dev\.net\{display:flex; flex-wrap:nowrap/);
    expect(src).toContain('.dev.net .del{margin-left:auto');
  });

  it("le nom de l'appareil est affiché sans espaces de tête", () => {
    expect(src).toContain("{(d.name ?? '').trim()}");
  });
});
