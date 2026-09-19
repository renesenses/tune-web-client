/**
 * L'interface ne se nomme plus par un numéro de version — chantier UI.
 *
 * Bertrand, 19/09/2026 : « je voudrais que les références à V2 deviennent v1
 * sur l'UI ».
 *
 * 🔴 La mesure a montré que la surface était minuscule, et pas là où on la
 * croyait. Sur les 11 locales, AUCUN écran n'écrit « V2 » en dur, et seules
 * DEUX chaînes en parlaient :
 *
 *   settings.uiChoiceHint  « …le menu du compte de la future v1 — ou ?v2=0… »
 *   v2.meta.foot           « …hors du drapeau ?v2… »
 *
 * Tout le reste — 1 069 clés `v2.*`, 60 fichiers `components/v2/`, 48 jetons
 * `--v2-*`, 60 identifiants `…V2` — est de la plomberie que personne ne lit.
 *
 * ⚠️ `?v2=0` RESTE écrit tel quel, et c'est délibéré : c'est le filet de
 * secours réel, le paramètre d'URL qui ramène à l'interface précédente quand
 * un écran se bloque. Le renommer dans le texte sans renommer le drapeau le
 * rendrait FAUX. Il disparaîtra avec le drapeau, à la suppression de
 * l'ancienne interface.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const LANGUES = ['fr', 'en', 'de', 'es', 'it', 'ja', 'ko', 'zh', 'ro', 'sv', 'hu'];
const loc = (l: string) => readFileSync(`src/lib/locales/${l}.ts`, 'utf8');
const valeur = (l: string, cle: string) =>
  (loc(l).match(new RegExp(`"${cle.replace('.', '\\.')}"\\s*:\\s*"((?:\\\\.|[^"])*)"`)) ?? [])[1] ?? '';

describe('aucun numéro de version dans le texte visible', () => {
  it('🔴 plus une seule chaîne ne nomme « v1 » ou « v2 » comme une interface', () => {
    const coupables: string[] = [];
    for (const l of LANGUES) {
      for (const ligne of loc(l).split('\n')) {
        const m = ligne.match(/^\s*"([^"]+)"\s*:\s*"((?:\\.|[^"])*)"/);
        if (!m) continue;
        const [, cle, val] = m;
        // `?v2=0` est le FILET, un paramètre d'URL littéral : il reste.
        const sansFilet = val.replace(/\?v2=0/g, '').replace(/\?v2\b/g, '');
        if (/\b[Vv](?:ersion\s*)?[12]\b/.test(sansFilet)) coupables.push(`${l} / ${cle}`);
      }
    }
    expect(coupables, `chaînes nommant encore une version : ${coupables.join(', ')}`).toEqual([]);
  });

  it('⚠️ …mais le filet `?v2=0` est TOUJOURS là', () => {
    // Le retirer du texte sans renommer le drapeau rendrait la phrase fausse
    // et l'échappatoire introuvable.
    for (const l of LANGUES) {
      expect(valeur(l, 'settings.uiChoiceHint'), l).toContain('?v2=0');
    }
  });

  it('aucun écran n a « V2 » en dur', () => {
    const vue = readFileSync('src/components/v2/AvatarMenu.svelte', 'utf8');
    expect(vue).not.toMatch(/>[^<]*\bV2\b/);
  });
});

describe('le couple de l interrupteur dit ce qu il est', () => {
  it('🔴 « Actuelle » nommait l ANCIENNE — or la nouvelle est le défaut', () => {
    // Depuis la phase 4 (#1032), un appareil qui n'a jamais choisi ouvre la
    // nouvelle. Appeler l'ancienne « Actuelle » désignait comme courant ce que
    // plus personne n'obtient par défaut.
    expect(valeur('fr', 'settings.uiCurrent')).toBe('Précédente');
    expect(valeur('fr', 'settings.uiFuture')).toBe('Nouvelle');
    expect(valeur('en', 'settings.uiCurrent')).toBe('Previous');
    expect(valeur('en', 'settings.uiFuture')).toBe('New');
  });

  it('les deux libellés sont traduits partout, et distincts', () => {
    for (const l of LANGUES) {
      const a = valeur(l, 'settings.uiCurrent');
      const b = valeur(l, 'settings.uiFuture');
      expect(a, `${l} uiCurrent`).not.toBe('');
      expect(b, `${l} uiFuture`).not.toBe('');
      expect(a, `${l} : les deux libellés se confondent`).not.toBe(b);
    }
  });
});
