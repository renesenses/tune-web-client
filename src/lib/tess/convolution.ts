/**
 * TESS W3 — le jeu de filtres de la convolution (maquette A1).
 *
 * Le serveur (T09a, import ; T08, routes) lit une RI `.wav`, un `.zip` de RI
 * ou un `.zip` de `.cfg` Convolver avec leurs RI, et rend un RAPPORT PAR
 * FICHIER : cadence, canaux, statut. Ce module ne fait que le lire et le dire.
 *
 * ⚠️ Routes supposées tant que T08/T09a ne les ont pas publiées :
 *   - `GET  /zones/{id}/tess/convolution` → `RapportFiltres` (404 : pas de rapport) ;
 *   - `POST /zones/{id}/tess/convolution` (multipart, champ `file`) → `RapportFiltres`
 *     ou refus `{ status, code, detail }` (400, 402, 413, 415, 422).
 * Un code de refus inconnu ici s'affiche par une phrase générique et le
 * `detail` du serveur : jamais un code brut, jamais un écran vide.
 */
import { BASE, fetchJSON } from '../api';
import { remplir, type Traduire } from './libelles';
import { estRefusTess, type RefusTess } from './contrat';

export type StatutFiltre = 'in_use' | 'available' | 'rejected' | 'unknown';

export interface FiltreConvolution {
  file: string;
  sample_rate_hz: number | null;
  channels: number | null;
  status: StatutFiltre;
  /** `in_use` : la RI correspond-elle à la cadence de la source ? `false` = rééchantillonnée. */
  matches_source: boolean | null;
  detail: string | null;
}

export interface RapportFiltres {
  filter_set: string;
  filters: FiltreConvolution[];
}

const objet = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

export function normaliserRapport(v: unknown): RapportFiltres | null {
  if (!objet(v) || typeof v.filter_set !== 'string' || !Array.isArray(v.filters)) return null;
  return {
    filter_set: v.filter_set,
    filters: v.filters.filter(objet).map((f) => ({
      file: typeof f.file === 'string' ? f.file : '?',
      sample_rate_hz: num(f.sample_rate_hz),
      channels: num(f.channels),
      status: f.status === 'in_use' || f.status === 'available' || f.status === 'rejected' ? f.status : 'unknown',
      matches_source: typeof f.matches_source === 'boolean' ? f.matches_source : null,
      detail: typeof f.detail === 'string' ? f.detail : null,
    })),
  };
}

/** Les refus de l'import (T09a), un par piège, traduits. */
const REFUS_IMPORT: Record<string, string> = {
  zip_path_traversal: 'tess.convolution.refus.pathTraversal',
  zip_absolute_path: 'tess.convolution.refus.pathTraversal',
  zip_link: 'tess.convolution.refus.link',
  zip_bomb: 'tess.convolution.refus.bomb',
  zip_too_large: 'tess.convolution.refus.tooLarge',
  file_too_large: 'tess.convolution.refus.tooLarge',
  zip_too_many_files: 'tess.convolution.refus.tooManyFiles',
  zip_invalid: 'tess.convolution.refus.invalidZip',
  wav_invalid: 'tess.convolution.refus.invalidWav',
  unsupported_format: 'tess.convolution.refus.unsupported',
  no_impulse_response: 'tess.convolution.refus.noFilter',
  cfg_invalid: 'tess.convolution.refus.invalidCfg',
  cfg_missing_ir: 'tess.convolution.refus.cfgMissingIr',
  premium_required: 'tess.reason.premiumRequired',
};

/** La phrase d'un refus d'import. `null` pour le détail quand la phrase suffit. */
export function messageRefusImport(refus: RefusTess, tr: Traduire): { message: string; detail: string | null } {
  const cle = REFUS_IMPORT[refus.code] ?? (refus.status === 413 ? REFUS_IMPORT.zip_too_large : undefined);
  if (cle) return { message: tr(cle), detail: null };
  return { message: tr('tess.convolution.refus.generic'), detail: refus.detail?.trim() ? refus.detail : null };
}

export async function lireJeuDeFiltres(zoneId: number): Promise<RapportFiltres | null> {
  let statut = 0;
  try {
    const r = await fetchJSON<unknown>(`${BASE}/zones/${zoneId}/tess/convolution`, undefined,
      (s) => { statut = s; return s === 404 || s === 405; }, true);
    return statut ? null : normaliserRapport(r);
  } catch {
    return null;
  }
}

export type ResultatImport = { ok: true; rapport: RapportFiltres } | { ok: false; refus: RefusTess };

export async function importerJeuDeFiltres(zoneId: number, fichier: File): Promise<ResultatImport> {
  const corps = new FormData();
  corps.append('file', fichier, fichier.name);
  let statut = 0;
  let r: unknown;
  try {
    r = await fetchJSON<unknown>(`${BASE}/zones/${zoneId}/tess/convolution`, { method: 'POST', body: corps },
      (s) => { statut = s; return s >= 400 && s < 500; }, true);
  } catch {
    // Un 413 d'un mandataire (nginx) arrive en HTML : statut connu, corps illisible.
    return { ok: false, refus: { status: statut, code: statut ? 'unknown' : 'network', detail: '', plugin_id: null } };
  }
  if (statut) {
    return { ok: false, refus: estRefusTess(r) ? r : { status: statut, code: 'unknown', detail: '', plugin_id: null } };
  }
  const rapport = normaliserRapport(r);
  return rapport ? { ok: true, rapport } : { ok: false, refus: { status: 0, code: 'invalid_response', detail: '', plugin_id: null } };
}

/** Extensions acceptées par le sélecteur de fichier (A1 : « Accepted: … »). */
export const FORMATS_ACCEPTES = '.wav,.zip';

/** Le fichier choisi a-t-il une extension acceptée ? Le refus local évite un
 *  aller-retour, le serveur reste juge. */
export function extensionAcceptee(nom: string): boolean {
  return /\.(wav|zip)$/i.test(nom);
}

/** Canaux d'une RI : « Mono », « Stereo », « 6 channels ». */
export function libelleCanaux(n: number, tr: Traduire): string {
  if (n === 1) return tr('tess.value.mono');
  if (n === 2) return tr('tess.value.stereo');
  return remplir(tr('tess.value.channels'), { n });
}
