/**
 * tune-server-rust#7539 — modifier UN champ de métadonnées (genre, année,
 * label, artiste d'album, compositeur) sur TOUT le résultat filtré d'Oxygen.
 *
 * Même désignation que l'étiquetage par filtre (#7128) : le navigateur
 * n'envoie que les FILTRES, le serveur désigne l'ensemble. Le geste passe
 * toujours par l'aperçu (`GET …/edit-by-filter/preview`), et la confirmation
 * renvoie les comptes vus (`expected_tracks`, `expected_albums`) : si la
 * sélection a changé entre-temps, le serveur refuse (`409 preview_changed`)
 * sans rien écrire.
 */
import { BASE, fetchJSON, type FacetParam } from './api';
import { parametresDuFiltre, type CibleEtiquetage } from './etiquetageParFiltre';

export type ChampEdition = 'genre' | 'year' | 'label' | 'album_artist' | 'composer';

export const CHAMPS_EDITION: ChampEdition[] = ['genre', 'year', 'label', 'album_artist', 'composer'];

export interface ExempleEdition {
  id: number;
  title: string;
  context: string | null;
  before: string | null;
  after: string;
}

export interface ApercuEdition {
  item_type: CibleEtiquetage;
  field: ChampEdition;
  value: string;
  tracks?: number;
  albums?: number;
  unchanged?: number;
  remote_skipped?: number;
  remote_albums_skipped?: number;
  limit: number;
  over_limit: boolean;
  /** Présent quand `over_limit` : le nombre de pistes du périmètre. */
  count?: number;
  file_writes_enabled: boolean;
  files?: number;
  files_cue_skipped?: number;
  track_examples?: ExempleEdition[];
  album_examples?: ExempleEdition[];
}

export interface BilanEdition extends ApercuEdition {
  status: 'ok';
  files_task_id: string | null;
  files_pass_refused?: boolean;
}

export interface StatutFichiers {
  status: 'idle' | 'running' | 'done' | 'cancelled' | 'stopped';
  task_id?: string;
  written?: number;
  skipped?: number;
  errors?: number;
  processed?: number;
  total?: number;
}

/** Année : exactement quatre chiffres (règle du serveur). */
export function anneeValide(v: string): boolean {
  return /^\d{4}$/.test(v.trim()) && Number(v.trim()) >= 1000;
}

/** La valeur est-elle envoyable pour ce champ ? (le serveur revalide) */
export function valeurValide(champ: ChampEdition, v: string): boolean {
  const t = v.trim();
  if (!t) return false;
  if (champ === 'year') return anneeValide(t);
  return t.length <= 200;
}

/** L'artiste d'album se pose toujours sur les albums. */
export function cibleEffective(champ: ChampEdition, cible: CibleEtiquetage): CibleEtiquetage {
  return champ === 'album_artist' ? 'album' : cible;
}

export function apercuEdition(
  cible: CibleEtiquetage,
  champ: ChampEdition,
  valeur: string,
  filtres: Record<string, FacetParam | undefined>,
): Promise<ApercuEdition> {
  const p = parametresDuFiltre(filtres);
  p.set('item_type', cible);
  p.set('field', champ);
  p.set('value', valeur.trim());
  return fetchJSON<ApercuEdition>(`${BASE}/library/edit-by-filter/preview?${p}`, undefined, undefined, true);
}

export function editerParFiltre(
  apercu: ApercuEdition,
  cible: CibleEtiquetage,
  filtres: Record<string, FacetParam | undefined>,
): Promise<BilanEdition> {
  const p = parametresDuFiltre(filtres);
  return fetchJSON<BilanEdition>(`${BASE}/library/edit-by-filter?${p}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      item_type: cible,
      field: apercu.field,
      value: apercu.value,
      expected_tracks: apercu.tracks ?? 0,
      expected_albums: apercu.albums ?? 0,
    }),
  }, undefined, true);
}

export function statutFichiers(): Promise<StatutFichiers> {
  return fetchJSON<StatutFichiers>(`${BASE}/library/edit-by-filter/files/status`, undefined, undefined, true);
}

export function arreterFichiers(): Promise<{ cancelled: boolean }> {
  return fetchJSON<{ cancelled: boolean }>(`${BASE}/library/edit-by-filter/files/cancel`, { method: 'POST' }, undefined, true);
}

let sonde: Promise<boolean> | null = null;

/** Le serveur connaît-il la route ? Un aperçu SANS filtre doit rendre `400 empty_filter`. */
export function editionParFiltreDisponible(): Promise<boolean> {
  if (!sonde) {
    sonde = fetchJSON<unknown>(
      `${BASE}/library/edit-by-filter/preview?item_type=track&field=genre&value=x`, undefined, undefined, true,
    )
      .then(() => false)
      .catch((e: { status?: number; code?: string }) => e?.status === 400 && e?.code === 'empty_filter');
  }
  return sonde;
}

/** Pour les tests : oublier la sonde. */
export function oublierLaSondeEdition(): void {
  sonde = null;
}
