/**
 * Les achats Bandcamp en FLAC — la logique de l'écran, sans l'écran.
 *
 * Yves, 16/09/2026 : « sur Bandcamp, les albums achetés ne sont pas joués à
 * la résolution d'achat mais en mp3/128 ». Bandcamp ne DIFFUSE pas de
 * lossless : il le LIVRE, en fichiers, derrière le cookie de session
 * `identity`. Le greffon serveur (`tune-bandcamp`, `achats.rs`) fait la
 * descente ; cet écran pose la session, propose le bouton par achat, suit les
 * téléchargements et confie le dossier obtenu à l'assistant d'import.
 *
 * Trois règles tenues ici, testables sans DOM :
 *
 *   1. le bouton « FLAC » n'apparaît que sur un achat `downloadable` — donc
 *      seulement avec une session valide : sans elle, Bandcamp ne rend pas de
 *      page de téléchargement, et un bouton qui échoue à coup sûr est pire
 *      qu'aucun bouton ;
 *   2. la bannière ne dit qu'UNE chose à la fois : pas de session → comment
 *      la poser ; session posée mais aucun téléchargement offert → elle est
 *      périmée ; sinon rien ;
 *   3. un téléchargement terminé porte le dossier à importer ; c'est l'étape
 *      suivante, et c'est à l'assistant d'import de la faire.
 */
import type { BandcampItem, BandcampTelechargement } from './api';
import { bandcampTelechargementEnCours } from './api/bandcampAchats';

/** Ce que la bannière de session doit dire. */
export type EtatSession = 'aucune' | 'perimee' | 'valide';

export function etatSession(session: boolean, downloadsAvailable: boolean, collectionVide: boolean): EtatSession {
  if (!session) return 'aucune';
  // Une collection vide n'offre rien à télécharger : ce n'est pas la session
  // qui est en cause, on ne l'accuse pas.
  if (!downloadsAvailable && !collectionVide) return 'perimee';
  return 'valide';
}

/** Le bouton par achat : la clé à envoyer, ou `null` s'il n'y a pas à l'offrir. */
export function cleTelechargeable(it: Pick<BandcampItem, 'sale_item' | 'downloadable'>): string | null {
  return it.downloadable && it.sale_item ? it.sale_item : null;
}

/** Le téléchargement qui concerne un achat, s'il y en a un. */
export function telechargementDe(
  liste: readonly BandcampTelechargement[],
  saleItem: string | null,
): BandcampTelechargement | null {
  if (!saleItem) return null;
  return liste.find((t) => t.sale_item === saleItem) ?? null;
}

/** Faut-il continuer à interroger le serveur ? Tant qu'un seul avance. */
export function fautSuivre(liste: readonly BandcampTelechargement[]): boolean {
  return liste.some((t) => bandcampTelechargementEnCours(t));
}

/** Les téléchargements finis, prêts pour l'import — les plus récents d'abord
 *  tel que le serveur les rend (clé d'achat). */
export function pretsALImport(liste: readonly BandcampTelechargement[]): (BandcampTelechargement & { state: 'termine' })[] {
  return liste.filter((t): t is BandcampTelechargement & { state: 'termine' } => t.state === 'termine');
}

/** Un volume lisible, en Mo, pour la progression. */
export function enMo(octets: number): string {
  return `${(octets / 1_048_576).toFixed(octets < 10 * 1_048_576 ? 1 : 0)} Mo`;
}

/**
 * « Ma collection » n'a pas chargé : faut-il proposer de RELIER le compte ?
 *
 * FabienM, fil 1606 (#2778) : « quand je quitte le menu Bandcamp et quand je
 * reviens mon compte n'est plus actif, je suis obligé de ressaisir mon
 * identifiant ». Le compte, lui, est gardé en base par le greffon
 * (`compte_lie`) : le serveur ne répond `428` QUE s'il n'en trouve aucun.
 *
 * L'écran, lui, concluait aussi « compte à relier » sur tout message qui
 * contenait « lié » ou « link ». Or l'échec d'une page de collection est un
 * `502` dont le message recopie la réponse de Bandcamp (`passerelle_en_echec`,
 * « HTTP 403 Forbidden: <!DOCTYPE html>… ») : une page HTML porte presque
 * toujours une balise `<link …>`. Un refus passager de Bandcamp faisait donc
 * réapparaître le formulaire de liaison, alors que le compte était toujours
 * relié — et ressaisir le nom « réparait » ce qui n'était pas cassé.
 *
 * Seul le statut décide : `428`, et rien d'autre.
 */
export function compteBandcampARelier(e: unknown): boolean {
  return (e as { status?: unknown } | null | undefined)?.status === 428;
}
