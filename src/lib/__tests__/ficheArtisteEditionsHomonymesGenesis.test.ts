// Bertrand, .18, v1.0.0-rc4, 12/10/2026 : fiche artiste Genesis, albums
// locaux — « A Trick of the Tail » n'apparaît pas, ni en carte ni ailleurs,
// même après un rescan.
//
// Le serveur sert pourtant tout (`genesis18AlbumsArtiste.fixture.json`,
// relevé le 12/10/2026 sur `GET /library/artists/2753/albums?sections=1`) :
//
//   - 15029, « A TRICK OF THE TAIL », UPnP, 8 titres — rendu EN PREMIER ;
//   - 10375, « A Trick of the Tail », local, 1981, 7 titres ;
//   - 19824, « A Trick of the Tail », local, 2007, 8 titres.
//
// `fusionnerDiscographie` rangeait les trois sous la source « local » et n'en
// gardait QU'UN par source (la règle des doublons de Qobuz, #4652) : celui qui
// a le plus de titres, à égalité le premier arrivé — l'exemplaire UPnP. Sa
// provenance est `upnp:<udn>` : sous la pastille « Local », la vignette
// tombait, et les deux albums locaux avec elle. Sans filtre, l'édition de 1981
// n'était atteignable de nulle part.
import { describe, expect, it } from 'vitest';
import {
  dansProvenances, fusionnerDiscographie, partagerParTypeDeSortie, provenancesEntree, recentrerSurProvenances,
  type EntreeDiscographie,
} from '../discographieCommune';
import { provenanceDe } from '../provenanceBibliotheque';
import type { Album } from '../types';
import G from './genesis18AlbumsArtiste.fixture.json';

const locaux = (G as unknown as { albums: Album[] }).albums;

/** Ce que la fiche montre sous un choix de pastilles : filtre, recentrage, sections. */
function fiche(choix: string[]): EntreeDiscographie[] {
  const c = new Set(choix);
  const gardees = fusionnerDiscographie(locaux, [])
    .filter((e) => dansProvenances(e, c))
    .map((e) => recentrerSurProvenances(e, c));
  const s = partagerParTypeDeSortie(gardees);
  return [...s.albums, ...s.eps, ...s.singles, ...s.live];
}
const principaux = (entrees: EntreeDiscographie[]) => entrees.map((e) => e.principal.album.id);
const atteints = (entrees: EntreeDiscographie[]) => entrees.flatMap((e) => e.exemplaires.map((x) => x.album.id));

describe('fiche Genesis (.18, 12/10/2026) — deux éditions locales homonymes et une copie UPnP', () => {
  it('le relevé contient bien les trois exemplaires', () => {
    const trick = locaux.filter((a) => /trick of the tail/i.test(a.title ?? '')).map((a) => a.id);
    expect(trick).toEqual([15029, 10375, 19824]);
  });

  it('pastille « Local » : les DEUX éditions locales ont leur vignette, et l’ouvrent', () => {
    const vues = fiche(['local']);
    expect(principaux(vues)).toContain(10375);
    expect(principaux(vues)).toContain(19824);
  });

  it('sans filtre : chaque album de la bibliothèque reste atteignable', () => {
    const vues = fiche([]);
    for (const a of locaux) expect(atteints(vues)).toContain(a.id);
    // La copie UPnP se range sur la vignette de l'édition locale, pas à côté.
    const trick = vues.filter((e) => e.exemplaires.some((x) => x.album.id === 10375));
    expect(trick).toHaveLength(1);
    expect(trick[0].exemplaires.map((x) => x.album.id)).toEqual([10375, 15029]);
    expect(trick[0].principal.album.id).toBe(10375);
  });

  it('pastille du serveur UPnP : la copie UPnP s’ouvre, pas la copie locale', () => {
    const udn = provenanceDe(locaux.find((a) => a.id === 15029)!);
    const vues = fiche([udn]);
    expect(principaux(vues)).toContain(15029);
    expect(vues.every((e) => provenancesEntree(e).includes(udn))).toBe(true);
  });

  it('pastille « Local » : chaque album local du relevé a sa vignette', () => {
    const vues = principaux(fiche(['local']));
    for (const a of locaux.filter((x) => provenanceDe(x) === 'local')) expect(vues).toContain(a.id);
  });

  it('les clés de vignette restent uniques (clés de boucle Svelte)', () => {
    const entrees = fusionnerDiscographie(locaux, []);
    expect(new Set(entrees.map((e) => e.cle)).size).toBe(entrees.length);
    for (const e of entrees) expect(new Set(e.sources).size).toBe(e.sources.length);
  });
});
