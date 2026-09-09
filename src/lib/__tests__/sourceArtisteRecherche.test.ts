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

describe('🔴 le balisage la passe enfin à la pochette', () => {
  const ecran = lire('components/v2/SearchV2.svelte');

  it('le MEILLEUR RÉSULTAT artiste porte sa source', () => {
    const debut = ecran.indexOf("{#if meilleur.genre === 'artiste'}");
    expect(debut).toBeGreaterThan(0);
    const bloc = ecran.slice(debut, ecran.indexOf("{:else if meilleur.genre === 'album'}", debut));
    expect(bloc).toContain('source={a.source as any}');
  });

  it('les tuiles de la rangée « Artistes » aussi', () => {
    const debut = ecran.indexOf('{#each vusArtistes as ar');
    expect(debut).toBeGreaterThan(0);
    const bloc = ecran.slice(debut, debut + 1600);
    expect(bloc).toContain('source={ar.source as any}');
  });

  it('TÉMOIN — albums et pistes la portaient déjà, et la portent toujours', () => {
    // Si la correction avait cassé leur badge, ce cas le dirait.
    expect((ecran.match(/source=\{a\.source as any\}/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });

  it('la pochette n’affiche PAS de badge pour le local ni la radio', () => {
    // Sans quoi chaque album de la bibliothèque porterait une pastille inutile.
    const art = lire('components/AlbumArt.svelte');
    expect(art).toContain("{#if source && source !== 'local' && source !== 'radio'}");
  });
});
