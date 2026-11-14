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

export type GenreErreurSpectrogramme =
  /** Pas de fichier local (piste de service, fichier absent du disque). */
  | 'non-locale'
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
  constructor(genre: GenreErreurSpectrogramme, detail = '') {
    super(`spectrogramme: ${genre}${detail ? ` (${detail})` : ''}`);
    this.genre = genre;
  }
}

/** Classe un refus du serveur à partir de son statut et de son corps. */
export function genreDeRefus(statut: number, corps: string): GenreErreurSpectrogramme {
  if (statut === 401) return 'session';
  // Le serveur dit « track not found » ; une route absente rend un 404 sans
  // ce texte (serveur antérieur à la fonction).
  if (statut === 404) return /track not found/i.test(corps) ? 'introuvable' : 'indisponible';
  if (statut === 422) {
    return /no local file|file not found/i.test(corps) ? 'non-locale' : 'impossible';
  }
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
    throw new ErreurSpectrogramme(genre, `${resp.status}`);
  }
  return resp.blob();
}
