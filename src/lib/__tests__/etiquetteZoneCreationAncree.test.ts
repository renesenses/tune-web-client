import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Garde d'ancrage : la zone de création d'étiquette s'ouvre SOUS son bouton
 * « + Tag », jamais au bas de la fenêtre.
 *
 * Le défaut vécu, signalé par bluevelvet (Pascal) le 06/07/2026 sur le fil
 * forum 451 « Etiquettes/Tags », instruit en
 * renesenses/tune-server-rust#2256 :
 *
 *   « De mémoire, la zone de création apparaissait en bas de l'écran, juste
 *     au-dessus de la barre de lecture, avec une partie de l'interface
 *     partiellement masquée par celle-ci. »
 *
 * La cause n'était pas une valeur de décalage mal choisie, mais un ancrage
 * manquant. `.tag-picker` est `position: absolute; top: 100%`, et la feuille
 * de style porte depuis l'origine (74546c0) une règle
 * `.tag-add-wrap { position: relative }` destinée à l'ancrer — que le balisage
 * n'a JAMAIS utilisée. Sans cet ancêtre positionné, le bloc de référence
 * remontait jusqu'à `.view-scroller` (App.svelte, `position: relative`), qui
 * occupe toute la hauteur de la vue : `top: 100%` plaçait donc la zone au bas
 * de cette hauteur, c'est-à-dire exactement contre la barre de lecture.
 *
 * L'invariant tenu ici, et rien de plus :
 *
 *   1. `.tag-add-wrap` existe en CSS **et** est employé dans le balisage ;
 *   2. le bouton « + Tag » et `.tag-picker` sont tous deux DANS ce conteneur,
 *      dans cet ordre — c'est ce qui fait de `top: 100%` « sous le bouton » ;
 *   3. `.tag-add-wrap` reste `position: relative`, sinon l'ancrage repart vers
 *      `.view-scroller` et le défaut revient à l'identique ;
 *   4. `.tag-picker` reste positionné en absolu par rapport à lui.
 *
 * La garde est structurelle : elle ne mesure rien dans un navigateur et ne
 * prétend pas rejouer le rendu. Elle fige la seule chaîne qui empêche le
 * décalage, parce que la règle CSS qui devait la porter est restée morte
 * pendant deux mois sans que rien ne le signale.
 */

const RACINE = resolve(__dirname, '../..');

const BIBLIO = readFileSync(resolve(RACINE, 'components/LibraryView.svelte'), 'utf-8');

/** Le balisage seul : tout ce qui précède la balise `<style>` du composant. */
function balisage(source: string): string {
  const i = source.indexOf('<style');
  return i === -1 ? source : source.slice(0, i);
}

/**
 * Corps d'une règle CSS, COMMENTAIRES RETIRÉS — même précaution que la garde
 * #2225 : la prose qui explique le défaut cite les propriétés qu'elle
 * interdit, et une garde ne doit jamais se déclarer satisfaite par un
 * commentaire.
 */
function corpsDeRegle(source: string, selecteur: string): string {
  const sansCommentaires = source.replace(/\/\*[\s\S]*?\*\//g, '');
  const echappe = selecteur.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regle = new RegExp(`(?:^|[;}])\\s*${echappe}\\s*\\{([^{}]*)\\}`, 'm');
  const trouve = sansCommentaires.match(regle);
  if (!trouve) throw new Error(`Règle CSS « ${selecteur} » introuvable`);
  return trouve[1];
}

/**
 * Le fragment de balisage délimité par `<balise class="…">` et sa fermeture,
 * comptage des imbrications compris. Renvoie `null` quand l'ouverture est
 * absente — le test le distingue explicitement d'un fragment vide.
 */
function fragmentDuConteneur(source: string, classe: string): string | null {
  const ouverture = new RegExp(`<([a-zA-Z][\\w-]*)([^>]*\\bclass="[^"]*\\b${classe}\\b[^"]*"[^>]*)>`);
  const debut = source.match(ouverture);
  if (!debut || debut.index === undefined) return null;
  const balise = debut[1];
  let profondeur = 1;
  let i = debut.index + debut[0].length;
  const jetons = new RegExp(`<(/?)${balise}(?:\\s[^>]*)?(/?)>`, 'g');
  jetons.lastIndex = i;
  let m: RegExpExecArray | null;
  while ((m = jetons.exec(source))) {
    if (m[2] === '/') continue;
    profondeur += m[1] === '/' ? -1 : 1;
    if (profondeur === 0) return source.slice(i, m.index);
  }
  return source.slice(i);
}

describe('#2256 : la zone de création d’étiquette est ancrée sous « + Tag »', () => {
  const MARQUAGE = balisage(BIBLIO);

  it('`.tag-add-wrap` n’est pas une règle morte : le balisage l’emploie', () => {
    // Le défaut d'origine tient tout entier là : la règle existait, le
    // balisage ne l'utilisait pas.
    expect(
      corpsDeRegle(BIBLIO, '.tag-add-wrap'),
      '.tag-add-wrap doit exister en CSS',
    ).toBeTruthy();
    expect(
      /class="[^"]*\btag-add-wrap\b/.test(MARQUAGE),
      '.tag-add-wrap est déclaré en CSS mais absent du balisage : ' +
        'l’ancrage n’existe pas et `top: 100%` retombe sur `.view-scroller`.',
    ).toBe(true);
  });

  it('le bouton « + Tag » et la zone de création vivent dans ce conteneur', () => {
    const dedans = fragmentDuConteneur(MARQUAGE, 'tag-add-wrap');
    expect(dedans, '.tag-add-wrap introuvable dans le balisage').not.toBeNull();
    const posBouton = dedans!.indexOf('tag-add-btn');
    const posZone = dedans!.indexOf('tag-picker');
    expect(posBouton, 'le bouton « + Tag » doit être DANS .tag-add-wrap').toBeGreaterThanOrEqual(0);
    expect(posZone, 'la zone de création doit être DANS .tag-add-wrap').toBeGreaterThanOrEqual(0);
    // L'ordre compte : `top: 100%` veut dire « sous le bouton », ce qui suppose
    // que le bouton précède la zone dans le flux.
    expect(posBouton, 'le bouton doit précéder la zone de création').toBeLessThan(posZone);
  });

  it('`.tag-add-wrap` reste le bloc de référence — sinon le défaut revient', () => {
    expect(
      corpsDeRegle(BIBLIO, '.tag-add-wrap'),
      '.tag-add-wrap sans `position: relative` : `.tag-picker` s’ancre de nouveau ' +
        'sur `.view-scroller` et retombe contre la barre de lecture.',
    ).toMatch(/position\s*:\s*relative/);
  });

  it('`.tag-picker` reste positionné en absolu sous son ancre', () => {
    const corps = corpsDeRegle(BIBLIO, '.tag-picker');
    expect(corps).toMatch(/position\s*:\s*absolute/);
    expect(corps, 'la zone s’ouvre SOUS le bouton, pas au-dessus').toMatch(/top\s*:\s*100%/);
  });
});
