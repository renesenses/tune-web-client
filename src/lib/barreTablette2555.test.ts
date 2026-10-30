import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { SEUIL_VU_PX } from './barreVuMetres';

// web#2555 — Galaxy Tab S4 (1280 px CSS), Chrome Android : avec la barre à
// VU-mètres, la colonne de droite débordait de la fenêtre. Mesuré en Chromium
// (voir la PR) ; ce banc garde la règle qui l'empêche, car vitest n'a pas de
// moteur de mise en page.
const SRC = readFileSync(new URL('../components/partages/TransportBar.svelte', import.meta.url), 'utf-8');

/** Corps de la requête de conteneur « barre à VU-mètres entre min et max ». */
export function requeteVuIntermediaire(src: string): { min: number; max: number; corps: string } | null {
  const m = src.match(/@container tbar \(min-width: (\d+)px\) and \(max-width: (\d+)px\) \{([\s\S]*?)\n  \}\n/);
  if (!m) return null;
  return { min: +m[1], max: +m[2], corps: m[3] };
}

const SECONDAIRES = [
  /\.transport-bar\.vu \.zone-chip-label\s*\{\s*display:\s*none/,
  /\.transport-bar\.vu \.zone-icon-btn\s*\{[^}]*max-width:\s*32px/,
  /\.transport-bar\.vu \.transport-right :global\(\.step-btn\)\s*\{\s*display:\s*none/,
];

function garde(src: string): string[] {
  const r = requeteVuIntermediaire(src);
  if (!r) return ['requête absente'];
  const fautes: string[] = [];
  // La requête mesure le contenu de la barre (sans ses 2 x 24 px de marge) ;
  // le seuil des cadrans, lui, mesure la barre entière.
  if (r.min > SEUIL_VU_PX - 48) fautes.push(`min ${r.min} laisse le seuil ${SEUIL_VU_PX} sans garde`);
  for (const re of SECONDAIRES) if (!re.test(r.corps)) fautes.push(`manque ${re}`);
  // Les commandes de lecture ne sont jamais masquées par cette requête.
  if (/control-btn(?!\.transfer)|transport-controls|play-btn/.test(r.corps)) fautes.push('masque une commande de lecture');
  return fautes;
}

describe('web#2555 — barre de lecture à VU-mètres sur tablette (1280 px)', () => {
  it('le secondaire est replié dès le seuil des cadrans, sans toucher aux commandes', () => {
    expect(garde(SRC)).toEqual([]);
  });

  it('couvre le bureau intermédiaire mais pas le bureau large (> 1800 px)', () => {
    const r = requeteVuIntermediaire(SRC)!;
    expect(r.max).toBe(1800);
  });

  it('contre-épreuve : sans la requête, ou avec un seuil trop haut, la garde échoue', () => {
    const sans = SRC.replace(/@container tbar \(min-width: \d+px\) and \(max-width: 1800px\)/, '@container tbar (min-width: 99999px)');
    expect(garde(sans).length).toBeGreaterThan(0);
    const nu = SRC.replace(/\.transport-bar\.vu \.zone-chip-label\s*\{\s*display:\s*none;\s*\}/, '');
    expect(garde(nu)).toContain('manque ' + SECONDAIRES[0]);
  });
});
