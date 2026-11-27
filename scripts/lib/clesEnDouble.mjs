/**
 * Les clés déclarées DEUX FOIS dans un fichier de langue.
 *
 * Deux PR de la rc14 (#3441, #3451) ajoutaient chacune
 * `tess.reason.not_applied_on_transport`, à deux endroits différents des
 * fichiers de langue. Git les fusionne sans conflit, et la clé se retrouvait
 * deux fois dans les 20 langues. Les contrôles de parité ne pouvaient pas le
 * voir : ils comparent des ENSEMBLES de clés, où un doublon disparaît. Seul
 * `svelte-check` le signalait (« An object literal cannot have multiple
 * properties with the same name »), et la seconde valeur écrasait la première
 * en silence à l'exécution.
 *
 * Même lecture que `localeKeys()` de `check-i18n` : une ligne qui commence
 * par une chaîne suivie de `:`.
 *
 * @param {string} source le texte d'un fichier de `src/lib/locales/`
 * @returns {{ cle: string, lignes: number[] }[]} chaque clé en double, avec ses lignes (base 1)
 */
export function clesEnDouble(source) {
  /** @type {Map<string, number[]>} */
  const vues = new Map();
  source.split('\n').forEach((ligne, i) => {
    const m = ligne.match(/^\s*['"]([^'"]+)['"]\s*:/);
    if (!m) return;
    const lignes = vues.get(m[1]) ?? [];
    lignes.push(i + 1);
    vues.set(m[1], lignes);
  });
  return [...vues]
    .filter(([, lignes]) => lignes.length > 1)
    .map(([cle, lignes]) => ({ cle, lignes }));
}
