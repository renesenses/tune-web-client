/**
 * L'écran Concerts, harmonisé (rc14, maquette `concerts.html` du 26/11/2026).
 *
 * Tout ce que la nouvelle présentation CALCULE vit ici, en fonctions pures :
 * le regroupement par mois, le bloc date de chaque carte, la casse des salles,
 * les initiales de repli, le filtre de la liste des pays et le rapprochement
 * d'un concert avec l'image d'artiste de la bibliothèque. Rien n'en vient du
 * serveur : le contrat ne change pas, seules les données déjà rendues
 * (`event_date`, `venue`, `city`, `artist_name`) sont présentées autrement.
 *
 * Les mois et les jours de la semaine viennent d'`Intl.DateTimeFormat`, dans
 * la langue de l'interface : aucune clé de traduction à tenir pour eux.
 */
import type { Concert } from './api';

/** `YYYY-MM-DD` → date locale à minuit, ou `null` si la chaîne n'a pas cette forme. */
function dateDe(iso: string | null | undefined): Date | null {
  const brut = (iso ?? '').trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(brut);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Première lettre en capitale, dans la langue donnée (« décembre 2026 » → « Décembre 2026 »). */
function capitaliser(s: string, langue: string): string {
  return s ? s.charAt(0).toLocaleUpperCase(langue) + s.slice(1) : s;
}

function formater(d: Date, langue: string, options: Intl.DateTimeFormatOptions): string {
  try {
    return new Intl.DateTimeFormat(langue, options).format(d);
  } catch {
    return new Intl.DateTimeFormat('en', options).format(d);
  }
}

/** Le bloc date d'une carte : jour sur deux chiffres, mois abrégé en capitales, jour de la semaine. */
export interface BlocDate {
  jour: string;
  mois: string;
  semaine: string;
}

export function blocDate(iso: string | null | undefined, langue: string): BlocDate | null {
  const d = dateDe(iso);
  if (!d) return null;
  return {
    jour: String(d.getDate()).padStart(2, '0'),
    // « déc. » → « DÉC » : le point d'abréviation n'a rien à faire en capitales.
    mois: formater(d, langue, { month: 'short' }).replace(/\.$/, '').toLocaleUpperCase(langue),
    semaine: capitaliser(formater(d, langue, { weekday: 'short' }).replace(/\.$/, ''), langue),
  };
}

/** Un mois de la liste « Par date » : son libellé et ses concerts, dans l'ordre reçu. */
export interface MoisConcerts {
  /** `YYYY-MM`, ou `autre` pour les concerts sans date lisible. */
  cle: string;
  /** « Décembre 2026 » ; vide pour `autre` (le gabarit pose alors un libellé traduit). */
  libelle: string;
  concerts: Concert[];
  /** Clés de boucle des concerts, reprises telles quelles de la liste d'entrée. */
  cles: string[];
}

/**
 * Regroupe une liste DÉJÀ TRIÉE (`grouperConcerts(…, 'date')`) par mois.
 *
 * L'ordre d'entrée est conservé, dans chaque mois et entre les mois : ce
 * module ne trie pas, il découpe. Les concerts sans date lisible forment un
 * dernier groupe `autre` — une ligne mal datée reste une ligne que
 * l'utilisateur voit (même règle que `concertsTri.ts`).
 */
export function grouperParMois(
  concerts: readonly Concert[],
  cles: readonly string[],
  langue: string,
): MoisConcerts[] {
  const groupes: MoisConcerts[] = [];
  const parCle = new Map<string, MoisConcerts>();
  concerts.forEach((c, i) => {
    const d = dateDe(c.event_date);
    const cle = d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` : 'autre';
    let g = parCle.get(cle);
    if (!g) {
      g = {
        cle,
        libelle: d ? capitaliser(formater(d, langue, { month: 'long', year: 'numeric' }), langue) : '',
        concerts: [],
        cles: [],
      };
      parCle.set(cle, g);
      groupes.push(g);
    }
    g.concerts.push(c);
    g.cles.push(cles[i] ?? `${cle}#${i}`);
  });
  // `autre` en dernier, quel que soit l'endroit où la première ligne mal datée est apparue.
  const autre = groupes.findIndex((g) => g.cle === 'autre');
  if (autre >= 0 && autre < groupes.length - 1) groupes.push(...groupes.splice(autre, 1));
  return groupes;
}

/** Les petits mots qui restent en minuscules au milieu d'un nom de lieu. */
const MOTS_MINUSCULES = new Set([
  'de', 'du', 'des', 'la', 'le', 'les', 'et', 'en', 'sur', 'sous', 'aux', 'au', 'à', 'lès', 'lez',
  'of', 'the', 'and', 'on', 'in', 'at',
  'der', 'die', 'das', 'am', 'im', 'an', 'und',
  'del', 'el', 'y', 'di', 'da', 'e', 'van', 'von',
]);

/**
 * « ZENITH DE DIJON » → « Zenith de Dijon ».
 *
 * Seul un nom écrit ENTIÈREMENT en capitales est transformé : un nom qui porte
 * déjà des minuscules a été écrit ainsi exprès (« Parc des Expositions »,
 * « AccorHotels Arena »), on n'y touche pas. Les mots courts usuels restent en
 * minuscules hors tête de nom ; les traits d'union et apostrophes sont
 * respectés (« ARC-ET-SENANS » → « Arc-et-Senans », « L'OLYMPIA » → « L'Olympia »).
 */
export function casseDeTitre(brut: string | null | undefined, langue = 'fr'): string {
  const s = (brut ?? '').trim();
  if (!s) return '';
  const aDesLettres = /\p{L}/u.test(s);
  if (!aDesLettres || s !== s.toLocaleUpperCase(langue)) return s;
  let premier = true;
  return s.replace(/\p{L}[\p{L}\p{M}]*/gu, (mot, index: number) => {
    const bas = mot.toLocaleLowerCase(langue);
    const avant = s.charAt(index - 1);
    // Une lettre isolée après une apostrophe (« D'ARTAGNAN ») est un élidé : on capitalise ce qui suit.
    const tete = premier;
    premier = false;
    if (!tete && MOTS_MINUSCULES.has(bas) && avant !== "'" && avant !== '’') return bas;
    if (bas.length === 1 && /['’]/.test(s.charAt(index + 1))) return tete ? bas.toLocaleUpperCase(langue) : bas;
    return bas.charAt(0).toLocaleUpperCase(langue) + bas.slice(1);
  });
}

/**
 * Les initiales de repli quand l'artiste n'a pas d'image dans la bibliothèque :
 * les initiales des deux premiers mots (« Jean-Louis Aubert » → « JA »), ou les
 * deux premières lettres d'un nom d'un seul mot (« Sting » → « ST »).
 */
export function initiales(nom: string | null | undefined): string {
  const mots = (nom ?? '').trim().split(/\s+/).filter((m) => /\p{L}|\p{N}/u.test(m));
  if (mots.length === 0) return '';
  const lettres = (m: string) => [...m].filter((c) => /\p{L}|\p{N}/u.test(c));
  if (mots.length === 1) return lettres(mots[0]).slice(0, 2).join('').toUpperCase();
  return (lettres(mots[0])[0] + lettres(mots[mots.length - 1])[0]).toUpperCase();
}

/** Une teinte stable par artiste (0 à `n - 1`), pour que deux vignettes voisines ne se confondent pas. */
export function teinteDe(nom: string | null | undefined, n = 5): number {
  let h = 0;
  for (const c of nom ?? '') h = (h * 31 + c.codePointAt(0)!) >>> 0;
  return h % n;
}

/** Clé de rapprochement d'un nom d'artiste : sans casse, sans accents, espaces réduits. */
export function cleArtiste(nom: string | null | undefined): string {
  return (nom ?? '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLocaleLowerCase('en')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Les images d'artiste de la bibliothèque, par clé de nom. Un artiste sans
 * image n'y figure pas ; deux homonymes : le premier qui a une image gagne.
 */
export function indexImagesArtistes(
  artistes: readonly { name?: string | null; image_path?: string | null }[] | null | undefined,
): Map<string, string> {
  const index = new Map<string, string>();
  for (const a of artistes ?? []) {
    const image = (a.image_path ?? '').trim();
    const cle = cleArtiste(a.name);
    if (image && cle && !index.has(cle)) index.set(cle, image);
  }
  return index;
}

/**
 * La liste des pays filtrée par la recherche : sur le nom affiché OU le code
 * ISO, sans casse ni accents (« allem » trouve « Allemagne », « ch » trouve la
 * Suisse par son code). L'ordre reçu est conservé.
 */
export function filtrerPays<T extends { code: string; nom: string }>(options: readonly T[], requete: string): T[] {
  const q = cleArtiste(requete);
  if (!q) return [...options];
  return options.filter((o) => cleArtiste(o.nom).includes(q) || o.code.toLowerCase() === q);
}
