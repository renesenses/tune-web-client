/**
 * tune-server-rust#7128 — poser (ou retirer) une étiquette sur TOUT le
 * résultat filtré d'Oxygen, en un geste (Rob Sykes, fil 2465 : « Genre = Jazz
 * ET Genre = Vocal », puis le tag « Vocal Jazz » sur tout ce qui reste).
 *
 * Le navigateur n'envoie AUCUNE liste d'identifiants : Oxygen ne charge
 * qu'une fenêtre du résultat, et le serveur désigne lui-même l'ensemble à
 * partir des MÊMES paramètres de facette que `GET /library/tracks`
 * (`appendFacetParam`, clés répétées, `all_of`). Il refuse un filtre vide
 * (`400 empty_filter`) et un résultat au-delà de son plafond
 * (`422 too_many_items`).
 *
 * Un serveur d'avant #7128 ne connaît pas la route (404) : `etiquetageParFiltreDisponible`
 * le détecte une fois, et l'écran ne montre alors pas le bouton.
 */
import { BASE, appendFacetParam, fetchJSON, type FacetParam } from './api';

export type CibleEtiquetage = 'track' | 'album';

export interface ApercuEtiquetage {
  item_type: CibleEtiquetage;
  count: number;
  limit: number;
  over_limit: boolean;
}

export interface BilanEtiquetage {
  tag_id: number;
  item_type: CibleEtiquetage;
  removed: boolean;
  /** Objets désignés par le filtre. */
  matched: number;
  /** Lignes réellement posées (ou retirées) : 0 quand on relance la pose. */
  changed: number;
}

/** La chaîne de requête des filtres — exactement celle de `getFilteredTracks`. */
export function parametresDuFiltre(filtres: Record<string, FacetParam | undefined>): URLSearchParams {
  const p = new URLSearchParams();
  for (const [cle, valeur] of Object.entries(filtres)) appendFacetParam(p, cle, valeur);
  return p;
}

/** Un filtre est « actif » s'il porte au moins une valeur hors `all_of`
 *  (l'opérateur seul ne filtre rien). Même règle que le refus du serveur. */
export function filtreActif(filtres: Record<string, FacetParam | undefined>): boolean {
  const p = parametresDuFiltre(filtres);
  for (const cle of p.keys()) if (cle !== 'all_of') return true;
  return false;
}

export function apercuEtiquetage(
  cible: CibleEtiquetage,
  filtres: Record<string, FacetParam | undefined>,
): Promise<ApercuEtiquetage> {
  const p = parametresDuFiltre(filtres);
  p.set('item_type', cible);
  return fetchJSON<ApercuEtiquetage>(`${BASE}/library/tag-by-filter/preview?${p}`, undefined, undefined, true);
}

export function etiqueterParFiltre(
  tagId: number,
  cible: CibleEtiquetage,
  filtres: Record<string, FacetParam | undefined>,
  retirer = false,
): Promise<BilanEtiquetage> {
  const p = parametresDuFiltre(filtres);
  return fetchJSON<BilanEtiquetage>(`${BASE}/library/tag-by-filter?${p}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tag_id: tagId, item_type: cible, remove: retirer }),
  });
}

let sonde: Promise<boolean> | null = null;

/**
 * Le serveur sait-il étiqueter par filtre ? Sondé UNE fois : un aperçu SANS
 * filtre doit être refusé par `400 empty_filter`. Un 404 (serveur d'avant), du
 * HTML (repli de l'application) ou toute autre réponse : non.
 */
export function etiquetageParFiltreDisponible(): Promise<boolean> {
  if (!sonde) {
    sonde = fetchJSON<unknown>(`${BASE}/library/tag-by-filter/preview?item_type=track`, undefined, undefined, true)
      .then(() => false)
      .catch((e: { status?: number; code?: string }) => e?.status === 400 && e?.code === 'empty_filter');
  }
  return sonde;
}

/** Pour les tests : oublier la sonde. */
export function oublierLaSonde(): void {
  sonde = null;
}
