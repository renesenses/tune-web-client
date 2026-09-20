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

  it('l’avancé suit la liste, la recherche en dernier', () => {
    // `concerts` ferme la marche : elle n'est rendue que si le greffon est là
    // (`$concertsUtilisable`), donc elle ne déplace rien pour qui ne l'a pas.
    expect(vuesDe('ADVANCED')).toEqual([
      'ambiance', 'browse', 'mediaservers', 'zonemanager', 'search', 'concerts',
    ]);
  });

  it('🔴 l’ordre AFFICHÉ, étages concaténés, est exactement celui demandé', () => {
    const affiche = [...vuesDe('CORE'), ...vuesDe('ADVANCED')].filter((v) => v !== 'concerts');
    expect(affiche).toEqual([
      'home', 'nowplaying', 'queue', 'history', 'library', 'oxygen', 'streaming',
      'radios', 'podcasts', 'ambiance', 'browse', 'mediaservers', 'zonemanager', 'search',
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
