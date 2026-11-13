// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { fr } from './onzeDictionnaires';
import type { Zone } from '../types';
import ZoneConfigModal from '../../components/partages/ZoneConfigModal.svelte';

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
 * Montage réel dans jsdom (patron de `sortieMonoZone.test.ts`, délai de 60 s
 * pour la transformation Svelte à froid, import à la collecte).
 */
const DELAI_MONTAGE = 60_000;

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

vi.mock('../api', async (importOriginal) => {
  const reel = await importOriginal<typeof import('../api')>();
  return {
    ...reel,
    updateZoneAutoplay: (id: number, enabled: boolean) => patchAutoplay(id, enabled),
  };
});

let cible: HTMLElement;
let monte: Record<string, any> | null = null;

beforeEach(() => {
  patchAutoplay.mockClear();
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } })),
  );
  cible = document.createElement('div');
  document.body.appendChild(cible);
});

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  cible.remove();
  vi.unstubAllGlobals();
});

function ouvrir(z: Zone): HTMLElement {
  monte = mount(ZoneConfigModal, {
    target: cible,
    props: {
      zone: z,
      allZones: [z],
      groups: [],
      onClose: () => {},
      onDelete: () => {},
      onGroupChanged: () => {},
      onRenamed: () => {},
    },
  });
  flushSync();
  return cible;
}

function interrupteur(racine: HTMLElement): HTMLInputElement {
  const el = racine.querySelector<HTMLInputElement>('[data-radio-fin-de-file] input[type="checkbox"]');
  if (!el) throw new Error('aucun interrupteur « radio de fin de file » dans le panneau de zone');
  return el;
}

describe('fil 2694 — radio de fin de file dans le panneau de zone', () => {
  it('le libellé dit ce que fait le réglage', { timeout: DELAI_MONTAGE }, () => {
    const racine = ouvrir(zone());
    const label = racine.querySelector('[data-radio-fin-de-file]')!;
    expect(label.textContent?.trim()).toBe(fr['zoneConfig.radioFinDeFileLabel']);
    expect(fr['zoneConfig.radioFinDeFileLabel']).toMatch(/similaires/);
    expect(fr['zoneConfig.radioFinDeFileLabel']).toMatch(/fin de la file/);
  });

  it("l'état coché vient du serveur", { timeout: DELAI_MONTAGE }, () => {
    expect(interrupteur(ouvrir(zone({ autoplay_enabled: true }))).checked).toBe(true);
  });

  it('une zone désactivée côté serveur est décochée', { timeout: DELAI_MONTAGE }, () => {
    expect(interrupteur(ouvrir(zone({ autoplay_enabled: false }))).checked).toBe(false);
  });

  it('décocher écrit `autoplay_enabled: false` sur le serveur', { timeout: DELAI_MONTAGE }, async () => {
    const boite = interrupteur(ouvrir(zone()));
    boite.checked = false;
    boite.dispatchEvent(new Event('change', { bubbles: true }));
    await vi.waitFor(() => expect(patchAutoplay).toHaveBeenCalledWith(26, false));
    await vi.waitFor(() => expect(boite.checked).toBe(false));
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
