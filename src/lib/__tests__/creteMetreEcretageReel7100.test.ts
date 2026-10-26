/**
 * #7100 (Alex, 26/10/2026 : Qobuz FLAC 44,1/24, serveur sous Docker, volume
 * 20-30 %) : le crête-mètre annonçait un écrêtage qui n'existait pas.
 *
 * `over_*` décrivait la SOURCE : un master limité à 0 dBFS allumait le rouge
 * quel que soit le volume. Le serveur dit désormais l'écrêtage RÉEL en
 * `over_*` et la crête du disque à part, en `source_over_*`. Le client montre
 * cette dernière en neutre, jamais en rouge.
 *
 * Chaque cas part de la trame telle que le serveur la publie, et passe par le
 * store, comme à l'écran.
 */
import { describe, it, expect } from 'vitest';
import { get } from 'svelte/store';
import { surcharge } from '../peakMetre';
import { handleAudioLevelsEvent, levelsForZone } from '../stores/audioLevels';

function etatsPublies(zone: number, trame: Record<string, unknown>) {
  handleAudioLevelsEvent({ zone_id: zone, ...trame });
  const n = get(levelsForZone(zone));
  return [
    surcharge(n.peak_left_db, n.over_left, n.source_over_left),
    surcharge(n.peak_right_db, n.over_right, n.source_over_right),
  ];
}

describe('#7100 — le rouge dit l\'écrêtage réel, pas la crête de la source', () => {
  it('🔴 source à 0 dBFS, volume à 25 % : témoin NEUTRE, pas de rouge', () => {
    const etats = etatsPublies(71001, {
      peak_left_db: 0, peak_right_db: 0,
      over_left: false, over_right: false,
      source_over_left: true, source_over_right: true,
    });
    expect(etats).toEqual(['source', 'source']);
  });

  it('🔴 l\'égaliseur pousse au-delà du plein : le rouge s\'allume', () => {
    const etats = etatsPublies(71002, {
      peak_left_db: -0.01, peak_right_db: -0.01,
      over_left: true, over_right: true,
      source_over_left: false, source_over_right: false,
    });
    expect(etats).toEqual(['rouge', 'rouge']);
  });

  it('un écrêtage réel l\'emporte sur la crête de la source', () => {
    expect(surcharge(0, true, true)).toBe('rouge');
  });

  it('un serveur antérieur (sans source_over_*) se lit comme avant', () => {
    const etats = etatsPublies(71003, {
      peak_left_db: 0, peak_right_db: -3, over_left: true, over_right: false,
    });
    expect(etats).toEqual(['rouge', 'aucune']);
    expect(get(levelsForZone(71003)).source_over_left).toBeNull();
  });
});
