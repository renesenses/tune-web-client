/**
 * Sécurité auditive (itération 14) — le volume de Nocturne passe par le même
 * chemin que le curseur de Tune : plafond de la zone (sécurité, confort),
 * refus en PURE verrouillé ou en volume fixe, envoi par `volumeDeGroupe`.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { writable } from 'svelte/store';

const h = vi.hoisted(() => ({ verrou: false, envois: [] as Array<[number, number]> }));

vi.mock('../../lib/stores/zones', async () => {
  const { writable: w } = await import('svelte/store');
  return {
    currentZone: w<any>(null), currentZoneId: w<number | null>(null), zones: w<any[]>([]),
    pauseAndSync: vi.fn(), resumeAndSync: vi.fn(), nextAndSync: vi.fn(), previousAndSync: vi.fn(),
  };
});
vi.mock('../../lib/volumeDeGroupe', () => ({
  reglerVolume: vi.fn(async (id: number, v: number) => { h.envois.push([id, v]); }),
}));
vi.mock('../../lib/stores/audiophile', async () => {
  const { writable: w } = await import('svelte/store');
  return { isVolumeLocked: () => h.verrou, refreshAudiophile: vi.fn(async () => {}), volumeLocked: w(false) };
});
vi.mock('../../lib/sourdine', () => ({ leverSourdineSiBesoin: vi.fn() }));
vi.mock('../../lib/api', () => ({ setVolume: vi.fn(), seek: vi.fn(), setShuffle: vi.fn(), setRepeat: vi.fn() }));

import { reglerVolume, annulerVolumeEnAttente } from './transportNocturne';
import { currentZone, currentZoneId } from '../../lib/stores/zones';
import { zoneVolume } from '../../lib/stores/nowPlaying';
import * as api from '../../lib/api';

function zone(extra: Record<string, unknown>) {
  const z = { id: 7, name: 'Salon', output_type: 'local', volume: 0.3, ...extra };
  (currentZoneId as ReturnType<typeof writable<number | null>>).set(7);
  (currentZone as ReturnType<typeof writable<any>>).set(z);
  zoneVolume.set(0.3);
  return z;
}

describe('Nocturne — sécurité auditive : même chemin que le curseur de Tune', () => {
  beforeEach(() => { h.verrou = false; h.envois.length = 0; annulerVolumeEnAttente(); });

  it('Fin (ou glisser au maximum) sur une zone plafonnée à 60 % → 60', () => {
    zone({ volume_limit_safety: 0.6 });
    expect(reglerVolume(1)).toBe(0.6);
    expect(h.envois).toEqual([[7, 0.6]]);
    expect(api.setVolume).not.toHaveBeenCalled();
  });

  it('au-dessus du confort, le curseur ne fait plus monter (comme le serveur)', () => {
    zone({ volume_limit_comfort: 0.5, volume_limit_safety: 0.8 });
    expect(reglerVolume(0.95)).toBe(0.5);
    expect(h.envois).toEqual([[7, 0.5]]);
  });

  it('PURE verrouillé : rien ne part', () => {
    zone({ volume_limit_safety: 0.6 });
    h.verrou = true;
    expect(reglerVolume(0.5)).toBeNull();
    expect(h.envois).toEqual([]);
  });

  it('volume fixe : rien ne part', () => {
    zone({ fixed_volume: true });
    expect(reglerVolume(0.5)).toBeNull();
    expect(h.envois).toEqual([]);
  });

  it('le curseur de Tune et celui de Nocturne partagent le même calcul ; le clavier est borné par la sécurité', () => {
    const lire = (r: string) => readFileSync(fileURLToPath(new URL(r, import.meta.url)), 'utf8');
    expect(lire('../partages/VolumeControl.svelte')).toContain('const val = volumeDuCurseur(zone, brut, vol);');
    const transport = lire('./transportNocturne.ts');
    expect(transport).toContain('const val = volumeDuCurseur(zone, brut, get(zoneVolume));');
    expect(transport).not.toMatch(/api\.setVolume\(/);
    const clavier = lire('../../lib/keyboard.ts');
    expect(clavier).toContain("const cible = cibleVolumeClavier(zone, vol, 'up');");
    expect(clavier).toContain('if (!volumeCommandable(zone) || volumeFixe(zone) || isVolumeLocked()) break;');
    expect(lire('./BarreLectureNocturne.svelte')).toContain('oninput={curseurVolume}');
  });
});
