/**
 * Aides pures du greffon « Playlists converter » (tune-server-rust#4715).
 *
 * Rien ici ne parle au serveur : les appels vivent dans `api.ts`, l'écran dans
 * `components/v2-heritage/convertisseur/`. Ce fichier tient ce que les trois
 * onglets partagent — lire le code d'une erreur du greffon, nommer une raison,
 * borner une cadence — pour qu'ils ne le recopient pas chacun à sa façon.
 */

/**
 * Le code d'une erreur du greffon, ou `null`.
 *
 * Le greffon répond `{error: "apercu_requis : la première synchronisation…"}`
 * (`dispatch.rs`, `erreur`) : le code est le PRÉFIXE de la phrase, et
 * `apiError` range cette chaîne entière dans `err.code` (`body.code ??
 * body.error`). On lit donc le préfixe, de `code` d'abord, du message sinon.
 */
export function codeConvertisseur(e: unknown): string | null {
  const brut = (e as { code?: unknown } | null)?.code;
  const texte = typeof brut === 'string' ? brut : e instanceof Error ? e.message : '';
  const m = /^([a-z][a-z_]*)\s*:/.exec(texte.trim());
  return m ? m[1] : null;
}

/** Les codes de raison que l'écran sait nommer (`appariement.rs`, `Raison`). */
export const RAISONS_CONNUES = [
  'aucun_resultat',
  'appariement_approximatif',
  'duree_hors_tolerance',
  'duree_inconnue',
  'service_en_erreur',
] as const;

/** La clé de traduction d'une raison ; une raison inconnue retombe sur la générique. */
export function cleRaison(code: string | undefined | null): string {
  return (RAISONS_CONNUES as readonly string[]).includes(code ?? '')
    ? `plconv.raison.${code}`
    : 'plconv.raison.autre';
}

/** `0` = à la demande seulement ; sinon de 15 min à 7 jours (`liens.rs`). */
export const CADENCE_MIN_MINUTES = 15;
export const CADENCE_MAX_MINUTES = 10_080;

/** Les cadences proposées. Toutes dans les bornes du greffon : il refuse (400) le reste. */
export const CADENCES_PROPOSEES = [0, 15, 30, 60, 180, 360, 720, 1440, 10_080] as const;

export function cadenceValide(minutes: number): boolean {
  return (
    Number.isInteger(minutes) &&
    (minutes === 0 || (minutes >= CADENCE_MIN_MINUTES && minutes <= CADENCE_MAX_MINUTES))
  );
}

/** Le nom affiché d'un service. `local` est traduit par l'appelant. */
const NOMS_SERVICES: Record<string, string> = {
  tidal: 'TIDAL',
  qobuz: 'Qobuz',
  spotify: 'Spotify',
  deezer: 'Deezer',
  youtube: 'YouTube',
  amazon: 'Amazon Music',
  apple: 'Apple Music',
};
export function nomService(service: string): string {
  return NOMS_SERVICES[service] ?? service;
}

/** Une date du greffon (millisecondes de l'hôte), dans la langue du navigateur. */
export function dateConvertisseur(ms: number | null | undefined): string {
  if (!ms) return '';
  return new Date(ms).toLocaleString();
}

/** Une playlist qu'on peut choisir : son identifiant tel que le greffon l'attend, et son nom. */
export interface PlaylistChoisissable {
  id: string;
  nom: string;
}

/**
 * Les playlists d'un service, telles que le gestionnaire les a déjà chargées.
 *
 * `local` : les identifiants entiers de la bibliothèque, EN TEXTE — c'est la
 * forme que le greffon attend (`source_service: "local"`). Un service : son
 * `source_id`. Aucune requête ici : le gestionnaire a déjà la liste.
 */
export function playlistsDuService(
  service: string,
  locales: readonly { id: number | null; name: string }[],
  parService: Readonly<Record<string, readonly { source_id: string; name: string }[]>>,
): PlaylistChoisissable[] {
  if (!service) return [];
  if (service === 'local') {
    return locales.filter((p) => p.id != null).map((p) => ({ id: String(p.id), nom: p.name }));
  }
  return (parService[service] ?? []).map((p) => ({ id: String(p.source_id), nom: p.name }));
}
