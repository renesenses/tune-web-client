/**
 * Assistant IA, étape 1 (tune-server-rust, chantier « assistant-ia ») —
 * le client du greffon monté sous `/api/v1/ext/assistant-ia`.
 *
 * La clé de l'utilisateur ne revient JAMAIS ici : le serveur ne rend que
 * `cle_definie` et ses quatre derniers caractères (`cle_fin`).
 *
 * Les échecs fonctionnels (clé refusée, plafond atteint…) arrivent en
 * `{ok: false, error, message}` avec un statut 4xx/5xx : `accepter` les laisse
 * passer comme des réponses, pour que l'écran dise la phrase traduite de son
 * code au lieu d'un bandeau « Server error ». Le serveur ne rend jamais 401
 * pour ces cas (le client y lirait une session expirée).
 */
import { BASE, fetchJSON } from './api';

const RACINE = `${BASE}/ext/assistant-ia`;

export type FournisseurIa = 'anthropic' | 'compatible_openai' | 'gemini' | 'ollama';

export interface ReglagesIa {
  fournisseur: FournisseurIa | null;
  modele: string;
  modele_effectif: string;
  modele_classique: string;
  url_base: string;
  url_par_defaut: string | null;
  plafond_eur: number;
  prix_entree_usd_mtok: number | null;
  prix_sortie_usd_mtok: number | null;
  tarif_connu: boolean;
  taux_usd_eur: number;
  cle_definie: boolean;
  cle_illisible: boolean;
  cle_fin: string | null;
  modeles_anthropic: string[];
  modele_anthropic_par_defaut: string;
  modele_anthropic_classique: string;
  modeles_gemini?: string[];
  modele_gemini_par_defaut?: string;
  consommation: {
    mois: string;
    cout_eur: number;
    appels: number;
    jetons_entree: number;
    jetons_sortie: number;
    depuis_cache: number;
    plafond_atteint: boolean;
  };
}

export interface ModificationIa {
  fournisseur?: FournisseurIa | '';
  modele?: string;
  modele_classique?: string;
  url_base?: string;
  plafond_eur?: string | number;
  prix_entree_usd_mtok?: string | number | null;
  prix_sortie_usd_mtok?: string | number | null;
  taux_usd_eur?: string | number;
  /** En clair, une seule fois ; `''` efface la clé. */
  cle?: string;
}

export interface EchecIa {
  ok: false;
  error: string;
  message: string;
}

export interface RegleIa {
  field: string;
  op: string;
  value: unknown;
}

export interface PropositionIa {
  name: string;
  match_mode: 'all' | 'any';
  rules: RegleIa[];
  sort_by: string | null;
  sort_order: 'asc' | 'desc' | null;
  max_tracks: number | null;
  untranslated: string[];
  refusees: { regle: Record<string, unknown>; raison: string }[];
}

export interface SuggestionIa {
  champ: string;
  avant: string | null;
  apres: string;
  confiance: number;
  raison: string | null;
}

export interface EcarteeIa {
  champ: string;
  valeur: string | null;
  raison: string;
}

export interface LigneJournalIa {
  champ: string;
  avant: string | null;
  apres: string;
}

export interface RapportIa {
  appliquees: LigneJournalIa[];
  refusees: EcarteeIa[];
  operation_id: string | null;
}

const accepter = (s: number) => s !== 401;

export function estEchec(r: unknown): r is EchecIa {
  return !!r && typeof r === 'object' && (r as { ok?: unknown }).ok === false;
}

/**
 * Une réponse de `/reglages` a-t-elle la forme attendue ? Un serveur sans le
 * greffon répond 404 sans corps ; un banc qui simule l'API, n'importe quoi.
 * Rien n'est lu d'une réponse qui ne passe pas ce contrôle.
 */
export function estReglages(r: unknown): r is ReglagesIa {
  if (!r || typeof r !== 'object') return false;
  const c = (r as { consommation?: unknown }).consommation;
  return !!c && typeof c === 'object' && typeof (r as { plafond_eur?: unknown }).plafond_eur === 'number';
}

export function lireReglagesIa(): Promise<ReglagesIa | EchecIa> {
  return fetchJSON(`${RACINE}/reglages`, undefined, accepter);
}

export function changerReglagesIa(m: ModificationIa): Promise<ReglagesIa | EchecIa> {
  return fetchJSON(`${RACINE}/reglages`, { method: 'PUT', body: JSON.stringify(m) }, accepter);
}

export function testerCleIa(): Promise<{ ok: true; cout_eur: number } | EchecIa> {
  return fetchJSON(`${RACINE}/tester`, { method: 'POST' }, accepter);
}

export function proposerPlaylistIa(
  phrase: string,
  cible: 'playlist' | 'collection' = 'playlist',
): Promise<{ ok: true; proposition: PropositionIa; depuis_cache: boolean; cout_eur: number } | EchecIa> {
  return fetchJSON(`${RACINE}/playlist`, { method: 'POST', body: JSON.stringify({ phrase, cible }) }, accepter);
}

export function suggestionsAlbumIa(
  albumId: number,
): Promise<{ ok: true; suggestions: SuggestionIa[]; ecartees: EcarteeIa[]; depuis_cache: boolean; cout_eur: number } | EchecIa> {
  return fetchJSON(`${RACINE}/albums/${albumId}/suggestions`, { method: 'POST' }, accepter);
}

export function appliquerSuggestionsIa(
  albumId: number,
  lignes: { champ: string; valeur: string }[],
): Promise<{ ok: true; rapport: RapportIa } | EchecIa> {
  return fetchJSON(
    `${RACINE}/albums/${albumId}/appliquer`,
    { method: 'POST', body: JSON.stringify({ lignes }) },
    accepter,
  );
}

export function annulerSuggestionsIa(
  albumId: number,
  operationId?: string | null,
): Promise<{ ok: true; rapport: RapportIa } | EchecIa> {
  return fetchJSON(
    `${RACINE}/albums/${albumId}/annuler`,
    { method: 'POST', body: JSON.stringify(operationId ? { operation_id: operationId } : {}) },
    accepter,
  );
}

/** Les codes d'échec que l'écran sait dire ; un autre retombe sur le générique. */
export const CODES_ECHEC = [
  'non_configure', 'cle_illisible', 'tarif_inconnu', 'plafond_atteint',
  'cle_refusee', 'quota', 'surcharge', 'modele_inconnu', 'reseau', 'refus',
  'reponse_invalide', 'phrase_invalide', 'album_introuvable', 'reglage_invalide',
] as const;

/** La clé i18n du message d'un échec. */
export function cleDEchec(code: string | undefined): string {
  return (CODES_ECHEC as readonly string[]).includes(code ?? '')
    ? `assistantIa.err.${code}`
    : 'assistantIa.err.generique';
}

/** Les raisons d'écart que l'écran sait dire. */
export const RAISONS = [
  'musicbrainz', 'edition_manuelle', 'identique', 'champ_inconnu', 'valeur_invalide',
  'renommer_l_artiste', 'doublon', 'modifie_depuis',
  'critere_inconnu', 'operateur_inconnu',
] as const;

export function cleDeRaison(raison: string): string {
  return (RAISONS as readonly string[]).includes(raison)
    ? `assistantIa.raison.${raison}`
    : 'assistantIa.raison.autre';
}

/** Les champs d'un album que l'assistant peut proposer. */
export const CHAMPS_ALBUM = [
  'title', 'artist', 'genre', 'label', 'subgenre', 'work', 'movement',
  'composer', 'conductor', 'orchestra', 'performer', 'lyricist', 'producer',
] as const;

export function cleDeChamp(champ: string): string {
  return (CHAMPS_ALBUM as readonly string[]).includes(champ)
    ? `assistantIa.champ.${champ}`
    : 'assistantIa.champ.autre';
}

/** Une valeur de règle, lisible : `[1960, 1969]` → « 1960 – 1969 ». */
export function valeurLisible(v: unknown): string {
  if (v == null) return '';
  if (Array.isArray(v)) return v.map((x) => String(x)).join(' – ');
  return String(v);
}

/** Les suggestions cochées par défaut : celles dont la confiance est d'au moins 0,7. */
export function cocheesParDefaut(s: SuggestionIa[], seuil = 0.7): Set<string> {
  return new Set(s.filter((x) => x.confiance >= seuil).map((x) => x.champ));
}

/** La confiance en pourcentage entier. */
export function pourcent(c: number): number {
  return Math.round(Math.max(0, Math.min(1, c)) * 100);
}
