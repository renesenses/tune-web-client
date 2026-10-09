// Les onze dictionnaires, ENREGISTRÉS dans `i18n.ts` avant chaque banc
// (`vitest.config.ts` → `setupFiles`).
//
// Depuis tune-server-rust#4800 (cause 4), `i18n.ts` n'importe plus aucun
// dictionnaire : chaque langue est un chunk chargé à la demande par
// `import()`. Sous test, ce chargement serait asynchrone et chronométré —
// exactement le motif que #1308 a banni — et tout banc qui monte un écran
// puis lit un libellé (`locale.set('ro')` ; `expect(texte).toContain(…)`)
// verrait des clés nues. On rend donc les onze synchrones ici, en statique
// et à la collecte, comme `i18n.ts` le faisait lui-même avant : les bancs
// gardent le comportement qu'ils ont toujours eu.
//
// Le banc du chargeur lui-même (`localeALaDemande4800.test.ts`) repart d'un
// module vierge (`vi.resetModules()`) pour vérifier le chemin réel.
// 🔴 LE NAVIGATEUR DES BANCS PARLE FRANÇAIS — et c'est posé AVANT l'import de
// `i18n.ts`, qui lit la langue du navigateur à l'évaluation.
//
// Depuis le 06/10/2026, la langue par défaut est celle du navigateur, plus
// `'fr'` en dur. jsdom et Node se déclarent `en-US` : sans cette ligne, les
// quelque quatre cents bancs qui lisent un libellé dans `fr` (rédigés quand
// le français était le défaut) chercheraient du français dans un écran
// anglais. Un banc qui teste la langue du navigateur la redéfinit lui-même
// (`langueDuNavigateur.test.ts`, `vi.spyOn(navigator, 'languages', 'get')`).
if (typeof navigator !== 'undefined') {
  Object.defineProperty(navigator, 'languages', { configurable: true, get: () => ['fr-FR', 'fr'] });
  Object.defineProperty(navigator, 'language', { configurable: true, get: () => 'fr-FR' });
}
const { enregistrerDictionnaire } = await import('../i18n');
import type { Locale } from '../i18n';
import { ONZE_LANGUES, dictionnaire } from './onzeDictionnaires';

for (const code of ONZE_LANGUES) {
  enregistrerDictionnaire(code as Locale, dictionnaire(code));
}
