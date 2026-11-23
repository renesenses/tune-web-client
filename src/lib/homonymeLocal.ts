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
 *  - ses albums partagent au moins un titre (clé d'édition) avec la
 *    discographie que le service rend pour la fiche — le recoupement de #8478.
 * Au moindre doute, rien : pas de drapeau, pas de membres, pas de crédits.
 */
import { cleEdition } from './discographieCommune';

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
  const service = new Set(titresDuService.map(cleEdition).filter(Boolean));
  const recoupe = titresLocaux.some((t) => { const k = cleEdition(t); return !!k && service.has(k); });
  return recoupe ? ids[0] : null;
}
