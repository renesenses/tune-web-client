/**
 * tune-server-rust#5284 — Sevy Tabroc, fil 2002 : « Le réglage de 500 titres
 * n'est pas pris en compte pour limiter le nombre de morceaux en lecture
 * aléatoire ». Journal : `shuffle_max_tracks` écrit à 13:07, puis une file de
 * 4 986 titres posée à 13:08.
 *
 * Le serveur borne `POST /playback/shuffle-all` (bibliothèque, album, artiste,
 * genre, recherche, répertoire — donc Oxygen). Mais chaque liste que le CLIENT
 * mélange lui-même partait par `play { track_ids }` sans rencontrer le
 * plafond : collections, favoris, listes de lecture, recherche, listes
 * intelligentes, gestes d'objet (tous via `lireListeAleatoire`), la
 * provenance de la Bibliothèque et la discographie d'un service (via
 * `melangee` nu).
 *
 * Épreuve : pour chaque chemin, une file demandée de 800 titres en donne 500.
 */
import { describe, expect, it, vi } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

vi.mock('../api', async (original) => ({
  ...(await original<typeof import('../api')>()),
  getConfig: vi.fn(async () => ({ shuffle_max_tracks: 500 })),
}));

import { lireListeAleatoire, planAleatoire } from '../lectureEnMasse';
import { pistesDeLaSelection, tirageAleatoire } from '../porteeAleatoire';
import { plafondFileAleatoire } from '../fileAleatoire';
import type { Track } from '../types';

const PLAFOND = 500;
const DEMANDE = 800;
const locales = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ id: i + 1, album_id: 1 + (i % 40), title: `T${i}` }) as Track);
const deService = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ id: null, title: `S${i}`, source: 'qobuz', source_id: String(i) }) as unknown as Track);

function temoin(plafond?: number) {
  const envois: { quoi: string; corps: any }[] = [];
  return {
    envois,
    gestes: {
      lire: async (c: any) => { envois.push({ quoi: 'lire', corps: c }); },
      enfiler: async (c: any) => { envois.push({ quoi: 'enfiler', corps: c }); },
      ...(plafond == null ? {} : { plafond: async () => plafond }),
    },
  };
}
function pistesEnvoyees(envois: { quoi: string; corps: any }[]): number {
  let n = 0;
  for (const e of envois) {
    if (e.quoi === 'lire') n += e.corps.track_ids ? e.corps.track_ids.length : 1;
    else n += e.corps.tracks.length;
  }
  return n;
}

describe('#5284 — une file aléatoire demandée de 800 titres en donne 500', () => {
  it('lireListeAleatoire, liste LOCALE, plafond lu au SERVEUR (collections, favoris, listes, recherche…)', async () => {
    const t = temoin();
    const n = await lireListeAleatoire(locales(DEMANDE), t.gestes);
    expect(n).toBe(PLAFOND);
    expect(t.envois).toHaveLength(1);
    expect(t.envois[0].corps.track_ids).toHaveLength(PLAFOND);
    expect(new Set(t.envois[0].corps.track_ids).size).toBe(PLAFOND);
  });

  it('lireListeAleatoire, liste de SERVICE (tête puis reste) : 500 au total', async () => {
    const t = temoin(PLAFOND);
    const n = await lireListeAleatoire(deService(DEMANDE), t.gestes);
    expect(n).toBe(PLAFOND);
    expect(pistesEnvoyees(t.envois)).toBe(PLAFOND);
  });

  it('planAleatoire borne au plafond reçu, et au défaut serveur (500) sans plafond', () => {
    expect((planAleatoire(locales(DEMANDE), PLAFOND) as any).corps.track_ids).toHaveLength(PLAFOND);
    expect((planAleatoire(locales(DEMANDE)) as any).corps.track_ids).toHaveLength(PLAFOND);
  });

  it('tirageAleatoire mélange AVANT de couper : pas toujours les 500 premiers', () => {
    const liste = Array.from({ length: DEMANDE }, (_, i) => i);
    const tirage = tirageAleatoire(liste, PLAFOND);
    expect(tirage).toHaveLength(PLAFOND);
    expect(new Set(tirage).size).toBe(PLAFOND);
    expect(tirage.some((x) => x >= PLAFOND), 'seuls les 500 premiers sortent : coupé avant de mélanger').toBe(true);
  });

  it('facettes de la Bibliothèque (pistesDeLaSelection) : 500', () => {
    const albums = new Set(Array.from({ length: 40 }, (_, i) => i + 1));
    expect(pistesDeLaSelection(locales(DEMANDE), albums, PLAFOND)).toHaveLength(PLAFOND);
  });

  it('plafondFileAleatoire lit la valeur serveur, et retombe sur 500 s’il ne répond pas', async () => {
    expect(await plafondFileAleatoire(async () => ({ shuffle_max_tracks: 800 }))).toBe(800);
    expect(await plafondFileAleatoire(async () => ({ shuffle_max_tracks: '500' }))).toBe(500);
    expect(await plafondFileAleatoire(async () => { throw new Error('hors ligne'); })).toBe(500);
  });

  /**
   * Provenance de la Bibliothèque et discographie d'un service mélangeaient
   * avec `melangee` nu, puis envoyaient TOUT. Aucun écran ne doit plus
   * mélanger lui-même une liste qu'il va lire : il passe par `tirageAleatoire`
   * ou `lireListeAleatoire`, qui rencontrent le plafond.
   */
  it('aucun écran ne mélange une liste avec `melangee` nu', () => {
    const racine = resolve(__dirname, '../../components');
    const fautifs: string[] = [];
    const parcourir = (d: string) => {
      for (const nom of readdirSync(d)) {
        const p = join(d, nom);
        if (statSync(p).isDirectory()) parcourir(p);
        else if (p.endsWith('.svelte') && /\bmelangee\(/.test(readFileSync(p, 'utf-8'))) fautifs.push(p);
      }
    };
    parcourir(racine);
    expect(fautifs, 'ces écrans mélangent sans plafond').toEqual([]);
  });
});
