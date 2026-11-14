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
 * - `hires_verdict` (rc12) : `verifie`, `douteux`, en OU avec `quality` ;
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

/** rc12 — les clés « Hi-Res vérifié / douteux » de l'écran, et leur mot côté serveur. */
const VERDICTS_HIRES: Record<string, string> = { hires_verifie: 'verifie', hires_douteux: 'douteux' };

/**
 * rc12 — « Hi-Res vérifié » / « Hi-Res douteux » filtrent l'écran. Un serveur
 * qui annonce `catalogue_hires_verdict` (`GET /library/hires-check`) les suit
 * par `hires_verdict=` ; devant un serveur plus ancien, qui ignorerait le
 * paramètre et rendrait des albums que l'écran cache, l'export est refusé
 * plutôt que de livrer autre chose que ce qu'on voit.
 */
export function catalogueSuitLesFiltres(qualites: readonly string[], serveurSuitLeVerdict = false): boolean {
  return serveurSuitLeVerdict || !qualites.some((q) => q in VERDICTS_HIRES);
}

/** Le chemin de la route, avec sa requête, relatif à la base de l'API. */
export function adresseCatalogue(f: FiltresCatalogue): string {
  const p = new URLSearchParams();
  const qualites = f.qualites.map((q) => q.toLowerCase()).filter((q) => QUALITES_CONNUES.has(q));
  if (qualites.length) p.set('quality', qualites.join(','));
  // OU avec `quality` côté serveur, comme les pastilles de l'écran.
  const verdicts = f.qualites.filter((q) => q in VERDICTS_HIRES).map((q) => VERDICTS_HIRES[q]);
  if (verdicts.length) p.set('hires_verdict', verdicts.join(','));
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
