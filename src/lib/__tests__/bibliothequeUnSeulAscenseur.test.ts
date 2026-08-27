import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Garde de mise en page : la Bibliothèque n'a qu'UN SEUL ascenseur vertical.
 *
 * Le défaut vécu, signalé en 0.8.347 sous Firefox (Jean Valjean, fil
 * « Anomalies V 0.8.347 », renesenses/tune-server-rust#2225) :
 *
 *   « Bibliothèque → genres ; les barres verticales de défilement (ascenseur
 *     à droite) se superposent »  — idem sur Genres → Rock et sur Artistes.
 *
 * Il a été corrigé trois fois, à trois endroits, pour la même raison à chaque
 * fois : DEUX conteneurs imbriqués déclaraient `overflow-y` alors qu'un seul
 * doit défiler. Chrome le masquait avec ses ascenseurs en surimpression ;
 * Firefox dessine une vraie barre, et les deux se superposaient (#1075, puis
 * #1119 où le `flex: 1` parasite écrasait la grille sur une colonne, puis
 * #1143 sur la largeur de la barre Firefox).
 *
 * La règle ne vit aujourd'hui que dans des COMMENTAIRES CSS (« No inner
 * scroll: the whole .library-view scrolls as one region »). Un commentaire
 * n'arrête personne : c'est précisément ainsi que le défaut est revenu après
 * #1075. Ce fichier transforme ces trois commentaires en invariant tenu.
 *
 * Ce garde ne PRÉTEND PAS que le symptôme rapporté en 0.8.347 est reproduit :
 * il ne l'est pas dans le code actuel (voir #2225). Il fige la structure qui
 * l'empêche, pour que personne n'ait à la redécouvrir une quatrième fois.
 *
 * La chaîne à préserver, du haut vers le bas :
 *
 *   .main-content    overflow: hidden          — ne défile pas
 *     .update-banner / .status-banner          — flex-shrink: 0, empilés AU-DESSUS
 *     .view-scroller  overflow-y: auto         — LE scroller de la vue active
 *       .library-view overflow: hidden         — met en page, ne défile pas
 *         .library-header                      — frère, hors du scroller
 *         .library-scroller overflow-y: auto   — LE scroller de la bibliothèque
 *           .genres-grid / .artists-grid       — AUCUN overflow-y
 *
 * Les bandeaux sont dans la garde parce qu'ils sont le déclencheur cité par le
 * testeur (« à tester avec fenêtre de mise à jour ou d'enrichissement
 * d'images ») : un bandeau qui grandit sans `flex-shrink: 0` vole sa hauteur
 * au scroller, et c'est cette hauteur volée qui fait céder la contrainte.
 */

const RACINE = resolve(__dirname, '../..');

const APP = readFileSync(resolve(RACINE, 'App.svelte'), 'utf-8');
const BIBLIO = readFileSync(resolve(RACINE, 'components/LibraryView.svelte'), 'utf-8');

/**
 * Corps d'une règle CSS, COMMENTAIRES RETIRÉS.
 *
 * Le retrait des commentaires n'est pas cosmétique : les corps de
 * `.genres-grid` et `.artists-grid` contiennent tous les deux le mot
 * `overflow-y` dans la prose qui explique pourquoi il ne doit pas y être
 * (« A second overflow-y here made Firefox draw a classic scrollbar… »). Sans
 * ce retrait, la garde se déclarerait satisfaite par le commentaire qui décrit
 * le défaut.
 */
function corpsDeRegle(source: string, selecteur: string): string {
  const sansCommentaires = source.replace(/\/\*[\s\S]*?\*\//g, '');
  const echappe = selecteur.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regle = new RegExp(`(?:^|[;}])\\s*${echappe}\\s*\\{([^{}]*)\\}`, 'm');
  const trouve = sansCommentaires.match(regle);
  if (!trouve) throw new Error(`Règle CSS « ${selecteur} » introuvable`);
  return trouve[1];
}

/** `overflow-y: auto|scroll`, ou `overflow: auto|scroll` qui l'implique. */
function declareUnAscenseurVertical(corps: string): boolean {
  return /overflow(-y)?\s*:\s*(auto|scroll)/.test(corps);
}

describe('garde #2225 : un seul ascenseur vertical dans la Bibliothèque', () => {
  it('.main-content ne défile pas — les bandeaux s’empilent au-dessus du scroller', () => {
    const corps = corpsDeRegle(APP, '.main-content');
    expect(corps, '.main-content doit rester `overflow: hidden` (#1075)').toMatch(
      /overflow\s*:\s*hidden/,
    );
  });

  it('.view-scroller est LE scroller de la vue active, et il peut se rétrécir', () => {
    const corps = corpsDeRegle(APP, '.view-scroller');
    expect(declareUnAscenseurVertical(corps)).toBe(true);
    // Sans `min-height: 0`, un item flex refuse de descendre sous la hauteur de
    // son contenu : le scroller déborderait au lieu de défiler, et le débordement
    // ressortirait un cran plus haut — le deuxième ascenseur.
    expect(corps, '.view-scroller a besoin de min-height: 0').toMatch(/min-height\s*:\s*0/);
  });

  it('les bandeaux ne volent jamais leur hauteur au scroller', () => {
    for (const bandeau of ['.update-banner', '.status-banner']) {
      const corps = corpsDeRegle(APP, bandeau);
      expect(corps, `${bandeau} doit être flex-shrink: 0`).toMatch(/flex-shrink\s*:\s*0/);
    }
  });

  it('.library-view met en page mais ne défile pas', () => {
    const corps = corpsDeRegle(BIBLIO, '.library-view');
    expect(corps, '.library-view doit rester `overflow: hidden`').toMatch(
      /overflow\s*:\s*hidden/,
    );
    expect(
      /overflow-y\s*:\s*(auto|scroll)/.test(corps),
      '.library-view ne doit PAS défiler : le défilement appartient à .library-scroller',
    ).toBe(false);
  });

  it('.library-scroller est le seul scroller de la bibliothèque', () => {
    const corps = corpsDeRegle(BIBLIO, '.library-scroller');
    expect(declareUnAscenseurVertical(corps)).toBe(true);
    expect(corps, '.library-scroller a besoin de min-height: 0').toMatch(/min-height\s*:\s*0/);
  });

  // Le cœur de #2225 : les deux onglets que le testeur a nommés.
  it.each(['.genres-grid', '.artists-grid'])(
    '%s ne déclare aucun ascenseur — sinon il se superpose à celui de .library-scroller',
    (selecteur) => {
      const corps = corpsDeRegle(BIBLIO, selecteur);
      expect(
        declareUnAscenseurVertical(corps),
        `${selecteur} déclare un overflow : c'est le deuxième ascenseur de #1075/#2225. ` +
          `La liste doit défiler AVEC .library-scroller, pas dans son propre conteneur.`,
      ).toBe(false);
    },
  );
});
