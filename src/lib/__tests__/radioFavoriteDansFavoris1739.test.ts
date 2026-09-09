/**
 * FabienM, fil 1739, point 4 : « Radio mis en favori n'apparaît pas dans le
 * menu favoris ».
 *
 * DEUX choses portent le nom « favori radio », et l'écran n'en montrait qu'une.
 *
 *  - le favori d'une STATION  → colonne `radios.favorite`, affiché seulement
 *    dans l'écran Radios ;
 *  - un titre CAPTÉ à l'antenne → table `radio_favorites`, seul contenu de
 *    l'onglet « Radio » des Favoris.
 *
 * Fabien a mis une station en favori, est allé dans Favoris, et n'a rien
 * trouvé. Rien ne ramenait les stations ici.
 *
 * ## Deux mesures sur le .18, le 09/09/2026
 *
 *  1. `GET /radios?favorite=true&limit=500` → **46 lignes, dont 5 seulement
 *     portent `favorite`**. Le filtre serveur est IGNORÉ : la requête sans
 *     filtre rend exactement les mêmes 46. S'y fier afficherait 41 stations
 *     qui ne sont pas en favori.
 *  2. `GET /radio-favorites?limit=500` → 7 titres captés.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const lire = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf-8');
function sansCommentaires(src: string): string {
  return src
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}
const src = () => sansCommentaires(lire('src/components/v2/FavoritesV2.svelte'));

describe('point 4 — les STATIONS favorites sont dans l’écran Favoris', () => {
  it('🔴 l’écran demande les stations, pas seulement les titres captés', () => {
    expect(src(), 'les stations favorites ne sont jamais demandées')
      .toContain("api.getRadios({ favorite: true, limit: 500 })");
  });

  it('🔴 le filtre est REFAIT côté client — le serveur ignore le sien', () => {
    // Mesuré : `?favorite=true` rend 46 lignes dont 5 favorites. Sans ce
    // filtre local, l'onglet afficherait 41 stations non favorites.
    expect(src()).toMatch(/\.filter\(\(r\) => r\?\.favorite\)/);
  });

  it('🔴 le contenu est chargé au MONTAGE, pas au clic sur l’onglet', () => {
    // Le compteur de l'onglet lit ce contenu. Chargé au clic seulement, il
    // annonçait « 0 » — donc personne ne cliquait, et l'absence se confirmait
    // toute seule. C'est la moitié du constat de Fabien.
    expect(src(), 'le chargement est encore conditionné à l’onglet actif')
      .not.toMatch(/if \(tab !== 'radio' \|\| radioCharge\) return;/);
    expect(src()).toContain('if (radioCharge) return;');
  });

  it('le compteur d’onglet additionne stations ET titres', () => {
    expect(src()).toContain('n: vStations.length + vRadio.length');
  });

  it('une station se LIT depuis l’écran Favoris', () => {
    // Une station listée sans moyen de la lancer serait une demi-correction.
    expect(src()).toContain('api.playRadio(r.id, zid)');
    expect(src()).toContain('onclick={() => lireStation(r)}');
  });

  it('la recherche de l’écran filtre aussi les stations', () => {
    expect(src()).toContain('stations.filter((r) => match(r.name) || match(r.genre))');
  });

  it('🔴 un échec sur UNE des deux listes ne vide pas l’autre', () => {
    // `Promise.allSettled`, pas `Promise.all` : la route des titres captés et
    // celle des stations sont indépendantes, et un serveur qui n'en sert
    // qu'une doit quand même montrer l'autre.
    expect(src()).toContain('Promise.allSettled([');
  });
});
