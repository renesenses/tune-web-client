/**
 * Écran Collections du nouveau client.
 *
 * Il n'existait PAS : la barre latérale n'y menait pas, aucun composant ne les
 * rendait. Le client actuel a `CollectionsView` ; le nouveau n'avait rien.
 *
 * ## Deux sortes, un seul écran
 *
 * NORMALE (liste d'albums choisis, `album_ids`) et SMART (une règle, évaluée à
 * la demande) sont mêlées : la distinction est de MÉCANIQUE, pas d'usage — on
 * cherche « ma sélection jazz », pas « ma collection à règles ». Une étiquette
 * la signale, elle ne sépare pas.
 *
 * ## Le repli, et pourquoi il est temporaire
 *
 * La PR serveur #3151 ajoute un champ `covers` aux deux listes. Tant qu'elle
 * n'est pas déployée, ce champ est ABSENT — et l'écran doit fonctionner quand
 * même. Il retombe donc sur les albums de chaque collection : une requête par
 * collection, exactement ce que la PR supprime.
 *
 * Ce test tient les DEUX : que `covers` soit utilisé quand il est là, et que le
 * repli existe tant qu'il ne l'est pas. Retirer le repli trop tôt viderait les
 * mosaïques chez tous ceux qui n'ont pas encore la nouvelle version.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const lire = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
const ecran = () => lire('../../components/v2/CollectionsV2.svelte');
const shell = () => lire('../../components/v2/ShellV2.svelte');
const barre = () => lire('../../components/v2/Sidebar.svelte');

/** La règle des quatre pochettes distinctes, telle que l'écran l'applique. */
function quatreDistinctes(source: { cover_path?: string | null }[]): string[] {
  const vues: string[] = [];
  for (const a of source) {
    const c = a?.cover_path;
    if (c && !vues.includes(c)) vues.push(c);
    if (vues.length === 4) break;
  }
  return vues;
}

describe('Collections — la sélection des pochettes', () => {
  it('quatre distinctes, dans l’ordre', () => {
    expect(
      quatreDistinctes([{ cover_path: 'A' }, { cover_path: 'B' }, { cover_path: 'C' }, { cover_path: 'D' }, { cover_path: 'E' }]),
    ).toEqual(['A', 'B', 'C', 'D']);
  });

  it('les doublons ne consomment pas de case', () => {
    // Deux albums d'une même édition partagent leur pochette.
    expect(
      quatreDistinctes([{ cover_path: 'A' }, { cover_path: 'A' }, { cover_path: 'B' }]),
    ).toEqual(['A', 'B']);
  });

  it('les albums sans pochette sont ignorés, pas comptés', () => {
    expect(
      quatreDistinctes([{ cover_path: null }, { cover_path: 'A' }, { cover_path: '' }, { cover_path: 'B' }]),
    ).toEqual(['A', 'B']);
  });

  it('aucune pochette : liste vide, la mosaïque retombera sur l’initiale', () => {
    expect(quatreDistinctes([{ cover_path: null }])).toEqual([]);
  });
});

describe('Collections — l’écran', () => {
  it('est atteignable : barre latérale et route du shell', () => {
    expect(barre().includes("view: 'collections'"), 'l’entrée a disparu de la barre').toBe(true);
    expect(shell().includes("$activeView === 'collections'"), 'la route a disparu du shell').toBe(true);
    expect(shell().includes('<CollectionsV2 />'), 'le composant n’est plus monté').toBe(true);
  });

  it('lit les DEUX sortes', () => {
    const src = ecran();
    expect(src.includes('api.getCollections()'), 'les collections manuelles ne sont plus lues').toBe(true);
    expect(src.includes('api.listSmartCollections()'), 'les collections intelligentes ne sont plus lues').toBe(true);
    // Séparément : l'échec de l'une ne doit pas priver de l'autre.
    expect(src.includes('Promise.allSettled'), 'un échec isolé ferait tomber les deux listes').toBe(true);
  });

  it('utilise `covers` du serveur quand il est là', () => {
    const src = ecran();
    expect(
      /covers: Array\.isArray\(c\.covers\) \? c\.covers : \[\]/.test(src),
      'le champ `covers` du serveur n’est plus lu : on repartirait sur une requête par collection.',
    ).toBe(true);
  });

  it('garde le repli tant que le serveur ne rend pas `covers`', () => {
    const src = ecran();
    expect(
      src.includes('const manquantes = entrees.filter((e) => !e.covers.length)'),
      'le repli a disparu : les mosaïques seraient vides sur tout serveur antérieur à la PR #3151.',
    ).toBe(true);
    // Et il ne s'applique QU'aux manquantes : rappeler le serveur pour celles
    // qui ont déjà leurs pochettes annulerait le gain de la PR.
    expect(
      src.includes('manquantes.map('),
      'le repli ne cible plus les seules collections sans pochette.',
    ).toBe(true);
  });

  it('la grille s’affiche AVANT les pochettes', () => {
    // `void completerPochettes()` après `chargement = false` : la grille est à
    // l'écran, les mosaïques la rejoignent. Attendre N requêtes avant de rien
    // montrer serait pire que pas de mosaïque.
    const src = ecran();
    const fin = src.indexOf('chargement = false;');
    const repli = src.indexOf('void completerPochettes()');
    expect(fin, 'le drapeau de chargement a disparu').toBeGreaterThan(-1);
    expect(repli, 'le repli n’est plus déclenché').toBeGreaterThan(fin);
  });
});
