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
 * `?v2=0` était resté écrit tel quel : c'était le filet réel, le paramètre
 * d'URL qui ramenait à l'interface précédente. La phase 5 a retiré cette
 * interface, le drapeau et l'interrupteur avec elle — leurs libellés et les
 * tests qui les tenaient sont partis ensemble.
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
        // Plus d'exemption pour `?v2=0` : le drapeau est parti avec la phase 5,
        // aucune chaîne n'a plus de raison de le citer.
        if (/\b[Vv](?:ersion\s*)?[12]\b|\?v2\b/.test(val)) coupables.push(`${l} / ${cle}`);
      }
    }
    expect(coupables, `chaînes nommant encore une version : ${coupables.join(', ')}`).toEqual([]);
  });

  it('aucun écran n a « V2 » en dur', () => {
    const vue = readFileSync('src/components/v2/AvatarMenu.svelte', 'utf8');
    expect(vue).not.toMatch(/>[^<]*\bV2\b/);
  });
});
