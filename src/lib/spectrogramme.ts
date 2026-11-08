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

export type GenreErreurSpectrogramme =
  /** Pas de fichier local (piste de service, fichier absent du disque). */
  | 'non-locale'
  /** Le fichier existe mais l'image n'a pas pu être produite. */
  | 'impossible'
  /** Piste inconnue, ou serveur trop ancien pour la route. */
  | 'indisponible'
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
  if (statut === 404) return 'indisponible';
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
