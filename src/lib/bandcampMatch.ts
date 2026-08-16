/** Rapprochement d'une collection Bandcamp avec la bibliothèque locale.
 *
 * Séparé du composant à dessein : c'est la seule partie qui peut se tromper
 * en silence, et la seule qui mérite des tests. Un écran qui affiche mal se
 * voit ; un rapprochement qui classe mal ne se voit pas — il annonce comme
 * « manquant » un album pourtant présent, ou l'inverse.
 */

/** Normaliser un titre pour la comparaison.
 *
 * Le point délicat, et la raison d'être de ce module : les acheteurs rangent
 * leurs albums avec la mention d'édition que Bandcamp ne porte pas. La
 * bibliothèque d'Yves contient par exemple `A Distortion Of Love
 * [2013 SACD Reissue]`, alors que Bandcamp dit `A Distortion Of Love`. Une
 * comparaison naïve les déclarerait différents et lui annoncerait comme
 * « à télécharger » un disque qu'il possède déjà — exactement le contraire du
 * service rendu.
 *
 * On retire donc : les accents, la ponctuation, les mentions d'édition entre
 * parenthèses ou crochets, et les articles de tête. Ce qui reste est comparé.
 */
export function normaliser(s: string | null | undefined): string {
  if (!s) return '';
  return (
    s
      .normalize('NFD')
      // Diacritiques : « Björk » et « Bjork » sont le même artiste.
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      // Mentions d'édition, de remaster, de réédition — entre parenthèses ou
      // crochets. C'est là que se joue l'essentiel des faux « manquants ».
      .replace(/[([][^)\]]*\b(deluxe|edition|remaster(ed)?|reissue|anniversary|expanded|bonus|version|sacd|hdcd|mono|stereo|disc\s*\d+)\b[^)\]]*[)\]]/g, ' ')
      // Millésimes seuls entre crochets : « [2013] ».
      .replace(/[([]\s*(19|20)\d{2}\s*[)\]]/g, ' ')
      // Apostrophes SUPPRIMÉES, pas remplacées par une espace : les traiter
      // comme le reste de la ponctuation couperait « Pepper's » en
      // « pepper s », qui ne s'apparie plus avec « Peppers ». Un test l'a
      // attrapé — les quatre variantes typographiques comptent.
      .replace(/['’`´]/g, '')
      .replace(/[^a-z0-9]+/g, ' ')
      .replace(/^(the|le|la|les|a|an)\s+/, '')
      .trim()
  );
}

/** Clé de rapprochement : artiste + album, tous deux normalisés. */
export function cle(artiste: string | null | undefined, album: string | null | undefined): string {
  return `${normaliser(artiste)}::${normaliser(album)}`;
}

export type Verdict = 'presente' | 'manquante' | 'ambigue';

export interface Rapprochement<T> {
  article: T;
  verdict: Verdict;
  /** Titre local retenu, quand il y en a un — pour que l'utilisateur juge. */
  correspondance?: string;
}

/** Classer chaque article de la collection face aux albums locaux.
 *
 * Trois verdicts, et le troisième compte autant que les deux autres : une
 * correspondance approximative annoncée comme certaine est pire que pas de
 * correspondance du tout. On ne devine pas à la place de l'utilisateur.
 *
 * - `presente` : artiste ET album correspondent après normalisation ;
 * - `ambigue`  : l'artiste correspond, et un album local CONTIENT le titre
 *                acheté (ou l'inverse) sans lui être égal — typiquement une
 *                édition, un coffret, ou un titre tronqué au rangement ;
 * - `manquante`: rien ne correspond.
 */
export function rapprocher<T extends { artist: string; title: string; type?: string }>(
  collection: T[],
  albumsLocaux: { artist?: string | null; title?: string | null }[],
): Rapprochement<T>[] {
  const exacts = new Map<string, string>();
  // Par artiste normalisé → titres normalisés, pour l'examen approximatif.
  const parArtiste = new Map<string, { norm: string; brut: string }[]>();

  for (const a of albumsLocaux) {
    const na = normaliser(a.artist);
    const nt = normaliser(a.title);
    if (!nt) continue;
    exacts.set(`${na}::${nt}`, a.title ?? '');
    const liste = parArtiste.get(na) ?? [];
    liste.push({ norm: nt, brut: a.title ?? '' });
    parArtiste.set(na, liste);
  }

  return collection.map((article) => {
    const na = normaliser(article.artist);
    const nt = normaliser(article.title);
    const exact = exacts.get(`${na}::${nt}`);
    if (exact !== undefined) {
      return { article, verdict: 'presente' as const, correspondance: exact };
    }
    // Inclusion dans un sens ou dans l'autre, à artiste égal. Le garde-fou des
    // 4 caractères évite qu'un titre très court (« Up », « X ») ne s'apparie
    // avec la moitié de la discographie.
    if (nt.length >= 4) {
      for (const cand of parArtiste.get(na) ?? []) {
        if (cand.norm.includes(nt) || nt.includes(cand.norm)) {
          return { article, verdict: 'ambigue' as const, correspondance: cand.brut };
        }
      }
    }
    return { article, verdict: 'manquante' as const };
  });
}
