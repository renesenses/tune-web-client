/**
 * LES DEUX SECTIONS DE LA PAGE ARTISTE ET LE FOCUS PAR ARTISTE — #4767.
 *
 * FabienM, forum fil 1875, 23/09/2026, captures de Roon : la page de Neil
 * Young est une seule liste de 192 albums. Cette tranche en sort deux
 * sections — « Compilations » et « Apparitions » — et, en arrivant de l'une
 * d'elles, réduit la fiche d'album aux titres de cet artiste sous une
 * pastille refermable.
 *
 * La donnée est l'artiste de CHAQUE piste : `track_credits` est vide en
 * pratique (mesure du 23/09/2026 sur le .18).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  focusRestreint, idArtisteDePiste, pistesAuxRangs, rangDansLAlbum, rangsDeLArtiste,
} from '../focusArtiste';
import { sectionsDepuisReponse } from '../api';

const lire = (f: string) => readFileSync(f, 'utf8');

/** Une compilation : trois titres, deux artistes. */
const COMPILATION = [
  { title: 'Marrakesh Express', artist_id: 3 },
  { title: 'Down by the River', artist_id: 1 },
  { title: 'Guinnevere', artist_id: 3 },
  { title: 'Helpless', artist_id: 1 },
];

describe('#4767 — le focus retient les bonnes pistes', () => {
  it('sans focus, la fiche montre l’album entier', () => {
    const rangs = rangsDeLArtiste(COMPILATION, null);
    expect(rangs).toEqual([0, 1, 2, 3]);
    expect(pistesAuxRangs(COMPILATION, rangs)).toEqual(COMPILATION);
    expect(focusRestreint(COMPILATION, rangs)).toBe(false);
  });

  it('avec un focus, seules les pistes de cet artiste, dans l’ordre de l’album', () => {
    const rangs = rangsDeLArtiste(COMPILATION, 1);
    expect(rangs).toEqual([1, 3]);
    expect(pistesAuxRangs(COMPILATION, rangs).map((p) => p.title)).toEqual([
      'Down by the River',
      'Helpless',
    ]);
    expect(focusRestreint(COMPILATION, rangs)).toBe(true);
  });

  it('un focus qui ne garde RIEN rend l’album entier, jamais un écran vide', () => {
    // Album rescanné, artiste fusionné depuis l'ouverture de la page : la
    // section promettait une piste, il n'y en a plus.
    const rangs = rangsDeLArtiste(COMPILATION, 999);
    expect(rangs).toEqual([0, 1, 2, 3]);
    expect(focusRestreint(COMPILATION, rangs)).toBe(false);
  });

  it('un focus qui garde TOUT n’affiche pas de pastille', () => {
    const unSeul = [{ title: 'Helpless', artist_id: 1 }];
    const rangs = rangsDeLArtiste(unSeul, 1);
    expect(rangs).toEqual([0]);
    expect(focusRestreint(unSeul, rangs)).toBe(false);
  });

  it('un identifiant absent, vide ou en chaîne est traité comme la base le rend', () => {
    expect(idArtisteDePiste({ artist_id: 7 })).toBe(7);
    expect(idArtisteDePiste({ artist_id: '7' })).toBe(7);
    expect(idArtisteDePiste({ artist_id: '' })).toBeNull();
    expect(idArtisteDePiste({ artist_id: null })).toBeNull();
    expect(idArtisteDePiste({})).toBeNull();
    expect(idArtisteDePiste(null)).toBeNull();
    // Une piste sans artiste ne se range sous personne.
    const melange = [{ artist_id: 1 }, { artist_id: null }, { artist_id: '1' }];
    expect(rangsDeLArtiste(melange, 1)).toEqual([0, 2]);
  });
});

describe('#4767 — « lire à partir d’ici » vise la bonne piste sous focus', () => {
  it('le rang affiché se retraduit en rang dans l’album', () => {
    const rangs = rangsDeLArtiste(COMPILATION, 1); // [1, 3]
    // La 2ᵉ ligne montrée est la 4ᵉ piste de la galette : c'est ce rang-là
    // que `start_index` doit porter, le serveur le compte sur l'album ENTIER.
    expect(rangDansLAlbum(rangs, 0)).toBe(1);
    expect(rangDansLAlbum(rangs, 1)).toBe(3);
  });

  it('hors focus, la traduction est l’identité', () => {
    const rangs = rangsDeLArtiste(COMPILATION, null);
    for (let i = 0; i < COMPILATION.length; i++) expect(rangDansLAlbum(rangs, i)).toBe(i);
  });

  it('hors bornes, le rang passe tel quel plutôt que de devenir `undefined`', () => {
    expect(rangDansLAlbum([1, 3], 9)).toBe(9);
    expect(rangDansLAlbum([], 2)).toBe(2);
  });
});

describe('#4767 — la réponse se lit aussi devant un serveur plus ancien', () => {
  it('un objet à sections se lit tel quel, clé absente = section absente', () => {
    const r = sectionsDepuisReponse({ albums: [{ id: 1 }], compilations: [{ id: 2 }] });
    expect(r.albums).toHaveLength(1);
    expect(r.compilations).toHaveLength(1);
    expect(r.appearances).toBeUndefined();
  });

  it('un TABLEAU nu — serveur qui ignore le drapeau — reste une discographie', () => {
    // Le client web et le serveur ne sont pas publiés ensemble : sans ce
    // repli, une interface à jour devant une .158 montrerait une page vide.
    const r = sectionsDepuisReponse([{ id: 1 }, { id: 2 }]);
    expect(r.albums).toHaveLength(2);
    expect(r.compilations).toBeUndefined();
    expect(r.appearances).toBeUndefined();
  });

  it('une réponse vide ou nulle ne fait pas tomber la page', () => {
    expect(sectionsDepuisReponse(null).albums).toEqual([]);
    expect(sectionsDepuisReponse({}).albums).toEqual([]);
  });
});

describe('#4767 — les écrans sont branchés', () => {
  it('la page artiste demande les sections à la MÊME route', () => {
    const api = lire('src/lib/api.ts');
    expect(api).toContain("/albums?sections=1");
    // Sans le drapeau, la route rend toujours le tableau nu : l'ancienne
    // fonction reste, elle est lue par « Tout lire » et les autres écrans.
    expect(api).toContain('export function getArtistAlbums(');
    expect(api).toContain('export function getArtistAlbumsSections(');

    const art = lire('src/components/v2/ArtistesV2.svelte');
    expect(art).toContain('getArtistAlbumsSections');
    expect(art, 'la clé absente vaut section vide').toContain('d?.compilations ?? []');
    expect(art).toContain('d?.appearances ?? []');
    expect(art, 'le focus part de la page artiste').toContain('artisteFocus');
  });

  it('la grille rend les deux sections, et seulement si elles portent quelque chose', () => {
    const d = lire('src/components/v2/DiscographieCommune.svelte');
    expect(d).toContain('{#if compilationsTriees.length}');
    expect(d).toContain('{#if apparitionsTriees.length}');
    expect(d).toContain("v2.disco.compilations");
    expect(d).toContain("v2.disco.appearances");
    // Le compte affiché EST la longueur de la liste rendue : rien d'autre ne
    // le porte, donc rien ne peut diverger.
    expect(d).toContain('<span class="cpt">{compilationsTriees.length}</span>');
    expect(d).toContain('<span class="cpt">{apparitionsTriees.length}</span>');
  });

  it('la fiche d’album porte la pastille refermable et traduit le rang', () => {
    const a = lire('src/components/v2/AlbumDetailV2.svelte');
    expect(a).toContain('artisteFocus');
    expect(a).toContain("v2.album.artistOnly");
    expect(a).toContain("v2.album.artistOnlyClear");
    expect(a, 'la × referme le focus').toContain('focusReferme = true');
    expect(a, 'la liste rendue est celle du focus').toContain('pistes={pistesVisibles}');
    expect(a, 'le rang cliqué est retraduit').toContain('rangDansLAlbum(rangsVisibles, rangAffiche)');
    // #1061 — « lire à partir d'ici » passe toujours par `playAlbum(i)`.
    expect(a).toContain('playAlbum(i)');
  });

  it('les quatre clés existent dans les onze langues', () => {
    const CLES = [
      'v2.disco.compilations',
      'v2.disco.appearances',
      'v2.album.artistOnly',
      'v2.album.artistOnlyClear',
    ];
    const LANGUES = ['fr', 'en', 'de', 'es', 'it', 'zh', 'ja', 'ko', 'ro', 'sv', 'hu'];
    for (const l of LANGUES) {
      const src = lire(`src/lib/locales/${l}.ts`);
      for (const c of CLES) expect(src, `${l} : ${c}`).toContain(`"${c}"`);
    }
  });
});
