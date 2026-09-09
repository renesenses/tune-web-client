/**
 * Le garde du VINGTIÈME site — renesenses/tune-server-rust#3732, point 2.
 *
 * Dix-neuf appels de lecture de la coquille v2 finissaient par
 * `.catch(() => {})`. Les corriger un par un ne vaut que si le suivant ne
 * rouvre pas le trou : c'est une ligne qu'on recopie du voisin, et le voisin
 * était fautif dix-neuf fois.
 *
 * ⚠️ LIMITE ASSUMÉE. Ce témoin LIT le source. Il attrape le `catch` nu — la
 * faute par copie — et rien de plus : un `catch` qui appellerait une fonction
 * inerte le laisserait vert. Ce que l'utilisateur VOIT est mesuré ailleurs,
 * en montant la coquille et en lisant le DOM :
 * `v2EchecsLectureVisibles.test.ts`. Les deux sont nécessaires, et aucun ne
 * remplace l'autre.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const RACINE = 'src/components/v2';
const lire = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf-8');

/** `playAndSync(…)` suivi, sur la même ligne, d'un `catch` qui ne fait RIEN. */
const CATCH_MUET = /playAndSync\([^\n]*?\.catch\(\s*\(\s*\)\s*=>\s*\{\s*\}\s*\)/;

function fichiersV2(): string[] {
  return readdirSync(resolve(process.cwd(), RACINE)).filter((f) => f.endsWith('.svelte'));
}

describe('#3732 — aucun appel de lecture n’avale son erreur en silence', () => {
  it('aucun `playAndSync(…).catch(() => {})` ne subsiste dans la coquille v2', () => {
    const coupables = fichiersV2().filter((f) => CATCH_MUET.test(lire(`${RACINE}/${f}`)));
    expect(
      coupables,
      'un appel de lecture avale de nouveau son erreur : l’utilisateur cliquera Lire ' +
        'et rien ne se passera, sans message ni trace. Utiliser ' +
        '`.catch(signalerEchecLecture)` (src/lib/echecLecture.ts).',
    ).toEqual([]);
  });

  it('le garde a bien un objet : la coquille v2 appelle réellement `playAndSync`', () => {
    // Sans ce contrôle, supprimer toute lecture de la v2 rendrait le garde
    // ci-dessus vert pour la pire des raisons.
    const appelants = fichiersV2().filter((f) => lire(`${RACINE}/${f}`).includes('playAndSync('));
    expect(appelants.length, 'plus aucun écran v2 ne lance de lecture — le garde perd son objet')
      .toBeGreaterThan(0);
  });

  it('aucun `catch` de lecture n’a un corps VIDE, quelle que soit sa forme', () => {
    // Le filet plus large : `() => {}` est la forme qu'on a trouvée dix-neuf
    // fois, mais `(e) => { }` ou `() => { /* on ignore */ }` sont le même
    // silence écrit autrement. La contrepartie de ce garde est qu'il ne juge
    // PAS un `catch` qui fait quelque chose — un écran qui pose son propre
    // message dans son propre bandeau (FavoritesV2, StreamingV2) est correct,
    // et n'a rien à changer.
    const CORPS_VIDE =
      /playAndSync\([^\n]*?\.catch\(\s*(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>\s*\{\s*(?:\/\*[\s\S]*?\*\/\s*|\/\/[^\n]*\n\s*)*\}\s*\)/;
    const coupables = fichiersV2().filter((f) => CORPS_VIDE.test(lire(`${RACINE}/${f}`)));
    expect(
      coupables,
      'un `catch` de lecture ne fait rien : l’échec restera invisible',
    ).toEqual([]);
  });
});
