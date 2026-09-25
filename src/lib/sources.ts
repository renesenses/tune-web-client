/**
 * Sources physiques et locales — renesenses/tune-server-rust#5065, étape 2.
 *
 * Contrat du registre commun du serveur (étape 1) :
 *
 *   GET  /api/v1/sources → [{ id, type, greffon, nom, etat, detail }]
 *        type ∈ "cd" | "entree" | "virtuelle" | "hdmi"
 *        etat ∈ "disque" | "vide" | "signal" | "silence"
 *             | "autorisation_refusee" | "non_pris_en_charge" | "indisponible"
 *   Bus  `sources.changed` → la liste COMPLÈTE, à chaque apparition,
 *        disparition ou changement d'état.
 *   POST /api/v1/sources/{id}/jouer { zone_id, piste? } → délégué au greffon.
 *
 * Seules les sources réellement présentes sur la machine du serveur sont
 * listées : une liste vide veut dire « rien à montrer ». Un serveur antérieur
 * ne connaît pas `/sources` (404) : c'est aussi une liste vide, sans bandeau.
 *
 * Tous les appels passent `sansBandeau` : l'écran porte ses erreurs.
 */
import { writable, derived } from 'svelte/store';
import { BASE, fetchJSON, type ApiError } from './api';
import type { WSEvent } from './types';

export type TypeSource = 'cd' | 'entree' | 'virtuelle' | 'hdmi';
export type EtatSource =
  | 'disque' | 'vide' | 'signal' | 'silence'
  | 'autorisation_refusee' | 'non_pris_en_charge' | 'indisponible';

export interface DetailSource {
  album?: string | null;
  artiste?: string | null;
  pistes?: number | null;
  pochette?: string | null;
  frequence?: number | null;
  canaux?: number | null;
  niveau_db?: number | null;
  virtuelle?: boolean;
  [cle: string]: unknown;
}

export interface Source {
  id: string;
  type: TypeSource;
  greffon: string;
  nom: string;
  etat: EtatSource;
  detail?: DetailSource | null;
}

/**
 * `null` tant que le serveur n'a pas répondu ; `[]` s'il n'a aucune source —
 * ou ne connaît pas la route. Dans les deux derniers cas la rubrique se tait.
 */
export const sources = writable<Source[] | null>(null);

/** La source dont la page est ouverte (vue `source`). */
export const sourceCourante = writable<string | null>(null);

/** La rubrique n'existe que s'il y a au moins une source. */
export const rubriqueSourcesVisible = derived(sources, ($s) => ($s?.length ?? 0) > 0);

const TYPES: ReadonlySet<string> = new Set(['cd', 'entree', 'virtuelle', 'hdmi']);

/** Garde ce qui ressemble à une source ; un élément malformé est ignoré. */
export function normaliserSources(brut: unknown): Source[] {
  const liste = Array.isArray(brut)
    ? brut
    : Array.isArray((brut as { sources?: unknown } | null)?.sources)
      ? (brut as { sources: unknown[] }).sources
      : null;
  if (!liste) return [];
  return liste.filter(
    (s): s is Source =>
      !!s && typeof (s as Source).id === 'string' && TYPES.has((s as Source).type),
  );
}

export function getSources(): Promise<Source[]> {
  return fetchJSON<unknown>(`${BASE}/sources`, undefined, undefined, true).then(normaliserSources);
}

/**
 * Relit la liste. 404 (serveur antérieur) → liste vide, rubrique masquée.
 * Autre panne : on garde ce qu'on savait, le bus ou la reconnexion suivront.
 */
export async function rafraichirSources(lire: () => Promise<Source[]> = getSources): Promise<void> {
  try {
    sources.set(await lire());
  } catch (e) {
    if ((e as ApiError | null)?.status === 404) sources.set([]);
  }
}

/**
 * Le direct : `sources.changed` porte la liste complète (tableau, ou
 * `{ sources: [...] }`). Une reconnexion du flux relit la route, puisque des
 * événements ont pu se perdre pendant la coupure.
 */
export function appliquerEvenementSources(ev: WSEvent, relire: () => void = () => { void rafraichirSources(); }): void {
  if (ev?.type === 'sources.changed') sources.set(normaliserSources(ev.data));
  else if (ev?.type === '_connected') relire();
}

/** Abonne le bus ; rend la fonction de désabonnement. */
export function abonnerSources(onEvent: (h: (ev: WSEvent) => void) => () => void): () => void {
  return onEvent((ev) => appliquerEvenementSources(ev));
}

/** Lance l'écoute de la source sur la zone (CD : disque ou `piste`). */
export function jouerSource(id: string, zoneId: number, piste?: number): Promise<unknown> {
  const corps: { zone_id: number; piste?: number } = { zone_id: zoneId };
  if (piste != null) corps.piste = piste;
  return fetchJSON<unknown>(
    `${BASE}/sources/${encodeURIComponent(id)}/jouer`,
    { method: 'POST', body: JSON.stringify(corps) },
    undefined,
    true,
  );
}

// ─── Aides pures ────────────────────────────────────────────────────────────

/** Les virtuelles à part : elles se replient sous « Entrées virtuelles ». */
export function partagerSources(liste: Source[]): { principales: Source[]; virtuelles: Source[] } {
  const principales: Source[] = [];
  const virtuelles: Source[] = [];
  for (const s of liste) (estVirtuelle(s) ? virtuelles : principales).push(s);
  return { principales, virtuelles };
}

export function estVirtuelle(s: Source): boolean {
  return s.type === 'virtuelle' || s.detail?.virtuelle === true;
}

/** Le nom montré : l'album pour un CD, sinon le nom déclaré par le greffon. */
export function nomSource(s: Source): string {
  if (s.type === 'cd') {
    const album = typeof s.detail?.album === 'string' ? s.detail.album.trim() : '';
    if (album) return album;
  }
  return s.nom;
}

/** Une entrée n'est écoutable que si le greffon peut l'ouvrir. */
export function sourceEcoutable(s: Source): boolean {
  return s.etat !== 'autorisation_refusee' && s.etat !== 'non_pris_en_charge' && s.etat !== 'indisponible';
}

/** `48 kHz`, `44.1 kHz` ; `null` sans fréquence. */
export function frequenceSource(hz: number | null | undefined): string | null {
  if (typeof hz !== 'number' || !Number.isFinite(hz) || hz <= 0) return null;
  const k = Math.round(hz / 100) / 10;
  return `${k} kHz`;
}

/** Plancher de l'indicateur de niveau : en dessous, la barre est vide. */
export const NIVEAU_PLANCHER_DB = -60;

/** Remplissage de l'indicateur, de 0 à 100 ; `null` sans mesure. */
export function remplissageNiveau(db: number | null | undefined): number | null {
  if (typeof db !== 'number' || !Number.isFinite(db)) return null;
  const p = ((db - NIVEAU_PLANCHER_DB) / -NIVEAU_PLANCHER_DB) * 100;
  return Math.max(0, Math.min(100, Math.round(p)));
}

/** Tracé d'icône par type (même grille 24 × 24 que la barre). */
export const ICONES_SOURCE: Record<TypeSource, string> = {
  cd: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18M12 9.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5',
  entree: 'M12 3a3 3 0 0 0-3 3v5a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3M5 11a7 7 0 0 0 14 0M12 18v3',
  virtuelle: 'M12 3l9 5-9 5-9-5zM3 13l9 5 9-5',
  hdmi: 'M3 8h18v5l-3 3H6l-3-3zM7 11h10',
};
