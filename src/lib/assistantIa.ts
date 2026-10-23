/**
 * Assistant IA, étapes 1 et 2 (tune-server-rust, chantier « assistant-ia ») —
 * le client du greffon monté sous `/api/v1/ext/assistant-ia`.
 *
 * Étape 2 : suggestions sur un LOT d'albums (arrêt net au plafond) et sur les
 * PISTES (œuvre, mouvement) ; le genre accepté est recopié sur les pistes ;
 * les réglages ne se modifient qu'en administrateur (`modifiable`).
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
  /** Étape 2 : faux pour un profil non administrateur quand l'authentification est active. */
  modifiable?: boolean;
  consommation: {
    mois: string;
    cout_eur: number;
    appels: number;
    jetons_entree: number;
    jetons_sortie: number;
    depuis_cache: number;
    plafond_atteint: boolean;
    /** Étape 3 : au moins 80 % du plafond dépensé (plafond atteint compris). */
    alerte?: boolean;
    part_du_plafond?: number;
    seuil_alerte?: number;
    /** Étape 3 : les mêmes compteurs, par usage. */
    par_usage?: Record<string, CompteUsageIa>;
  };
  /** Étape 3 : le tarif appliqué au modèle effectif, daté ; `null` sans fournisseur. */
  tarif?: TarifIa | null;
}

/** Étape 3 : les compteurs d'un usage (`playlist`, `album`, `pistes`, `test`, `requete`, `traduction`). */
export interface CompteUsageIa {
  cout_eur: number;
  appels: number;
  jetons_entree: number;
  jetons_sortie: number;
  depuis_cache: number;
}

/** Étape 3 : d'où vient le tarif appliqué, et quand il a été relevé. */
export interface TarifIa {
  origine: 'table' | 'saisi' | 'local' | null;
  entree_usd_mtok?: number | null;
  sortie_usd_mtok?: number | null;
  releve_le?: string | null;
  source_url?: string | null;
  a_relever_avant?: string | null;
  a_relever?: boolean;
}

/** Étape 3 : l'état du plafond, joint à chaque réponse d'un usage. */
export interface EtatPlafondIa {
  depense_eur: number;
  plafond_eur: number;
  part: number;
  seuil_alerte: number;
  alerte: boolean;
  atteint: boolean;
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
  /**
   * web#2306 (tune-server-rust#6730, PR #6746) — le motif rendu par le
   * fournisseur (`error.message`), expurgé de toute clé et tronqué à 300
   * caractères par le serveur. Absent d'un serveur plus ancien.
   */
  motif?: string;
  /** `aucune_regle` (tune-server-rust#6731) : les règles écartées et ce que le modèle n'a pas traduit. */
  refusees?: { regle: Record<string, unknown>; raison: string }[];
  untranslated?: string[];
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
  /** Étape 2 : la ligne porte sur une piste. */
  piste_id?: number;
}

export interface RapportIa {
  appliquees: LigneJournalIa[];
  refusees: EcarteeIa[];
  operation_id: string | null;
  /** Étape 2 : pistes dont le genre a été recopié (ou rendu à l'annulation). */
  pistes_genre?: number;
  compilation_epargnee?: boolean;
  pistes_modifiees_depuis?: number;
}

/** Étape 2 : une suggestion sur une piste (œuvre, mouvement). */
export interface SuggestionPisteIa {
  piste_id: number;
  titre: string;
  champ: string;
  avant: string | null;
  apres: string;
  confiance: number;
  raison: string | null;
}

export interface EcarteePisteIa extends EcarteeIa {
  piste_id?: number | null;
}

/** Le résultat d'un album dans un lot. */
export type ResultatLotIa =
  | { ok: true; album_id: number; titre: string | null; suggestions: SuggestionIa[]; ecartees: EcarteeIa[]; depuis_cache: boolean; cout_eur: number }
  | { ok: false; album_id: number; error: string; message: string };

export interface LotIa {
  ok: true;
  resultats: ResultatLotIa[];
  /** Pourquoi le lot s'est arrêté avant la fin, ou `null`. */
  arret: { error: string; message: string } | null;
  non_traites: number[];
  cout_eur: number;
  plafond?: EtatPlafondIa;
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

export function testerCleIa(): Promise<{ ok: true; cout_eur: number; plafond?: EtatPlafondIa } | EchecIa> {
  return fetchJSON(`${RACINE}/tester`, { method: 'POST' }, accepter);
}

export function proposerPlaylistIa(
  phrase: string,
  cible: 'playlist' | 'collection' = 'playlist',
): Promise<{ ok: true; proposition: PropositionIa; depuis_cache: boolean; cout_eur: number; plafond?: EtatPlafondIa } | EchecIa> {
  return fetchJSON(`${RACINE}/playlist`, { method: 'POST', body: JSON.stringify({ phrase, cible }) }, accepter);
}

export function suggestionsAlbumIa(
  albumId: number,
): Promise<{ ok: true; suggestions: SuggestionIa[]; ecartees: EcarteeIa[]; depuis_cache: boolean; cout_eur: number; plafond?: EtatPlafondIa } | EchecIa> {
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

export function suggestionsPistesIa(
  albumId: number,
): Promise<{ ok: true; suggestions: SuggestionPisteIa[]; ecartees: EcarteePisteIa[]; depuis_cache: boolean; cout_eur: number; plafond?: EtatPlafondIa } | EchecIa> {
  return fetchJSON(`${RACINE}/albums/${albumId}/pistes/suggestions`, { method: 'POST' }, accepter);
}

export function appliquerPistesIa(
  albumId: number,
  lignes: { piste_id: number; champ: string; valeur: string }[],
): Promise<{ ok: true; rapport: RapportIa } | EchecIa> {
  return fetchJSON(
    `${RACINE}/albums/${albumId}/pistes/appliquer`,
    { method: 'POST', body: JSON.stringify({ lignes }) },
    accepter,
  );
}

/** Albums d'un lot de suggestions, au plus (borne du serveur). */
export const LOT_MAX = 50;

/** Les identifiants d'un lot : uniques, dans l'ordre, bornés à `LOT_MAX`. */
export function idsDuLot(ids: readonly (number | null | undefined)[], max = LOT_MAX): number[] {
  const vus = new Set<number>();
  for (const id of ids) {
    if (typeof id === 'number' && Number.isFinite(id) && !vus.has(id)) vus.add(id);
    if (vus.size >= max) break;
  }
  return [...vus];
}

export function lotSuggestionsIa(albumIds: number[], budgetEur?: string): Promise<LotIa | EchecIa> {
  const corps: Record<string, unknown> = { album_ids: albumIds };
  if (budgetEur && budgetEur.trim()) corps.budget_eur = budgetEur.trim();
  return fetchJSON(`${RACINE}/lot/suggestions`, { method: 'POST', body: JSON.stringify(corps) }, accepter);
}

export function lotAppliquerIa(
  albums: { album_id: number; lignes: { champ: string; valeur: string }[] }[],
): Promise<{ ok: true; rapports: ({ ok: true; album_id: number; rapport: RapportIa } | { ok: false; album_id: number; error: string })[] } | EchecIa> {
  return fetchJSON(`${RACINE}/lot/appliquer`, { method: 'POST', body: JSON.stringify({ albums }) }, accepter);
}

export function lotAnnulerIa(
  operations: { album_id: number; operation_id: string | null }[],
): Promise<{ ok: true; rapports: unknown[] } | EchecIa> {
  return fetchJSON(`${RACINE}/lot/annuler`, { method: 'POST', body: JSON.stringify({ operations }) }, accepter);
}

/** L'écran peut-il modifier les réglages ? Un serveur de l'étape 1 ne dit rien : oui. */
export function peutModifier(r: ReglagesIa | null | undefined): boolean {
  return !!r && r.modifiable !== false;
}

/** Les codes d'échec que l'écran sait dire ; un autre retombe sur le générique. */
export const CODES_ECHEC = [
  'non_configure', 'cle_illisible', 'tarif_inconnu', 'plafond_atteint',
  'cle_refusee', 'quota', 'surcharge', 'modele_inconnu', 'reseau', 'refus',
  'reponse_invalide', 'phrase_invalide', 'album_introuvable', 'reglage_invalide',
  'admin_requis', 'lot_invalide', 'budget_du_lot_atteint', 'erreur_fournisseur',
  'aucune_regle', 'cle_sans_espace_de_travail',
] as const;

/** La clé i18n du message d'un échec. */
export function cleDEchec(code: string | undefined): string {
  return (CODES_ECHEC as readonly string[]).includes(code ?? '')
    ? `assistantIa.err.${code}`
    : 'assistantIa.err.generique';
}

/**
 * web#2306 — le message traduit d'un échec, suivi du motif du fournisseur
 * quand le serveur l'a gardé (tune-server-rust#6746). Sans motif : le message
 * traduit seul, comme avant.
 */
export function messageDEchec(
  e: { error?: string; motif?: unknown } | null | undefined,
  tr: (cle: string) => string,
): string {
  const message = tr(cleDEchec(e?.error));
  const motif = typeof e?.motif === 'string' ? e.motif.trim() : '';
  if (!motif) return message;
  return `${message} ${tr('assistantIa.err.motif').replace('{motif}', motif)}`;
}

/** Les raisons d'écart que l'écran sait dire. */
export const RAISONS = [
  'musicbrainz', 'edition_manuelle', 'identique', 'champ_inconnu', 'valeur_invalide',
  'renommer_l_artiste', 'doublon', 'modifie_depuis',
  'critere_inconnu', 'operateur_inconnu',
  'deja_rempli', 'piste_inconnue', 'reference_inconnue', 'reference_ambigue',
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

/**
 * Le message d'une application ou d'une annulation, complété de ce que le
 * serveur a fait des PISTES (étape 2) : genre recopié, compilation épargnée,
 * pistes retouchées depuis et laissées telles quelles.
 */
export function messageDeRapport(base: string, r: RapportIa, t: (cle: string) => string): string {
  const morceaux = [base];
  if (r.pistes_genre) morceaux.push(t('assistantIa.album.genreTracks').replace('{n}', String(r.pistes_genre)));
  if (r.compilation_epargnee) morceaux.push(t('assistantIa.album.compilationSpared'));
  if (r.pistes_modifiees_depuis) {
    morceaux.push(t('assistantIa.album.tracksKept').replace('{n}', String(r.pistes_modifiees_depuis)));
  }
  return morceaux.join(' ');
}

/** La clé d'une ligne d'un lot : un album, un champ. */
export const cleDeLigneDuLot = (albumId: number, champ: string) => `${albumId}:${champ}`;

/** Les lignes cochées d'un lot, regroupées par album, prêtes pour `/lot/appliquer`. */
export function lignesDuLot(
  resultats: readonly ResultatLotIa[],
  cochees: ReadonlySet<string>,
): { album_id: number; lignes: { champ: string; valeur: string }[] }[] {
  const albums: { album_id: number; lignes: { champ: string; valeur: string }[] }[] = [];
  for (const r of resultats) {
    if (!r.ok) continue;
    const lignes = r.suggestions
      .filter((s) => cochees.has(cleDeLigneDuLot(r.album_id, s.champ)))
      .map((s) => ({ champ: s.champ, valeur: s.apres }));
    if (lignes.length) albums.push({ album_id: r.album_id, lignes });
  }
  return albums;
}

// ---------------------------------------------------------------------------
// Étape 3 : suivi par usage, alerte à 80 %, tarif daté
// ---------------------------------------------------------------------------

/** Les usages que le serveur compte, dans l'ordre d'affichage. */
export const USAGES_IA = ['playlist', 'album', 'pistes', 'requete', 'traduction', 'test'] as const;

/** La clé i18n du nom d'un usage ; un usage inconnu garde son nom brut. */
export function cleDUsage(usage: string): string | null {
  return (USAGES_IA as readonly string[]).includes(usage) ? `assistantIa.usageName.${usage}` : null;
}

/** Les lignes du détail par usage : usages connus d'abord, dans leur ordre, puis les autres. */
export function lignesParUsage(
  c: ReglagesIa['consommation'] | null | undefined,
): (CompteUsageIa & { usage: string })[] {
  const par = c?.par_usage ?? {};
  const rang = (u: string) => {
    const i = (USAGES_IA as readonly string[]).indexOf(u);
    return i < 0 ? USAGES_IA.length : i;
  };
  return Object.entries(par)
    .map(([usage, v]) => ({ usage, ...v }))
    .sort((a, b) => rang(a.usage) - rang(b.usage) || a.usage.localeCompare(b.usage));
}

/** L'alerte à 80 % s'affiche tant que le plafond n'est pas atteint (au-delà, c'est le refus qui parle). */
export function alerteAAfficher(p: EtatPlafondIa | null | undefined): boolean {
  return !!p && p.alerte && !p.atteint;
}

/** L'état du plafond tiré des réglages (même forme que celui des réponses). */
export function plafondDesReglages(r: ReglagesIa | null | undefined): EtatPlafondIa | null {
  if (!r || r.consommation.alerte === undefined) return null;
  return {
    depense_eur: r.consommation.cout_eur,
    plafond_eur: r.plafond_eur,
    part: r.consommation.part_du_plafond ?? 0,
    seuil_alerte: r.consommation.seuil_alerte ?? 80,
    alerte: r.consommation.alerte,
    atteint: r.consommation.plafond_atteint,
  };
}

/** Le texte de l'alerte : part dépensée (arrondie vers le bas), dépense et plafond. */
export function texteAlerte(modele: string, p: EtatPlafondIa): string {
  return modele
    .replace('{part}', String(Math.floor(p.part * 100)))
    .replace('{cout}', p.depense_eur.toFixed(2))
    .replace('{plafond}', p.plafond_eur.toFixed(2));
}

/** `AAAA-MM-JJ` en date lisible dans la langue donnée ; la chaîne brute si illisible. */
export function dateLisible(iso: string | null | undefined, langue = 'fr'): string {
  if (!iso) return '';
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  try {
    return d.toLocaleDateString(langue, { year: 'numeric', month: 'long', day: 'numeric' });
  } catch {
    return iso;
  }
}
