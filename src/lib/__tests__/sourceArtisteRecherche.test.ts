/**
 * La source des ARTISTES dans l'écran Recherche.
 *
 * Bertrand, 09/09/2026 : « Écran recherche : manque le sélecteur de source dans
 * l'artiste (meilleur résultat) ».
 *
 * ## Mesuré avant de corriger
 *
 * `GET /search?q=Marco Iacobini&limit=100` sur le .18. Le serveur range les
 * résultats par SEAU — `local`, puis `services.{bandcamp,qobuz,tidal,youtube}` —
 * et les objets artistes qu'il rend ne portent **aucun champ `source`** :
 *
 *     bandcamp : {id: 'https://marcoiacobini.bandcamp.com', image_path: …, name: 'Marco Iacobini'}
 *     qobuz    : {id: '2113961',   image_path: null, name: 'Marco Iacobini'}
 *     tidal    : {id: '6456650',   image_path: …,    name: 'Marco Iacobini'}
 *     youtube  : {id: 'UCi92pS…',  image_path: …,    name: 'Marco Iacobini'}
 *
 * Quatre fois le même nom, parfois la même image. Sans marque d'origine, les
 * quatre tuiles sont indiscernables.
 *
 * ## Où était le manque
 *
 * PAS dans les données : `fusionnerParType` estampille déjà `source` sur les
 * artistes, exactement comme sur les albums et les pistes. Le manque était dans
 * le BALISAGE — les tuiles d'artiste ne passaient pas cette source à la
 * pochette, là où les cartes d'album et de piste le font depuis toujours.
 *
 * C'est la forme « écrit mais pas branché » : la donnée était là, calculée,
 * et jetée à l'affichage.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fusionnerParType } from '../rechercheClassement';

const lire = (p: string) => readFileSync(resolve(__dirname, '../../', p), 'utf-8');

/** La réponse du .18, réduite à ce qui compte ici. */
const REPONSE = {
  local: { artists: [], albums: [], tracks: [] } as any,
  services: {
    bandcamp: { artists: [{ id: 'https://marcoiacobini.bandcamp.com', name: 'Marco Iacobini' }] },
    qobuz: { artists: [{ id: '2113961', name: 'Marco Iacobini' }] },
    tidal: { artists: [{ id: '6456650', name: 'Marco Iacobini' }] },
    youtube: { artists: [{ id: 'UCi92pSILK92cFpeWPHWkjog', name: 'Marco Iacobini' }] },
  } as any,
};

describe('la donnée existait déjà', () => {
  it('🔴 chaque artiste de service reçoit la source de son seau', () => {
    const { artistes } = fusionnerParType(REPONSE.local, REPONSE.services);
    expect(artistes.map((a: any) => a.source).sort())
      .toEqual(['bandcamp', 'qobuz', 'tidal', 'youtube']);
  });

  it('un artiste local est marqué « local »', () => {
    const { artistes } = fusionnerParType(
      { artists: [{ id: 7, name: 'M' }], albums: [], tracks: [] } as any, {} as any);
    expect((artistes[0] as any).source).toBe('local');
  });

  it('une source déjà portée par l’objet n’est pas écrasée', () => {
    const { artistes } = fusionnerParType(null, { qobuz: { artists: [{ id: '1', name: 'X', source: 'tidal' }] } } as any);
    expect((artistes[0] as any).source).toBe('tidal');
  });
});

/**
 * 🔴 MISE À JOUR du 18/09/2026 — renesenses/tune-web-client#1136.
 *
 * Ces deux cas exigeaient `source={a.source as any}` / `source={ar.source as
 * any}` sur la pochette des tuiles d'artiste : l'INCRUSTATION de `AlbumArt`.
 *
 * Elle ne convient plus, et pour la raison même du ticket #1136 : elle écarte
 * `source === 'local'` (`AlbumArt.svelte:77`), donc l'artiste de la
 * bibliothèque restait muet au milieu de ceux qui parlent. La pastille est
 * désormais rendue HORS de la pochette (`.asrc` / `.bsrc`), comme l'ancienne
 * interface le fait déjà (`SearchView.svelte:1244-1252`) et comme #1129 vient
 * de le trancher pour la section Titres : on REMPLACE l'incrustation, on ne
 * s'y ajoute pas — jamais deux pastilles pour une provenance.
 *
 * Ce que ces deux cas gardaient — « la source arrive jusqu'à la tuile et n'y
 * est pas jetée » — est donc gardé AU RENDU par
 * `badgeSourceArtiste1136.test.ts`, qui monte l'écran et lit ce qui est peint.
 * On n'en laisse ici que l'inverse : l'incrustation ne doit PAS revenir, sous
 * peine de deux pastilles.
 */
describe('🔴 le balisage la passe enfin à la pochette', () => {
  const ecran = lire('components/v2/SearchV2.svelte');

  it('le MEILLEUR RÉSULTAT artiste ne réincruste PAS sa source dans la pochette', () => {
    const debut = ecran.indexOf("{#if meilleur.genre === 'artiste'}");
    expect(debut).toBeGreaterThan(0);
    const bloc = ecran.slice(debut, ecran.indexOf("{:else if meilleur.genre === 'album'}", debut));
    expect(bloc).toContain('<AlbumArt');
    expect(bloc.slice(bloc.indexOf('<AlbumArt'))).not.toContain('source={a.source as any}');
  });

  it('les tuiles de la rangée « Artistes » non plus', () => {
    const debut = ecran.indexOf('{#each vusArtistes as ar');
    expect(debut).toBeGreaterThan(0);
    const bloc = ecran.slice(debut, ecran.indexOf('{/each}', debut));
    expect(bloc).toContain('<AlbumArt');
    expect(bloc).not.toContain('source={ar.source as any}');
  });

  it('TÉMOIN — albums et pistes la portaient déjà, et la portent toujours', () => {
    // Si la correction avait cassé leur badge, ce cas le dirait.
    expect((ecran.match(/source=\{a\.source as any\}/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });

  it('la pochette n’affiche PAS de badge pour le local ni la radio', () => {
    // Sans quoi chaque album de la bibliothèque porterait une pastille inutile.
    const art = lire('components/partages/AlbumArt.svelte');
    expect(art).toContain("{#if source && source !== 'local' && source !== 'radio'}");
  });
});
