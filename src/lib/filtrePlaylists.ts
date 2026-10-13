/**
 * Retrouver la playlist cible par son nom — Bertrand, 13/10/2026 : partout où
 * l'on ajoute une piste (ou un album) à une playlist, un champ de recherche
 * plutôt que de faire défiler toute la liste.
 *
 * Le filtre ignore la casse et les accents (« Été » se trouve en tapant
 * « ete »), et cherche le texte n'importe où dans le nom. Une requête vide
 * garde toute la liste, dans son ordre.
 */

/** Le nom ramené à sa forme de comparaison : minuscules, sans accents ni espaces superflus. */
export function normaliserNom(s: string | null | undefined): string {
  return (s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** Les éléments dont le nom contient la requête, dans l'ordre reçu. */
export function filtrerParNom<T>(items: readonly T[], requete: string, nom: (x: T) => string | null | undefined): T[] {
  const q = normaliserNom(requete);
  if (!q) return [...items];
  return items.filter((x) => normaliserNom(nom(x)).includes(q));
}

/**
 * Ce que fait Entrée dans le champ :
 *  - une seule correspondance : la choisir ;
 *  - aucune, et du texte tapé : créer une playlist de ce nom ;
 *  - sinon rien (plusieurs, ou champ vide).
 */
export type ActionEntree<T> = { type: 'choisir'; cible: T } | { type: 'creer'; nom: string } | { type: 'rien' };

export function actionEntree<T>(correspondances: readonly T[], requete: string): ActionEntree<T> {
  const nom = requete.trim();
  if (!nom) return { type: 'rien' };
  if (correspondances.length === 1) return { type: 'choisir', cible: correspondances[0] };
  if (correspondances.length === 0) return { type: 'creer', nom };
  return { type: 'rien' };
}

/** Le nom à préremplir dans « Nouvelle playlist » : le texte tapé, quand rien ne lui correspond. */
export function nomPrerempli(correspondances: number, requete: string): string {
  return correspondances === 0 ? requete.trim() : '';
}
