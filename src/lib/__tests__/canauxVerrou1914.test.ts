// @vitest-environment jsdom
//
// 🔴 Fils 1914/1913 — Reivax66, v0.9.163, Windows :
//
//   « Dans l'onglet appareil la case canaux suivre l'appareil reste grisée
//     pour l'ampli DENON AVR X1600-H qui est pourtant un ampli 7.1 »
//
// CE QUE DIT LE CODE
// ------------------
// Le serveur (`tune-core/src/audio/canaux_declares.rs`) publie
// `channel_layout_status.unavailable` avec DEUX motifs :
//
//  - `sortie_non_locale` : renderer réseau. La disposition déclarée ne
//    l'atteint pas — il négocie lui-même son format. Le verrou est juste, mais
//    son texte (« le renderer négocie lui-même son format ») se lisait comme
//    un jugement sur l'ampli. Il dit désormais que le verrou tient à la
//    SORTIE et ne dit rien des capacités de l'appareil.
//  - `au_dela_de_l_appareil` : le pilote annonce moins que le choix. Le
//    serveur « ne bloque pas la saisie » ; l'écran, lui, grisait — et
//    enfermait l'utilisateur hors de « Suivre l'appareil ».
//
// CONTRE-ÉPREUVE : remettre `disabled={… || z.channel_layout_status?.unavailable}`
// dans SettingsV2 fait rougir « au-delà de l'appareil : le sélecteur reste
// libre ».
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return {
    ...actual,
    getConfig: vi.fn(async () => ({ music_dirs: [], quality_split: true })),
    getScanSchedule: vi.fn(async () => ({ enabled: false, time: '03:00' })),
    getScanStatus: vi.fn(async () => ({ scanning: false })),
    getScanReport: vi.fn(async () => null),
    getStats: vi.fn(async () => ({})),
  };
});

import SettingsV2 from '../../components/v2/SettingsV2.svelte';
import { canauxVerrouilles } from '../vueZones';
import { preferences } from '../stores/preferences';
import { zones } from '../stores/zones';
import { dictionnaire, ONZE_LANGUES } from './onzeDictionnaires';

const fr = dictionnaire('fr');

describe('fils 1914/1913 — quand verrouiller', () => {
  it('rien d’indisponible : libre', () => {
    expect(canauxVerrouilles(null)).toBe(false);
    expect(canauxVerrouilles(undefined)).toBe(false);
    expect(canauxVerrouilles({ unavailable: false, reason: null })).toBe(false);
  });
  it('🔴 sortie réseau : verrouillé — on SAIT que le choix n’atteindrait pas l’appareil', () => {
    expect(canauxVerrouilles({ unavailable: true, reason: 'sortie_non_locale' })).toBe(true);
  });
  it('🔴 au-delà de ce qu’annonce le pilote : un AVERTISSEMENT, pas un verrou', () => {
    expect(canauxVerrouilles({ unavailable: true, reason: 'au_dela_de_l_appareil' })).toBe(false);
  });
  it('motif inconnu (serveur plus récent) : verrouillé par prudence', () => {
    expect(canauxVerrouilles({ unavailable: true, reason: 'quelque_chose_de_neuf' })).toBe(true);
    expect(canauxVerrouilles({ unavailable: true, reason: null })).toBe(true);
  });
});

describe('fils 1914/1913 — l’explication ne juge plus l’appareil', () => {
  it.each(ONZE_LANGUES)('%s : le motif « sortie réseau » existe et n’est plus l’ancien texte', (l) => {
    const d = dictionnaire(l);
    const t = d['zoneConfig.channelsUnavailableNonLocal'];
    expect(t, `${l} : clé absente`).toBeTruthy();
    expect(t).not.toContain('renderer négocie lui-même son format');
  });
  it('fr : le verrou est dit tenir à la sortie, pas à l’appareil', () => {
    expect(fr['zoneConfig.channelsUnavailableNonLocal']).toContain('ne dit rien des capacités de votre appareil');
  });
});

// ── L'écran monté ───────────────────────────────────────────────────────────

let hote: HTMLDivElement | null = null;
let monte: Record<string, any> | null = null;
let zonesServeur: unknown[] = [];

function statut(over: Record<string, unknown> = {}) {
  return { requested: null, effective: null, unavailable: false, reason: null, detail: null, ...over };
}
function zone(over: Record<string, unknown> = {}) {
  return {
    id: 21, name: 'Salon', output_type: 'local', volume: 1, state: 'stopped',
    channel_layout: null,
    channel_layouts_offered: [{ id: 'mono', canaux: 1 }, { id: 'stereo', canaux: 2 }],
    channel_layout_status: statut(),
    ...over,
  };
}
async function attendre(tours = 4) {
  for (let i = 0; i < tours; i++) {
    await new Promise((r) => setTimeout(r, 0));
    flushSync();
  }
}
async function poser(z: Record<string, unknown>): Promise<HTMLDivElement> {
  preferences.update((p) => ({ ...p, settingsLevel: 'beginner' }));
  zonesServeur = [z];
  zones.set([z] as any);
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(SettingsV2, { target: hote, props: {} });
  flushSync();
  const onglet = [...hote.querySelectorAll('button')].find(
    (b) => (b.textContent ?? '').trim() === fr['settings.tabDevices'],
  );
  expect(onglet, 'onglet Appareils introuvable').toBeDefined();
  (onglet as HTMLButtonElement).click();
  await attendre();
  expect(hote.querySelector('#zc-21'), 'carte de zone absente — témoin sans objet').not.toBeNull();
  return hote;
}
const selecteur = (h: HTMLElement) => h.querySelector<HTMLSelectElement>('#zc-21 .canaux select');

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} } as any);
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    const u = String(url);
    const corps = /\/zones(\?|$)/.test(u) ? zonesServeur
      : /\/(profiles|devices|playlists|shortcuts)(\?|$)/.test(u) ? [] : {};
    return new Response(JSON.stringify(corps), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }));
});
afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  hote?.remove();
  hote = null;
  zones.set([]);
  vi.unstubAllGlobals();
});

describe('fils 1914/1913 — Réglages › Appareils', () => {
  it('🔴 au-delà de l’appareil : le sélecteur reste libre, et l’avertissement est affiché', { timeout: 60_000 }, async () => {
    const h = await poser(zone({
      channel_layout: 'surround71',
      channel_layout_status: statut({ requested: 'surround71', unavailable: true, reason: 'au_dela_de_l_appareil' }),
    }));
    const sel = selecteur(h);
    expect(sel, 'aucun sélecteur de canaux').not.toBeNull();
    expect(sel!.disabled, 'grisé alors que le serveur ne bloque pas la saisie').toBe(false);
    expect(h.querySelector('#zc-21')!.textContent).toContain(fr['zoneConfig.channelsUnavailableBeyondDevice']);
  });

  it('sortie réseau : verrouillé, avec l’explication visible', { timeout: 60_000 }, async () => {
    const h = await poser(zone({
      output_type: 'dlna',
      channel_layouts_offered: [{ id: 'stereo', canaux: 2 }, { id: 'surround71', canaux: 8 }],
      channel_layout_status: statut({ unavailable: true, reason: 'sortie_non_locale' }),
    }));
    expect(selecteur(h)!.disabled).toBe(true);
    expect(h.querySelector('#zc-21')!.textContent).toContain(fr['zoneConfig.channelsUnavailableNonLocal']);
  });
});
