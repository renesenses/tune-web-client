import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Garde d'atteignabilité : créer une étiquette ne dépend plus d'être sur la
 * fiche d'un album.
 *
 * Le défaut vécu, signalé par bluevelvet (Pascal) le 06/07/2026 sur le fil
 * forum 953 « Etiquettes/Tags (en constrution…) », instruit en
 * renesenses/tune-server-rust#2256, point 1/3 :
 *
 *   « Je n'ai pas retrouvé la manière de créer une troisième étiquette. Pour
 *     l'instant, la procédure ne me paraît pas suffisamment intuitive. »
 *
 * Il ne l'a pas retrouvée parce qu'elle n'existait qu'à un seul endroit :
 * `api.createTag` n'avait qu'un appelant, `handleCreateAndAssignTag`, lui-même
 * déclenché par le seul champ ouvert par « + Tag » sur la fiche d'un album.
 * La barre de filtres de la grille d'albums, elle, savait déjà filtrer,
 * renommer et supprimer une étiquette — jamais en créer — et n'était même pas
 * montée tant qu'aucune étiquette n'existait : une bibliothèque neuve
 * n'affichait donc rien du tout.
 *
 * L'invariant tenu ici, et rien de plus :
 *
 *   1. la création a plus d'un point d'appel — le chemin unique est ce qui
 *      rendait la fonction introuvable ;
 *   2. la barre de filtres porte un déclencheur de création ;
 *   3. ce déclencheur n'est PAS derrière `{#if userTags.length > 0}`, sans
 *      quoi il disparaît exactement quand il sert le plus : à la première
 *      étiquette ;
 *   4. la création depuis la barre crée l'étiquette SEULE, sans assigner
 *      d'album — aucun album n'est sélectionné à cet endroit ;
 *   5. le champ de la fiche d'album offre une validation visible : la touche
 *      Entrée en était la seule issue, et un clic ailleurs perdait la saisie
 *      sans un mot.
 *
 * La garde est structurelle : elle ne rejoue aucun rendu. Elle fige les
 * chemins d'accès, parce que c'est leur nombre — un seul — qui était le
 * défaut.
 */

const RACINE = resolve(__dirname, '../..');

const BIBLIO = readFileSync(resolve(RACINE, 'components/LibraryView.svelte'), 'utf-8');

/** Le balisage seul : tout ce qui précède la balise `<style>` du composant. */
function balisage(source: string): string {
  const i = source.indexOf('<style');
  return i === -1 ? source : source.slice(0, i);
}

/**
 * Le balisage débarrassé de ses commentaires HTML. La prose qui explique le
 * défaut cite les classes qu'elle rétablit ; une garde ne doit jamais se
 * déclarer satisfaite par un commentaire.
 */
function sansCommentaires(marquage: string): string {
  return marquage.replace(/<!--[\s\S]*?-->/g, '');
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

/** Le corps de la fonction nommée, accolades appariées. */
function corpsDeFonction(source: string, nom: string): string {
  const entete = new RegExp(`function\\s+${nom}\\s*\\([^)]*\\)\\s*\\{`);
  const debut = source.match(entete);
  if (!debut || debut.index === undefined) {
    throw new Error(`Fonction « ${nom} » introuvable dans LibraryView.svelte`);
  }
  let profondeur = 1;
  let i = debut.index + debut[0].length;
  const depart = i;
  while (i < source.length && profondeur > 0) {
    const c = source[i];
    if (c === '{') profondeur++;
    else if (c === '}') profondeur--;
    i++;
  }
  return source.slice(depart, i - 1);
}

describe('#2256 : créer une étiquette ne passe plus par la seule fiche d’album', () => {
  const MARQUAGE = sansCommentaires(balisage(BIBLIO));

  it('la création a plus d’un point d’appel', () => {
    // C'est l'énoncé exact du défaut : un unique appelant, caché derrière un
    // unique bouton, sur une unique page.
    const appels = [...BIBLIO.matchAll(/\bapi\.createTag\s*\(/g)].length;
    expect(
      appels,
      'api.createTag n’a qu’un seul appelant : la création reste au même ' +
        'endroit unique que celui que Pascal n’a pas retrouvé.',
    ).toBeGreaterThan(1);
  });

  it('la barre de filtres de la grille d’albums porte un déclencheur de création', () => {
    const barre = fragmentDuConteneur(MARQUAGE, 'filter-chips');
    expect(barre, '.filter-chips introuvable dans le balisage').not.toBeNull();
    expect(
      /class="[^"]*\btag-create\b/.test(barre!),
      'la barre de filtres sait filtrer, renommer et supprimer une étiquette ' +
        'mais pas en créer — c’est exactement l’état signalé le 06/07.',
    ).toBe(true);
  });

  it('le déclencheur n’est pas conditionné à l’existence d’une étiquette', () => {
    const barre = fragmentDuConteneur(MARQUAGE, 'filter-chips')!;
    const posCreation = barre.indexOf('tag-create');
    const posGarde = barre.search(/\{#if\s+userTags\.length\s*>\s*0\s*\}/);
    expect(posCreation, 'déclencheur de création absent de la barre').toBeGreaterThanOrEqual(0);
    if (posGarde >= 0) {
      expect(
        posCreation,
        'le déclencheur de création est monté sous `{#if userTags.length > 0}` : ' +
          'il disparaît quand la bibliothèque n’a encore aucune étiquette, ' +
          'c’est-à-dire au moment précis où il faut pouvoir en créer une.',
      ).toBeLessThan(posGarde);
    }
  });

  it('la création depuis la barre crée l’étiquette seule, sans assigner d’album', () => {
    const corps = corpsDeFonction(BIBLIO, 'handleCreateTag');
    expect(corps, 'handleCreateTag doit appeler api.createTag').toMatch(/api\.createTag\s*\(/);
    expect(
      corps,
      'aucun album n’est sélectionné dans la barre de filtres : y assigner ' +
        'un album relèverait de l’invention.',
    ).not.toMatch(/api\.tagItem\s*\(/);
  });

  it('le champ de la fiche d’album offre une validation visible, pas seulement Entrée', () => {
    const zone = fragmentDuConteneur(MARQUAGE, 'tag-picker');
    expect(zone, '.tag-picker introuvable dans le balisage').not.toBeNull();
    expect(
      /class="[^"]*\btag-picker-submit\b/.test(zone!),
      'la touche Entrée est la seule issue : un nom saisi puis un clic ' +
        'ailleurs disparaît sans message.',
    ).toBe(true);
    // Le bouton doit réellement déclencher la création, pas se contenter
    // d'exister.
    expect(zone!).toMatch(/tag-picker-submit[\s\S]*?handleCreateAndAssignTag\s*\(/);
  });
});
