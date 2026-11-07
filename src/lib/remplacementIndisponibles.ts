/**
 * tune-server-rust#8066 — « Remplacer l'indisponible » et « Réparer la
 * playlist » (forum, fil 2691, 07/11/2026).
 *
 * Un service retire un album puis le republie sous un nouvel identifiant : la
 * playlist garde le titre disparu, grisé « Indisponible ». Le serveur cherche
 * le même titre sur le même service (titre et artiste identiques, album
 * proche, durée à ±2 s) et note chaque candidat. S'il n'y a qu'UN candidat sûr
 * (score ≥ seuil, 0,9), il remplace directement ; sinon l'écran fait choisir.
 *
 * L'indisponibilité est celle que la liste affiche déjà : `pisteIndisponible`
 * (`disponible === false`). Pas de seconde définition ici.
 *
 * Routes :
 *  - playlist Tune : `/playlists/{id}/tracks/{entry_id}/replacements|replace`
 *    et `/playlists/{id}/repair` ;
 *  - playlist du service : `/streaming/{service}/playlists/{id}/tracks/{rang}/
 *    replacements|replace` (avec `track_id`, le titre vu à ce rang) et
 *    `/streaming/{service}/playlists/{id}/repair`. Refus `403
 *    playlist_non_modifiable` si la playlist n'est pas à l'utilisateur.
 */
import { BASE, fetchJSON } from './api';
import { pisteIndisponible } from './albumAParaitre';

/** Un titre de remplacement proposé (une piste de service + son score). */
export interface CandidatRemplacement {
  source: string;
  source_id: string;
  title: string;
  artist_name?: string | null;
  album_title?: string | null;
  duration_ms?: number | null;
  cover_path?: string | null;
  score: number;
  sure: boolean;
}

export type Decision = 'direct' | 'choix' | 'aucun';

/** Ce que rend `replace` : fait, choix requis, ou aucun candidat. */
export type IssueRemplacement =
  | { etat: 'remplace'; track?: any }
  | { etat: 'choix'; candidats: CandidatRemplacement[] }
  | { etat: 'aucun' }
  | { etat: 'refus'; message: string };

/** Le rapport de « Réparer la playlist ». */
export interface RapportReparation {
  threshold: number;
  examined: number;
  replaced: Array<Record<string, any>>;
  to_choose: Array<Record<string, any> & { candidates: CandidatRemplacement[] }>;
  no_candidate: Array<Record<string, any>>;
  errors: Array<Record<string, any>>;
}

/** Où vit la playlist. */
export type CiblePlaylist =
  | { kind: 'local'; playlistId: number }
  | { kind: 'streaming'; service: string; playlistId: string };

/**
 * Le titre se remplace-t-il ? Indisponible, de service, dans une playlist que
 * l'utilisateur peut modifier. Une piste locale n'a pas de « nouvelle
 * référence » chez un service.
 */
export function peutRemplacer(piste: any, modifiable: boolean): boolean {
  if (!modifiable || !pisteIndisponible(piste)) return false;
  const source = piste?.source;
  return typeof source === 'string' && source !== '' && source !== 'local' && piste?.source_id != null;
}

/** La playlist a-t-elle au moins un titre à réparer ? */
export function aDesIndisponibles(pistes: any[], modifiable: boolean): boolean {
  return (pistes ?? []).some((p) => peutRemplacer(p, modifiable));
}

/** Le score en pour cent, entier. */
export function pourcent(score: number): number {
  return Math.round(Math.max(0, Math.min(1, Number(score) || 0)) * 100);
}

function racine(cible: CiblePlaylist): string {
  return cible.kind === 'local'
    ? `${BASE}/playlists/${cible.playlistId}`
    : `${BASE}/streaming/${encodeURIComponent(cible.service)}/playlists/${encodeURIComponent(cible.playlistId)}`;
}

/** La désignation de la ligne : `entry_id` (Tune) ou le rang (service). */
function ligne(cible: CiblePlaylist, piste: any, rang: number): string {
  return cible.kind === 'local' ? String(piste?.entry_id) : String(rang);
}

export function lireCandidats(cible: CiblePlaylist, piste: any, rang: number) {
  return fetchJSON<{ decision: Decision; threshold: number; candidates: CandidatRemplacement[] }>(
    `${racine(cible)}/tracks/${ligne(cible, piste, rang)}/replacements`,
  );
}

/**
 * Remplace le titre : par `sourceId` s'il est donné, sinon par le seul
 * candidat sûr. Les refus documentés (choix requis, aucun candidat, playlist
 * non modifiable) reviennent en ISSUE, pas en exception.
 */
export async function remplacer(
  cible: CiblePlaylist,
  piste: any,
  rang: number,
  sourceId?: string,
): Promise<IssueRemplacement> {
  const corps: Record<string, unknown> = {};
  if (sourceId) corps.source_id = sourceId;
  if (cible.kind === 'streaming') corps.track_id = String(piste?.source_id ?? '');
  const r = await fetchJSON<any>(
    `${racine(cible)}/tracks/${ligne(cible, piste, rang)}/replace`,
    { method: 'POST', body: JSON.stringify(corps) },
    (s) => s === 403 || s === 404 || s === 409,
  );
  return issueDe(r);
}

/** Lit la réponse de `replace` (exportée pour les essais). */
export function issueDe(r: any): IssueRemplacement {
  if (r?.replaced === true) return { etat: 'remplace', track: r.track };
  if (r?.code === 'choix_requis') return { etat: 'choix', candidats: r.candidates ?? [] };
  if (r?.code === 'aucun_candidat') return { etat: 'aucun' };
  return { etat: 'refus', message: String(r?.error ?? '') };
}

export async function reparer(cible: CiblePlaylist): Promise<RapportReparation | { refus: string }> {
  const r = await fetchJSON<any>(`${racine(cible)}/repair`, { method: 'POST' }, (s) => s === 403);
  if (r?.code === 'playlist_non_modifiable') return { refus: String(r.error ?? '') };
  return r as RapportReparation;
}
