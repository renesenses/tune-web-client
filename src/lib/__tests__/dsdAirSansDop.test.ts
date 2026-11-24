// TESS T12c (tune-server-rust#9417, décision du 17/11) — Devialet AIR : le
// DoP est débranché, le serveur refuse `dsd_mode=dop` en 400 (comme « natif »
// et « auto » depuis #8920). Le sélecteur ne propose donc que le PCM sur une
// zone Devialet AIR, et garde les quatre modes partout ailleurs.
import { describe, expect, it } from 'vitest';
import { modesDsdOfferts } from '../transportDsd';

describe('modesDsdOfferts', () => {
  it('Devialet AIR : PCM seulement, jamais DoP', () => {
    expect(modesDsdOfferts('devialet_air')).toEqual(['pcm']);
    expect(modesDsdOfferts('devialet_air')).not.toContain('dop');
  });

  it('les autres zones gardent les quatre modes', () => {
    for (const t of ['local', 'dlna', 'oaat', 'airplay2', null, undefined]) {
      expect(modesDsdOfferts(t)).toEqual(['auto', 'native', 'dop', 'pcm']);
    }
  });
});
