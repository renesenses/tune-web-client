/**
 * #307 — les en-têtes remontaient au défilement, **sous Firefox seulement**.
 *
 * Fil testeur Jean Valjean (Windows 11, Firefox). Constaté à nouveau par
 * Bertrand le 08/09/2026 sur macOS : Bibliothèque figée — c'est le témoin,
 * corrigé en 0.9.44/45 — mais Collections et Radio Live « remontent un peu »,
 * et Podcasts laisse une bande de pochettes coupée au-dessus de ses onglets,
 * le titre de l'écran ayant disparu vers le haut.
 *
 * ## Le mécanisme, et il n'a rien à voir avec `position: sticky`
 *
 * Un enfant de conteneur flex a `min-height: auto` par défaut : il ne peut PAS
 * devenir plus petit que son contenu. Un enfant qui porte `flex: 1` et
 * `overflow-y: auto` demande pourtant exactement l'inverse — « prends la place
 * qui reste, et fais défiler ce qui dépasse ».
 *
 * Sans `min-height: 0`, Firefox applique la règle : le bloc GRANDIT au lieu de
 * défiler, son `overflow` ne sert jamais, et c'est un ancêtre qui défile — en
 * emportant l'en-tête. Chrome tolère l'absence, ce qui explique pourquoi le
 * défaut ne se voyait que d'un côté.
 *
 * `ShellV2` connaissait déjà la règle pour les ENFANTS de `.main`
 * (`.main > :global(*){… min-height:0}`). C'est `.main` lui-même qui ne
 * l'avait pas — et lui aussi est un enfant de flex.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { globSync } from 'fs';

/** Extrait les règles CSS d'un composant Svelte. */
function reglesCss(fichier: string): Array<{ nom: string; corps: string }> {
  const src = readFileSync(fichier, 'utf8');
  const i = src.lastIndexOf('<style');
  if (i < 0) return [];
  return [...src.slice(i).matchAll(/\.([\w-]+)\s*\{([^}]*)\}/g)]
    .map((m) => ({ nom: m[1], corps: m[2].replace(/\s+/g, '') }));
}

const ECRANS = globSync('src/components/v2/*.svelte');

describe('🔴 Un bloc qui défile DANS un flex doit pouvoir rétrécir', () => {
  it('la garde voit bien quelque chose', () => {
    // Un balayage qui ne lit aucun fichier serait vert pour rien.
    expect(ECRANS.length).toBeGreaterThan(30);
  });

  it('aucun `flex:1` + `overflow:auto` sans `min-height:0`', () => {
    const fautifs: string[] = [];
    for (const f of ECRANS) {
      for (const r of reglesCss(f)) {
        const defile = r.corps.includes('overflow-y:auto') || r.corps.includes('overflow:auto');
        if (!defile || !r.corps.includes('flex:1')) continue;
        if (!r.corps.includes('min-height:0')) fautifs.push(`${f.split('/').pop()} → .${r.nom}`);
      }
    }
    expect(fautifs, 'ces blocs grandiront au lieu de défiler sous Firefox').toEqual([]);
  });

  it('🔴 et le conteneur principal de la coquille non plus', () => {
    // C'est l'ancêtre : sans lui, le `height:100%` de chaque écran se résout
    // contre un parent trop haut, et tout le reste est vain.
    const shell = readFileSync('src/components/v2/ShellV2.svelte', 'utf8');
    const m = shell.match(/\.main\s*\{([^}]*)\}/);
    expect(m, '.main est introuvable').not.toBeNull();
    expect(m![1].replace(/\s+/g, '')).toContain('min-height:0');
  });

  it('les enfants de `.main` gardent la leur', () => {
    // Elle existait déjà, et la retirer en « simplifiant » ramènerait le
    // défaut par l'autre bout.
    const shell = readFileSync('src/components/v2/ShellV2.svelte', 'utf8');
    expect(shell).toMatch(/\.main\s*>\s*:global\(\*\)\{[^}]*min-height:\s*0/);
  });
});
