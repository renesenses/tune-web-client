// Réparer les pistes sans artiste — Bertrand, 18/09/2026 : « Albums douteux ».
//
// Mesuré sur sa bibliothèque le même jour : l'onglet annonce 1 595 entrées, et
// ce ne sont pas des albums mais des PISTES — 1 592 pour une seule raison,
// l'artiste manque. 932 d'Art Blakey, 445 de Prince : des captures de
// l'enregistreur qui n'ont jamais porté d'étiquette.
//
// Trois sources possibles, mesurées : le dossier grand-parent couvre
// 1 496 / 1 592 ; l'artiste de l'album, 33 ; le titre en « X - Y », 79 — le
// reste de ces titres étant des numéros de piste. Le chemin gagne, et pour
// seulement 26 noms distincts.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { artisteDuChemin, grouperParArtisteDevine, type PisteDouteuse } from '../artisteDepuisChemin';

const lire = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf-8');
const sansCommentaires = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/<!--[\s\S]*?-->/g, '').replace(/^\s*\/\/.*$/gm, '');

const piste = (p: Partial<PisteDouteuse>): PisteDouteuse =>
  ({ id: 1, title: 'x', artist_name: 'Unknown Artist', album_title: null, duration_ms: 0, reasons: ['missing_artist'], ...p });

describe('deviner l’artiste depuis le chemin', () => {
  it('le dossier grand-parent, sur les vrais chemins du .18', () => {
    expect(artisteDuChemin('/data/recordings/Tidal/Prince/Ultimate/01 - I Wanna Be Your Lover.m4a')).toBe('Prince');
    expect(artisteDuChemin('/data/recordings/Qobuz/Allysha Joy/Torn _ Tonic/06 - Still Dreaming.flac')).toBe('Allysha Joy');
    expect(artisteDuChemin('/data/music/NEW_FLAC/POP-ROCK/R/RH Factor, The/2003-Hard Groove/03-x.flac')).toBe('RH Factor, The');
  });

  it('🔴 un grand-parent purement numérique n’est pas un nom', () => {
    // « 2003-Hard Groove » est un album, « 01 » un disque. Sans cette règle on
    // poserait « 2003 » comme artiste.
    expect(artisteDuChemin('/m/2003/Hard Groove/03-x.flac')).toBeNull();
    expect(artisteDuChemin('/m/01/CD2/03-x.flac')).toBeNull();
    expect(artisteDuChemin('/m/- . -/Album/x.flac')).toBeNull();
  });

  it('une lettre d’index n’est pas un nom', () => {
    // `…/R/RH Factor, The/…` : le « R » est un classeur alphabétique.
    expect(artisteDuChemin('/m/R/Album/x.flac')).toBeNull();
  });

  it('🔴 un grand-parent qui EST l’album ne l’est pas — rangement par disque', () => {
    // `…/Ultimate/CD1/01 - x.flac` : le grand-parent est l'album, pas
    // l'artiste. Le poser renommerait l'artiste d'après le disque.
    expect(artisteDuChemin('/m/Prince/Ultimate/CD1/01 - x.flac', 'Ultimate')).toBeNull();
    expect(artisteDuChemin('/m/Prince/Ultimate/CD1/01 - x.flac', '  ultimate  ')).toBeNull();
    // Sans le titre d'album, on ne peut pas le savoir : on propose, il tranche.
    expect(artisteDuChemin('/m/Prince/Ultimate/CD1/01 - x.flac')).toBe('Ultimate');
  });

  it('un chemin absent ou trop court ne donne rien', () => {
    expect(artisteDuChemin(null)).toBeNull();
    expect(artisteDuChemin('')).toBeNull();
    expect(artisteDuChemin('/x.flac')).toBeNull();
  });

  it('les chemins Windows sont lus aussi', () => {
    expect(artisteDuChemin('D:\\Musique\\Prince\\Ultimate\\01 - x.m4a')).toBe('Prince');
  });

  it('groupé par nom deviné, les plus gros d’abord', () => {
    const g = grouperParArtisteDevine([
      piste({ id: 1, file_path: '/m/Prince/Ultimate/01.m4a' }),
      piste({ id: 2, file_path: '/m/Prince/Ultimate/02.m4a' }),
      piste({ id: 3, file_path: '/m/Art Blakey/Moanin/01.flac' }),
    ]);
    expect(g.map((x) => [x.nom, x.pistes.length])).toEqual([['Prince', 2], ['Art Blakey', 1]]);
  });

  it('🔴 seules les pistes SANS artiste sont concernées', () => {
    // Une piste courte ou sans titre d'album a un autre problème, que ce geste
    // ne règle pas — lui poser un artiste ne la sortirait même pas de la liste.
    const g = grouperParArtisteDevine([
      piste({ id: 1, reasons: ['very_short'], file_path: '/m/Prince/Ultimate/01.m4a' }),
      piste({ id: 2, reasons: ['missing_album'], file_path: '/m/Prince/Ultimate/02.m4a' }),
    ]);
    expect(g).toEqual([]);
  });

  it('une piste sans indice n’entre dans aucun groupe', () => {
    const g = grouperParArtisteDevine([piste({ id: 1, file_path: '/m/2003/Album/01.flac' })]);
    expect(g).toEqual([]);
  });
});

describe('l’écran des douteuses', () => {
  const vue = sansCommentaires(lire('src/components/v2/MetadataV2.svelte'));
  const api = sansCommentaires(lire('src/lib/api.ts'));

  it('🔴 la liste est enfin LUE — `items`, et paginée', () => {
    // `getDoubtfulAlbums` promettait un tableau et rendait `{items, …}` :
    // `doubtful.length` valait `undefined`, l'écran concluait « aucun album
    // douteux », et les 1 595 entrées du .18 restaient invisibles.
    const i = api.indexOf('export async function getDoubtfulTracks');
    expect(i).toBeGreaterThan(-1);
    const corps = api.slice(i, api.indexOf('\n}', i));
    expect(corps).toContain('Array.isArray(r)');
    expect(corps).toContain('r?.items ?? []');
    const j = vue.indexOf('async function chargerDouteuses(');
    expect(j).toBeGreaterThan(-1);
    expect(vue.slice(j, vue.indexOf('\n  }', j))).toContain('offset += 1000');
  });

  it('on pose un artiste par NOM, pas par piste', () => {
    // 1 496 pistes, 26 noms : un appel par nom, et l'utilisateur valide 26
    // décisions au lieu de 1 496 lignes.
    const i = vue.indexOf('async function poserArtistesDevines(');
    expect(i).toBeGreaterThan(-1);
    const corps = vue.slice(i, vue.indexOf('\n  }', i));
    expect(corps).toContain('for (const g of dGroupes)');
    expect(corps).toContain('api.setTracksArtist(g.pistes.map((p) => p.id), g.nom)');
    expect(corps).toContain('if (!dRetenus.has(g.nom)) continue;');
  });

  it('rien n’est posé sans un nom coché', () => {
    const i = vue.indexOf('async function poserArtistesDevines(');
    expect(vue.slice(i, i + 120)).toContain('if (!dRetenus.size || dBusy) return;');
  });

  it('la liste est relue au serveur après écriture, pas corrigée de mémoire', () => {
    const i = vue.indexOf('async function poserArtistesDevines(');
    const corps = vue.slice(i, vue.indexOf('\n  }', i));
    expect(corps).toContain('dLoaded = false');
    expect(corps).toContain('await chargerDouteuses()');
  });

  it('les six libellés existent dans les onze langues', () => {
    const cles = ['dArtistIntro','dArtistApply','dArtistAll','dArtistTracks','dArtistNoClue','dArtistDone'];
    for (const l of ['de','en','es','fr','hu','it','ja','ko','ro','sv','zh']) {
      const src = lire(`src/lib/locales/${l}.ts`);
      for (const c of cles) expect(src, `${l} : v2.meta.${c}`).toContain(`"v2.meta.${c}":`);
    }
  });
});
