/**
 * LE COLLAGE D'UNE PAGE WEB DANS « MES NOTES » — demande de Ralph_Cramden
 * (ASR), validée le 19/11/2026.
 *
 * Coller un extrait de page (Wikipédia, un article…) dans la note doit donner
 * du MARKDOWN, pas le texte brut : liens, gras, italique, titres, listes,
 * paragraphes, citations. Le reste (scripts, styles, images, formulaires,
 * tableaux complexes, attributs) est ignoré.
 *
 * 🔴 SÉCURITÉ. Ce module ne produit JAMAIS de HTML : il ne lit que le texte
 * des nœuds et quelques balises connues, et échappe les caractères qui
 * feraient du balisage (`<`, `*`, `[`…). Un lien n'est gardé que si son
 * adresse, une fois absolue, est en `http:` ou `https:` — `javascript:`,
 * `data:`, `vbscript:`… ne laissent que leur libellé. `DOMParser` construit
 * un document INERTE : ni script exécuté, ni image chargée. Et le rendu de la
 * note passe toujours par `rendreMarkdownSur` (`lib/markdownSur`), qui ne
 * garde lui-même que les liens `https:`.
 */

export interface OptionsCollage {
  /** L'adresse de la page source, quand le navigateur la donne. */
  adresseSource?: string | null;
}

/** Ignorés AVEC leur contenu. */
const IGNORES = new Set([
  'script', 'style', 'noscript', 'template', 'head', 'title', 'meta', 'link',
  'img', 'picture', 'svg', 'math', 'canvas', 'video', 'audio', 'iframe',
  'object', 'embed', 'form', 'input', 'button', 'select', 'textarea',
  'map', 'area', 'source', 'track', 'dialog',
]);

/** Les appels de note `[1]` et les liens « modifier » de Wikipédia. */
const CLASSES_IGNOREES = ['reference', 'mw-editsection', 'noprint'];

const BLOCS = new Set([
  'p', 'div', 'section', 'article', 'main', 'header', 'footer', 'aside', 'nav',
  'figure', 'figcaption', 'address', 'dl', 'dt', 'dd', 'center', 'details', 'summary',
  'body', 'html',
]);

/** L'adresse de la page source : `<base href>` ou l'en-tête Windows `SourceURL:`. */
function sourceDans(entete: string, doc: Document): string | null {
  const base = doc.querySelector('base[href]')?.getAttribute('href');
  if (base) return base;
  const m = /^SourceURL:(\S+)/m.exec(entete);
  return m ? m[1] : null;
}

/** L'adresse absolue en `http(s):`, sinon `null` (relative sans source, autre schéma). */
export function adresseCollee(href: string | null, source: string | null): string | null {
  if (!href) return null;
  const brut = href.trim();
  if (!brut || brut.startsWith('#')) return null;
  let base: URL | undefined;
  try {
    base = source ? new URL(source) : undefined;
  } catch {
    base = undefined;
  }
  if (base && base.protocol !== 'http:' && base.protocol !== 'https:') base = undefined;
  let u: URL;
  try {
    u = base ? new URL(brut, base) : new URL(brut);
  } catch {
    return null;
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
  // Une adresse sans espace ni parenthèse : elle ne peut pas sortir de `(…)`.
  return u.href.replace(/[\s()<>]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0')}`);
}

// Les marques de structure (préfixes de titre, liste, citation) sont posées
// entre DEBUT et FIN, leurs espaces en ESPACE : la normalisation des espaces
// ne les touche pas, et la protection des débuts de ligne les distingue du
// texte collé. Un bloc de code est mis de côté et remplacé par CODE<n>CODE.
const DEBUT = '\uE000';
const FIN = '\uE001';
const ESPACE = '\uE002';
const CODE = '\uE003';
const RESERVES = /[\uE000-\uE003]/g;

function marque(s: string): string {
  return DEBUT + s.replace(/ /g, ESPACE) + FIN;
}

/** Le texte d'un nœud, ses caractères de balisage Markdown neutralisés. */
function echapperTexte(texte: string): string {
  return texte
    .replace(RESERVES, '')
    .replace(/[\\`*[\]<>|~]/g, (c) => `\\${c}`)
    .replace(/&(?=#?\w+;)/g, '\\&')
    .replace(/(^|\W)_|_(?=\W|$)/g, (m) => m.replace('_', '\\_'));
}

/** Un début de ligne qui ferait un titre, une citation ou une liste. */
function echapperDebut(ligne: string): string {
  return ligne
    .replace(/^(#{1,6}(?:\s|$)|[>+=-])/, '\\$1')
    .replace(/^(\d+)([.)])(?=\s|$)/, '$1\\$2');
}

/** Normalise un morceau de Markdown : lignes rognées, une ligne vide au plus. */
function normaliser(md: string): string {
  return md
    .split('\n')
    .map((l) => l.replace(/[ \t]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function prefixer(md: string, premier: string, suite: string): string {
  return md
    .split('\n')
    .map((l, i) => (i === 0 ? marque(premier) : l ? marque(suite) : suite.trim() ? marque(suite.trimEnd()) : '') + l)
    .join('\n');
}

/** Entoure `contenu` d'un marqueur, les espaces de bord laissés dehors. */
function entourer(contenu: string, marque: string): string {
  const m = /^(\s*)([\s\S]*?)(\s*)$/.exec(contenu)!;
  if (!m[2]) return contenu;
  return `${m[1]}${marque}${m[2]}${marque}${m[3]}`;
}

class Convertisseur {
  riche = false;
  codes: string[] = [];
  constructor(private source: string | null) {}

  /** Le contenu d'un élément, blocs séparés par des lignes vides. */
  enfants(el: Node, dansLien = false): string {
    let sortie = '';
    for (const n of Array.from(el.childNodes)) sortie += this.noeud(n, dansLien);
    return sortie;
  }

  /** Un bloc : son contenu normalisé (débuts de ligne protégés à la fin, par `finir`). */
  bloc(el: Node): string {
    return normaliser(this.enfants(el));
  }

  noeud(n: Node, dansLien: boolean): string {
    if (n.nodeType === 3) return echapperTexte((n.nodeValue ?? '').replace(/\s+/g, ' '));
    if (n.nodeType !== 1) return '';
    const el = n as Element;
    const nom = el.localName;
    if (IGNORES.has(nom) || el.getAttribute('hidden') !== null || el.getAttribute('aria-hidden') === 'true'
      || CLASSES_IGNOREES.some((c) => el.classList.contains(c))) return '';
    switch (nom) {
      case 'br':
        return '\n';
      case 'strong':
      case 'b': {
        const c = this.enfants(el, dansLien);
        if (!c.trim()) return c;
        this.riche = true;
        return entourer(c.replace(/\n+/g, ' '), '**');
      }
      case 'em':
      case 'i':
      case 'cite':
      case 'dfn': {
        const c = this.enfants(el, dansLien);
        if (!c.trim()) return c;
        this.riche = true;
        return entourer(c.replace(/\n+/g, ' '), '*');
      }
      case 'a': {
        const c = this.enfants(el, true).replace(/\n+/g, ' ');
        const adresse = dansLien ? null : adresseCollee(el.getAttribute('href'), this.source);
        if (!adresse || !c.trim()) return c;
        this.riche = true;
        const m = /^(\s*)([\s\S]*?)(\s*)$/.exec(c)!;
        return `${m[1]}[${m[2]}](${adresse})${m[3]}`;
      }
      case 'h1': case 'h2': case 'h3': case 'h4': case 'h5': case 'h6': {
        const c = this.bloc(el).replace(/\n+/g, ' ');
        if (!c) return '';
        this.riche = true;
        return `\n\n${marque(`${'#'.repeat(Number(nom[1]))} `)}${c}\n\n`;
      }
      case 'ul':
      case 'ol': {
        // Sous-liste : collée à la ligne de son élément, la liste reste serrée.
        const avant = el.parentElement?.localName === 'li' ? '\n' : '\n\n';
        return `${avant}${this.liste(el, nom === 'ol')}\n\n`;
      }
      case 'li':
        // Un `<li>` hors liste (extrait coupé au milieu d'une liste).
        return `\n\n${this.liste(el, false, [el])}\n\n`;
      case 'blockquote': {
        const c = this.bloc(el);
        if (!c) return '';
        this.riche = true;
        return `\n\n${prefixer(c, '> ', '> ')}\n\n`;
      }
      case 'pre': {
        const c = (el.textContent ?? '').replace(RESERVES, '').replace(/\n+$/, '');
        if (!c.trim()) return '';
        const plus = Math.max(2, ...(c.match(/`+/g) ?? []).map((s) => s.length));
        const cloture = '`'.repeat(plus + 1);
        this.codes.push(`${cloture}\n${c}\n${cloture}`);
        return `\n\n${CODE}${this.codes.length - 1}${CODE}\n\n`;
      }
      case 'table':
        return `\n\n${this.tableau(el)}\n\n`;
      case 'hr':
        return '\n\n';
      default:
        if (BLOCS.has(nom)) return `\n\n${this.enfants(el, dansLien)}\n\n`;
        return this.enfants(el, dansLien);
    }
  }

  liste(el: Element, ordonnee: boolean, items?: Element[]): string {
    const lis = items ?? Array.from(el.children).filter((c) => c.localName === 'li');
    let numero = ordonnee ? Number.parseInt(el.getAttribute('start') ?? '1', 10) : 0;
    if (!Number.isFinite(numero)) numero = 1;
    const lignes: string[] = [];
    for (const li of lis) {
      const c = this.bloc(li);
      if (!c) continue;
      this.riche = true;
      const marque = ordonnee ? `${numero++}. ` : '- ';
      lignes.push(prefixer(c, marque, ' '.repeat(marque.length)));
    }
    return lignes.join('\n');
  }

  /** Un tableau simple : une ligne par rangée. Fusions ou tableau imbriqué : ignoré. */
  tableau(el: Element): string {
    if (el.querySelector('table, [rowspan]:not([rowspan="1"]), [colspan]:not([colspan="1"])')) return '';
    const rangees = Array.from(el.querySelectorAll('tr'));
    return rangees
      .map((tr) =>
        Array.from(tr.children)
          .filter((c) => c.localName === 'td' || c.localName === 'th')
          .map((c) => this.bloc(c).replace(/\n+/g, ' '))
          .filter(Boolean)
          .join(' · '),
      )
      .filter(Boolean)
      .join('\n\n');
  }
}

/** Protège les débuts de ligne du texte, puis pose marques et blocs de code. */
function finir(md: string, codes: string[]): string {
  const re = new RegExp(`^((?:${DEBUT}[^${FIN}]*${FIN})*)(.*)$`);
  const code = new RegExp(`^${CODE}(\\d+)${CODE}$`);
  const lignes: string[] = [];
  for (const l of md.split('\n')) {
    const [, prefixes, reste] = re.exec(l)!;
    const devant = prefixes.replace(new RegExp(`[${DEBUT}${FIN}]`, 'g'), '').replace(new RegExp(ESPACE, 'g'), ' ');
    const c = code.exec(reste);
    if (c) {
      const suite = devant.replace(/(?:\d+\.|-) /g, (m) => ' '.repeat(m.length));
      codes[Number(c[1])].split('\n').forEach((ligne, i) => lignes.push((i === 0 ? devant : suite) + ligne));
    } else {
      lignes.push(devant + echapperDebut(reste));
    }
  }
  return lignes.join('\n');
}

/**
 * Le Markdown d'un collage `text/html`, ou `null` quand le HTML n'apporte
 * aucune mise en forme (lien, gras, italique, titre, liste, citation) : le
 * navigateur colle alors le texte brut comme d'habitude.
 */
export function htmlVersMarkdown(html: string, options: OptionsCollage = {}): string | null {
  if (!html || typeof DOMParser === 'undefined') return null;
  const source = options.adresseSource ?? null;
  // Format Windows (CF_HTML) : un en-tête `Version:… SourceURL:…` avant le HTML.
  const entete = /^Version:\d/.test(html) && html.indexOf('<') > 0 ? html.slice(0, html.indexOf('<')) : '';
  const doc = new DOMParser().parseFromString(html.slice(entete.length), 'text/html');
  const conv = new Convertisseur(source ?? sourceDans(entete, doc));
  const brut = conv.bloc(doc.body);
  if (!conv.riche || !brut) return null;
  return finir(brut, conv.codes);
}
