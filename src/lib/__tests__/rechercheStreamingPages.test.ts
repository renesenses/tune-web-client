/**
 * La recherche DANS UN SERVICE : quatre familles, et des pages.
 *
 * Fabien, sur la v0.9.140 :
 *
 *   « La recherche dans le service Streaming fonctionne mal : albums et titres
 *     sont mélangés, artistes en 1 seule ligne (impossible de tout voir) »
 *   « La recherche globale depuis le menu principal ne retourne pas tous les
 *     résultats du streaming (ex : recherche titre "Somebody" sur Qobuz ->
 *     retourne seulement 50 résultats) »
 *
 * Les deux constats se réglaient au même endroit, et l'écran en était la
 * cause :
 *
 *  1. `StreamingV2` ne rendait que DEUX des quatre familles servies — Albums
 *     et Artistes. Les titres n'avaient pas de section : les singles
 *     apparaissaient donc parmi les albums, d'où le « mélange » ; les
 *     playlists n'apparaissaient pas du tout.
 *  2. Les artistes tenaient sur une rangée à défilement horizontal dont la
 *     barre est masquée (`scrollbar-width:none`) et qui était en plus tronquée
 *     à quatorze — « impossible de tout voir » au sens propre.
 *  3. `api.searchStreaming` n'envoyait AUCUN `offset` : rien, dans tout le
 *     client, ne pouvait aller chercher la page suivante.
 *
 * Mesure sur le .18 le 07/09/2026, `q=somebody` sur Qobuz (`limit=50`) :
 *
 *     offset=0    -> 50 albums, 50 artistes, 50 titres, 50 playlists
 *     offset=50   -> 50 / 50 / 50 / 50, tous différents
 *     offset=120  -> 50 albums, 14 artistes (la famille s'épuise)
 *     offset=200  -> 50 albums, 0 artiste, 50 titres, 0 playlist
 *     has_more: true   totals: {albums:1000, artists:134, tracks:1000, …}
 *
 * `has_more` est donc GLOBAL : il reste vrai tant qu'une seule famille a de la
 * matière. C'est lui qui commande le bouton, pas le compte d'une famille.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const lire = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
const ecran = () => lire('../../components/v2/StreamingV2.svelte');
const client = () => lire('../api.ts');

/** Le bloc `{:else if results}` — les résultats de service, et rien d'autre. */
function blocResultats(src: string): string {
  const debut = src.indexOf('{:else if results}');
  expect(debut, 'le bloc des résultats de service a disparu').toBeGreaterThan(-1);
  const fin = src.indexOf('{:else if paneLoading}', debut);
  expect(fin, 'la fin du bloc des résultats est introuvable').toBeGreaterThan(debut);
  return src.slice(debut, fin);
}

describe('Recherche dans un service : les quatre familles', () => {
  it('les quatre familles ont chacune leur section', () => {
    const bloc = blocResultats(ecran());
    for (const famille of ['results.albums', 'results.tracks', 'results.artists', 'results.playlists']) {
      expect(
        bloc.includes(`{#if ${famille}?.length}`),
        `la famille « ${famille} » n'a plus de section : elle se confondrait avec une autre`,
      ).toBe(true);
    }
  });

  it('les titres passent par la liste commune, donc par le tableau du mode essentiel', () => {
    const bloc = blocResultats(ecran());
    expect(
      /<ListePistesV2[\s\S]*?pistes=\{results\.tracks/.test(bloc),
      'les titres ne passent plus par ListePistesV2 : ils perdraient le tableau et les colonnes choisies',
    ).toBe(true);
    expect(
      ecran().includes("import ListePistesV2 from './ListePistesV2.svelte';"),
      'ListePistesV2 n’est plus importé',
    ).toBe(true);
  });

  it('les artistes ne sont NI tronqués NI enfermés dans la rangée qui défile', () => {
    const bloc = blocResultats(ecran());
    expect(
      /results\.artists\.slice\(/.test(bloc),
      'les artistes sont de nouveau tronqués — c’est exactement « impossible de tout voir »',
    ).toBe(false);
    expect(
      bloc.includes('class="agrid"'),
      'les artistes sont revenus dans une rangée : `.arow` défile horizontalement sans barre visible',
    ).toBe(true);
    expect(
      /\.agrid\{[^}]*display:grid/.test(ecran()),
      '`.agrid` n’est plus une grille qui va à la ligne',
    ).toBe(true);
  });
});

describe('Recherche dans un service : les pages', () => {
  it('`searchStreaming` sait envoyer un décalage', () => {
    const src = client();
    const bloc = /export function searchStreaming\([\s\S]*?\n\}/.exec(src);
    expect(bloc, 'searchStreaming a disparu').not.toBeNull();
    expect(
      /offset\s*=\s*0/.test(bloc![0]),
      'searchStreaming ne prend plus de décalage : le client resterait plafonné à la première page',
    ).toBe(true);
    expect(
      /set\('offset'/.test(bloc![0]),
      'le décalage n’est plus transmis au serveur',
    ).toBe(true);
  });

  it('« voir plus » CHARGE la page suivante, il ne dévoile pas une part déjà en main', () => {
    const src = ecran();
    const bloc = /async function chargerPlus\(\)[\s\S]*?\n  \}/.exec(src);
    expect(bloc, 'chargerPlus a disparu : le bouton ne pourrait plus rien charger').not.toBeNull();
    expect(
      /rechOffset \+ api\.SEARCH_PAGE_LIMIT/.test(bloc![0]),
      'la page suivante ne se calcule plus depuis le décalage courant',
    ).toBe(true);
    expect(
      /api\.searchStreaming\(svc, needle, api\.SEARCH_PAGE_LIMIT, suivant\)/.test(bloc![0]),
      'chargerPlus ne redemande plus au service avec le décalage',
    ).toBe(true);
    // Le bouton est commandé par `has_more`, pas par le compte d'une famille :
    // les artistes s'épuisent (134) bien avant les titres (1000).
    expect(
      blocResultats(src).includes('results.has_more'),
      'le bouton ne suit plus `has_more` : il disparaîtrait dès qu’une famille s’épuise',
    ).toBe(true);
  });

  it('les pages s’EMPILENT, dédoublonnées par la clef même du balisage', () => {
    const src = ecran();
    const bloc = /async function chargerPlus\(\)[\s\S]*?\n  \}/.exec(src)![0];
    for (const famille of ['albums', 'artists', 'tracks', 'playlists']) {
      expect(
        bloc.includes(`${famille}: empiler(results.${famille}, page.${famille})`),
        `la famille « ${famille} » n’est plus empilée : la page suivante l’écraserait`,
      ).toBe(true);
    }
    // 🔴 `each_key_duplicate` arrête Svelte et l'écran ENTIER disparaît. En
    // empilant des pages, deux entrées identiques deviennent possibles : le
    // dédoublonnage doit donc se faire avec EXACTEMENT la clef que `{#each}`
    // utilisera, sans quoi l'unicité n'est qu'espérée.
    expect(
      /const vus = new Set\(out\.map\(\(x, i\) => cleItem\(x, i\)\)\)/.test(src),
      'le dédoublonnage n’emploie plus la clef du balisage : deux pages pourraient rendre la même clef',
    ).toBe(true);
    const rendu = blocResultats(src);
    for (const famille of ['results.albums', 'results.artists', 'results.playlists']) {
      expect(
        new RegExp(`\\{#each ${famille.replace('.', '\\.')} as \\w+, i \\(cleItem\\(`).test(rendu),
        `« ${famille} » n’est plus clef-é par cleItem : le dédoublonnage ne le protège plus`,
      ).toBe(true);
    }
    // Les titres ne passent pas par un `{#each}` d'ici : c'est `ListePistesV2`
    // qui les clé-e, et il faut lui passer LA MÊME clef.
    expect(
      /clef=\{\(\w+, i\) => cleItem\(/.test(rendu),
      'la liste de titres ne reçoit plus la clef commune : sa clef par défaut est `id`, or une piste de service a `id: null`',
    ).toBe(true);
  });

  it('une nouvelle recherche repart de la première page', () => {
    // Sans cette remise à zéro, la recherche suivante repartirait au décalage
    // de la précédente et n'aurait plus jamais de première page.
    const src = ecran();
    const effet = /\/\/ Recherche dans le service courant\.[\s\S]*?\n  \}\);/.exec(src);
    expect(effet, 'l’effet de recherche a disparu').not.toBeNull();
    expect(
      (effet![0].match(/rechOffset = 0/g) ?? []).length >= 2,
      'le décalage n’est plus remis à zéro quand la recherche change',
    ).toBe(true);
  });
});
