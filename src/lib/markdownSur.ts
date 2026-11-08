/**
 * LE RENDU MARKDOWN ASSAINI des notes personnelles — web#2653.
 *
 * Le serveur (tune-server-rust#7849) garde le texte d'une note BRUT : c'est au
 * client de le rendre sans danger. Ce module est la SEULE source du
 * `{@html}` de `MesNotes.svelte`.
 *
 * Les trois règles de l'issue :
 *
 * 1. AUCUN HTML BRUT. Le Markdown autorise le HTML en ligne (`<script>`,
 *    `<img onerror=…>`) : chaque jeton `html` de `marked` est rendu ÉCHAPPÉ,
 *    donc affiché comme du texte, jamais interprété.
 * 2. AUCUN SCRIPT. Avec 1, il ne reste que les adresses : `[x](javascript:…)`,
 *    `data:`, `vbscript:`… Un lien dont l'adresse n'est pas `https:` est
 *    rendu en TEXTE (son libellé seul).
 * 3. LIENS EN HTTPS SEULEMENT, ouverts dans un nouvel onglet, sans transmettre
 *    l'origine (`rel="noopener noreferrer nofollow"`).
 *
 * Les IMAGES ne sont jamais chargées : une image distante dans une note privée
 * préviendrait son hébergeur à chaque ouverture de la fiche. Une image en
 * `https:` devient un lien vers elle, sinon son texte alternatif.
 *
 * Une instance `Marked` PROPRE : `marked.use()` réglerait l'instance globale,
 * partagée avec tout autre appelant du paquet.
 */
import { Marked, type Tokens } from 'marked';

const ECHAPPEMENTS: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

export function echapper(texte: string): string {
  return texte.replace(/[&<>"']/g, (c) => ECHAPPEMENTS[c]);
}

/** L'adresse si elle est absolue et en `https:`, sinon `null`. */
export function adresseHttps(href: string | null | undefined): string | null {
  if (!href) return null;
  let u: URL;
  try {
    u = new URL(href.trim());
  } catch {
    return null;
  }
  return u.protocol === 'https:' ? u.href : null;
}

function lien(adresse: string, contenu: string, titre?: string | null): string {
  const t = titre ? ` title="${echapper(titre)}"` : '';
  return `<a href="${echapper(adresse)}"${t} target="_blank" rel="noopener noreferrer nofollow">${contenu}</a>`;
}

const moteur = new Marked({
  gfm: true,
  breaks: true,
  async: false,
  renderer: {
    html(jeton: Tokens.HTML | Tokens.Tag): string {
      return echapper(jeton.text);
    },
    link(this: any, jeton: Tokens.Link): string {
      const contenu = this.parser.parseInline(jeton.tokens);
      const adresse = adresseHttps(jeton.href);
      return adresse ? lien(adresse, contenu, jeton.title) : contenu;
    },
    image(jeton: Tokens.Image): string {
      const alt = echapper(jeton.text || '');
      const adresse = adresseHttps(jeton.href);
      return adresse ? lien(adresse, alt || echapper(adresse), jeton.title) : alt;
    },
    // Les cases à cocher des listes de tâches : rendues en caractères, pas en
    // `<input>` — aucun élément de formulaire dans une note.
    checkbox(jeton: Tokens.Checkbox): string {
      return jeton.checked ? '☑ ' : '☐ ';
    },
  },
});

/** Le HTML sûr d'un texte Markdown de note. */
export function rendreMarkdownSur(texte: string | null | undefined): string {
  if (!texte) return '';
  return moteur.parse(texte, { async: false }) as string;
}
