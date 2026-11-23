/**
 * L'ARTISTE DE LA BIBLIOTHÈQUE EST-IL BIEN CELUI DE LA FICHE DE SERVICE ?
 * Fil 3009 (FabienM), points 7 et 16 — relecture du 23/11.
 *
 * La fiche d'un artiste de service résout l'artiste du MÊME nom dans la
 * bibliothèque (#1356). Le nom ne suffit pas à prêter à la fiche Qobuz ce qui
 * DÉCRIT l'artiste local — son pays, ses membres, ses crédits, ses liens :
 * deux groupes « Moonchild » (tune-server-rust#9071, #8478) porteraient le
 * drapeau et les liens ProgArchives l'un de l'autre.
 *
 * L'identité n'est donc retenue que si elle est CONFIRMÉE :
 *  - un seul artiste de la bibliothèque porte exactement ce nom (replié) ;
 *  - ses albums partagent avec la discographie du service des titres qui
 *    PROUVENT quelque chose (clé d'édition) : ni l'album éponyme (deux
 *    « Moonchild » ont chacun leur « Moonchild », #9071), ni un titre
 *    générique (« Greatest Hits », « Live », « II »…), ni un titre de trois
 *    caractères ou moins ;
 *  - AU MOINS DEUX titres probants en commun, ou UN SEUL si l'artiste local
 *    n'a qu'un album (et que ce titre est probant).
 * Au moindre doute, rien : pas de drapeau, pas de membres, pas de crédits.
 */
import { cleEdition } from './discographieCommune';

/** Des titres que deux artistes sans rapport portent couramment (clés repliées). */
const TITRES_GENERIQUES = new Set([
  'greatest hits', 'the greatest hits', 'best of', 'the best of', 'the very best of', 'very best of',
  'hits', 'the hits', 'live', 'live in concert', 'in concert', 'unplugged', 'demo', 'demos', 'the demos',
  'untitled', 'untitled album', 'self titled', 'debut', 'the album', 'album', 'ep', 'the ep',
  'singles', 'the singles', 'collection', 'the collection', 'anthology', 'the anthology',
  'essential', 'the essential', 'essentials', 'gold', 'platinum', 'remixes', 'the remixes',
  'christmas', 'love songs', 'instrumentals', 'acoustic', 'rarities', 'b sides', 'compilation',
  'i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii', 'viii', 'ix', 'x',
]);

/** Le titre prouve-t-il quelque chose sur l'identité de l'artiste ? */
export function titreProbant(cle: string, cleNom: string): boolean {
  return cle.length > 3 && cle !== cleNom && !TITRES_GENERIQUES.has(cle);
}

export function homonymeLocalConfirme(
  artistesTrouves: readonly { id?: number | null; name?: string | null }[] | null | undefined,
  nom: string,
  titresLocaux: readonly (string | null | undefined)[],
  titresDuService: readonly (string | null | undefined)[],
): number | null {
  const cible = cleEdition(nom);
  if (!cible) return null;
  const exacts = (artistesTrouves ?? []).filter((a) => a?.id != null && cleEdition(a.name) === cible);
  const ids = [...new Set(exacts.map((a) => a.id as number))];
  if (ids.length !== 1) return null;
  const locaux = new Set(titresLocaux.map(cleEdition).filter(Boolean));
  const service = new Set(titresDuService.map(cleEdition).filter(Boolean));
  const communs = [...locaux].filter((k) => service.has(k) && titreProbant(k, cible));
  if (communs.length >= 2) return ids[0];
  if (communs.length === 1 && locaux.size === 1) return ids[0];
  return null;
}
