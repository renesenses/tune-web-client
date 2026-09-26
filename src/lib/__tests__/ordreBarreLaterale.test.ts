import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * L'ordre de la barre latérale, donné par Bertrand le 20/09/2026.
 *
 * Il ENTRELACE les deux étages : pour que l'affichage suive sa liste, la file
 * d'attente et Oxygen montent dans le noyau, et la recherche descend en
 * avancé. Sans garde, un remaniement ultérieur remettrait « naturellement »
 * ces entrées à leur ancienne place — chacune a un commentaire qui plaide
 * pour l'ancien classement.
 */
const SIDEBAR = readFileSync(resolve(__dirname, '../../components/v2/Sidebar.svelte'), 'utf8');

/** Les vues d'un tableau, dans l'ordre où elles y figurent. */
function vuesDe(nom: string): string[] {
  const i = SIDEBAR.indexOf(`const ${nom}: Item[] = [`);
  expect(i, `tableau ${nom} introuvable`).toBeGreaterThan(-1);
  const bloc = SIDEBAR.slice(i, SIDEBAR.indexOf('\n  ]', i));
  return [...bloc.matchAll(/\{ view: '([a-z]+)'/g)].map((m) => m[1]);
}

describe('barre latérale — l’ordre du 20/09/2026', () => {
  it('le noyau suit la liste, file d’attente et Oxygen compris', () => {
    expect(vuesDe('CORE')).toEqual([
      'home', 'nowplaying', 'queue', 'history', 'library', 'oxygen', 'streaming', 'radios', 'podcasts',
    ]);
  });

  it('l’avancé suit la liste, le tableau de bord avant la recherche', () => {
    // `concerts` ferme la marche : elle n'est rendue que si le greffon est là
    // (`$concertsUtilisable`), donc elle ne déplace rien pour qui ne l'a pas.
    //
    // 🔴 `tableaudebord` s'intercale entre les Zones et la Recherche —
    // arbitrage de Bertrand du 25/09/2026, sur le NOUVEL écran à widgets.
    // La liste est COMPLÉTÉE à cette place précise, pas assouplie : ce témoin
    // EST l'arbitrage du 20/09, et une addition sans mandat explicite doit
    // continuer de le faire rougir.
    //
    // `circle` suit `concerts` — demande de Bertrand du 26/09/2026 : l'entrée
    // Tune Circle à côté des autres greffons, rendue seulement si le greffon
    // tourne (`$circleCharge`).
    expect(vuesDe('ADVANCED')).toEqual([
      'ambiance', 'browse', 'mediaservers', 'zonemanager', 'tableaudebord', 'search', 'concerts', 'circle',
    ]);
  });

  it('🔴 l’ordre AFFICHÉ, étages concaténés, est exactement celui demandé', () => {
    const affiche = [...vuesDe('CORE'), ...vuesDe('ADVANCED')].filter((v) => v !== 'concerts' && v !== 'circle');
    expect(affiche).toEqual([
      'home', 'nowplaying', 'queue', 'history', 'library', 'oxygen', 'streaming',
      'radios', 'podcasts', 'ambiance', 'browse', 'mediaservers', 'zonemanager',
      'tableaudebord', 'search',
    ]);
  });

  it('le tableau de bord a quitté la barre', () => {
    expect(SIDEBAR).not.toContain("view: 'dashboard'");
  });

  it('aucune entrée n’est dupliquée entre les deux étages', () => {
    const toutes = [...vuesDe('CORE'), ...vuesDe('ADVANCED')];
    expect(new Set(toutes).size, 'une entrée figure dans les deux étages').toBe(toutes.length);
  });
});
