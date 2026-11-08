/**
 * Catalogue imprimable de la Bibliothèque (web#2622, tune-server-rust#7671).
 *
 * Le serveur rend `GET /export/catalogue.html` : un fichier HTML autonome
 * (pochettes intégrées) qui s'imprime ou s'enregistre en PDF depuis le
 * navigateur. Ce module ne fait que traduire les filtres EN COURS de l'écran
 * en paramètres de cette route — le bouton exporte ce que l'on voit.
 *
 * Ce que la route sait faire, et rien de plus :
 * - `quality` : `dsd`, `hires`, `cd`, `lossy`, plusieurs en OU (virgules) ;
 * - `format` : plusieurs en OU ;
 * - `genre`, `artist` : la facette ouverte de l'onglet Genres ou Artistes ;
 * - `sort` : `title`, `artist`, `year` ; `order` : `asc` / `desc` ;
 * - `lang` : `fr` ou `en` (le reste retombe sur l'anglais côté serveur).
 *
 * Un tri que le catalogue ne connaît pas (ajout, DR, aléatoire…) retombe sur
 * le titre : un ordre aléatoire imprimé n'aurait pas de sens.
 */

export interface FiltresCatalogue {
  qualites: string[];
  formats: string[];
  /** Clé de tri de l'écran (`SortKey`). */
  tri: string;
  /** Sens du tri par année (`ordreAnnee`). */
  ordreAnnee: 'asc' | 'desc';
  genre?: string | null;
  artiste?: string | null;
  langue?: string | null;
}

const QUALITES_CONNUES = new Set(['dsd', 'hires', 'cd', 'lossy']);

/** Le chemin de la route, avec sa requête, relatif à la base de l'API. */
export function adresseCatalogue(f: FiltresCatalogue): string {
  const p = new URLSearchParams();
  const qualites = f.qualites.map((q) => q.toLowerCase()).filter((q) => QUALITES_CONNUES.has(q));
  if (qualites.length) p.set('quality', qualites.join(','));
  const formats = f.formats.map((x) => x.trim().toLowerCase()).filter(Boolean);
  if (formats.length) p.set('format', formats.join(','));
  if (f.genre?.trim()) p.set('genre', f.genre.trim());
  if (f.artiste?.trim()) p.set('artist', f.artiste.trim());
  if (f.tri === 'artist') {
    p.set('sort', 'artist');
  } else if (f.tri === 'year' || f.tri === 'release_date') {
    p.set('sort', 'year');
    p.set('order', f.ordreAnnee);
  } else {
    p.set('sort', 'title');
  }
  if (f.langue) p.set('lang', f.langue.toLowerCase().startsWith('fr') ? 'fr' : 'en');
  return `/export/catalogue.html?${p.toString()}`;
}
