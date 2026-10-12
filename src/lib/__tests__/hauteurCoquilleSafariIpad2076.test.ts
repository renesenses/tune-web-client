/**
 * web#2076 — Patatorz, fil 2206 (11/10/2026) : sous Safari sur iPad Pro 11,
 * la barre de lecture du bas n'apparaît pas.
 *
 * La coquille v2 (`.v2-shell`, `overflow:hidden`, barre de lecture en
 * dernier enfant) mesurait `height:100vh`. Sous Safari iOS/iPadOS, `100vh`
 * est la hauteur du GRAND viewport, barres d'outils repliées : quand elles
 * sont affichées, le bas de la coquille, donc la barre de lecture, passe sous
 * le bord visible. Et `body` porte déjà `padding-top: env(safe-area-inset-top)`
 * (`tune-theme.css`) : la coquille débordait encore de ce retrait.
 *
 * Attendu : `100dvh` (viewport dynamique), avec `100vh` en repli DÉCLARÉ
 * AVANT pour les navigateurs qui ignorent `dvh`, et le retrait du haut
 * soustrait des deux.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const shell = readFileSync(resolve(process.cwd(), 'src/components/v2/ShellV2.svelte'), 'utf-8');
const theme = readFileSync(resolve(process.cwd(), 'src/styles/tune-theme.css'), 'utf-8');
const regle = /\.v2-shell\{([^}]*)\}/.exec(shell.replace(/\/\*[\s\S]*?\*\//g, ''))?.[1] ?? '';
const hauteurs = [...regle.matchAll(/(?:^|;)\s*height:([^;]+)/g)].map((m) => m[1].trim());

describe('web#2076 — la coquille tient dans le viewport VISIBLE de Safari', () => {
  it('la règle `.v2-shell` est trouvée', () => {
    expect(regle).toContain('overflow:hidden');
  });
  it('🔴 la dernière hauteur déclarée est en `dvh`, avec un repli `vh` avant elle', () => {
    expect(hauteurs.length, hauteurs.join(' | ')).toBeGreaterThanOrEqual(2);
    expect(hauteurs[hauteurs.length - 1]).toMatch(/100dvh/);
    expect(hauteurs[0]).toMatch(/100vh/);
  });
  it('🔴 le retrait du haut que `body` réserve déjà est soustrait (sinon le bas déborde d’autant)', () => {
    expect(theme).toMatch(/padding-top:\s*env\(safe-area-inset-top/);
    for (const h of hauteurs) expect(h).toMatch(/calc\(100d?vh - env\(safe-area-inset-top, ?0px\)\)/);
  });
});
