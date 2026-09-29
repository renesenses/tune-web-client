/**
 * L'ordre ALPHABÉTIQUE des genres, artistes, albums et listes de lecture :
 * le même que celui du serveur (#1772, suite de tune-server-rust#4956,
 * décision de Bertrand du 29/09/2026).
 *
 * C'est la transcription de `comparer_alphabetique`
 * (`tune-core/src/upnp_server/dossiers.rs`), règle pour règle :
 *
 * - les signes, la ponctuation et les espaces de TÊTE ne comptent pas :
 *   « (Hip-Hop) » se range à H, « 'Jazz » à J, « ␣Blues » à B ;
 * - les suites de chiffres se comparent par leur VALEUR : « 9s » avant
 *   « 10s », « 007 » vaut « 7 » ; un nombre passe avant du texte ;
 * - la casse et les accents sont ignorés (même table de repli que le
 *   serveur, `sans_accents_minuscule`) ;
 * - deux libellés de même clé sont départagés par le texte brut, en ordre de
 *   points de code (celui des `&str` en Rust) : l'ordre est total, donc stable.
 *
 * Pas d'`Intl.Collator` : ses règles dépendent de la langue du navigateur et
 * de sa version d'ICU, et ne sont pas celles du serveur. Un même rayon doit
 * se lire dans le même ordre sur le web et sur un lecteur DLNA.
 */

/** Un morceau de clé : un nombre (par longueur, puis chiffres) ou du texte. */
type Morceau = { nombre: true; chiffres: string } | { nombre: false; texte: string };

const REPLI: Record<string, string> = {
  à: 'a', á: 'a', â: 'a', ã: 'a', ä: 'a', å: 'a',
  ç: 'c',
  è: 'e', é: 'e', ê: 'e', ë: 'e',
  ì: 'i', í: 'i', î: 'i', ï: 'i',
  ñ: 'n',
  ò: 'o', ó: 'o', ô: 'o', õ: 'o', ö: 'o',
  ù: 'u', ú: 'u', û: 'u', ü: 'u',
  ý: 'y', ÿ: 'y',
};

/** `char::is_alphanumeric` de Rust : propriété Alphabetic, ou catégorie N. */
const SIGNES_DE_TETE = /^[^\p{Alphabetic}\p{N}]+/u;

/**
 * Minuscule Unicode caractère par caractère, PUIS repli des accents — comme
 * le serveur. Par caractère, et non sur la chaîne entière : `toLowerCase` sur
 * une chaîne applique le sigma final (« Σ » → « ς »), que Rust n'applique pas.
 */
function sansAccentsMinuscule(s: string): string {
  let out = '';
  for (const c of s) {
    for (const m of c.toLowerCase()) out += REPLI[m] ?? m;
  }
  return out;
}

function cleNaturelle(s: string): Morceau[] {
  const replie = sansAccentsMinuscule(s.replace(SIGNES_DE_TETE, ''));
  const morceaux: Morceau[] = [];
  const re = /[0-9]+|[^0-9]+/g;
  for (const [m] of replie.matchAll(re)) {
    if (m.charCodeAt(0) >= 48 && m.charCodeAt(0) <= 57) {
      // Les zéros de tête ne comptent pas : « 007 » vaut « 7 ».
      morceaux.push({ nombre: true, chiffres: m.replace(/^0+/, '') });
    } else {
      morceaux.push({ nombre: false, texte: m });
    }
  }
  return morceaux;
}

/**
 * Compare deux chaînes en ordre de POINTS DE CODE, l'ordre des `&str` Rust.
 * L'opérateur `<` de JS compare des unités UTF-16 : il range un caractère
 * hors plan de base (paire de substituts, 0xD800–0xDFFF) avant U+E000–U+FFFF.
 * On corrige l'unité au premier écart, sans rien allouer.
 */
function comparerPointsDeCode(a: string, b: string): number {
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    let x = a.charCodeAt(i);
    let y = b.charCodeAt(i);
    if (x === y) continue;
    if (x >= 0xd800) x += x >= 0xe000 ? -0x800 : 0x2000;
    if (y >= 0xd800) y += y >= 0xe000 ? -0x800 : 0x2000;
    return x < y ? -1 : 1;
  }
  return a.length === b.length ? 0 : a.length < b.length ? -1 : 1;
}

function comparerMorceaux(x: Morceau, y: Morceau): number {
  if (x.nombre && y.nombre) {
    // La longueur passe avant les chiffres, donc 9 < 10.
    if (x.chiffres.length !== y.chiffres.length) return x.chiffres.length < y.chiffres.length ? -1 : 1;
    return comparerPointsDeCode(x.chiffres, y.chiffres);
  }
  // Les nombres passent avant le texte, comme dans un explorateur.
  if (x.nombre) return -1;
  if (y.nombre) return 1;
  return comparerPointsDeCode(x.texte, y.texte);
}

/**
 * Les clés déjà calculées : un tri de 4 000 albums fait des dizaines de
 * milliers de comparaisons sur les mêmes libellés. Vidé au-delà d'un plafond
 * pour ne pas grossir sans fin.
 */
const cles = new Map<string, Morceau[]>();
const PLAFOND_CLES = 50_000;

function cleDe(s: string): Morceau[] {
  let k = cles.get(s);
  if (!k) {
    if (cles.size >= PLAFOND_CLES) cles.clear();
    k = cleNaturelle(s);
    cles.set(s, k);
  }
  return k;
}

/**
 * Comparateur de `Array.prototype.sort` pour l'ordre alphabétique commun au
 * web et au serveur. `null` et `undefined` valent la chaîne vide.
 */
export function comparerAlphabetique(a: string | null | undefined, b: string | null | undefined): number {
  const sa = a ?? '';
  const sb = b ?? '';
  const ka = cleDe(sa);
  const kb = cleDe(sb);
  const n = Math.min(ka.length, kb.length);
  for (let i = 0; i < n; i++) {
    const c = comparerMorceaux(ka[i], kb[i]);
    if (c !== 0) return c;
  }
  if (ka.length !== kb.length) return ka.length < kb.length ? -1 : 1;
  return comparerPointsDeCode(sa, sb);
}

/**
 * La lettre du rail A–Z sous laquelle `comparerAlphabetique` range un
 * libellé : la première lettre après les signes de tête, sans accent, en
 * majuscule — « # » pour un chiffre ou tout le reste. Le rail et l'ordre
 * doivent dire la même chose : « (Hip-Hop) », rangé à H, s'annonce sous H,
 * pas sous « # » au milieu des H.
 */
export function initialeAlphabetique(s: string | null | undefined): string {
  const c = sansAccentsMinuscule((s ?? '').replace(SIGNES_DE_TETE, '')).charAt(0).toUpperCase();
  return c >= 'A' && c <= 'Z' ? c : '#';
}

/** Ce qu'il faut d'un artiste pour le ranger. */
export interface ArtisteTriable {
  id?: number | null;
  name?: string | null;
  sort_name?: string | null;
}

/**
 * La clé de tri d'un artiste, celle du serveur (`trier_artistes`, #4956,
 * décision de Bertrand du 29/09/2026) : le nom de tri s'il est renseigné
 * (« Beatles, The »), sinon le nom. Un nom de tri vide ou fait d'espaces ne
 * compte pas.
 */
export function cleDeTriArtiste(a: ArtisteTriable): string {
  const s = a.sort_name;
  return s != null && s.trim() !== '' ? s : (a.name ?? '');
}

/**
 * L'ordre des artistes du serveur : `comparerAlphabetique` sur
 * `cleDeTriArtiste`, et à clé égale l'identifiant (un id absent passe en
 * premier, comme `None` en Rust).
 */
export function comparerArtistes(a: ArtisteTriable, b: ArtisteTriable): number {
  const c = comparerAlphabetique(cleDeTriArtiste(a), cleDeTriArtiste(b));
  if (c !== 0) return c;
  const ia = a.id ?? null, ib = b.id ?? null;
  if (ia === ib) return 0;
  if (ia === null) return -1;
  if (ib === null) return 1;
  return ia < ib ? -1 : 1;
}

/**
 * La lettre d'un album sur le rail A–Z de la Bibliothèque : celle de son
 * artiste au tri Artiste, celle de son titre sinon.
 *
 * Une seule règle, en pages comme hors pages : depuis tune-server-rust#5423,
 * l'API paginée range les albums par `comparer_alphabetique` (titre, ou nom
 * d'artiste `ar.name` au tri Artiste). La dichotomie d'`offsetDeLettre`
 * exige une initiale qui croisse le long de CET ordre : « (Inédit) », rangé
 * à I par le serveur, doit s'annoncer sous I — sous « # », le saut à I
 * tomberait une case trop loin.
 */
export function initialeAlbum(
  a: { title?: string | null; artist_name?: string | null },
  parArtiste: boolean,
): string {
  return initialeAlphabetique(parArtiste ? a.artist_name : a.title);
}
