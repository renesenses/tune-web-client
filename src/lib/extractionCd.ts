/**
 * Extraction d'un CD vers la bibliothèque — renesenses/tune-server-rust#2466
 * (serveur : tune-server-rust#5938, greffon natif `cd`, module `extraction`).
 *
 * Contrat, sous `/api/v1/ext/cd` (routes réservées aux administrateurs) :
 *
 *   GET    /lecteurs              → { plateforme_prise_en_charge, lecteurs: [{ chemin, presence, extraction_en_cours }] }
 *   GET    /extraction/reglages   → { formats, format, verifications, destination, destination_source, emplacements }
 *   PUT    /extraction/reglages   { format?, destination? } → même forme ; 400 corps_invalide · format_non_pris_en_charge · refus de destination
 *   POST   /extractions           { format?, destination?, pistes?, verification?, ecraser?, artiste?, album?, titres? }
 *                                 → 202 état · 400 · 404 aucun_lecteur · 409 · 502 lecture_toc
 *   GET    /extractions           → { extractions: [état…] } (la plus récente d'abord)
 *   GET    /extractions/{id}      → état · 404 extraction_inconnue
 *   DELETE /extractions/{id}      → 202 état (encore en_cours) · 404 extraction_inconnue · 409 extraction_terminee
 *
 * Évènements (WebSocket `{ type, data }`, `data` = l'état COMPLET) :
 * `cd.extraction.demarree`, `cd.extraction.progression`, `cd.extraction.terminee`.
 *
 * Un serveur antérieur n'a pas ces routes : `GET /extraction/reglages` rend
 * le 404 nu d'axum, et l'écran ne montre pas l'action (`extractionDisponible`).
 */
import { BASE, fetchJSON, type ApiError } from './api';
import type { SearchResult } from './types';

export type FormatExtraction = 'flac' | 'wav';
export type VerificationExtraction = 'doute' | 'toujours';
export type StatutExtraction = 'en_cours' | 'terminee' | 'echec' | 'annulee';
export type StatutPisteExtraction = 'en_attente' | 'extraction' | 'ecriture' | 'terminee' | 'echec' | 'annulee';

export interface ReglagesExtraction {
  formats: FormatExtraction[];
  format: FormatExtraction;
  verifications: VerificationExtraction[];
  destination: string | null;
  destination_source: 'reglage' | 'defaut' | 'aucune';
  emplacements: string[];
}

export interface PisteExtraction {
  numero: number;
  titre: string;
  statut: StatutPisteExtraction;
  secteurs: number;
  secteurs_lus: number;
  pourcentage: number;
  lectures_supplementaires: number;
  secteurs_illisibles: number;
  accuraterip_v1: string | null;
  accuraterip_v2: string | null;
  fichier: string | null;
  erreur: unknown;
}

export interface EtatExtraction {
  id: string;
  statut: StatutExtraction;
  format: FormatExtraction;
  verification: VerificationExtraction;
  lecteur: string;
  disc_id: string;
  metadonnees: 'musicbrainz' | 'repli';
  artiste: string;
  album: string;
  disque: number;
  disques: number;
  destination: string;
  dossier: string;
  piste_courante: number | null;
  pourcentage: number;
  debut: number;
  fin: number | null;
  erreur: { code: string; message: string } | null;
  scan: 'lance' | 'deja_en_cours' | 'indisponible' | 'non_lance' | null;
  pistes: PisteExtraction[];
}

export interface DemandeExtraction {
  format?: FormatExtraction;
  destination?: string;
  pistes?: number[];
  verification?: VerificationExtraction;
  ecraser?: boolean;
  artiste?: string;
  album?: string;
  titres?: Record<string, string>;
}

const CD = `${BASE}/ext/cd`;

// Tous les appels passent `sansBandeau` : l'écran dit lui-même ses refus.
export function getReglagesExtraction(): Promise<ReglagesExtraction> {
  return fetchJSON<ReglagesExtraction>(`${CD}/extraction/reglages`, undefined, undefined, true);
}

export function putReglagesExtraction(r: { format?: FormatExtraction; destination?: string }): Promise<ReglagesExtraction> {
  return fetchJSON<ReglagesExtraction>(
    `${CD}/extraction/reglages`,
    { method: 'PUT', body: JSON.stringify(r) },
    undefined,
    true,
  );
}

export function lancerExtraction(demande: DemandeExtraction): Promise<EtatExtraction> {
  return fetchJSON<EtatExtraction>(
    `${CD}/extractions`,
    { method: 'POST', body: JSON.stringify(demande) },
    undefined,
    true,
  );
}

export async function getExtractions(): Promise<EtatExtraction[]> {
  const r = await fetchJSON<{ extractions?: EtatExtraction[] }>(`${CD}/extractions`, undefined, undefined, true);
  return Array.isArray(r?.extractions) ? r.extractions : [];
}

export function getExtraction(id: string): Promise<EtatExtraction> {
  return fetchJSON<EtatExtraction>(`${CD}/extractions/${encodeURIComponent(id)}`, undefined, undefined, true);
}

export function annulerExtraction(id: string): Promise<EtatExtraction> {
  return fetchJSON<EtatExtraction>(
    `${CD}/extractions/${encodeURIComponent(id)}`,
    { method: 'DELETE' },
    undefined,
    true,
  );
}

// ─── Aides pures ────────────────────────────────────────────────────────────

/**
 * Les réglages lus prouvent-ils que le serveur sait extraire ? Une réponse
 * sans `emplacements` ni `formats` (route inconnue servie par un repli, ou
 * serveur antérieur) ne le prouve pas : l'action reste cachée.
 */
export function extractionDisponible(r: unknown): r is ReglagesExtraction {
  const x = r as Partial<ReglagesExtraction> | null;
  return !!x && Array.isArray(x.formats) && x.formats.length > 0 && Array.isArray(x.emplacements);
}

/** Le motif stable d'un refus (`extraction_en_cours`…), ou `null`. */
export function motifRefus(e: unknown): string | null {
  const code = (e as ApiError | null)?.code;
  return typeof code === 'string' && code ? code : null;
}

/** Le corps du refus, pour ses champs propres (`fichiers`, `zones`…). */
export function corpsRefus(e: unknown): Record<string, unknown> {
  const c = (e as { corps?: unknown } | null)?.corps;
  return c && typeof c === 'object' ? (c as Record<string, unknown>) : {};
}

/**
 * La clé de traduction d'un refus du contrat. Jamais le code brut à l'écran :
 * un motif inconnu tombe sur la phrase générique.
 */
export const CLES_REFUS: Record<string, string> = {
  extraction_en_cours: 'v2.cd.rip.err.ripRunning',
  lecture_en_cours: 'v2.cd.rip.err.playing',
  fichiers_existants: 'v2.cd.rip.err.filesExist',
  aucun_emplacement: 'v2.cd.rip.err.noLocation',
  aucun_disque: 'v2.cd.noDisc',
  aucun_lecteur: 'v2.cd.noDrive',
  lecture_toc: 'v2.cd.unreadable',
  piste_inconnue: 'v2.cd.unknownTrack',
  pistes_vides: 'v2.cd.rip.err.noTracks',
  champ_invalide: 'v2.cd.rip.err.badField',
  corps_invalide: 'v2.cd.rip.err.badRequest',
  format_non_pris_en_charge: 'v2.cd.rip.err.badFormat',
  destination_vide: 'v2.cd.rip.err.badDestination',
  destination_relative: 'v2.cd.rip.err.badDestination',
  destination_invalide: 'v2.cd.rip.err.badDestination',
  hors_bibliotheque: 'v2.cd.rip.err.outsideLibrary',
  emplacement_inaccessible: 'v2.cd.rip.err.locationUnreachable',
  extraction_inconnue: 'v2.cd.rip.err.unknownRip',
  extraction_terminee: 'v2.cd.rip.err.alreadyFinished',
  admin_requis: 'v2.cd.rip.err.adminRequired',
  // Codes de l'`erreur` d'une extraction en échec.
  disque_retire: 'v2.cd.rip.err.discRemoved',
  lecture: 'v2.cd.rip.err.read',
  ecriture: 'v2.cd.rip.err.write',
  balises: 'v2.cd.rip.err.tags',
  fichier_existant: 'v2.cd.rip.err.filesExist',
};

export function cleRefus(code: string | null): string {
  return (code && CLES_REFUS[code]) || 'v2.cd.rip.err.generic';
}

export interface SaisieLancement {
  format: FormatExtraction;
  destination: string;
  verification: VerificationExtraction;
  pistes: number[];
  artiste: string;
  album: string;
  /** Titre saisi, par numéro de piste. */
  titres: Record<number, string>;
  ecraser?: boolean;
}

export interface DisqueSource {
  artiste: string | null;
  titre: string | null;
  pistes: { numero: number; titre: string }[];
}

/**
 * Le corps de `POST /extractions`. Seules les CORRECTIONS partent : un champ
 * égal à ce que MusicBrainz a donné est laissé au serveur, qui l'a déjà. Les
 * pistes ne partent que si la sélection n'est pas le disque entier.
 */
export function corpsLancement(s: SaisieLancement, d: DisqueSource): DemandeExtraction {
  const corps: DemandeExtraction = {
    format: s.format,
    verification: s.verification,
  };
  if (s.destination) corps.destination = s.destination;
  const toutes = d.pistes.map((p) => p.numero);
  const choisies = toutes.filter((n) => s.pistes.includes(n));
  if (choisies.length !== toutes.length) corps.pistes = choisies;
  const artiste = s.artiste.trim();
  if (artiste && artiste !== (d.artiste ?? '').trim()) corps.artiste = artiste;
  const album = s.album.trim();
  if (album && album !== (d.titre ?? '').trim()) corps.album = album;
  const titres: Record<string, string> = {};
  for (const p of d.pistes) {
    if (!choisies.includes(p.numero)) continue;
    const v = (s.titres[p.numero] ?? '').trim();
    if (v && v !== (p.titre ?? '').trim()) titres[String(p.numero)] = v;
  }
  if (Object.keys(titres).length) corps.titres = titres;
  if (s.ecraser) corps.ecraser = true;
  return corps;
}

/**
 * Un évènement du bus appliqué à l'état suivi. Rend le nouvel état, ou
 * `null` si l'évènement ne le concerne pas. Sans extraction suivie, une
 * extraction qui démarre (lancée d'un autre écran) est adoptée.
 */
export function appliquerEvenement(
  suivi: EtatExtraction | null,
  ev: { type?: string; data?: unknown } | null | undefined,
): EtatExtraction | null {
  const type = ev?.type ?? '';
  if (!type.startsWith('cd.extraction.')) return null;
  const e = ev!.data as EtatExtraction | null;
  if (!e || typeof e !== 'object' || typeof e.id !== 'string' || !Array.isArray(e.pistes)) return null;
  if (suivi && suivi.id !== e.id) {
    // Une autre extraction ne remplace l'affichage que si la nôtre est finie.
    return suivi.statut === 'en_cours' ? null : e;
  }
  // Un évènement en retard ne fait pas revenir un état final à `en_cours`.
  if (suivi && suivi.statut !== 'en_cours' && e.statut === 'en_cours') return null;
  return e;
}

/** Secteurs illisibles cumulés : du silence a remplacé de la musique. */
export function secteursIllisibles(e: EtatExtraction): number {
  return e.pistes.reduce((n, p) => n + (p.secteurs_illisibles || 0), 0);
}

/** Les fichiers écrits (pistes terminées), pour retrouver l'album scanné. */
export function fichiersEcrits(e: EtatExtraction): string[] {
  return e.pistes.filter((p) => p.statut === 'terminee' && p.fichier).map((p) => p.fichier as string);
}

/**
 * L'identifiant de l'album dans la bibliothèque, depuis une recherche : la
 * piste dont le chemin est l'un des fichiers écrits fait foi ; à défaut, un
 * album de même titre et de même artiste.
 */
export function albumIdDepuisRecherche(r: SearchResult | null | undefined, e: EtatExtraction): number | null {
  const fichiers = new Set(fichiersEcrits(e));
  for (const t of r?.tracks ?? []) {
    if (t.file_path && fichiers.has(t.file_path) && typeof t.album_id === 'number') return t.album_id;
  }
  const norme = (s: string | null | undefined) => (s ?? '').trim().toLowerCase();
  for (const a of r?.albums ?? []) {
    if (typeof a.id === 'number' && norme(a.title) === norme(e.album)
      && (!a.artist_name || norme(a.artist_name) === norme(e.artiste))) return a.id;
  }
  return null;
}

/** Faut-il attendre `library.scan.completed` avant d'ouvrir l'album ? */
export function scanAttendu(e: EtatExtraction): boolean {
  return e.scan === 'lance' || e.scan === 'deja_en_cours';
}
