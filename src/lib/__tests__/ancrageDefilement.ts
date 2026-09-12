/**
 * Outil d'analyse pour les gardes d'ancrage (#925, #907, #887).
 *
 * 🔴 POURQUOI CE FICHIER EXISTE
 *
 * Un `position: sticky` ne tient que si AUCUN ancêtre, entre l'élément et son
 * conteneur de défilement, ne porte `overflow` (autre que `visible`),
 * `contain`, `content-visibility`, `transform`, `filter`, `perspective`,
 * `backdrop-filter` ou `will-change`. Un tel ancêtre devient le nouveau bloc
 * conteneur, et l'en-tête « épinglé » repart avec le contenu — SANS erreur,
 * sans avertissement, et sans qu'aucun test unitaire ordinaire ne bronche : la
 * règle CSS est toujours là, elle ne sert simplement plus à rien.
 *
 * Vérifier la présence de `position: sticky` est donc une garde honnête mais
 * faible. La garde qui a de la valeur est celle-ci : personne n'a posé une
 * propriété bloquante SUR LE CHEMIN. C'est elle qui casse en silence, c'est
 * donc elle qu'on tient.
 *
 * jsdom ne met rien en page (aucune hauteur, aucun défilement) : on ne peut pas
 * mesurer ici. On lit donc le source — la chaîne d'ancêtres depuis le gabarit,
 * les déclarations depuis la feuille de style du composant.
 */

/** Une règle CSS : son sélecteur brut et ses déclarations. */
export interface Regle {
  selecteur: string;
  declarations: Record<string, string>;
}

/** Les propriétés qui, sur un ancêtre, annulent un `sticky` en silence. */
export const PROPRIETES_BLOQUANTES: Record<string, (valeur: string) => boolean> = {
  overflow: (v) => v !== 'visible',
  'overflow-x': (v) => v !== 'visible',
  'overflow-y': (v) => v !== 'visible',
  contain: (v) => v !== 'none' && !/^(style|none)$/.test(v),
  'content-visibility': (v) => v !== 'visible',
  transform: (v) => v !== 'none',
  filter: (v) => v !== 'none',
  perspective: (v) => v !== 'none',
  'backdrop-filter': (v) => v !== 'none',
  'will-change': (v) => /transform|filter|perspective|contain/.test(v),
};

const bloc = (source: string, balise: string): string => {
  const re = new RegExp(`<${balise}[^>]*>([\\s\\S]*?)</${balise}>`, 'gi');
  let out = '';
  for (const m of source.matchAll(re)) out += m[1] + '\n';
  return out;
};

/** Le gabarit seul : ni `<script>`, ni `<style>`, ni commentaires. */
export function gabarit(source: string): string {
  return source
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '');
}

/**
 * Retire les blocs `@media`, `@supports`, `@container`… avec leur contenu.
 *
 * 🔴 Sans ça, une règle écrite pour un point de rupture étroit se lit comme une
 * règle inconditionnelle : `.top-row { grid-template-columns: 1fr }`, qui ne
 * vaut qu'en dessous de 900 px, écrasait la vraie valeur `300px 1fr` dans la
 * cascade simplifiée ci-dessous. Défaut trouvé par le test lui-même, le
 * 12/09/2026 — une garde qui lit mal le CSS garde n'importe quoi.
 */
function sansBlocsArobase(css: string): string {
  let out = '';
  for (let i = 0; i < css.length; i++) {
    if (css[i] !== '@') { out += css[i]; continue; }
    // On saute jusqu'à l'accolade ouvrante, puis jusqu'à sa fermante.
    const ouvrante = css.indexOf('{', i);
    const pointVirgule = css.indexOf(';', i);
    if (ouvrante < 0 || (pointVirgule >= 0 && pointVirgule < ouvrante)) {
      // Règle @ sans bloc (`@import …;`) : on la saute jusqu'au `;`.
      i = pointVirgule < 0 ? css.length : pointVirgule;
      continue;
    }
    let profondeur = 0;
    let j = ouvrante;
    for (; j < css.length; j++) {
      if (css[j] === '{') profondeur++;
      else if (css[j] === '}' && --profondeur === 0) break;
    }
    i = j;
  }
  return out;
}

/**
 * Les règles de la feuille de style du composant.
 * Les commentaires sont retirés AVANT découpage : ils contiennent souvent des
 * exemples de CSS (« sans `position: sticky` … ») qui seraient lus comme de
 * vraies déclarations.
 */
export function lireStyles(source: string): Regle[] {
  const css = sansBlocsArobase(bloc(source, 'style').replace(/\/\*[\s\S]*?\*\//g, ''));
  const regles: Regle[] = [];
  // Sélecteur { déclarations } — on ignore les blocs @media/@supports en ne
  // gardant que les corps qui ne contiennent pas eux-mêmes d'accolade.
  for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selecteur = m[1].trim();
    if (!selecteur || selecteur.startsWith('@')) continue;
    const declarations: Record<string, string> = {};
    for (const d of m[2].split(';')) {
      const i = d.indexOf(':');
      if (i < 0) continue;
      const prop = d.slice(0, i).trim().toLowerCase();
      const val = d.slice(i + 1).trim().toLowerCase();
      if (prop) declarations[prop] = val;
    }
    regles.push({ selecteur, declarations });
  }
  return regles;
}

/**
 * Toutes les déclarations qui s'appliquent à un élément portant cette classe,
 * en cumulant les règles successives (cascade simplifiée : dernière gagnante).
 * On ne retient que les sélecteurs qui ciblent la classe SEULE — `.x`, `.x.y`,
 * `.x.x` — et jamais un descendant (`.a .x`), qui ne s'applique pas partout.
 */
export function declarationsDe(regles: Regle[], classe: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const r of regles) {
    for (const sel of r.selecteur.split(',')) {
      const s = sel.trim();
      // `.classe`, `.classe.autre`, `.classe:hover` — mais pas `.a .classe`.
      if (!/^[.a-z0-9_-]+(::?[a-z-]+(\([^)]*\))?)?$/i.test(s)) continue;
      const classes = [...s.matchAll(/\.([a-z0-9_-]+)/gi)].map((m) => m[1]);
      if (!classes.includes(classe)) continue;
      Object.assign(out, r.declarations);
    }
  }
  return out;
}

/** Un élément du gabarit : son nom de balise et ses classes statiques. */
export interface Noeud {
  balise: string;
  classes: string[];
}

const VIDES = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
  'link', 'meta', 'param', 'source', 'track', 'wbr',
]);

function classesDe(attrs: string): string[] {
  const out: string[] = [];
  // class="a b {expr}" — on garde les morceaux littéraux.
  const m = /\sclass\s*=\s*("([^"]*)"|'([^']*)')/i.exec(attrs);
  if (m) {
    const brut = (m[2] ?? m[3] ?? '').replace(/\{[^}]*\}/g, ' ');
    out.push(...brut.split(/\s+/).filter(Boolean));
  }
  // class:actif={…} — classe conditionnelle de Svelte.
  for (const c of attrs.matchAll(/\sclass:([a-z0-9_-]+)/gi)) out.push(c[1]);
  return out;
}

/**
 * La chaîne d'ancêtres de CHAQUE élément portant `classeCible`, du plus
 * extérieur au plus proche (la cible exclue).
 *
 * Le gabarit d'un composant Svelte est du HTML bien formé : on empile les
 * balises ouvrantes et on dépile sur les fermantes. Les blocs `{#if}`, `{#each}`
 * n'ouvrent pas d'élément et n'entrent donc pas dans la pile.
 */
export function chainesAncetres(source: string, classeCible: string): Noeud[][] {
  const html = gabarit(source);
  const pile: Noeud[] = [];
  const chaines: Noeud[][] = [];
  const re = /<(\/?)([a-z][a-z0-9-]*)((?:"[^"]*"|'[^']*'|\{[^}]*\}|[^>"'{])*?)(\/?)>/gi;
  for (const m of html.matchAll(re)) {
    const fermante = m[1] === '/';
    const balise = m[2].toLowerCase();
    const attrs = m[3] ?? '';
    const autoFermante = m[4] === '/';
    if (fermante) {
      for (let i = pile.length - 1; i >= 0; i--) {
        if (pile[i].balise === balise) { pile.length = i; break; }
      }
      continue;
    }
    const noeud: Noeud = { balise, classes: classesDe(attrs) };
    if (noeud.classes.includes(classeCible)) chaines.push([...pile]);
    if (!autoFermante && !VIDES.has(balise)) pile.push(noeud);
  }
  return chaines;
}

export interface Bloqueur {
  classe: string;
  balise: string;
  propriete: string;
  valeur: string;
}

export interface Verdict {
  /** Le conteneur de défilement trouvé DANS ce composant, s'il y en a un. */
  scroller: Noeud | null;
  /** Les ancêtres bloquants rencontrés AVANT le conteneur de défilement. */
  bloqueurs: Bloqueur[];
  /** La chaîne effectivement inspectée, du plus proche au plus lointain. */
  inspectes: Noeud[];
}

const defile = (d: Record<string, string>) =>
  ['overflow', 'overflow-y'].some((p) => /auto|scroll|overlay/.test(d[p] ?? ''));

/**
 * Remonte la chaîne depuis la cible et s'arrête au conteneur de défilement.
 *
 * Le conteneur de défilement lui-même n'est PAS un bloqueur : c'est lui qui
 * rend l'ancrage possible. Tout ce qui se trouve entre la cible et lui en est
 * un dès qu'il porte une des propriétés listées plus haut.
 */
export function verdictAncrage(source: string, classeCible: string): Verdict {
  const regles = lireStyles(source);
  const chaines = chainesAncetres(source, classeCible);
  if (!chaines.length) {
    throw new Error(`aucun élément de classe « ${classeCible} » dans ce gabarit`);
  }
  // La chaîne la PLUS PROFONDE : c'est le pire cas, celui qui a le plus
  // d'ancêtres susceptibles de bloquer.
  const chaine = chaines.reduce((a, b) => (b.length > a.length ? b : a));
  const bloqueurs: Bloqueur[] = [];
  const inspectes: Noeud[] = [];
  let scroller: Noeud | null = null;
  for (let i = chaine.length - 1; i >= 0; i--) {
    const n = chaine[i];
    inspectes.push(n);
    const decl: Record<string, string> = {};
    for (const c of n.classes) Object.assign(decl, declarationsDe(regles, c));
    if (defile(decl)) { scroller = n; break; }
    for (const [prop, estBloquant] of Object.entries(PROPRIETES_BLOQUANTES)) {
      const v = decl[prop];
      if (v && estBloquant(v)) {
        bloqueurs.push({
          classe: n.classes.join('.') || '(sans classe)',
          balise: n.balise, propriete: prop, valeur: v,
        });
      }
    }
  }
  return { scroller, bloqueurs, inspectes };
}
