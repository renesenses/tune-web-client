/**
 * APE et WavPack sont SANS PERTE — et le client le disait faux (#3848).
 *
 * « Le format APE est sans perte. Pourquoi l'identifier 'LOSSY' ? » — Marco
 * Polo, fil 1754, avec une capture de neuf badges `LOSSY APE 44.1/16`
 * d'affilée, le mot LOSSY en rouge.
 *
 * La cause n'était pas le badge : c'était la liste. Le client portait sept
 * formats sans perte là où le serveur en connaît sept AUTRES — APE et WavPack
 * manquaient des deux côtés de l'écran. Un APE 44,1/16 ne satisfaisait donc
 * aucune des quatre conditions de `getQualityTier` et retombait sur `'lossy'`,
 * alors que le serveur renvoyait `quality: "cd"` pour le même album.
 *
 * ## La source de vérité
 *
 * `AudioFormat::is_lossless()` (`tune-core/src/audio/formats.rs`) :
 * Flac, Wav, Dsd, Alac, Aiff, WavPack, Ape. Les chaînes testées ici sont les
 * extensions que le serveur reconnaît et stocke (`from_extension`) — `wv` et
 * non « wavpack », `aif` à côté d'`aiff`, `dst` à côté de `dsf`/`dff`.
 *
 * ## Ce que ces cas gardent
 *
 * Le piège de ce défaut, c'est qu'il ne se voyait QUE sur les rips CD : le
 * même APE en 24 bits ou au-delà de 48 kHz passait par les garde-fous de
 * spécifications (`bd >= 24`, `sr > 48000`) et s'affichait hi-res. Un test qui
 * n'essaierait que du 24 bits serait donc vert contre le bogue. Chaque format
 * est éprouvé en 44,1/16 — le seul point où la liste décide vraiment.
 */
import { describe, it, expect } from 'vitest';
import { getQualityTier, estAvecPerte, estSansPerte, LOSSY_FORMATS } from '../utils';

const RIP_CD = { sample_rate: 44100, bit_depth: 16, source: 'local' as const };

describe('#3848 — les formats sans perte du serveur le sont aussi à l écran', () => {
  it('un APE 44,1/16 est CD, pas Lossy', () => {
    expect(getQualityTier({ format: 'ape', ...RIP_CD })).toBe('cd');
  });

  it('un WavPack 44,1/16 est CD, pas Lossy', () => {
    expect(getQualityTier({ format: 'wv', ...RIP_CD })).toBe('cd');
  });

  it('toute la liste du serveur tient en 44,1/16 — le seul point où elle décide', () => {
    for (const fmt of ['flac', 'wav', 'alac', 'aiff', 'aif', 'wv', 'ape']) {
      expect(getQualityTier({ format: fmt, ...RIP_CD }), `${fmt} mal classé`).toBe('cd');
    }
  });

  it('les conteneurs DSD gardent leur propre palier, `dst` compris', () => {
    for (const fmt of ['dsd', 'dsf', 'dff', 'dst']) {
      expect(getQualityTier({ format: fmt, sample_rate: 2822400, bit_depth: 1 })).toBe('dsd');
    }
  });

  it('en 24 bits le défaut était invisible — la garde ne doit pas s en contenter', () => {
    // Contre-épreuve : ces deux-là passaient DÉJÀ avant le correctif, par les
    // spécifications et non par la liste. Ils ne prouvent rien seuls.
    expect(getQualityTier({ format: 'ape', sample_rate: 44100, bit_depth: 24 })).toBe('hires');
    expect(getQualityTier({ format: 'ape', sample_rate: 96000, bit_depth: 24 })).toBe('hires');
  });
});

describe('#3848 — les codecs avec perte le restent', () => {
  it('mp3, aac, ogg, opus et wma sont Lossy en 44,1', () => {
    for (const fmt of ['mp3', 'aac', 'ogg', 'opus', 'wma']) {
      expect(getQualityTier({ format: fmt, sample_rate: 44100, bit_depth: 0 }), fmt).toBe('lossy');
    }
  });

  it('aucun format déclaré sans perte n est aussi déclaré avec perte', () => {
    // Les deux listes doivent rester disjointes : un format présent dans les
    // deux serait classé selon l ordre des tests, c est-à-dire par accident.
    for (const fmt of ['flac', 'wav', 'alac', 'aiff', 'aif', 'dsd', 'dsf', 'dff', 'dst', 'wv', 'ape']) {
      expect(estAvecPerte(fmt), `${fmt} est dans les DEUX listes`).toBe(false);
    }
    for (const fmt of LOSSY_FORMATS) {
      expect(estSansPerte(fmt), `${fmt} est dans les DEUX listes`).toBe(false);
    }
  });

  it('`m4a` n est dans aucune des deux : le serveur le résout avant de le stocker', () => {
    // `normalize_format("m4a", bit_depth)` rend `alac` ou `aac` selon la
    // présence d une profondeur de bits. Ranger `m4a` d un côté trancherait à
    // la place du serveur, et se tromperait une fois sur deux.
    expect(estSansPerte('m4a')).toBe(false);
    expect(estAvecPerte('m4a')).toBe(false);
  });

  it('la casse et l absence de format ne font pas planter le classement', () => {
    expect(estSansPerte('APE')).toBe(true);
    expect(estAvecPerte('MP3')).toBe(true);
    expect(estSansPerte(null)).toBe(false);
    expect(estAvecPerte(undefined)).toBe(false);
  });
});
