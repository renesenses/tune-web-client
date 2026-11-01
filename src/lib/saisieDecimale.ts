/**
 * Saisie d'un nombre décimal dans un champ texte de l'égaliseur paramétrique.
 *
 * Le champ garde ce que l'on tape (tampon local) ; rien n'est lu, borné ni
 * réécrit avant la validation (sortie du champ ou Entrée). Un champ réécrit à
 * chaque frappe affichait « 20 » dès qu'on effaçait la fréquence et gardait le
 * « 1 » de 1,41 dans le Q, le curseur sautant avant le chiffre tapé.
 *
 * La virgule et le point sont acceptés : `<input type="number">` refuse la
 * virgule sous Firefox et Safari (valeur vide) et l'accepte sous Chromium
 * selon la langue du système — d'où un champ texte et cette lecture-ci.
 */

/** Lit « 1,41 », « 1.41 », « 2 000 » ; `null` si vide ou illisible. */
export function lireDecimal(texte: string): number | null {
  const t = texte.replace(/[\s  ]/g, '').replace(',', '.');
  if (!/^[+-]?(\d+\.?\d*|\.\d+)$/.test(t)) return null;
  const v = Number(t);
  return Number.isFinite(v) ? v : null;
}

export function borner(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

/** Arrondi à `decimales` chiffres, sans artefact binaire (0.1 + 0.2). */
export function arrondir(v: number, decimales: number): number {
  const p = 10 ** decimales;
  return Math.round(v * p) / p;
}
