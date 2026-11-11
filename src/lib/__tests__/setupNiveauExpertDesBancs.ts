// Branché dans `vitest.config.ts` → `setupFiles`, APRÈS `setupStockageWeb`.
//
// #2735 — le niveau d'interface par défaut d'une installation NEUVE est passé
// d'Expert (27/08) à Essentiel (Bertrand, 09/11/2026). Plusieurs centaines de
// bancs ont été écrits sous l'ancien défaut : ils montent un écran sans poser
// de niveau et attendent ce que l'Expert montre (tris, bascules, réglages).
//
// Plutôt que de réécrire ces bancs un à un, on rejoue pour eux le chemin que
// suit une installation EXISTANTE : l'ancien interrupteur « avancé »
// (`tune_settings_advanced = '1'`) fait choisir Expert à `legacySettingsLevel`,
// sans créer de blob de préférences — `hadLocalPrefs` reste faux, et rien
// d'autre ne change. Un banc qui veut le défaut d'une installation neuve vide
// le stockage avant d'importer le magasin (voir `niveauParDefautEssentiel2735`).
try {
  if (typeof localStorage !== 'undefined') localStorage.setItem('tune_settings_advanced', '1');
} catch { /* environnement sans stockage : rien à faire */ }
