/**
 * Sauvegarde des personnalisations dans le nuage mozaiklabs
 * (renesenses/tune-server-rust#5654, renesenses/tune-web-client#902).
 *
 * Le serveur Tune prend tout seul des instantanés chiffrés de sa
 * configuration (au plus un par jour, et après chaque changement, passé un
 * délai d'attente) et sait les restaurer — sur la même machine ou sur une
 * machine neuve reliée au même compte. Le site en garde trois au plus par
 * machine et cinq machines au plus par compte, et élague les plus anciens.
 *
 * Réservée au Premium, toutes ses fonctions comprises : sans Premium, l'écran
 * le dit et ne liste ni ne restaure rien (`peutLister`).
 *
 * Les profils sont restaurés SANS leur mot de passe (le hash ne voyage
 * jamais) : l'écran l'annonce avant la restauration, et le bilan nomme les
 * profils créés sans mot de passe (`profilsSansMotDePasse`).
 *
 * Ce module ne porte que les DÉCISIONS de l'écran, sans Svelte ni réseau :
 * quand proposer la reprise, quel instantané par défaut, quand demander la
 * phrase de passe. Elles sont ainsi éprouvables une par une.
 *
 * 🔴 La phrase de passe et la clé de secours ne vont QUE dans le corps d'un
 * POST (`restaurer`, `activer`). Jamais dans une URL, jamais dans le stockage
 * du navigateur : `sauvegardeCloudSecret.test.ts` le tient.
 */

/** `GET /system/config-backup/cloud/status`. */
export interface EtatSauvegardeCloud {
  premium: boolean;
  account_linked: boolean;
  enabled: boolean;
  key_configured: boolean;
  last_backup_at: string | null;
  last_attempt_at: string | null;
  last_error: string | null;
  pending_since: string | null;
  debounce_minutes: number;
  /** Instantanés gardés par machine. */
  max_snapshots: number;
  /** Machines gardées par compte (serveurs récents). */
  max_machines?: number;
}

/** Un instantané tel que le serveur Tune le liste. */
export interface InstantaneCloud {
  id: number;
  server_id: string;
  server_label: string | null;
  key_id: string;
  format_version: number;
  size_bytes: number;
  created_at: string;
  /** Pris par CE serveur. */
  this_server: boolean;
  /** La clé de CE serveur l'ouvre ; sinon il faut la phrase de passe ou la clé de secours. */
  local_key: boolean;
}

export interface ListeInstantanes {
  backups: InstantaneCloud[];
  /** Instantanés gardés par machine. */
  max: number;
  max_per_server?: number;
  max_machines?: number;
}

export type ModeRestauration = 'merge' | 'replace';

export interface BilanRestauration {
  settings_written: number;
  zones_created: number;
  zones_updated: number;
  profiles_created: number;
  /** Profils créés par la restauration, donc sans mot de passe (serveurs récents). */
  profiles_without_password?: string[];
  playlists_restored: number;
  playlists_replaced: number;
  favorites_restored: number;
  radios_restored: number;
  /**
   * Jetons de service réécrits, par leur nom (serveurs récents) : aujourd'hui
   * seul `discogs_token` voyage, chiffré dans l'instantané (#902).
   */
  service_tokens_restored?: string[];
  warnings: string[];
}

export interface ResultatRestauration {
  success: boolean;
  key_adopted: boolean;
  /** Toujours `false` : les mots de passe des profils ne voyagent jamais. */
  passwords_restored?: boolean;
  report: BilanRestauration;
}

/** Les refus que l'écran sait traiter lui-même. */
export type CodeRefusSauvegarde =
  | 'secret_required'
  | 'wrong_secret'
  | 'account_not_linked'
  | 'premium_required'
  | 'cloud_unreachable'
  | 'autre';

/** Erreur portant le code stable que le serveur a rendu. */
export class RefusSauvegarde extends Error {
  code: CodeRefusSauvegarde;
  constructor(code: CodeRefusSauvegarde, message?: string) {
    super(message ?? code);
    this.code = code;
  }
}

const CODES_CONNUS: CodeRefusSauvegarde[] = [
  'secret_required',
  'wrong_secret',
  'account_not_linked',
  'premium_required',
  'cloud_unreachable',
];

/** Lit le code d'un corps d'erreur `{"error": "…"}` du serveur. */
export function codeDuRefus(corps: unknown): CodeRefusSauvegarde {
  const e = (corps as { error?: unknown } | null)?.error;
  return typeof e === 'string' && (CODES_CONNUS as string[]).includes(e)
    ? (e as CodeRefusSauvegarde)
    : 'autre';
}

/** Longueur minimale de la phrase de passe (le serveur la vérifie aussi). */
export const LONGUEUR_MIN_PHRASE = 10;

/** La phrase de passe saisie est-elle acceptable ? `null` = oui, sinon la clé i18n du motif. */
export function motifPhraseRefusee(phrase: string, confirmation: string): string | null {
  if (phrase.length < LONGUEUR_MIN_PHRASE) return 'cloudBackup.passphraseTooShort';
  if (phrase !== confirmation) return 'cloudBackup.passphraseMismatch';
  return null;
}

/**
 * L'assistant de première installation propose-t-il « Reprendre vos
 * personnalisations » ?
 *
 * Trois conditions, toutes nécessaires : le serveur est relié au compte
 * (sinon il ne peut rien lire chez mozaiklabs), le compte est Premium (la
 * sauvegarde complète l'est, décision du 23/09) et il existe au moins un
 * instantané. Sans elles, rien ne s'affiche : une offre qui mène à une
 * liste vide est une impasse.
 */
export function offreDeReprise(
  etat: EtatSauvegardeCloud | null | undefined,
  liste: ListeInstantanes | null | undefined,
): boolean {
  if (!peutLister(etat)) return false;
  return (liste?.backups?.length ?? 0) > 0;
}

/**
 * La liste des instantanés a-t-elle un sens ? Relié ET Premium. Sert aussi
 * AVANT de la demander : la route est gardée Premium, et un 402 afficherait
 * un bandeau d'erreur sur l'accueil d'une installation neuve.
 */
export function peutLister(etat: EtatSauvegardeCloud | null | undefined): boolean {
  return !!etat && etat.account_linked && etat.premium;
}

/** L'instantané proposé par défaut : le plus récent. */
export function instantaneParDefaut(liste: InstantaneCloud[]): InstantaneCloud | null {
  if (!liste.length) return null;
  return [...liste].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))[0];
}

/** Faut-il demander la phrase de passe AVANT d'essayer ? */
export function secretAttendu(i: InstantaneCloud | null | undefined): boolean {
  return !!i && !i.local_key;
}

/** Corps du POST de restauration. Le secret vide n'est pas envoyé. */
export function corpsRestauration(
  id: number,
  mode: ModeRestauration,
  secret: string | null | undefined,
): { id: number; mode: ModeRestauration; secret: string | null } {
  const s = (secret ?? '').trim();
  return { id, mode, secret: s ? s : null };
}

/** Taille lisible, unités traduites par `Intl` dans la langue de l'interface. */
export function tailleLisible(octets: number, langue?: string): string {
  if (!Number.isFinite(octets) || octets < 0) return '—';
  const [valeur, unite] =
    octets < 1024 * 1024
      ? [Math.max(1, Math.round(octets / 1024)), 'kilobyte']
      : [Math.round((octets / (1024 * 1024)) * 10) / 10, 'megabyte'];
  try {
    return new Intl.NumberFormat(langue, { style: 'unit', unit: unite, unitDisplay: 'short' }).format(valeur);
  } catch {
    return `${valeur} ${unite === 'kilobyte' ? 'kB' : 'MB'}`;
  }
}

/** La restauration a-t-elle repris le jeton Discogs (#902) ? */
export function jetonDiscogsRepris(b: BilanRestauration | null | undefined): boolean {
  return (b?.service_tokens_restored ?? []).includes('discogs_token');
}

/** Les compteurs du bilan, dans l'ordre de l'affichage, sans les zéros. */
export function lignesDuBilan(b: BilanRestauration): { cle: string; n: number }[] {
  const lignes: [string, number][] = [
    ['cloudBackup.reportSettings', b.settings_written],
    ['cloudBackup.reportZonesCreated', b.zones_created],
    ['cloudBackup.reportZonesUpdated', b.zones_updated],
    ['cloudBackup.reportProfiles', b.profiles_created],
    ['cloudBackup.reportPlaylists', b.playlists_restored],
    ['cloudBackup.reportPlaylistsReplaced', b.playlists_replaced],
    ['cloudBackup.reportFavorites', b.favorites_restored],
    ['cloudBackup.reportRadios', b.radios_restored],
    ['cloudBackup.reportDiscogs', jetonDiscogsRepris(b) ? 1 : 0],
  ];
  return lignes.filter(([, n]) => (n ?? 0) > 0).map(([cle, n]) => ({ cle, n }));
}

/**
 * Les profils que la restauration a créés SANS mot de passe, triés et sans
 * doublon. Vide si le serveur n'en a créé aucun (ou s'il est antérieur et ne
 * le dit pas : l'avertissement général reste affiché avant la restauration).
 */
export function profilsSansMotDePasse(b: BilanRestauration | null | undefined): string[] {
  const noms = (b?.profiles_without_password ?? []).filter((n) => typeof n === 'string' && n.trim());
  return [...new Set(noms)].sort((a, c) => a.localeCompare(c));
}

/**
 * `POST /system/config-backup/cloud/preview` : ce qu'un instantané contient,
 * compté par le serveur Tune APRÈS déchiffrement, sans rien restaurer ni
 * adopter la clé (#902). Le site ne connaît que la taille et la date de
 * dépôt : ce résumé n'existe que sur le serveur Tune, et ne part nulle part.
 */
export interface ResumeInstantane {
  /** Date écrite DANS l'instantané (que le site ne peut pas falsifier). */
  created_at: string | null;
  server_version: string | null;
  settings: number;
  zones: number;
  zone_names: string[];
  profiles: number;
  playlists: number;
  favorites: number;
  radios: number;
  eq_presets: number;
  /** Noms des jetons présents, jamais leur valeur. */
  service_tokens: string[];
}

/** Corps du POST d'aperçu. Le secret vide n'est pas envoyé. */
export function corpsApercu(
  id: number,
  secret: string | null | undefined,
): { id: number; secret: string | null } {
  const { secret: s } = corpsRestauration(id, 'merge', secret);
  return { id, secret: s };
}

/** Le résumé rendu est-il lisible ? Un serveur antérieur ne connaît pas la route. */
export function lireResume(corps: unknown): ResumeInstantane | null {
  const r = (corps as { summary?: unknown } | null)?.summary as Partial<ResumeInstantane> | undefined;
  if (!r || typeof r !== 'object' || typeof r.settings !== 'number') return null;
  const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0);
  const noms = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && !!x.trim()) : []);
  return {
    created_at: typeof r.created_at === 'string' ? r.created_at : null,
    server_version: typeof r.server_version === 'string' ? r.server_version : null,
    settings: n(r.settings),
    zones: n(r.zones),
    zone_names: noms(r.zone_names),
    profiles: n(r.profiles),
    playlists: n(r.playlists),
    favorites: n(r.favorites),
    radios: n(r.radios),
    eq_presets: n(r.eq_presets),
    service_tokens: noms(r.service_tokens),
  };
}

/** Les lignes du résumé, dans l'ordre de l'affichage, sans les zéros. */
export function lignesDuResume(r: ResumeInstantane): { cle: string; n: number; detail?: string }[] {
  const lignes: { cle: string; n: number; detail?: string }[] = [
    { cle: 'cloudBackup.summarySettings', n: r.settings },
    { cle: 'cloudBackup.summaryZones', n: r.zones, detail: r.zone_names.join(', ') || undefined },
    { cle: 'cloudBackup.summaryProfiles', n: r.profiles },
    { cle: 'cloudBackup.summaryEq', n: r.eq_presets },
    { cle: 'cloudBackup.summaryPlaylists', n: r.playlists },
    { cle: 'cloudBackup.summaryFavorites', n: r.favorites },
    { cle: 'cloudBackup.summaryRadios', n: r.radios },
    { cle: 'cloudBackup.summaryDiscogs', n: r.service_tokens.includes('discogs_token') ? 1 : 0 },
  ];
  return lignes.filter((l) => l.n > 0);
}
