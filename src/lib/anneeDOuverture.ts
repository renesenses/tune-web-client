/**
 * Où se pose le curseur de la frise des années à l'OUVERTURE — #1314.
 *
 * Jean Valjean (fil 1671, 19/09/2026) : « Lors de l'ouverture de la
 * bibliothèque, la frise chronologique est mise systématiquement sur l'année
 * ayant le plus d'album. » C'était voulu (`busiestYear`), et c'était le
 * mauvais repère : l'année la plus fournie ne dit rien de ce que l'auditeur
 * cherchait la dernière fois, et elle revenait à chaque visite, quel que soit
 * le parcours précédent.
 *
 * La règle :
 *   1. la dernière année que l'auditeur a CHOISIE (clic sur la frise),
 *      retenue d'une visite à l'autre — si elle est encore sur l'axe ;
 *   2. sinon, l'année la plus RÉCENTE qui porte au moins un album : le bout
 *      de l'axe, là où une collection grandit.
 *
 * Le repère retenu ne FILTRE rien : seul un clic fige l'année et atténue la
 * grille (`fYear`). Retenir le filtre lui-même ferait rouvrir la Bibliothèque
 * sur une seule année, ce qui passerait pour des albums disparus.
 */
const CLE = 'tune_v2_ecran_lib.anneeRepere';

export function anneeDOuverture(
  bars: readonly { year: number; n: number }[],
  repere: number | null,
): number | null {
  if (!bars.length) return null;
  if (repere != null && bars.some((b) => b.year === repere)) return repere;
  for (let i = bars.length - 1; i >= 0; i--) if (bars[i].n > 0) return bars[i].year;
  return null;
}

export function lireAnneeRepere(): number | null {
  try {
    const v = Number.parseInt(localStorage.getItem(CLE) ?? '', 10);
    return Number.isFinite(v) ? v : null;
  } catch {
    return null;
  }
}

export function ecrireAnneeRepere(annee: number): void {
  try {
    localStorage.setItem(CLE, String(annee));
  } catch { /* stockage indisponible : le repère ne dure que la visite */ }
}
