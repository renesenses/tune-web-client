import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { extraireFeuilleDeStyle, releverDeclarations } from '../cascadeCss';

/**
 * Page Plugins — le titre « Catégories » du rail latéral passait sous
 * l'en-tête figé. renesenses/tune-server-rust#2148.
 *
 * Jean Valjean, fil forum 1421, 14/08/2026, v0.9.75 sous Firefox/Windows :
 * « Pour une question d'esthétique, est-il possible de descendre la barre
 * latérale d'une ou 2 lignes, on ne voit plus le mot Catégories ? »
 *
 * CAUSE MESURÉE (Chrome sans affichage, 1280×900, dev server sur la vraie
 * page Plugins) : `.plugins-header` mesure **176 px**, alors que le rail se
 * figeait sur une constante `top: 150px` réglée à l'œil en #1282. 26 px du
 * rail — dont 9 des 15 px du titre — passaient derrière l'en-tête, et
 * `document.elementFromPoint()` au centre du titre rendait
 * `HEADER.plugins-header`. À 20 px de police (zoom navigateur), l'en-tête
 * monte à 192 px et le titre est masqué en ENTIER (18/18 px) : exactement ce
 * que le testeur décrit. Après correctif : 0 px masqué à toutes les tailles,
 * et le point-test rend `H3.sidebar-title`.
 *
 * CE QUE CE FICHIER PROUVE, ET CE QU'IL NE PROUVE PAS
 * ---------------------------------------------------
 * jsdom n'a pas de moteur de mise en page : il ne connaît ni `position:
 * sticky`, ni la hauteur d'un en-tête. Un test de rendu serait donc vert quoi
 * qu'il arrive — la fausse preuve à éviter. Ces gardes vérifient le seul fait
 * vérifiable hors navigateur : que l'ancrage du rail est **calculé sur une
 * hauteur mesurée** et non réécrit en dur. La preuve du rendu, elle, a été
 * prise au navigateur et est consignée ci-dessus.
 *
 * PIÈGE ÉVITÉ : le fichier PARLE de `150px` dans ses commentaires (c'est le
 * défaut qu'il documente). Une recherche textuelle de « 150px » serait donc
 * verte à tort, ou rouge à tort selon le sens. On lit ici les DÉCLARATIONS
 * CSS analysées, commentaires retirés — et le dernier test vérifie que cette
 * distinction est bien réelle.
 */

const CHEMIN = resolve(process.cwd(), 'src/components/PluginsView.svelte');
const SOURCE = readFileSync(CHEMIN, 'utf-8');
const FEUILLE = extraireFeuilleDeStyle(SOURCE);

/** Balisage seul : entre la fin du `<script>` et le début du `<style>`. */
function extraireBalisage(source: string): string {
  const finScript = source.lastIndexOf('</script>');
  const debutStyle = source.indexOf('<style>');
  if (finScript === -1 || debutStyle === -1 || debutStyle < finScript) {
    throw new Error('balisage introuvable');
  }
  // Les commentaires HTML sont retirés : un `<!-- top: 150px -->` ne doit
  // jamais compter comme du balisage.
  return source.slice(finScript + '</script>'.length, debutStyle).replace(/<!--[\s\S]*?-->/g, '');
}

const BALISAGE = extraireBalisage(SOURCE);

/** Balise ouvrante portant la classe donnée, dans le balisage. */
function baliseAvecClasse(classe: string): string {
  const motif = new RegExp(`<[a-zA-Z][^>]*class="[^"]*\\b${classe}\\b[^"]*"[^>]*>`);
  const trouvee = motif.exec(BALISAGE);
  expect(trouvee, `aucune balise ne porte la classe .${classe}`).not.toBeNull();
  return trouvee![0];
}

describe('Plugins — ancrage du rail « Catégories » (#2148)', () => {
  it("le rail ne se cale plus sur une constante en pixels", () => {
    const tops = releverDeclarations(FEUILLE, ['top']).filter(
      (r) => r.selecteur === '.categories-sidebar',
    );

    const constantes = tops.filter((r) => /^-?\d+(\.\d+)?(px|rem|em)$/.test(r.valeur));
    expect(
      constantes.map((r) => `${r.media ?? 'premier niveau'} → top: ${r.valeur}`),
      "`.categories-sidebar` ne doit déclarer aucun `top` constant : la hauteur " +
        "de `.plugins-header` dépend de la police, du zoom et du repliement des " +
        'onglets. Le décalage se pose en ligne, à la hauteur mesurée.',
    ).toEqual([]);

    // Le rail reste bien figé — on n'a pas « corrigé » en retirant le sticky.
    const positions = releverDeclarations(FEUILLE, ['position']).filter(
      (r) => r.selecteur === '.categories-sidebar' && r.media === null,
    );
    expect(positions.map((r) => r.valeur)).toContain('sticky');
  });

  it("le décalage est posé en ligne, à la hauteur MESURÉE de l'en-tête", () => {
    const entete = baliseAvecClasse('plugins-header');
    const liaison = /bind:clientHeight=\{([A-Za-z_$][\w$]*)\}/.exec(entete);
    expect(
      liaison,
      "`.plugins-header` doit exposer sa hauteur réelle via bind:clientHeight — " +
        'sans mesure, le rail retombe sur une valeur devinée.',
    ).not.toBeNull();

    const variable = liaison![1];
    const rail = baliseAvecClasse('categories-sidebar');
    expect(
      rail,
      `\`.categories-sidebar\` doit porter style:top="{${variable}}px", c.-à-d. la ` +
        "hauteur mesurée de l'en-tête et rien d'autre.",
    ).toMatch(new RegExp(`style:top="\\{${variable}\\}px"`));
  });

  it('le titre du rail passe par la traduction, dans les onze langues', () => {
    const titre = /<h3[^>]*class="[^"]*\bsidebar-title\b[^"]*"[^>]*>([\s\S]*?)<\/h3>/.exec(
      BALISAGE,
    );
    expect(titre, 'le titre `.sidebar-title` est introuvable').not.toBeNull();

    const contenu = titre![1].trim();
    const cle = /\{\$t\('([^']+)'\)\}/.exec(contenu);
    expect(
      cle,
      `le titre du rail est écrit en dur (${JSON.stringify(contenu)}) : il doit ` +
        "passer par \$t(), comme les entrées juste en dessous.",
    ).not.toBeNull();

    const dossier = resolve(process.cwd(), 'src/lib/locales');
    const langues = readdirSync(dossier)
      .filter((f) => f.endsWith('.ts') && f !== 'index.ts')
      .map((f) => f.slice(0, -3))
      .sort();
    // Le nombre est AFFICHÉ, pas supposé : une liste vide rendrait ce test
    // vert sans avoir rien ouvert.
    expect(langues.length, `langues examinées : ${langues.join(', ')}`).toBe(11);

    const absentes = langues.filter((langue) => {
      const src = readFileSync(join(dossier, `${langue}.ts`), 'utf-8');
      return !new RegExp(`^\\s*['"]${cle![1].replace(/\./g, '\\.')}['"]\\s*:`, 'm').test(src);
    });
    expect(absentes, `clé ${cle![1]} absente de : ${absentes.join(', ')}`).toEqual([]);
  });

  /**
   * Test de MÉTHODE, pas de comportement : il ne rougit sous aucune
   * dégradation de `PluginsView.svelte`. Il est là parce que la garde
   * ci-dessus reposerait sur du sable si `releverDeclarations` lisait les
   * commentaires — or le fichier surveillé PARLE de `top: 150px` dans sa
   * prose. Une recherche textuelle naïve se tromperait ; celle-ci ne le peut
   * pas, et ce test le montre.
   */
  it("la garde lit les déclarations analysées, jamais les commentaires", () => {
    // Le fichier réel documente le défaut : le motif y est écrit en toutes
    // lettres, dans un commentaire.
    expect(SOURCE, 'la prose du composant doit citer la constante retirée').toContain(
      'top: 150px',
    );

    // Sur une feuille témoin, la même valeur est présente DEUX fois : une fois
    // en commentaire, une fois comme déclaration réelle. La méthode ne doit
    // voir que la seconde.
    const temoin = `
      .categories-sidebar {
        /* ancien réglage : top: 150px, calé à l'œil */
        position: sticky;
      }
      .autre-rail { top: 150px; }
    `;
    const vues = releverDeclarations(temoin, ['top']);
    expect(vues.map((r) => `${r.selecteur} → ${r.valeur}`)).toEqual(['.autre-rail → 150px']);
  });
});
