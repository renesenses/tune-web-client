/**
 * Le spectrogramme d'une piste de la bibliothèque (renesenses/tune-server-rust#7857,
 * PR #7897).
 *
 * `GET /library/tracks/{id}/spectrogramme.png?largeur=&hauteur=` rend une
 * IMAGE, générée à la demande (plusieurs secondes sur une longue piste) puis
 * gardée en cache côté serveur. Une balise `<img src>` ne peut pas porter
 * l'en-tête d'authentification (le jeton vit en localStorage, pas dans un
 * cookie) : on télécharge donc l'image en `Blob` et l'écran en fait une URL
 * locale.
 *
 * Les refus du serveur, tels que la PR les définit :
 *   - 404 « track not found » : piste inconnue ;
 *   - 422 « track has no local file » / « track file not found » : la piste
 *     n'est pas un fichier local lisible ;
 *   - 422 « spectrogram failed: … » : le fichier existe mais ne se décode pas.
 * Un serveur antérieur à la PR répond 404 sans ce corps : même famille que
 * « piste inconnue », l'écran dit alors que la fonction n'est pas disponible.
 *
 * Go du 13/11 (tune-server-rust, après #8664) — une piste QOBUZ ou TIDAL de
 * la bibliothèque a aussi son spectrogramme et sa forme d'onde : le serveur
 * télécharge l'audio pour le calcul puis l'efface. Ses refus sont des 422 en
 * JSON, `{ error, raison }` : `raison` (`RaisonService`) se traduit.
 */
import { authHeaders, BASE } from './api';
import { clearToken } from './auth';

/** Taille demandée : le défaut du serveur (1200 × 400), bornée 200–4000 × 100–2000. */
export const LARGEUR_SPECTROGRAMME = 1200;
export const HAUTEUR_SPECTROGRAMME = 400;

/**
 * web#2707 (Bertrand, 07/11 ; discussion tune-server-rust#8304, reprise en
 * rc12) — l'échelle de couleurs, en dBFS, à droite de l'image.
 *
 * Recopie EXACTE de `tune-core/src/audio/spectrogramme.rs` : `PLANCHER_DB`
 * (noir) à 0 dBFS (blanc), sept couleurs réparties régulièrement entre les
 * deux (`couleur`). Si le serveur change sa palette, ces valeurs suivent.
 */
export const PLANCHER_DB = -120;
export const PALETTE_SPECTROGRAMME: readonly (readonly [number, number, number])[] = [
  [0, 0, 0], [20, 10, 80], [110, 20, 140], [210, 50, 70], [250, 140, 20], [255, 230, 80], [255, 255, 255],
];
/** Les marges de l'image (en pixels sur 1200 × 400) : la zone tracée en est retranchée. */
export const MARGES_SPECTROGRAMME = { haut: 8, bas: 22 } as const;

/** Le dégradé CSS de l'échelle, du plancher (bas) à 0 dBFS (haut). */
export function degradeEchelleDb(): string {
  const n = PALETTE_SPECTROGRAMME.length - 1;
  const arrets = PALETTE_SPECTROGRAMME.map(([r, g, b], i) => `rgb(${r}, ${g}, ${b}) ${Math.round((i / n) * 1000) / 10}%`);
  return `linear-gradient(to top, ${arrets.join(', ')})`;
}

/** Les graduations : 0, −20, … jusqu'au plancher, avec leur hauteur en % depuis le bas. */
export function graduationsDb(pas = 20): { db: number; bas: number }[] {
  const out: { db: number; bas: number }[] = [];
  for (let db = 0; db >= PLANCHER_DB; db -= pas) out.push({ db, bas: ((db - PLANCHER_DB) / -PLANCHER_DB) * 100 });
  return out;
}

/** « −20 » avec le vrai signe moins ; « 0 » sans signe. */
export const libelleDb = (db: number): string => (db === 0 ? '0' : `\u2212${Math.abs(db)}`);

/** Les services dont une piste s'analyse par téléchargement (go du 13/11). */
export const SERVICES_ANALYSABLES: readonly string[] = ['qobuz', 'tidal'];

/** La piste se calcule-t-elle par téléchargement (Qobuz, TIDAL) ? */
export function analyseParTelechargement(source: string | null | undefined): boolean {
  return !!source && SERVICES_ANALYSABLES.includes(source.toLowerCase());
}

/**
 * L'identifiant à donner au spectrogramme et à la fiche technique d'une piste
 * Qobuz / TIDAL de la bibliothèque (un `i64` de `tracks`), ou `null`.
 */
export function idAnalyseDe(piste: { id?: unknown; source?: unknown } | null | undefined): number | null {
  return typeof piste?.id === 'number' && analyseParTelechargement(piste.source == null ? null : String(piste.source))
    ? piste.id
    : null;
}

/** Les raisons d'un refus pour une piste de service, telles que le serveur les nomme. */
export const RAISONS_SERVICE = [
  'service_non_connecte', 'service_inactif', 'non_diffusable', 'region',
  'trop_volumineux', 'delai_depasse', 'telechargement_impossible', 'zoom_non_disponible',
  /** Recette du 14/11 — piste d'un serveur multimédia (UPnP) sans copie locale. */
  'source_reseau',
] as const;
export type RaisonService = (typeof RAISONS_SERVICE)[number];

/** La raison d'un 422 en JSON (`{ error, raison }`), ou `null`. */
export function raisonDeRefus(corps: string): RaisonService | null {
  try {
    const r = (JSON.parse(corps) as { raison?: unknown })?.raison;
    return typeof r === 'string' && (RAISONS_SERVICE as readonly string[]).includes(r) ? (r as RaisonService) : null;
  } catch {
    return null;
  }
}

/** Les clés i18n des raisons, écrites en entier (la garde i18n les lit). */
const CLES_RAISONS: Record<RaisonService, string> = {
  service_non_connecte: 'analyse.raison.service_non_connecte',
  service_inactif: 'analyse.raison.service_inactif',
  non_diffusable: 'analyse.raison.non_diffusable',
  region: 'analyse.raison.region',
  trop_volumineux: 'analyse.raison.trop_volumineux',
  delai_depasse: 'analyse.raison.delai_depasse',
  telechargement_impossible: 'analyse.raison.telechargement_impossible',
  zoom_non_disponible: 'analyse.raison.zoom_non_disponible',
  source_reseau: 'analyse.raison.source_reseau',
};

/** La clé i18n d'une raison de refus. */
export const cleRaisonService = (r: RaisonService): string => CLES_RAISONS[r];

/** Une raison qui peut passer en réessayant (délai, réseau du service). */
export const raisonRetentable = (r: RaisonService | null | undefined): boolean =>
  r === 'delai_depasse' || r === 'telechargement_impossible';

export type GenreErreurSpectrogramme =
  /** Pas de fichier local (piste de service, fichier absent du disque). */
  | 'non-locale'
  /** Piste Qobuz / TIDAL que le serveur n'a pas pu télécharger : voir `raison`. */
  | 'service'
  /** Le fichier existe mais l'image n'a pas pu être produite. */
  | 'impossible'
  /** Serveur trop ancien pour la route (404 sans corps de piste, 405). */
  | 'indisponible'
  /** La piste n'existe pas (404 « track not found » du serveur). */
  | 'introuvable'
  /** Session expirée (401). */
  | 'session'
  /** Réseau coupé, 5xx, tout le reste. */
  | 'reseau';

export class ErreurSpectrogramme extends Error {
  genre: GenreErreurSpectrogramme;
  raison: RaisonService | null;
  constructor(genre: GenreErreurSpectrogramme, detail = '', raison: RaisonService | null = null) {
    super(`spectrogramme: ${genre}${detail ? ` (${detail})` : ''}`);
    this.genre = genre;
    this.raison = raison;
  }
}

/** Classe un refus du serveur à partir de son statut et de son corps. */
export function genreDeRefus(statut: number, corps: string): GenreErreurSpectrogramme {
  if (statut === 401) return 'session';
  // Le serveur dit « track not found » ; une route absente rend un 404 sans
  // ce texte (serveur antérieur à la fonction).
  if (statut === 404) return /track not found/i.test(corps) ? 'introuvable' : 'indisponible';
  if (statut === 422) {
    if (raisonDeRefus(corps)) return 'service';
    return /no local file|file not found/i.test(corps) ? 'non-locale' : 'impossible';
  }
  // Recette du 14/11 (D10) — tout autre refus du client (400, 403, 410…) :
  // l'analyse n'existe pas pour cette source, et l'écran le dit au lieu
  // d'attendre. 408 et 429 restent des incidents passagers.
  if (statut >= 400 && statut < 500 && statut !== 408 && statut !== 429) return 'non-locale';
  return 'reseau';
}

export async function chargerSpectrogramme(
  trackId: number,
  opts: { largeur?: number; hauteur?: number; signal?: AbortSignal } = {},
): Promise<Blob> {
  const largeur = opts.largeur ?? LARGEUR_SPECTROGRAMME;
  const hauteur = opts.hauteur ?? HAUTEUR_SPECTROGRAMME;
  let resp: Response;
  try {
    resp = await fetch(
      `${BASE}/library/tracks/${trackId}/spectrogramme.png?largeur=${largeur}&hauteur=${hauteur}`,
      { headers: authHeaders({ Accept: 'image/png' }), signal: opts.signal },
    );
  } catch (e) {
    if ((e as { name?: string })?.name === 'AbortError') throw e;
    throw new ErreurSpectrogramme('reseau');
  }
  if (!resp.ok) {
    const corps = await resp.text().catch(() => '');
    const genre = genreDeRefus(resp.status, corps);
    if (genre === 'session') clearToken();
    throw new ErreurSpectrogramme(genre, `${resp.status}`, raisonDeRefus(corps));
  }
  return resp.blob();
}
