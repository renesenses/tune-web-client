// @vitest-environment jsdom
//
// 🔴 `renesenses/tune-web-client#1708` — suite du 28/09/2026.
//
// Décision de Bertrand (28/09) : à texte égal, la BIBLIOTHÈQUE passe devant
// un service de streaming pour le « Meilleur résultat ». La PR #1740 a ramené
// le portrait à `BONUS_IMAGE`, mais `meilleurResultat` scorait encore la
// source par `bonusSource(a.source)`, qui ne donne le rang « bibliothèque »
// qu'à la chaîne `'local'`. Un album de bibliothèque venu d'un serveur UPnP
// (`upnp`, `upnp:<udn>`) ou à source vide valait 0,5 au lieu de 5 :
//
//   artiste « Wish You Were Here », Qobuz, portrait   100 + 0,5 + 4   = 104,5
//   album   « Wish You Were Here », upnp, pochette     100 + 0,5 + 0,5 = 101
//
// et l'artiste de service reprenait le médaillon.
//
// CONTRE-ÉPREUVE : remettre `bonusSource(x.source)` dans les boucles de
// `meilleurResultat` (le code compile toujours) rougit 11 des 15 cas — upnp,
// upnp:<udn>, vide, null, absente, pour les albums comme pour les pistes.
// Les deux témoins et le cas `local` restent verts. Mesuré sur Shrek le 30/09.
import { describe, expect, it } from 'vitest';
import { meilleurResultat, type ResultatsFusionnes } from '../rechercheClassement';

const art = (name: string, source: string, portrait = false) =>
  ({ id: 'qobuz-1', name, source, ...(portrait ? { image_path: '/portrait.jpg' } : {}) }) as any;
const alb = (title: string, source: string | null | undefined, pochette = false) =>
  ({ id: 42, title, ...(source === undefined ? {} : { source }), ...(pochette ? { cover_path: '/p.jpg' } : {}) }) as any;
const pis = (title: string, source: string | null | undefined) =>
  ({ id: 7, title, ...(source === undefined ? {} : { source }) }) as any;

const jeu = (o: Partial<ResultatsFusionnes>): ResultatsFusionnes =>
  ({ artistes: [], albums: [], pistes: [], ...o });

const PROVENANCES_BIBLIOTHEQUE: [string, string | null | undefined][] = [
  ['local', 'local'],
  ['upnp', 'upnp'],
  ['upnp:<udn>', 'upnp:uuid:4d696e69-444c-164e-9d41-001132c3a7b2'],
  ['chaîne vide', ''],
  ['null', null],
  ['absente', undefined],
];

describe('#1708 — toute provenance de BIBLIOTHÈQUE garde le médaillon', () => {
  for (const [nom, source] of PROVENANCES_BIBLIOTHEQUE) {
    it(`🔴 album de bibliothèque (source ${nom}) avant l’artiste Qobuz à portrait`, () => {
      const r = jeu({
        artistes: [art('Wish You Were Here', 'qobuz', true)],
        albums: [alb('Wish You Were Here', source, true)],
      });
      const m = meilleurResultat('wish you were here', r) as any;
      expect(m.genre, `source ${nom} : l’artiste de service reprend le médaillon`).toBe('album');
      expect(m.album.id).toBe(42);
    });

    it(`🔴 piste de bibliothèque (source ${nom}) avant l’artiste Qobuz à portrait`, () => {
      const r = jeu({
        artistes: [art('Money', 'qobuz', true)],
        pistes: [pis('Money', source)],
      });
      expect((meilleurResultat('money', r) as any).genre).toBe('piste');
    });
  }

  it('entre albums de même texte, l’album UPnP passe devant le même album Qobuz', () => {
    const r = jeu({
      albums: [
        { id: 'q-9', title: 'Wish You Were Here', source: 'qobuz', cover_path: '/q.jpg' } as any,
        alb('Wish You Were Here', 'upnp', false),
      ],
    });
    expect((meilleurResultat('wish you were here', r) as any).album.id).toBe(42);
  });

  it('témoin : sans identifiant, une ligne n’est PAS de bibliothèque — le service garde son rang', () => {
    // `estDeBibliotheque` exige un `id` : une source vide sans `id` ne prend
    // pas le rang local, et l'artiste Qobuz exact garde le médaillon.
    const r = jeu({
      artistes: [art('Wish You Were Here', 'qobuz', true)],
      albums: [{ title: 'Wish You Were Here', source: '' } as any],
    });
    expect((meilleurResultat('wish you were here', r) as any).genre).toBe('artiste');
  });

  it('témoin : un texte meilleur l’emporte toujours sur la provenance', () => {
    const r = jeu({
      artistes: [art('Wish You Were Here', 'qobuz', true)],
      albums: [alb('Wish You Were Here (Live)', 'upnp', true)],
    });
    expect((meilleurResultat('wish you were here', r) as any).genre).toBe('artiste');
  });
});
