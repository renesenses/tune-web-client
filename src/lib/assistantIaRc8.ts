/**
 * Assistant IA — les usages de la rc8 (décisions de Bertrand du 23/10/2026,
 * tune-server-rust #6834 et #6839) : notes de pochette, diagnostic en lecture
 * seule, collections intelligentes par l'assistant, transcription au coffre.
 *
 * Mêmes règles que `assistantIa.ts` : la clé ne revient jamais, un échec
 * arrive en `{ok: false, error, message}` (jamais 401), et rien n'est créé ni
 * appliqué par le serveur — l'écran propose, l'utilisateur enregistre par les
 * routes habituelles.
 *
 * Un serveur sans ces routes répond 404 : `routeAbsente` le reconnaît, et
 * l'écran cache simplement le bouton.
 */
import { BASE, fetchJSON } from './api';
import type { EchecIa, EtatPlafondIa, RegleIa } from './assistantIa';

const RACINE = `${BASE}/ext/assistant-ia`;
const accepter = (s: number) => s !== 401;

/** Un aperçu : ce qui PARTIRAIT, et son coût estimé. Rien n'est envoyé. */
export interface ApercuIa {
  ok: true;
  apercu: true;
  modele: string;
  envoye: { systeme: string; message: string };
  cout_estime_eur: number | null;
  plafond?: EtatPlafondIa;
}

/** Une réponse 404 sans corps (route absente d'un serveur plus ancien). */
export function routeAbsente(r: unknown): boolean {
  return r == null || (typeof r === 'object' && !('ok' in (r as object)));
}

/** Un coût en euros, lisible : « ≈ 0,0040 € ». `null` : tarif inconnu. */
export function coutLisible(eur: number | null | undefined, langue = 'fr'): string {
  if (eur == null || !Number.isFinite(eur)) return '?';
  return `≈ ${eur.toLocaleString(langue, { minimumFractionDigits: 4, maximumFractionDigits: 4 })} €`;
}

// ---------------------------------------------------------------------------
// Notes de pochette
// ---------------------------------------------------------------------------

export interface ParagrapheNotesIa {
  texte: string;
  sources: string[];
}

export interface NotesIa {
  ok: true;
  album_id: number;
  marque: 'ia';
  bandeau: string;
  modele: string;
  langue: string;
  cree_le: string;
  notes: {
    paragraphes: ParagrapheNotesIa[];
    oeuvre: { titre: string; mouvements: string[] } | null;
    versions_presentes: number[];
    ecartes: unknown[];
  };
  attributions: { bloc: string; attribution: { source: string | null; url: string | null; licence: string | null } }[];
  cout_eur?: number;
  depuis_cache?: boolean;
  plafond?: EtatPlafondIa;
}

export function lireNotesIa(albumId: number): Promise<NotesIa | EchecIa> {
  return fetchJSON(`${RACINE}/albums/${albumId}/notes`, undefined, (s) => s !== 401, true);
}

export function ecrireNotesIa(
  albumId: number,
  o: { langue?: string; second_avis?: boolean; regenerer?: boolean; apercu?: boolean } = {},
): Promise<NotesIa | ApercuIa | EchecIa> {
  return fetchJSON(`${RACINE}/albums/${albumId}/notes`, { method: 'POST', body: JSON.stringify(o) }, accepter);
}

export function effacerNotesIa(albumId: number): Promise<{ ok: true } | EchecIa> {
  return fetchJSON(`${RACINE}/albums/${albumId}/notes`, { method: 'DELETE' }, accepter);
}

/** Les sources sous licence à citer sous les notes (Wikipédia, CC BY-SA…). */
export function attributionsACiter(n: NotesIa | null | undefined): string[] {
  if (!n) return [];
  const utilisees = new Set(n.notes.paragraphes.flatMap((p) => p.sources));
  return n.attributions
    .filter((a) => utilisees.has(a.bloc) && (a.attribution.licence || a.attribution.source))
    .map((a) => [a.attribution.source, a.attribution.licence].filter(Boolean).join(' — '));
}

// ---------------------------------------------------------------------------
// Diagnostic en lecture seule
// ---------------------------------------------------------------------------

export interface ApercuDiagnosticIa {
  ok: true;
  apercu_id: string;
  fournisseur: string | null;
  modele: string;
  /** Ollama : rien ne quitte le réseau de l'utilisateur. */
  local: boolean;
  envoye: { systeme: string; message: string };
  lignes_journal: number;
  remplacements: number;
  cout_estime_eur: number | null;
  plafond?: EtatPlafondIa;
  duree_validite_s: number;
}

export interface DiagnosticIa {
  ok: true;
  marque: 'ia';
  constat: string;
  causes_probables: { cause: string; indices: string[]; confiance: 'faible' | 'moyenne' | 'elevee' }[];
  a_essayer: { geste: string; ou: string | null }[];
  rapport_utile: boolean;
  /** Pseudonymisé : c'est lui qui peut être joint au rapport publié, si l'utilisateur coche. */
  resume_pour_le_rapport: string;
  /** Toujours vide : le diagnostic ne fait aucune action. */
  actions: never[];
  cout_eur: number;
  plafond?: EtatPlafondIa;
}

export function apercuDiagnosticIa(
  o: { zone_id?: number | null; question?: string; langue?: string; second_avis?: boolean },
): Promise<ApercuDiagnosticIa | EchecIa> {
  return fetchJSON(`${RACINE}/diagnostic/apercu`, { method: 'POST', body: JSON.stringify(o) }, accepter);
}

export function envoyerDiagnosticIa(apercuId: string): Promise<DiagnosticIa | EchecIa> {
  return fetchJSON(`${RACINE}/diagnostic`, { method: 'POST', body: JSON.stringify({ apercu_id: apercuId }) }, accepter);
}

// ---------------------------------------------------------------------------
// Collections intelligentes (#6839)
// ---------------------------------------------------------------------------

export interface CollectionProposeeIa {
  name: string;
  description: string;
  match_mode: 'all' | 'any';
  rules: RegleIa[];
  marque: 'ia';
}

export interface EcartReglesIa {
  ajoutees: RegleIa[];
  retirees: RegleIa[];
  inchangees: number;
}

type AvecCout = { cout_eur: number; depuis_cache: boolean; plafond?: EtatPlafondIa };

export function affinerCollectionIa(o: {
  cible?: 'collection' | 'playlist';
  actuelle: { name: string; match_mode: string; rules: RegleIa[] };
  phrase: string;
  langue?: string;
  apercu?: boolean;
}): Promise<({ ok: true; proposition: { name: string; match_mode: 'all' | 'any'; rules: RegleIa[] }; ecart: EcartReglesIa; avant: RegleIa[] } & AvecCout) | ApercuIa | EchecIa> {
  return fetchJSON(`${RACINE}/collections/affiner`, { method: 'POST', body: JSON.stringify(o) }, accepter);
}

export function proposerCollectionsIa(
  o: { langue?: string; apercu?: boolean } = {},
): Promise<({ ok: true; collections: CollectionProposeeIa[]; ecartees: unknown[] } & AvecCout) | ApercuIa | EchecIa> {
  return fetchJSON(`${RACINE}/collections/proposer`, { method: 'POST', body: JSON.stringify(o) }, accepter);
}

export function collectionsEcouteIa(
  o: { langue?: string; profil_id?: number | null; apercu?: boolean } = {},
): Promise<({ ok: true; collections: CollectionProposeeIa[]; ecartees: unknown[] } & AvecCout) | ApercuIa | EchecIa> {
  return fetchJSON(`${RACINE}/collections/ecoute`, { method: 'POST', body: JSON.stringify(o) }, accepter);
}

export function nommerCollectionIa(
  o: { cible?: 'collection' | 'playlist'; rules: RegleIa[]; match_mode?: string; langue?: string },
): Promise<({ ok: true; name: string; description: string; marque: 'ia' } & AvecCout) | EchecIa> {
  return fetchJSON(`${RACINE}/collections/nommer`, { method: 'POST', body: JSON.stringify(o) }, accepter);
}

export function pourquoiAlbumIa(
  o: { rules: RegleIa[]; match_mode?: string; album_id: number; langue?: string },
): Promise<({ ok: true; explication: string; regles: number[]; marque: 'ia' } & AvecCout) | EchecIa> {
  return fetchJSON(`${RACINE}/collections/pourquoi`, { method: 'POST', body: JSON.stringify(o) }, accepter);
}

/**
 * L'écart d'ALBUMS entre deux aperçus du moteur (`/library/smart-collections/preview`) :
 * « +12 / −3 », calculé AVANT d'appliquer.
 */
export function ecartAlbums(avant: readonly number[], apres: readonly number[]): { gagnes: number[]; perdus: number[] } {
  const a = new Set(avant);
  const b = new Set(apres);
  return {
    gagnes: apres.filter((id) => !a.has(id)),
    perdus: avant.filter((id) => !b.has(id)),
  };
}

// ---------------------------------------------------------------------------
// Transcription (Whisper) au coffre
// ---------------------------------------------------------------------------

export interface TranscriptionIa {
  cle_definie: boolean;
  cle_illisible: boolean;
  /** D'où viendrait la clé : `coffre`, `cle_principale` (fournisseur OpenAI), `environnement` (variable héritée). */
  source: 'coffre' | 'cle_principale' | 'environnement' | null;
  cle_fin: string | null;
  modele: string;
  prix_usd_minute: number;
  releve_le: string;
  source_url: string | null;
  variable_heritee: string;
}

/** La transcription d'une réponse de `/reglages` (absente d'un serveur plus ancien). */
export function transcriptionDesReglages(r: unknown): TranscriptionIa | null {
  const t = r && typeof r === 'object' ? (r as { transcription?: unknown }).transcription : null;
  return t && typeof t === 'object' && 'modele' in (t as object) ? (t as TranscriptionIa) : null;
}
