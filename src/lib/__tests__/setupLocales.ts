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
import { enregistrerDictionnaire, type Locale } from '../i18n';
import { ONZE_LANGUES, dictionnaire } from './onzeDictionnaires';

for (const code of ONZE_LANGUES) {
  enregistrerDictionnaire(code as Locale, dictionnaire(code));
}
