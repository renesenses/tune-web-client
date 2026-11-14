/**
 * La FICHE TECHNIQUE d'une piste — tune-server-rust#8160.
 *
 * `GET /library/tracks/{id}/fiche-technique` réunit, datés : le format réel,
 * le spectrogramme conservé, la plage dynamique et sa source, le faux Hi-Res,
 * l'intégrité (dernier audit), la provenance des métadonnées et la note
 * personnelle. Une section que rien ne renseigne vaut `null` : une piste de
 * service, sans fichier, n'a ni spectrogramme, ni DR, ni intégrité, et
 * l'écran ne montre AUCUNE section vide.
 *
 * `POST /library/tracks/{id}/spectrogramme` recalcule l'image sans lire le
 * cache et rend la section `spectrogramme`.
 *
 * La forme d'onde (fil du forum 2793) : `forme_d_onde` porte son état et son
 * URL (`lib/formeOnde`) ; `null` pour une piste sans fichier, ou d'un serveur
 * antérieur — l'écran tente alors la route et se replie s'il ne la trouve pas.
 */
import { BASE, fetchJSON, type ApiError } from './api';
import type { SectionFormeOnde } from './formeOnde';

export interface FormatReel {
  codec?: string;
  sample_rate?: number;
  bit_depth?: number;
  channels?: number;
  bitrate_kbps?: number;
  duration_ms?: number;
  file_size?: number;
  fichier_modifie_le?: string;
}

export type EtatSpectrogramme = 'a_jour' | 'perime' | 'absent';

export interface SectionSpectrogramme {
  etat: EtatSpectrogramme;
  url: string;
  largeur: number;
  hauteur: number;
  octets?: number;
  calcule_le?: string;
  duree_calcul_ms?: number | null;
  /** Qobuz / TIDAL (go du 13/11) : l'image se calcule par téléchargement. */
  service?: string;
}

export interface SectionDr {
  valeur: number;
  source?: string;
  algo?: string;
  mesure_le?: string;
}

export interface SectionFauxHiRes {
  verdict: string;
  raison?: string | null;
  coupure_hz?: number | null;
  bits_effectifs?: number | null;
  sample_rate?: number | null;
  bits_declares?: number | null;
  mesure_le?: string | null;
}

export interface SectionIntegrite {
  verdict: 'sain' | 'corrompu' | 'non_verifiable' | string;
  code?: string;
  erreur?: string | null;
  position_trames?: number | null;
  mode?: 'full' | 'quick' | string;
  audite_le?: string | null;
  audit_en_cours?: boolean;
  fichier_change_depuis?: boolean | null;
}

export interface SectionProvenance {
  source?: string;
  source_id?: string;
  isrc?: string;
  musicbrainz_recording_id?: string;
  balises_lues_du_fichier?: boolean;
  fichier_modifie_le?: string;
  champs_tenus?: string[];
  credits?: { source: string | null; nombre: number }[];
}

export interface FicheTechnique {
  track_id: number;
  title?: string;
  artist_name?: string | null;
  album_title?: string | null;
  source?: string;
  a_un_fichier: boolean;
  genere_le?: string;
  format: FormatReel | null;
  spectrogramme: SectionSpectrogramme | null;
  dynamic_range: SectionDr | null;
  faux_hires: SectionFauxHiRes | null;
  integrite: SectionIntegrite | null;
  provenance: SectionProvenance | null;
  note: { texte_md: string; maj_le: string } | null;
  forme_d_onde: SectionFormeOnde | null;
}

/** Ce que l'écran sait dire d'un échec de chargement. */
export type GenreErreurFiche = 'indisponible' | 'reseau';

export class ErreurFiche extends Error {
  genre: GenreErreurFiche;
  constructor(genre: GenreErreurFiche) {
    super(`fiche technique: ${genre}`);
    this.genre = genre;
  }
}

/**
 * Charge la fiche. 404 : piste inconnue, ou serveur antérieur à #8160 — même
 * phrase à l'écran (« indisponible »). Tout le reste : réseau.
 */
export async function chargerFicheTechnique(trackId: number): Promise<FicheTechnique> {
  try {
    return await fetchJSON<FicheTechnique>(
      `${BASE}/library/tracks/${trackId}/fiche-technique`, undefined, undefined, true,
    );
  } catch (e) {
    const statut = (e as ApiError)?.status;
    throw new ErreurFiche(statut === 404 || statut === 405 ? 'indisponible' : 'reseau');
  }
}

/** Recalcule le spectrogramme ; rend sa nouvelle section. */
export async function recalculerSpectrogramme(trackId: number): Promise<SectionSpectrogramme | null> {
  return fetchJSON<SectionSpectrogramme | null>(
    `${BASE}/library/tracks/${trackId}/spectrogramme`, { method: 'POST' }, undefined, true,
  );
}

/** Les sections à montrer, dans l'ordre de l'écran. Jamais une section vide. */
export type CleSection =
  | 'format' | 'spectrogramme' | 'formeDOnde' | 'dynamicRange' | 'fauxHires'
  | 'integrite' | 'provenance' | 'note';

export function sectionsVisibles(f: FicheTechnique): CleSection[] {
  const s: CleSection[] = [];
  if (f.format && Object.keys(f.format).length > 0) s.push('format');
  if (f.spectrogramme) s.push('spectrogramme');
  // Fil 2793 : la forme d'onde, pour un fichier local — et, depuis le go du
  // 13/11, pour une piste Qobuz / TIDAL, dont le serveur rend la section.
  if (f.a_un_fichier || f.forme_d_onde) s.push('formeDOnde');
  if (f.dynamic_range) s.push('dynamicRange');
  if (f.faux_hires) s.push('fauxHires');
  if (f.integrite) s.push('integrite');
  if (f.provenance && Object.keys(f.provenance).length > 0) s.push('provenance');
  // La note se crée depuis la fiche : toujours là, éditable.
  s.push('note');
  return s;
}

/** Clé i18n de la source d'un DR. */
export function cleSourceDr(source: string | undefined): string {
  switch (source) {
    case 'tag': return 'fiche.dr.sourceTag';
    case 'analysis': return 'fiche.dr.sourceAnalysis';
    case 'sidecar': return 'fiche.dr.sourceSidecar';
    default: return 'fiche.dr.sourceUnknown';
  }
}

const VERDICTS_HIRES: Record<string, string> = {
  verifie: 'fiche.hires.verifie',
  conforme: 'fiche.hires.conforme',
  douteux: 'fiche.hires.douteux',
  non_concluant: 'fiche.hires.nonConcluant',
  non_analyse: 'fiche.hires.nonAnalyse',
};
export function cleVerdictHiRes(verdict: string): string {
  return VERDICTS_HIRES[verdict] ?? 'fiche.hires.nonAnalyse';
}

const VERDICTS_INTEGRITE: Record<string, string> = {
  sain: 'fiche.integrity.sain',
  corrompu: 'fiche.integrity.corrompu',
  non_verifiable: 'fiche.integrity.nonVerifiable',
};
export function cleVerdictIntegrite(verdict: string): string {
  return VERDICTS_INTEGRITE[verdict] ?? 'fiche.integrity.nonVerifiable';
}

/** Clé i18n de l'état du spectrogramme conservé. */
export function cleEtatSpectrogramme(etat: EtatSpectrogramme): string {
  return etat === 'a_jour' ? 'fiche.spectro.upToDate'
    : etat === 'perime' ? 'fiche.spectro.stale'
      : 'fiche.spectro.absent';
}

/** Une date ISO du serveur, lisible dans la langue de l'interface. */
export function dateLisible(iso: string | null | undefined, langue: string): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  try {
    return new Intl.DateTimeFormat(langue, { dateStyle: 'medium', timeStyle: 'short' }).format(d);
  } catch {
    return d.toISOString();
  }
}

/** 96000 → « 96 kHz », 44100 → « 44,1 kHz » (séparateur de la langue). */
export function frequenceLisible(hz: number, langue: string): string {
  const khz = hz / 1000;
  return `${new Intl.NumberFormat(langue, { maximumFractionDigits: 1 }).format(khz)} kHz`;
}

/** Taille en octets → ko / Mo / Go (unités SI, écrites par `Intl` dans la langue). */
export function tailleLisible(octets: number, langue: string): string {
  const unites = ['byte', 'kilobyte', 'megabyte', 'gigabyte'] as const;
  let v = octets;
  let i = 0;
  while (v >= 1000 && i < unites.length - 1) { v /= 1000; i += 1; }
  return new Intl.NumberFormat(langue, {
    style: 'unit', unit: unites[i], unitDisplay: 'short', maximumFractionDigits: i === 0 ? 0 : 1,
  }).format(v);
}
