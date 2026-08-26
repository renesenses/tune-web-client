import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Lecteur : un texte coupé doit pouvoir se lire au survol.
 *
 * Lot 1 du chantier `renesenses/tune-server-rust#2411`. Les composants du
 * lecteur sont ceux qui mordent le plus : ils sont à l'écran en permanence et
 * tiennent dans les colonnes les plus étroites de l'interface.
 *
 * Ce test reprend le patron posé par `bandcampInfobulles.test.ts`
 * (`tune-web-client#590`) et le généralise sur trois points, parce que le
 * lecteur pose trois problèmes que la vue Bandcamp ne posait pas :
 *
 * 1. **La troncature vient d'AILLEURS.** Bandcamp tronquait dans son propre
 *    `<style>`. Ici, l'essentiel passe par la classe utilitaire `.truncate`,
 *    définie une fois pour tout le dépôt dans `src/styles/tune-theme.css`. On
 *    lit donc les DEUX sources : la feuille globale et le `<style>` local.
 *    `NowPlaying` a en plus sa propre règle (`.inline-credits`, en
 *    `line-clamp`) — que le relevé de l'issue, fondé sur le seul mot
 *    `truncate`, ne pouvait pas voir.
 *
 * 2. **Une infobulle portée par un PARENT compte.** Le navigateur remonte
 *    jusqu'au premier ancêtre porteur d'un `title=` pour composer sa bulle.
 *    Exiger un `title=` sur l'élément lui-même quand son bouton en porte déjà
 *    un produirait du bruit — le corps de l'issue prévient que « l'infobulle
 *    n'est pas toujours souhaitable ». C'est l'échappatoire réclamée par le
 *    commentaire de découpage, et c'est une RÈGLE, pas une liste d'exemptions
 *    à maintenir : on suit la pile de balises.
 *
 * 3. **L'infobulle doit porter la DONNÉE.** Un `title="Titre"` ou un
 *    `title={$t('queue.track')}` satisferait un test de simple présence sans
 *    rien apprendre à personne. On refuse donc le libellé statique.
 *
 * ⚠️ **Limite assumée : ce test lit la source, il ne rend pas le composant.**
 * Il n'existe ni `@testing-library/svelte` ni test de rendu dans ce dépôt.
 * Il garantit que l'attribut est écrit dans le balisage, pas qu'une bulle
 * apparaît à l'écran — et il ne dit rien de la question de savoir si ces
 * textes sont réellement coupés à la largeur où on les regarde.
 */

const RACINE = resolve(__dirname, '../..');

/** Les composants du lot 1. `LibraryView` et `StreamingView` en sont
 *  volontairement absents : d'autres sessions écrivent dedans, et le chantier
 *  les traite à part. */
const COMPOSANTS = ['NowPlaying', 'TransportBar', 'MiniPlayer', 'QueueView'] as const;

/**
 * Les classes qu'une feuille de style tronque — par points de suspension ou
 * par `line-clamp`. Lues, jamais recopiées : renommer `.track-title` ne doit
 * pas désarmer la garde en silence.
 */
function classesTronquees(css: string): Set<string> {
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
const GLOBALES = classesTronquees(readFileSync(resolve(RACINE, 'styles/tune-theme.css'), 'utf8'));

/** Éléments HTML sans balise fermante : ils ne doivent pas empiler. */
const AUTOFERMANTES = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
  'link', 'meta', 'param', 'source', 'track', 'wbr',
]);

type Balise = {
  ligne: number;
  tag: string;
  attrs: string;
  /** Un ancêtre porte-t-il déjà un `title=` ? */
  titreHerite: boolean;
};

/**
 * Les balises ouvrantes du marquage, avec leurs attributs bruts et l'état de
 * la pile au moment où on les rencontre.
 *
 * Un simple `/<[^>]*>/` ne suffit PAS : `onclick={() => ouvrir(...)}` contient
 * un `>` dans sa flèche, et la balise serait coupée en deux. On suit donc la
 * profondeur d'accolade et les chaînes, comme dans le test Bandcamp.
 */
function balisesOuvrantes(markup: string): Balise[] {
  const sorties: Balise[] = [];
  /** Pile des ancêtres ouverts : pour chacun, porte-t-il un `title=` ? */
  const pile: { tag: string; titre: boolean }[] = [];
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
    const porteTitre = /(?:^|\s)title=/.test(attrs);

    sorties.push({
      ligne: markup.slice(0, lt).split('\n').length,
      tag,
      attrs,
      titreHerite: pile.some((p) => p.titre),
    });

    const autoferme = attrs.trimEnd().endsWith('/') || AUTOFERMANTES.has(tag.toLowerCase());
    if (!autoferme) pile.push({ tag, titre: porteTitre });

    i = j + 1;
  }
  return sorties;
}

function classesDe(attrs: string): string[] {
  const m = /(?:^|\s)class="([^"]*)"/.exec(attrs);
  return m ? m[1].split(/\s+/).filter(Boolean) : [];
}

/** L'expression écrite dans `title=`, ou `null` s'il n'y en a pas. */
function expressionTitre(attrs: string): string | null {
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

type Analyse = {
  nom: string;
  tronquees: Set<string>;
  locales: Set<string>;
  balises: Balise[];
  /** Les balises qui portent une classe tronquante. */
  coupables: { b: Balise; classes: string[] }[];
};

const ANALYSES: Analyse[] = COMPOSANTS.map((nom) => {
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
});

const analyse = (nom: string) => ANALYSES.find((a) => a.nom === nom)!;

describe('Lecteur — infobulle sur les textes tronqués (#2411, lot 1)', () => {
  it('la feuille globale définit bien une classe de troncature', () => {
    // Contre-épreuve du test lui-même : si la lecture du CSS retournait un
    // ensemble vide, tous les cas suivants passeraient sans rien vérifier.
    expect(
      [...GLOBALES],
      "aucune règle de troncature lue dans tune-theme.css — le lecteur de CSS est cassé, pas l'écran",
    ).toContain('truncate');
  });

  it('la règle propre de NowPlaying est vue elle aussi', () => {
    // `.inline-credits` tronque en `line-clamp` sans jamais employer le mot
    // « truncate » : c'est précisément le angle mort qui a fait sous-estimer
    // le chantier (BandcampView, #2404).
    expect(
      [...analyse('NowPlaying').locales],
      'la règle line-clamp de .inline-credits n’est plus lue',
    ).toContain('inline-credits');
  });

  it('chaque composant du lot tronque bien du texte', () => {
    for (const a of ANALYSES) {
      expect(
        a.coupables.length,
        `${a.nom}.svelte : plus aucun élément tronqué — le test ne garde plus rien`,
      ).toBeGreaterThan(0);
    }
  });

  it('chaque élément tronqué peut se lire au survol', () => {
    const nus: string[] = [];
    for (const a of ANALYSES) {
      for (const { b, classes } of a.coupables) {
        // Un `title=` sur un ancêtre suffit : le navigateur remonte jusqu'à
        // lui. C'est le cas de la pastille de zone, dont le bouton porte déjà
        // `title={zoneFullLabel(zone)}`.
        if (expressionTitre(b.attrs) !== null || b.titreHerite) continue;
        nus.push(`${a.nom}.svelte:${b.ligne} — <${b.tag} class="${classes.join(' ')}"> sans title=`);
      }
    }
    expect(
      nus,
      `Le lecteur coupe du texte sans donner de recours au survol :\n  ${nus.join('\n  ')}`,
    ).toEqual([]);
  });

  it("l'infobulle porte la donnée, pas un libellé d'interface", () => {
    // Une bulle « Titre » sur un titre coupé ne sert à rien : ce qu'on veut
    // lire, c'est le texte entier. On refuse donc le littéral statique et le
    // `$t()` seul. Un `$t()` employé en REPLI dans une expression plus large
    // (`{piste.title || $t('queue.unknownTrack')}`) reste légitime.
    const creux: string[] = [];
    for (const a of ANALYSES) {
      for (const { b, classes } of a.coupables) {
        const expr = expressionTitre(b.attrs);
        if (expr === null) continue;
        const litteral = /^".*"$/.test(expr);
        const tSeul = /^\$?t\(\s*['"][\w.]+['"]\s*\)$/.test(expr);
        if (!litteral && !tSeul) continue;
        creux.push(
          `${a.nom}.svelte:${b.ligne} — <${b.tag} class="${classes.join(' ')}"> title=${expr} ne dit rien du texte coupé`,
        );
      }
    }
    expect(creux, `Infobulles creuses :\n  ${creux.join('\n  ')}`).toEqual([]);
  });

  it('la pastille de zone reste couverte par son bouton', () => {
    // Cas limite explicite : si quelqu'un retire le `title=` du bouton, la
    // pastille redevient un texte coupé sans recours et le cas précédent doit
    // le voir. On verrouille ici la raison pour laquelle elle est exemptée,
    // afin que l'exemption ne devienne pas silencieuse.
    const chip = analyse('TransportBar').coupables.find((x) =>
      x.classes.includes('truncate') && classesDe(x.b.attrs).includes('zone-chip-label'),
    );
    expect(chip, 'la pastille de zone a disparu de TransportBar').toBeDefined();
    expect(
      chip!.b.titreHerite,
      'le bouton de sélection de zone ne porte plus de title= : la pastille n’est plus lisible au survol',
    ).toBe(true);
  });
});
