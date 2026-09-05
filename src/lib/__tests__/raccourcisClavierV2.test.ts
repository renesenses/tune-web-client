import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const lire = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf-8');
const sansCommentaires = (s: string) =>
  s.replace(/<!--[\s\S]*?-->/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

describe('Raccourcis clavier (Bertrand, 05/09/2026)', () => {
  const clavier = sansCommentaires(lire('src/lib/keyboard.ts'));
  const shell = sansCommentaires(lire('src/components/v2/ShellV2.svelte'));

  it('le NOUVEAU client les branche — il ne le faisait pas du tout', () => {
    // `setupKeyboardShortcuts` n'était appelé que par App.svelte, que `?v2` ne
    // monte jamais : Espace, les flèches, N, P et M ne faisaient rien.
    expect(shell).toContain("import { setupKeyboardShortcuts } from '../../lib/keyboard'");
    expect(shell).toContain('$effect(() => setupKeyboardShortcuts())');
  });

  it('S arrête, et la touche média matérielle aussi', () => {
    expect(clavier).toContain("case 'KeyS':");
    expect(clavier).toContain("case 'MediaStop':");
    expect(clavier).toContain('api.stop(zone.id)');
  });

  it("S ne marche pas sur les frappes de saisie ni avec Cmd/Ctrl", () => {
    // La garde de saisie couvre tout le gestionnaire.
    expect(clavier).toContain("if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;");
    const i = clavier.indexOf("case 'KeyS':");
    expect(clavier.slice(i, i + 240)).toContain('if (e.metaKey || e.ctrlKey) break;');
  });

  it('la RADIO est exclue, comme elle l’était du bouton', () => {
    const i = clavier.indexOf("case 'KeyS':");
    expect(clavier.slice(i, i + 240)).toContain("get(currentTrack)?.source === 'radio'");
  });

  it("S n'écrase aucune touche déjà prise", () => {
    // Space, N, P, M et les flèches étaient déjà attribuées.
    for (const c of ['Space', 'KeyN', 'KeyP', 'KeyM', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']) {
      expect((clavier.match(new RegExp(`case '${c}'`, 'g')) ?? []).length, c).toBe(1);
    }
    expect((clavier.match(/case 'KeyS'/g) ?? []).length).toBe(1);
  });
});
