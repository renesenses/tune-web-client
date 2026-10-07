/**
 * Sauvegarde des personnalisations dans le nuage mozaiklabs
 * (renesenses/tune-server-rust#5654, renesenses/tune-web-client#902).
 *
 * Le serveur Tune prend tout seul des instantanés chiffrés de sa
 * configuration (au plus un par jour, et après chaque changement, passé un
 * délai d'attente), en garde trois chez mozaiklabs, et sait les restaurer —
 * sur la même machine ou sur une machine neuve reliée au même compte.
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
  max_snapshots: number;
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
  max: number;
}

export type ModeRestauration = 'merge' | 'replace';

export interface BilanRestauration {
  settings_written: number;
  zones_created: number;
  zones_updated: number;
  profiles_created: number;
  playlists_restored: number;
  playlists_replaced: number;
  favorites_restored: number;
  radios_restored: number;
  warnings: string[];
}

export interface ResultatRestauration {
  success: boolean;
  key_adopted: boolean;
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
  ];
  return lignes.filter(([, n]) => (n ?? 0) > 0).map(([cle, n]) => ({ cle, n }));
}
