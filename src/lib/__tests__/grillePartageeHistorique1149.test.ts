/**
 * #1149 — « la ligne d'une piste nue ne s'aligne pas sur la ligne d'un album
 * ou d'une playlist » : DEUX grilles CSS indépendantes dans le même écran.
 *
 * FabienM, fil forum 1778, 13/09/2026, point 1, v0.9.148 (déjà point 16 du fil
 * 1774 la veille) :
 *
 *   « mauvais alignement des titres vs albums/playlist : si l'historique est
 *     un titre alors la ligne est un peu décalée sur la droite par rapport à
 *     une ligne Album ou Playlist. »
 *
 * ## Ce que #1009 avait déjà réconcilié
 *
 * La PREMIÈRE colonne (le « + » du pli au-dessus de la colonne `#`), la
 * gouttière (14 px) et la marge gauche (1 px de bordure + 9 px = les 10 px du
 * tableau). `alignementHistorique1009.test.ts` tient ces trois points et n'est
 * pas retouché ici.
 *
 * ## 🔴 Ce qui restait : la DROITE de la ligne
 *
 * `.objet` gardait un gabarit à lui — `var(--col1) auto 1fr auto auto` — dont
 * les trois dernières colonnes ne sortaient d'aucune source commune. Le
 * tableau, lui, finit par DEUX colonnes fixes : la barre d'actions
 * (`LARGEUR_ACTIONS`) et le suffixe propre à l'écran (`largeurApres`, 164 px
 * ici, qui porte la zone, l'instant et le cœur radio).
 *
 * Conséquence directe et visible : « il y a 3 min » sur la ligne d'objet ne
 * tombait PAS au-dessus de « il y a 9 min » sur la ligne de piste. Deux
 * colonnes `auto` se résolvent sur leur contenu, donc à une largeur différente
 * à chaque ligne — c'est la leçon que `ListePistesV2` porte en tête depuis le
 * 07/09/2026 (« TIME » deux cents pixels à droite de « 5:24 ») et qu'il
 * applique À L'INTÉRIEUR du tableau, mais pas ENTRE le tableau et la ligne
 * d'objet.
 *
 * ## Le parti pris : UNE grille, composée des mêmes valeurs
 *
 * On ne recopie aucune largeur. `.objet` devient
 * `var(--col1) minmax(0,1fr) var(--col-actions) var(--col-suffixe)`, où :
 *
 *  - `--col1` vient de `colonnesRetenues(...)[0].largeur` — la source du
 *    tableau (acquis de #1009) ;
 *  - `--col-actions` vient de `LARGEUR_ACTIONS`, EXPORTÉ par `ListePistesV2` :
 *    la valeur n'existe qu'une fois, et le témoin qui la rapporte au nombre de
 *    boutons de `PisteActions` continue de la garder ;
 *  - `--col-suffixe` vient de la même constante que l'attribut
 *    `largeurApres` passé au tableau.
 *
 * Les deux grilles ont la même boîte, la même gouttière et les deux mêmes
 * colonnes de queue : leurs bords droits tombent donc au même endroit, quel
 * que soit le nombre de colonnes de données cochées entre les deux.
 *
 * ## 🔴 CE QUE CETTE GARDE PROUVE — ET CE QU'ELLE NE PROUVE PAS
 *
 * Elle prouve que les deux gabarits sont COMPOSÉS des mêmes valeurs, lues à
 * une source unique, et que la cellule de queue de la ligne d'objet a la même
 * structure que celle des lignes de piste.
 *
 * Elle ne prouve AUCUN pixel. Le CSS scopé de Svelte n'est pas injecté sous
 * vitest + jsdom : monter les composants et lire des largeurs calculées
 * rendrait `0px` partout et donnerait un vert creux. L'alignement à l'écran
 * reste à voir dans un navigateur ; ce qui est tenu ici, c'est que les deux
 * lignes ne peuvent plus repartir chacune de son côté.
 *
 * Elle ne dit rien non plus du TIROIR d'un objet déplié
 * (`padding-left:22px; border-left:2px; margin-left:8px`) : ce retrait est un
 * repère de niveau, délibéré, et il n'est pas touché par ce lot.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const lire = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf-8');
const hist = () => lire('src/components/v2/HistoriqueV2.svelte');
const liste = () => lire('src/components/v2/ListePistesV2.svelte');

/** Le bloc de règles d'un sélecteur, du `{` au `}`. */
function regle(src: string, selecteur: string): string {
  const i = src.indexOf(selecteur);
  expect(i, `sélecteur absent : ${selecteur}`).toBeGreaterThan(-1);
  return src.slice(i, src.indexOf('}', i));
}

describe('#1149 — une SEULE grille pour la ligne d’objet et la ligne de piste', () => {
  /** 🔴 LE POINT CENTRAL : quatre colonnes, et les deux dernières en variable. */
  it('le gabarit de `.objet` se termine par les deux colonnes de queue du tableau', () => {
    const r = regle(hist(), '.objet{');
    const g = /grid-template-columns:([^;]+)/.exec(r);
    expect(g, '`.objet` n’a plus de grid-template-columns').not.toBeNull();
    const cols = g![1].trim();
    expect(cols, 'la première colonne doit rester celle de #1009').toMatch(/^var\(--col1/);
    expect(cols, 'la colonne d’actions du tableau manque').toContain('var(--col-actions');
    expect(cols, 'la colonne du suffixe manque').toContain('var(--col-suffixe');
    // Plus AUCUN `auto` : deux colonnes `auto` se résolvent sur leur contenu et
    // ne peuvent pas tomber en face de celles du tableau.
    expect(cols, 'un `auto` est resté dans le gabarit de la ligne d’objet').not.toMatch(/\bauto\b/);
  });

  /** La largeur des actions vient de `ListePistesV2`, jamais recopiée. */
  it('`--col-actions` est la LARGEUR_ACTIONS exportée par `ListePistesV2`', () => {
    const l = liste();
    expect(l, 'LARGEUR_ACTIONS n’est pas exportée').toMatch(
      /export const LARGEUR_ACTIONS = '\d+px';/,
    );
    const h = hist();
    expect(h, 'HistoriqueV2 n’importe pas LARGEUR_ACTIONS').toMatch(
      /import ListePistesV2, \{[^}]*LARGEUR_ACTIONS[^}]*\} from '\.\/ListePistesV2\.svelte'/,
    );
    expect(h, '`--col-actions` n’est pas posée depuis la constante importée').toMatch(
      /--col-actions:\{LARGEUR_ACTIONS\}/,
    );
    // Et rien d'écrit en dur : la barre d'actions a déjà changé de largeur une
    // fois (178 → 208 px, 16/09/2026), un nombre figé ici s'en détacherait.
    const px = /export const LARGEUR_ACTIONS = '(\d+)px';/.exec(l)![1];
    const sansCommentaires = h.replace(/\/\*[\s\S]*?\*\//g, '').replace(/<!--[\s\S]*?-->/g, '');
    expect(sansCommentaires, `${px}px est recopié dans HistoriqueV2`).not.toContain(`${px}px`);
  });

  /** La largeur du suffixe est la MÊME des deux côtés de l'écran. */
  it('`--col-suffixe` vaut exactement le `largeurApres` passé au tableau', () => {
    const h = hist();
    const cst = /const LARGEUR_SUFFIXE = '(\d+px)';/.exec(h);
    expect(cst, 'LARGEUR_SUFFIXE introuvable').not.toBeNull();
    expect(h, '`--col-suffixe` n’est pas posée depuis la constante').toMatch(
      /--col-suffixe:\{LARGEUR_SUFFIXE\}/,
    );
    const passees = [...h.matchAll(/largeurApres="(\d+px)"/g)].map((m) => m[1]);
    expect(passees.length, 'aucun `largeurApres` passé à ListePistesV2').toBeGreaterThan(0);
    for (const p of passees) {
      expect(p, `largeurApres=${p} ≠ LARGEUR_SUFFIXE=${cst![1]}`).toBe(cst![1]);
    }
  });

  /**
   * La cellule de queue de la ligne d'objet a la MÊME structure que celle des
   * lignes de piste : l'instant, puis la place du cœur radio. Sans ce second
   * élément, « il y a 3 min » se collerait 28 px plus à droite que sur les
   * pistes — la grille serait juste, et le texte toujours décalé.
   */
  it('la cellule de queue porte `.quand` PUIS la place du cœur, comme les pistes', () => {
    const h = hist();
    const cellule = /<span class="osuffixe">([\s\S]*?)<\/span>\s*<\/button>/.exec(h);
    expect(cellule, '`.osuffixe` absente de la ligne d’objet').not.toBeNull();
    const dedans = cellule![1];
    expect(dedans, 'l’instant n’est pas dans un `.quand`').toContain('class="quand"');
    expect(dedans, 'la place du cœur radio manque').toContain('class="fav-vide"');
    expect(dedans.indexOf('class="quand"')).toBeLessThan(dedans.indexOf('class="fav-vide"'));
  });

  /** Et elle se cale à droite comme `.act` du tableau. */
  it('`.osuffixe` et `.act` se calent du même côté', () => {
    const act = regle(liste(), '.act{');
    expect(act).toContain('justify-content:flex-end');
    const o = regle(hist(), '.osuffixe{');
    expect(o).toContain('display:flex');
    expect(o).toContain('justify-content:flex-end');
    // Aucune gouttière : `.act` n'en pose pas, le suffixe est rendu dedans tel
    // quel. Une gouttière ici décalerait l'instant d'autant.
    expect(o, 'une gouttière décalerait l’instant').not.toMatch(/\bgap:/);
  });

  /** Le compte de pistes tombe dans la colonne des actions, calé à droite. */
  it('le compte de l’objet occupe la colonne des actions, aligné à droite', () => {
    const o = regle(hist(), '.ocompte-cell{');
    expect(o).toContain('display:flex');
    expect(o).toContain('justify-content:flex-end');
  });

  /** ⚠️ CE QU'IL NE FAUT PAS CASSER — le tableau garde sa propre composition. */
  it('le gabarit du tableau finit toujours par actions puis suffixe', () => {
    // #1061 : la largeur d'actions a été choisie entre DEUX constantes selon
    // que l'écran posait le bouton « Lire à partir d'ici ». Depuis le
    // 20/09/2026 le bouton est sur toutes les lignes : une seule constante,
    // et c'est justement elle que la ligne d'objet de l'Historique importe.
    // Ce qui compte ici est l'ORDRE : actions, puis suffixe.
    expect(liste()).toMatch(/gabaritGrille\(colonnes\)\} \$\{largeurDesActions\}/);
    expect(liste()).toMatch(/const largeurDesActions = LARGEUR_ACTIONS;/);
    expect(liste()).toMatch(/apres \? ` \$\{largeurApres\}` : ''/);
    // 🔴 L'Historique ne pose toujours aucun `onLireDepuis` : il prend le
    // défaut de la liste, et sa ligne d'objet compose avec la MÊME constante.
    expect(hist()).not.toContain('onLireDepuis');
  });

  /**
   * ⚠️ Sous 720 px il n'y a plus de colonnes à aligner : `ListePistesV2`
   * retire son en-tête et replie ses lignes sur `minmax(0,1fr) auto`. La ligne
   * d'objet doit se replier avec lui — ses deux colonnes de queue font 372 px
   * à elles deux, davantage que la largeur d'un téléphone.
   */
  it('les deux lignes se replient au même seuil sur écran étroit', () => {
    const seuil = (src: string) =>
      /@media \(max-width: (\d+)px\)\{[\s\S]{0,400}?grid-template-columns/.exec(src)?.[1];
    expect(seuil(liste()), 'le tableau ne se replie plus').toBeTruthy();
    expect(seuil(hist()), `objet=${seuil(hist())} tableau=${seuil(liste())}`)
      .toBe(seuil(liste()));
  });

  /** Et la gouttière reste commune : sans elle, les colonnes de queue glissent. */
  it('la gouttière des deux lignes est la même', () => {
    const gt = /gap:\s*(\d+)px/.exec(regle(liste(), '.thead, .trow{'))?.[1];
    const go = /gap:\s*(\d+)px/.exec(regle(hist(), '.objet{'))?.[1];
    expect(gt).toBeTruthy();
    expect(go, `objet=${go} tableau=${gt}`).toBe(gt);
  });
});
