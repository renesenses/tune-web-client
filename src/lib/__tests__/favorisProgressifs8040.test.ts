/**
 * tune-server-rust#8040 — les favoris d'un service s'affichent par pages, la
 * première tout de suite, la suite ensuite sans geste.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  chargerFavorisProgressifs,
  pageComplete,
  PREMIERE_PAGE,
  type NatureFavori,
  type Page,
} from '../favorisProgressifs';

const lire = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf-8');
const sansCommentaires = (s: string) =>
  s.replace(/<!--[\s\S]*?-->/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const elements = (n: number, de = 1) =>
  Array.from({ length: n }, (_, i) => ({ source_id: String(de + i), title: `piste ${de + i}` }));

/** Une promesse à résoudre à la main. */
function differee<T>() {
  let resoudre!: (v: T) => void;
  const promesse = new Promise<T>((r) => { resoudre = r; });
  return { promesse, resoudre };
}

describe('Favoris progressifs (tune-server-rust#8040)', () => {
  it('la première page s’affiche AVANT que la liste entière ne soit arrivée', async () => {
    const entiere = differee<unknown>();
    const appels: Array<[NatureFavori, Page | undefined]> = [];
    const lireFavoris = vi.fn(async (nature: NatureFavori, page?: Page) => {
      appels.push([nature, page]);
      if (nature !== 'tracks') return { [nature]: [] , total: 0 };
      if (page) return { tracks: elements(50), total: 120, limit: 50, offset: 0 };
      return entiere.promesse;
    });
    const affiches: Array<[NatureFavori, number]> = [];
    const pret = vi.fn();

    const fini = chargerFavorisProgressifs(lireFavoris, (n, items) => affiches.push([n, items.length]), pret);
    // Laisser les premières pages répondre.
    await new Promise((r) => setTimeout(r, 0));

    expect(affiches).toContainEqual(['tracks', 50]);
    expect(pret).toHaveBeenCalledTimes(1);
    expect(appels).toContainEqual(['tracks', { limit: PREMIERE_PAGE, offset: 0 }]);
    expect(appels).toContainEqual(['tracks', undefined]);

    entiere.resoudre({ tracks: elements(120) });
    await fini;
    expect(affiches.at(-1)).toEqual(['tracks', 120]);
  });

  it('rien de plus n’est demandé quand la première page couvre tout', async () => {
    const lireFavoris = vi.fn(async (nature: NatureFavori) => ({ [nature]: elements(3), total: 3 }));
    const affiches: Array<[NatureFavori, number]> = [];
    await chargerFavorisProgressifs(lireFavoris, (n, items) => affiches.push([n, items.length]), () => {});
    expect(lireFavoris).toHaveBeenCalledTimes(3);
    expect(affiches).toHaveLength(3);
  });

  it('un serveur antérieur (sans `total`) rend la liste entière : prise telle quelle, une seule requête', async () => {
    const lireFavoris = vi.fn(async (nature: NatureFavori) => ({ [nature]: elements(300) }));
    const affiches: Array<[NatureFavori, number]> = [];
    await chargerFavorisProgressifs(lireFavoris, (n, items) => affiches.push([n, items.length]), () => {});
    expect(lireFavoris).toHaveBeenCalledTimes(3);
    expect(affiches).toContainEqual(['tracks', 300]);
  });

  it('une nature en échec rend une liste vide et ne retarde pas « prêt »', async () => {
    const lireFavoris = vi.fn(async (nature: NatureFavori) => {
      if (nature === 'artists') throw new Error('503 service_occupe');
      return { [nature]: elements(2), total: 2 };
    });
    const affiches: Array<[NatureFavori, number]> = [];
    const pret = vi.fn();
    await chargerFavorisProgressifs(lireFavoris, (n, items) => affiches.push([n, items.length]), pret);
    expect(pret).toHaveBeenCalledTimes(1);
    expect(affiches).toContainEqual(['artists', 0]);
    expect(affiches).toContainEqual(['tracks', 2]);
  });

  it('la suite en échec laisse la première page affichée', async () => {
    const lireFavoris = vi.fn(async (nature: NatureFavori, page?: Page) => {
      if (!page) throw new Error('502');
      return { [nature]: elements(50), total: 120 };
    });
    const affiches: Array<[NatureFavori, number]> = [];
    await chargerFavorisProgressifs(lireFavoris, (n, items) => affiches.push([n, items.length]), () => {});
    expect(affiches.filter(([n]) => n === 'tracks')).toEqual([['tracks', 50]]);
  });

  it('pageComplete lit `total` ; sans total annoncé, une page pleine appelle la suite', () => {
    expect(pageComplete({ tracks: elements(300) }, 'tracks', 50)).toBe(true);
    expect(pageComplete({ tracks: elements(50), total: 120 }, 'tracks', 50)).toBe(false);
    expect(pageComplete({ tracks: elements(20), total: 20 }, 'tracks', 50)).toBe(true);
    expect(pageComplete({ tracks: elements(50), total: null }, 'tracks', 50)).toBe(false);
    expect(pageComplete({ tracks: elements(12), total: null }, 'tracks', 50)).toBe(true);
  });

  it('l’écran Favoris passe par le chargement progressif', () => {
    const ecran = sansCommentaires(lire('src/components/v2/StreamingV2.svelte'));
    expect(ecran).toContain('chargerFavorisProgressifs(');
    expect(ecran).toContain('api.getStreamingFavorites(svc, type, page)');
    // La suite se signale, dans la langue de l'interface, sous la première page.
    expect(ecran).toContain("$t('v2.stream.loadingMore' as any)");
    // Le compteur qui périme une chaîne en vol avance pour TOUTE vue qui
    // prend la place — avant le retour anticipé d'un onglet expiré, pas
    // seulement dans la branche des favoris.
    const avance = ecran.indexOf('const mien = ++seqFavoris;');
    expect(avance).toBeGreaterThan(-1);
    expect(avance).toBeLessThan(ecran.indexOf('if (ongletExpire) { paneLoading = false; return; }'));
  });
});
