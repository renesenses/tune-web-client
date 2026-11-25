// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { fr } from './onzeDictionnaires';
import type { Zone } from '../types';
import { reglerRadioFinDeFile, modeNomme, _oublierModes } from '../radioFinDeFile';

/**
 * Forum, fil 2694 (Ilan, 12/11/2026) ; décision de Bertrand du 13/11 —
 * « Continuer avec des titres similaires à la fin de la file », comme Roon.
 *
 * Le serveur (tune-server-rust, migration 152 / PG 118) active la radio de
 * fin de file par défaut et marque `added_by_radio` les lignes qu'elle
 * ajoute. Ici : le réglage est atteignable depuis le panneau de zone, son
 * état vient du serveur, le décocher écrit `autoplay_enabled: false`, et les
 * deux vues de la file affichent le badge.
 *
 * rc14 : le réglage est passé dans la file d'attente (`lib/radioFinDeFile`).
 */
function zone(over: Partial<Zone> = {}): Zone {
  return {
    id: 26,
    name: 'Salon',
    output_type: 'local',
    output_device_id: 'local:dac-2694',
    volume: 1,
    state: 'stopped',
    autoplay_enabled: true,
    ...over,
  } as Zone;
}

const patchAutoplay = vi.fn(async (id: number, enabled: boolean) => ({ ...zone({ id }), autoplay_enabled: enabled }));

const patchMode = vi.fn(async (id: number, mode: string) => ({ ...zone({ id }), autoplay_enabled: true, autoplay_mode: mode }));

vi.mock('../api', async (importOriginal) => {
  const reel = await importOriginal<typeof import('../api')>();
  return {
    ...reel,
    updateZoneAutoplay: (id: number, enabled: boolean) => patchAutoplay(id, enabled),
    updateZoneAutoplayMode: (id: number, mode: string) => patchMode(id, mode),
  };
});

beforeEach(() => {
  patchAutoplay.mockClear();
  patchMode.mockClear();
  _oublierModes();
});

/**
 * rc14 (retours de Rémi, go de Bertrand du 25/11/2026) — le réglage a QUITTÉ
 * la fenêtre de la zone pour la FILE D'ATTENTE (`QueueV2`, `FileMini`). Sa
 * logique vit dans `lib/radioFinDeFile`, éprouvée ici ; la présence du bouton
 * dans la file est gardée par `interfaceRemiRc14.svelte.test.ts`.
 */
describe('fil 2694 — radio de fin de file, option de la file', () => {
  it('le libellé dit ce que fait le réglage', () => {
    expect(fr['zoneConfig.radioFinDeFileLabel']).toMatch(/similaires/);
    expect(fr['zoneConfig.radioFinDeFileLabel']).toMatch(/fin de la file/);
  });

  it('couper écrit `autoplay_enabled: false` sur le serveur', async () => {
    await reglerRadioFinDeFile(zone(), false);
    expect(patchAutoplay).toHaveBeenCalledWith(26, false);
    expect(patchMode).not.toHaveBeenCalled();
  });

  it('le mode nommé vient de la zone : `random_album`', () => {
    expect(modeNomme('random_album')).toBe('random_album');
    expect(modeNomme('off')).toBeNull();
    expect(modeNomme(undefined)).toBeNull();
  });
});

describe('fil 2694 — décocher puis recocher garde le mode nommé (#2271)', () => {
  it('un « album au hasard » coupé puis remis revient en « album au hasard »', async () => {
    await reglerRadioFinDeFile(zone({ autoplay_enabled: true, autoplay_mode: 'random_album' }), false);
    expect(patchAutoplay).toHaveBeenCalledWith(26, false);
    // La zone rendue par le serveur dit « off » : la mémoire garde le mode.
    await reglerRadioFinDeFile(zone({ autoplay_enabled: false, autoplay_mode: 'off' }), true);
    expect(patchMode).toHaveBeenCalledWith(26, 'random_album');
    expect(patchAutoplay).toHaveBeenCalledTimes(1);
  });

  it('« titres similaires » se remet par le booléen', async () => {
    await reglerRadioFinDeFile(zone({ autoplay_enabled: false, autoplay_mode: 'off' }), true);
    expect(patchAutoplay).toHaveBeenCalledWith(26, true);
    expect(patchMode).not.toHaveBeenCalled();
  });
});

describe('fil 2694 — le badge « ajouté par la radio » dans la file', () => {
  const ici = dirname(fileURLToPath(import.meta.url));
  const source = (chemin: string) => readFileSync(join(ici, '..', '..', 'components', chemin), 'utf8');

  it.each(['v2/QueueV2.svelte', 'v2/mini/FileMini.svelte'])('%s lit `added_by_radio` et affiche le badge traduit', (chemin) => {
    const src = source(chemin);
    expect(src).toMatch(/\.added_by_radio\}/);
    expect(src).toContain("'queue.addedByRadio'");
    expect(src).toContain("'queue.addedByRadioTip'");
  });

  it('les libellés du badge existent', () => {
    expect(fr['queue.addedByRadio']).toBe('Radio');
    expect(fr['queue.addedByRadioTip']).toMatch(/radio de fin de file/);
  });
});
