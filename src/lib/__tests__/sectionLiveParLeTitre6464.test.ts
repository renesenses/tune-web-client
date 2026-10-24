/**
 * renesenses/tune-server-rust#6464 (FabienM, fil 2302 point 4) — la règle
 * PROVISOIRE de la section « Live » par le titre, éprouvée sur de VRAIS
 * titres, faux positifs compris. Mêmes listes que le témoin serveur
 * (`tune-core/src/metadata/section_live_titre_tests_6464.rs`).
 */
import { describe, expect, it } from 'vitest';
import { estLive, fusionnerDiscographie, partagerParTypeDeSortie, titreAnnonceUnLive } from '../discographieCommune';
import type { Album } from '../types';

const LIVES = [
  'Live at Leeds', 'MTV Unplugged in New York', 'Unplugged', 'Live After Death', 'Live Rust',
  'Live/Dead', 'Live and Dangerous', 'Live Killers', 'Live Evil', 'Live!', 'Live 1975–85',
  'Live at the Royal Albert Hall', 'Live in Paris', 'Bashung (Live)', "LIVE À L'OLYMPIA",
];
const PAS_DES_LIVES = [
  'Live Through This', 'Live and Let Die', 'Live Forever', "Long Live Rock 'n' Roll", 'Live to Tell',
  'Live Your Life', 'Live It Up', 'I Want to Live', 'Alive', 'Lively Up Yourself',
  'Welcome to the Pleasuredome (Liverpool mix)', 'Delivery Man',
];
const LIVES_MUETS = ['Waiting for Columbus', 'Alive!', 'Stop Making Sense'];

describe('Section « Live » par le titre (#6464)', () => {
  it.each(LIVES)('« %s » est reconnu comme live', (titre) => {
    expect(titreAnnonceUnLive(titre)).toBe(true);
  });
  it.each(PAS_DES_LIVES)('« %s » n’est PAS un live (faux positif écarté)', (titre) => {
    expect(titreAnnonceUnLive(titre)).toBe(false);
  });
  it.each(LIVES_MUETS)('« %s » ne dit pas « live » : la règle ne prétend pas le voir', (titre) => {
    expect(titreAnnonceUnLive(titre)).toBe(false);
  });

  it('un EP live de service va dans « Live », pas dans « EP »', () => {
    const album = (id: number, title: string, release_type?: string): Album => ({ id, title, release_type });
    const entrees = fusionnerDiscographie(
      [],
      [{ service: 'qobuz', albums: [album(1, 'Unplugged EP', 'ep'), album(2, 'Live Through This', 'album'), album(3, 'Un EP', 'ep')] }],
    );
    const s = partagerParTypeDeSortie(entrees);
    expect(s.live.map((e) => e.principal.album.title)).toEqual(['Unplugged EP']);
    expect(s.albums.map((e) => e.principal.album.title)).toEqual(['Live Through This']);
    expect(s.eps.map((e) => e.principal.album.title)).toEqual(['Un EP']);
    expect(estLive(entrees[0])).toBe(true);
  });
});
