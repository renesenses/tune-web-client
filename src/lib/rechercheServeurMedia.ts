import type { MediaServerBrowseResult } from './types';

/** Replie une chaîne pour la comparaison : sans accents, en minuscules.
 *
 *  La bibliothèque locale cherche déjà comme ça (`unaccent` + `LOWER` côté
 *  base). Le repli du navigateur doit dire la même chose, sinon le même texte
 *  trouverait un album ici et pas là. */
export function replier(v: string): string {
  return v
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
}

/** Le repli quand le serveur distant ne sait pas chercher.
 *
 *  On filtre CE QUI EST DÉJÀ À L'ÉCRAN — le dossier courant, rien de plus. La
 *  vue le dit à l'utilisateur : sans ça, une liste courte se lirait comme le
 *  résultat d'une recherche complète, alors qu'elle ne couvre qu'un dossier.
 *
 *  Les pistes se comparent sur le titre ET l'artiste : dans un dossier
 *  d'album, chercher un interprète est le geste naturel. */
export function filtrerLocalement(
  resultat: MediaServerBrowseResult,
  requete: string
): MediaServerBrowseResult {
  const q = replier(requete.trim());
  if (!q) return resultat;
  return {
    ...resultat,
    containers: resultat.containers.filter((c) => replier(c.title).includes(q)),
    items: resultat.items.filter(
      (i) => replier(i.title).includes(q) || replier(i.artist ?? '').includes(q)
    ),
  };
}
