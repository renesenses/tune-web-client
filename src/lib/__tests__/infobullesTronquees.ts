import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Le moteur commun des gardes « un texte coupé se lit au survol »
 * (chantier `renesenses/tune-server-rust#2411`).
 *
 * Il a été écrit pour la vue Bandcamp (`tune-web-client#590`), généralisé par
 * le lot 1 — le lecteur — (`#603`), et il est extrait ici au deuxième lot
 * parce qu'un troisième usage arrive : la seule alternative était de recopier
 * deux cents lignes d'analyseur par lot. Les cas propres à chaque lot restent
 * dans le fichier de test du lot ; seule la mécanique est partagée.
 *
 * Le principe, inchangé :
 *
 * 1. **La troncature se lit dans le CSS, jamais dans une liste de lignes.**
 *    On lit la feuille globale ET le `<style>` local du composant, on en
 *    déduit les classes qui coupent (`text-overflow: ellipsis` ou
 *    `line-clamp`), puis on exige un `title=` sur les éléments qui les
 *    portent. Renommer une classe ou ajouter une vignette ne désarme donc
 *    rien en silence — et le relevé fondé sur le seul mot `truncate` ratait
 *    précisément les composants qui posent leurs propres règles.
 *
 * 2. **Une infobulle portée par un ANCÊTRE compte.** Le navigateur remonte
 *    jusqu'au premier ancêtre porteur d'un `title=`. Exiger une seconde bulle
 *    à l'intérieur d'un bouton déjà pourvu produirait du bruit. C'est une
 *    règle — on suit la pile de balises — et non une liste d'exemptions à
 *    entretenir. **Encore faut-il que cette bulle héritée dise quelque
 *    chose** : le lot 2 a trouvé deux textes coupés dont le seul recours était
 *    un ancêtre portant `title={$t('home.openAlbum')}`. Couverts au sens du
 *    lot 1, illisibles en pratique. L'ancêtre est donc soumis à la même
 *    exigence de contenu que l'élément lui-même.
 *
 * 3. **L'infobulle doit porter la DONNÉE.** `title="Titre"` ou
 *    `title={$t('home.album')}` satisferait un test de simple présence sans
 *    rien apprendre à personne.
 *
 * ⚠️ **Limite assumée : on lit la source, on ne rend pas le composant.** Il
 * n'existe ni `@testing-library/svelte` ni test de rendu dans ce dépôt. On
 * garantit que l'attribut est écrit dans le balisage, pas qu'une bulle
 * apparaît à l'écran — et rien ici ne dit que ces textes sont réellement
 * coupés à la largeur où on les regarde.
 */

/** `src/`, quel que soit le fichier de test qui appelle. */
export const RACINE = resolve(__dirname, '../..');

/**
 * Les classes qu'une feuille de style tronque — par points de suspension ou
 * par `line-clamp`. Lues, jamais recopiées.
 */
export function classesTronquees(css: string): Set<string> {
  const sansCommentaires = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const classes = new Set<string>();
  for (const regle of sansCommentaires.split('}')) {
    const accolade = regle.indexOf('{');
    if (accolade === -1) continue;
    const selecteur = regle.slice(0, accolade);
    const corps = regle.slice(accolade + 1);
    const tronque =
      /text-overflow\s*:\s*ellipsis/.test(corps) || /line-clamp\s*:/.test(corps);
    if (!tronque) continue;
    for (const [, nom] of selecteur.matchAll(/\.([\w-]+)/g)) classes.add(nom);
  }
  return classes;
}

/** La classe utilitaire du dépôt, `src/styles/tune-theme.css`. */
export const GLOBALES = classesTronquees(
  readFileSync(resolve(RACINE, 'styles/tune-theme.css'), 'utf8'),
);

/** Éléments HTML sans balise fermante : ils ne doivent pas empiler. */
const AUTOFERMANTES = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
  'link', 'meta', 'param', 'source', 'track', 'wbr',
]);

export type Balise = {
  ligne: number;
  tag: string;
  attrs: string;
  /** Un ancêtre porte-t-il déjà un `title=` ? */
  titreHerite: boolean;
  /**
   * L'expression du `title=` de l'ancêtre le PLUS PROCHE qui en porte un —
   * celui que le navigateur retiendra. `null` s'il n'y en a aucun.
   */
  titreAncetre: string | null;
};

/**
 * Les balises ouvrantes du marquage, avec leurs attributs bruts et l'état de
 * la pile au moment où on les rencontre.
 *
 * Un simple `/<[^>]*>/` ne suffit PAS : `onclick={() => ouvrir(...)}` contient
 * un `>` dans sa flèche, et la balise serait coupée en deux. On suit donc la
 * profondeur d'accolade et les chaînes.
 */
export function balisesOuvrantes(markup: string): Balise[] {
  const sorties: Balise[] = [];
  /** Pile des ancêtres ouverts : pour chacun, l'expression de son `title=`. */
  const pile: { tag: string; titre: string | null }[] = [];
  let i = 0;
  while (i < markup.length) {
    const lt = markup.indexOf('<', i);
    if (lt === -1) break;

    // Fermeture : on dépile.
    const fermeture = /^<\/([a-zA-Z][\w-]*)\s*>/.exec(markup.slice(lt, lt + 48));
    if (fermeture) {
      for (let k = pile.length - 1; k >= 0; k--) {
        if (pile[k].tag === fermeture[1]) {
          pile.length = k;
          break;
        }
      }
      i = lt + fermeture[0].length;
      continue;
    }

    const nom = /^<([a-zA-Z][\w-]*)/.exec(markup.slice(lt, lt + 48));
    if (!nom) {
      i = lt + 1;
      continue;
    }
    let j = lt + nom[0].length;
    let accolades = 0;
    let guillemet: string | null = null;
    while (j < markup.length) {
      const c = markup[j];
      if (guillemet) {
        if (c === guillemet) guillemet = null;
      } else if (c === '"' || c === "'") {
        guillemet = c;
      } else if (c === '{') {
        accolades++;
      } else if (c === '}') {
        accolades--;
      } else if (c === '>' && accolades === 0) {
        break;
      }
      j++;
    }
    const attrs = markup.slice(lt + nom[0].length, j);
    const tag = nom[1];
    const porteTitre = expressionTitre(attrs);

    // Le plus proche l'emporte : c'est celui dont le navigateur compose la bulle.
    let titreAncetre: string | null = null;
    for (let k = pile.length - 1; k >= 0; k--) {
      if (pile[k].titre !== null) {
        titreAncetre = pile[k].titre;
        break;
      }
    }

    sorties.push({
      ligne: markup.slice(0, lt).split('\n').length,
      tag,
      attrs,
      titreHerite: titreAncetre !== null,
      titreAncetre,
    });

    const autoferme = attrs.trimEnd().endsWith('/') || AUTOFERMANTES.has(tag.toLowerCase());
    if (!autoferme) pile.push({ tag, titre: porteTitre });

    i = j + 1;
  }
  return sorties;
}

export function classesDe(attrs: string): string[] {
  const m = /(?:^|\s)class="([^"]*)"/.exec(attrs);
  return m ? m[1].split(/\s+/).filter(Boolean) : [];
}

/** L'expression écrite dans `title=`, ou `null` s'il n'y en a pas. */
export function expressionTitre(attrs: string): string | null {
  const accolade = /(?:^|\s)title=\{/.exec(attrs);
  if (accolade) {
    let profondeur = 1;
    let k = accolade.index + accolade[0].length;
    const debut = k;
    while (k < attrs.length && profondeur > 0) {
      if (attrs[k] === '{') profondeur++;
      else if (attrs[k] === '}') profondeur--;
      k++;
    }
    return attrs.slice(debut, k - 1).trim();
  }
  const litteral = /(?:^|\s)title="([^"]*)"/.exec(attrs);
  return litteral ? `"${litteral[1]}"` : null;
}

export type Analyse = {
  nom: string;
  /** Toutes les classes tronquantes visibles depuis ce composant. */
  tronquees: Set<string>;
  /** Celles que le composant définit lui-même, hors feuille globale. */
  locales: Set<string>;
  balises: Balise[];
  /** Les balises qui portent une classe tronquante. */
  coupables: { b: Balise; classes: string[] }[];
};

/** Analyse un composant de `src/components/`. */
export function analyser(nom: string): Analyse {
  const source = readFileSync(resolve(RACINE, `components/${nom}.svelte`), 'utf8');
  const debutStyle = source.indexOf('<style>');
  const markup = debutStyle === -1 ? source : source.slice(0, debutStyle);
  const style = debutStyle === -1 ? '' : source.slice(debutStyle, source.indexOf('</style>'));
  const locales = classesTronquees(style);
  const tronquees = new Set([...GLOBALES, ...locales]);
  const balises = balisesOuvrantes(markup);
  const coupables = balises
    .map((b) => ({ b, classes: classesDe(b.attrs).filter((c) => tronquees.has(c)) }))
    .filter((x) => x.classes.length > 0);
  return { nom, tronquees, locales, balises, coupables };
}

/**
 * Les éléments tronqués qu'aucune infobulle ne couvre — ni la leur, ni celle
 * d'un ancêtre. Nommés fichier + ligne, pour que le rouge soit lisible.
 */
export function sansInfobulle(analyses: Analyse[]): string[] {
  const nus: string[] = [];
  for (const a of analyses) {
    for (const { b, classes } of a.coupables) {
      if (expressionTitre(b.attrs) !== null || b.titreHerite) continue;
      nus.push(`${a.nom}.svelte:${b.ligne} — <${b.tag} class="${classes.join(' ')}"> sans title=`);
    }
  }
  return nus;
}

/**
 * Une infobulle est creuse si elle ne dit qu'un libellé d'interface. Un `$t()`
 * employé en REPLI dans une expression plus large (`{album.title || $t('…')}`)
 * reste légitime : c'est bien la donnée qui est portée.
 */
export function estCreuse(expr: string): boolean {
  const litteral = /^".*"$/.test(expr);
  const tSeul = /^\$?t\(\s*['"][\w.]+['"]\s*\)$/.test(expr);
  return litteral || tSeul;
}

/**
 * Les textes coupés dont la bulle — la leur, ou à défaut celle de l'ancêtre
 * dont ils héritent — ne dit qu'un libellé d'interface.
 *
 * Le cas hérité compte autant que le cas direct : un titre d'album coupé dans
 * un bouton qui annonce « Ouvrir l'album » reste illisible. C'est le trou que
 * le lot 2 a trouvé dans la règle du lot 1.
 */
export function infobullesCreuses(analyses: Analyse[]): string[] {
  const creux: string[] = [];
  for (const a of analyses) {
    for (const { b, classes } of a.coupables) {
      const propre = expressionTitre(b.attrs);
      const expr = propre ?? b.titreAncetre;
      if (expr === null || !estCreuse(expr)) continue;
      const ou = propre === null ? ' (héritée de son ancêtre)' : '';
      creux.push(
        `${a.nom}.svelte:${b.ligne} — <${b.tag} class="${classes.join(' ')}"> title=${expr}${ou} ne dit rien du texte coupé`,
      );
    }
  }
  return creux;
}
