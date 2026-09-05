import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const lire = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf-8');
const sansCommentaires = (s: string) =>
  s.replace(/<!--[\s\S]*?-->/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

/**
 * « Écrit, pas branché » — le défaut de la journée du 05/09/2026.
 *
 * Cinq fois le même : un mécanisme complet, correct, testé… et monté nulle
 * part dans la coquille `?v2`, qui ne monte JAMAIS `App.svelte`. L'annonce de
 * mise à jour, l'Historique, Oxygen, les raccourcis clavier, puis le conteneur
 * de dialogues.
 *
 * Ce fichier tient la liste de ce que la coquille DOIT monter, pour que le
 * sixième soit rattrapé par un test et non par Bertrand.
 */
describe('La coquille v2 monte tout ce que App.svelte monte', () => {
  const shell = sansCommentaires(lire('src/components/v2/ShellV2.svelte'));

  it('le conteneur de DIALOGUES est monté', () => {
    // Sans lui, `dialogs.confirm()` pose sa demande dans une file que personne
    // ne rend : la promesse ne se résout jamais, et le geste ne fait rien —
    // sans message, sans erreur de console.
    expect(shell).toContain("import DialogContainer from '../DialogContainer.svelte'");
    expect(shell).toContain('<DialogContainer />');
  });

  it('les raccourcis CLAVIER sont branchés', () => {
    expect(shell).toContain('$effect(() => setupKeyboardShortcuts())');
  });

  it("l'annonce de mise à jour est branchée", () => {
    expect(shell).toContain('startUpdatePolling()');
    expect(shell).toContain('stopUpdatePolling()');
  });

  it('aucun écran v2 n’attend un dialogue que la coquille ne rendrait pas', () => {
    // La règle générale : si un écran monté par la coquille attend un
    // dialogue, la coquille doit porter le conteneur.
    const v2 = readdirSync(resolve(process.cwd(), 'src/components/v2'))
      .filter((f) => f.endsWith('.svelte'));
    const attendent = v2.filter((f) => lire(`src/components/v2/${f}`).includes('await dialogs.'));
    expect(attendent.length, 'aucun écran n’utilise les dialogues — le garde perd son objet')
      .toBeGreaterThan(0);
    expect(shell).toContain('<DialogContainer />');
  });
});
