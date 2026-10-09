/**
 * ATTRIBUTION D'UNE BIOGRAPHIE — d'où vient le texte, sous quelle licence.
 *
 * Décision de Bertrand, 06/10/2026, préalable à site-mozaiklabs#278 : quand
 * l'IA est indisponible, le site publie l'extrait Wikipédia comme bio
 * d'artiste ou d'album. La licence CC BY-SA 4.0 exige qu'on le dise : la
 * source, un lien vers l'article, la licence et un lien vers son texte.
 *
 * Le serveur porte la provenance sous `bio_provenance`
 * (`{ source, source_url, license, lang, fetched_at }`, tune-server-rust,
 * `artist_repo::bio_provenance` / `album_repo::bio_provenance`), sur
 * `GET /library/artists/{id}`, `GET /library/albums/{id}` et les deux routes
 * `/bio`. Le chemin « proxy communautaire » des routes `/bio`, lui, ne rend
 * qu'un `source` à plat : on le lit aussi, faute de mieux.
 *
 * Règles :
 *  - pas de provenance (serveur ancien) → aucune ligne ;
 *  - bio IA (`ai`, `claude`) ou étiquette de repli `community` → aucune ligne ;
 *  - Wikipédia → nom, article, licence ; sans licence explicite, CC BY-SA 4.0,
 *    qui est celle de tout le texte de Wikipédia ;
 *  - autre source → son nom, et l'article et la licence s'ils sont fournis ;
 *  - un lien n'est posé que sur une URL http(s).
 */

export interface BioProvenance {
  source?: string | null;
  source_url?: string | null;
  license?: string | null;
  lang?: string | null;
  fetched_at?: string | null;
}

export interface AttributionBio {
  /** Clé i18n du nom de la source quand il se traduit (Wikipédia). */
  cleSource: string | null;
  /** Nom de la source quand c'est un nom propre invariable. */
  nomSource: string | null;
  /** URL http(s) de l'article, ou null. */
  urlArticle: string | null;
  /** Titre lisible de l'article (Wikipédia), sinon null → libellé générique. */
  titreArticle: string | null;
  /** Licence telle qu'on l'affiche (« CC BY-SA 4.0 »), ou null. */
  licence: string | null;
  /** URL du texte de la licence, ou null. */
  urlLicence: string | null;
}

/** Sources pour lesquelles on n'affiche rien : texte généré, ou repli muet. */
const SANS_ATTRIBUTION = new Set(['ai', 'claude', 'community']);

const NOMS_PROPRES: Record<string, string> = {
  lastfm: 'Last.fm',
  'last.fm': 'Last.fm',
  musicbrainz: 'MusicBrainz',
  theaudiodb: 'TheAudioDB',
  qobuz: 'Qobuz',
  discogs: 'Discogs',
};

const texte = (v: unknown): string | null =>
  typeof v === 'string' && v.trim() ? v.trim() : null;

/**
 * La provenance d'une réponse : `bio_provenance` d'abord, sinon les champs à
 * plat (`source`, `source_url`, `license`) du chemin proxy.
 */
export function provenanceDe(reponse: unknown): BioProvenance | null {
  if (!reponse || typeof reponse !== 'object') return null;
  const r = reponse as Record<string, unknown>;
  const p = r.bio_provenance;
  if (p && typeof p === 'object' && texte((p as BioProvenance).source)) {
    return p as BioProvenance;
  }
  if (texte(r.source)) {
    return {
      source: texte(r.source),
      source_url: texte(r.source_url),
      license: texte(r.license),
    };
  }
  return null;
}

function urlSure(u: unknown): string | null {
  const s = texte(u);
  if (!s) return null;
  try {
    const url = new URL(s);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null;
  } catch {
    return null;
  }
}

function estWikipedia(source: string, url: string | null): boolean {
  if (source === 'wikipedia') return true;
  if (!url) return false;
  try {
    return new URL(url).hostname.endsWith('wikipedia.org');
  } catch {
    return false;
  }
}

/** « https://fr.wikipedia.org/wiki/Bill_Evans » → « Bill Evans ». */
function titreWikipedia(url: string): string | null {
  try {
    const u = new URL(url);
    if (!u.hostname.endsWith('wikipedia.org')) return null;
    const m = u.pathname.match(/^\/wiki\/(.+)$/);
    if (!m) return null;
    return decodeURIComponent(m[1]).replace(/_/g, ' ').trim() || null;
  } catch {
    return null;
  }
}

/**
 * « CC BY-SA 4.0 », « CC-BY-SA-4.0 », « cc by-sa 3.0 »… → libellé canonique et
 * URL creativecommons.org. Une licence non Creative Commons garde son texte,
 * sans lien.
 */
export function licenceLisible(brute: string): { libelle: string; url: string | null } {
  const m = brute.trim().match(/^cc[\s_-]*(by(?:[\s_-]+(?:sa|nc|nd))*)[\s_-]+(\d(?:\.\d)?)$/i);
  if (!m) return { libelle: brute.trim(), url: null };
  const parties = m[1].toLowerCase().split(/[\s_-]+/);
  const version = m[2].includes('.') ? m[2] : `${m[2]}.0`;
  return {
    libelle: `CC ${parties.join('-').toUpperCase()} ${version}`,
    url: `https://creativecommons.org/licenses/${parties.join('-')}/${version}/`,
  };
}

export function attributionBio(p: BioProvenance | null | undefined): AttributionBio | null {
  const source = texte(p?.source)?.toLowerCase();
  if (!p || !source || SANS_ATTRIBUTION.has(source)) return null;

  const urlArticle = urlSure(p.source_url);
  const wiki = estWikipedia(source, urlArticle);
  const licenceBrute = texte(p.license) ?? (wiki ? 'CC BY-SA 4.0' : null);
  const nomPropre = NOMS_PROPRES[source] ?? null;

  // Une source inconnue qui n'apporte ni article ni licence ne dit rien
  // d'utile : on se tait plutôt que d'afficher une étiquette interne.
  if (!wiki && !nomPropre && !urlArticle && !licenceBrute) return null;

  let licence: string | null = null;
  let urlLicence: string | null = null;
  if (licenceBrute) {
    const l = licenceLisible(licenceBrute);
    // TheAudioDB rend `license: "TheAudioDB"` : répéter le nom n'apprend rien.
    const nom = (nomPropre ?? texte(p.source) ?? '').toLowerCase();
    if (l.libelle.toLowerCase() !== nom) {
      licence = l.libelle;
      urlLicence = l.url;
    }
  }

  return {
    cleSource: wiki ? 'v2.bioAttr.wikipedia' : null,
    nomSource: wiki ? null : nomPropre ?? texte(p.source),
    urlArticle,
    titreArticle: urlArticle && wiki ? titreWikipedia(urlArticle) : null,
    licence,
    urlLicence,
  };
}
