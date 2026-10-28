// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import { get } from 'svelte/store';

vi.hoisted(() => {
  class AudioMuet {
    volume = 1; muted = false; src = ''; crossOrigin = ''; preload = ''; currentTime = 0;
    addEventListener() {} removeEventListener() {} load() {} pause() {}
    play() { return Promise.resolve(); }
  }
  (globalThis as any).Audio = AudioMuet;
});

import VolumeControl from '../../components/partages/VolumeControl.svelte';
import TransportBar from '../../components/partages/TransportBar.svelte';
import ZonesV2 from '../../components/v2/ZonesV2.svelte';
import TvView from '../../components/v2-heritage/TvView.svelte';
import { zones, currentZoneId } from '../stores/zones';
import { stopSeekTimer, zoneVolume } from '../stores/nowPlaying';
import { preferences } from '../stores/preferences';
import { audiophileEnabled, audiophileLockVolume } from '../stores/audiophile';
import { activeView } from '../stores/navigation';
import { setupKeyboardShortcuts } from '../keyboard';
import { DELAI_VOLUME_MS } from '../limiteurVolume';

type Envoi = { url: string; body: any };
let envois: Envoi[];
let host: HTMLDivElement;
let component: ReturnType<typeof mount> | null;
let arreterClavier: (() => void) | undefined;
let reponsePas: Promise<Response> | undefined;
const refus = { can_set_volume: false, can_mute: false };
const attendre = (ms = 0) => new Promise((r) => setTimeout(r, ms));
async function stabiliser() {
  for (let i = 0; i < 5; i++) { await attendre(); flushSync(); }
}
function zone(caps: any, id = 1, output_type = 'oaat') {
  return { id, name: `Zone ${id}`, output_type, state: 'stopped', online: true,
    volume: 0.4, muted: false, output_capabilities: caps } as any;
}
function poser(z: ReturnType<typeof zone>) {
  zones.set([z]); currentZoneId.set(z.id); zoneVolume.set(z.volume); flushSync();
}
async function monter(c: any, z = zone(refus)) {
  poser(z); component = mount(c, { target: host }); flushSync(); await stabiliser();
  envois.length = 0;
}
function input(el: HTMLInputElement, value = '0.6') {
  el.value = value; el.dispatchEvent(new Event('input', { bubbles: true })); flushSync();
}
function touche(code: string, key = code) {
  window.dispatchEvent(new KeyboardEvent('keydown', { code, key, bubbles: true, cancelable: true }));
  flushSync();
}

beforeEach(() => {
  envois = []; component = null; reponsePas = undefined;
  host = document.createElement('div'); document.body.appendChild(host);
  audiophileEnabled.set(false); audiophileLockVolume.set(false);
  preferences.update((p) => ({ ...p, volumeDisplay: 'percent', volumeStepButtons: true }));
  activeView.set('nowplaying');
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const u = String(url).replace(/\?.*$/, '');
    const method = init?.method ?? 'GET';
    if (method !== 'GET' && /\/(volume(?:\/step)?|mute)$/.test(u)) {
      envois.push({ url: u, body: init?.body ? JSON.parse(String(init.body)) : null });
    }
    if (u.endsWith('/volume/step') && reponsePas) return reponsePas;
    const body = u.includes('tune-tested.json') ? { version: 1, count: 0, devices: [] }
      : u.endsWith('/system/diagnostics') ? { zones_doublons: [] }
      : /\/zones$/.test(u) ? get(zones)
      : /\/devices$|\/devices\/all$|\/outputs$|\/stereo-pairs$/.test(u) ? []
      : u.endsWith('/volume/step') ? { zone_id: 1, volume: 0.41, limited: false } : {};
    return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }));
});

afterEach(async () => {
  arreterClavier?.(); arreterClavier = undefined;
  if (component) await unmount(component);
  host.remove(); stopSeekTimer(); zones.set([]); currentZoneId.set(null);
  audiophileEnabled.set(false); audiophileLockVolume.set(false);
  vi.unstubAllGlobals(); localStorage.clear();
});

describe('#2486 — capacités de sortie sur les contrôles réels', () => {
  it('désactive curseur, boutons et saisie dB quand le volume est refusé', async () => {
    preferences.update((p) => ({ ...p, volumeDisplay: 'dB' }));
    await monter(VolumeControl);
    const slider = host.querySelector<HTMLInputElement>('.volume-slider')!;
    const db = host.querySelector<HTMLInputElement>('.volume-db-input')!;
    expect(slider.disabled).toBe(true); expect(db.disabled).toBe(true);
    expect([...host.querySelectorAll<HTMLButtonElement>('.step-btn')].every((b) => b.disabled)).toBe(true);
    input(slider); input(db, '-20'); db.dispatchEvent(new FocusEvent('blur'));
    await stabiliser(); expect(envois).toEqual([]);
  });

  it.each([undefined, null, {}, { can_set_volume: true }])('garde les anciennes capacités ou une autorisation explicite (%j)', async (caps) => {
    await monter(VolumeControl, zone(caps));
    const slider = host.querySelector<HTMLInputElement>('.volume-slider')!;
    expect(slider.disabled).toBe(false); input(slider);
    expect(envois).toHaveLength(1); expect(envois[0].body.volume).toBeCloseTo(0.6);
  });

  it('ne confond pas can_mute=true avec can_set_volume=false', async () => {
    await monter(VolumeControl, zone({ can_set_volume: false, can_mute: true }));
    const mute = host.querySelector<HTMLButtonElement>('.volume-btn')!;
    expect(mute.disabled).toBe(false); mute.click(); await stabiliser();
    expect(envois).toHaveLength(1); expect(envois[0].url).toMatch(/\/mute$/);
  });

  it('un volume autorisé ne déclenche pas de mute refusé, même pour lever la sourdine', async () => {
    await monter(VolumeControl, { ...zone({ can_set_volume: true, can_mute: false }), muted: true });
    expect(host.querySelector<HTMLButtonElement>('.volume-btn')!.disabled).toBe(true);
    input(host.querySelector<HTMLInputElement>('.volume-slider')!); await stabiliser();
    expect(envois).toHaveLength(1); expect(envois[0].url).toMatch(/\/volume$/);
  });

  it('conserve le volume local du navigateur et le verrou PURE', async () => {
    await monter(VolumeControl, zone(refus, 1, 'browser'));
    const slider = host.querySelector<HTMLInputElement>('.volume-slider')!;
    expect(slider.disabled).toBe(false); input(slider);
    expect(envois).toHaveLength(1);
    audiophileEnabled.set(true); audiophileLockVolume.set(true); flushSync();
    expect(slider.disabled).toBe(true); input(slider, '0.7');
    expect(envois).toHaveLength(1);
  });

  it.each(['zone', 'capacite', 'PURE', 'demontage'])('annule le volume différé après %s', async (changement) => {
    await monter(VolumeControl, zone({ can_set_volume: true }));
    const slider = host.querySelector<HTMLInputElement>('.volume-slider')!;
    input(slider, '0.5'); input(slider, '0.7'); expect(envois).toHaveLength(1);
    if (changement === 'zone') poser(zone({}, 2));
    if (changement === 'capacite') poser(zone(refus));
    if (changement === 'PURE') { audiophileEnabled.set(true); audiophileLockVolume.set(true); flushSync(); }
    if (changement === 'demontage') { unmount(component!); component = null; }
    await attendre(DELAI_VOLUME_MS + 30); expect(envois).toHaveLength(1);
  });

  it('un écho de volume de la même zone ne supprime pas la dernière consigne', async () => {
    await monter(VolumeControl, zone({}));
    const slider = host.querySelector<HTMLInputElement>('.volume-slider')!;
    input(slider, '0.5'); input(slider, '0.7');
    zones.update((zs) => zs.map((z) => ({ ...z, volume: 0.5 }))); flushSync();
    await attendre(DELAI_VOLUME_MS + 30);
    expect(envois).toHaveLength(2); expect(envois[1].body.volume).toBeCloseTo(0.7);
  });

  it('ignore la réponse tardive du pas et ne lève pas la sourdine de la nouvelle zone', async () => {
    await monter(VolumeControl, { ...zone({}), volume_limit_safety: 1, volume_limit_comfort: null });
    let terminer!: (response: Response) => void;
    reponsePas = new Promise((resolve) => { terminer = resolve; });
    host.querySelectorAll<HTMLButtonElement>('.step-btn')[1].click(); await stabiliser();
    expect(envois).toHaveLength(1); expect(envois[0].url).toMatch(/\/volume\/step$/);
    poser({ ...zone({}, 2), volume: 0.2, muted: true });
    terminer(new Response(JSON.stringify({ zone_id: 1, volume: 0.8, limited: false }), {
      headers: { 'Content-Type': 'application/json' },
    }));
    await stabiliser();
    expect(get(zoneVolume)).toBeCloseTo(0.2); expect(envois).toHaveLength(1);
    expect(get(zones)[0].muted).toBe(true);
  });

  it('désactive aussi le popup mobile et ses boutons', async () => {
    await monter(TransportBar); host.querySelector<HTMLButtonElement>('.mobile-volume-btn')!.click(); flushSync();
    const slider = host.querySelector<HTMLInputElement>('.mobile-volume-slider')!;
    expect(slider.disabled).toBe(true);
    expect(host.querySelector<HTMLButtonElement>('.mobile-mute-btn')!.disabled).toBe(true);
    expect([...host.querySelectorAll<HTMLButtonElement>('.mobile-step-btn')].every((b) => b.disabled)).toBe(true);
    input(slider); await stabiliser(); expect(envois).toEqual([]);
  });

  it.each(['zone', 'capacite'])('annule le volume mobile différé après %s', async (changement) => {
    await monter(TransportBar, zone({})); host.querySelector<HTMLButtonElement>('.mobile-volume-btn')!.click(); flushSync();
    const slider = host.querySelector<HTMLInputElement>('.mobile-volume-slider')!;
    input(slider, '0.5'); input(slider, '0.7'); expect(envois).toHaveLength(1);
    poser(changement === 'zone' ? zone({}, 2) : zone(refus));
    await attendre(DELAI_VOLUME_MS + 30); expect(envois).toHaveLength(1);
  });

  it('garde les curseurs des cartes de zone inertes sur refus explicite', async () => {
    await monter(ZonesV2);
    const sliders = [...host.querySelectorAll<HTMLInputElement>('input[type="range"]')];
    expect(sliders.length).toBeGreaterThan(0);
    for (const slider of sliders) { expect(slider.disabled).toBe(true); input(slider, '60'); }
    await stabiliser(); expect(envois).toEqual([]);
  });

  it('les raccourcis globaux respectent volume et mute indépendamment', async () => {
    poser(zone(refus)); arreterClavier = setupKeyboardShortcuts();
    touche('ArrowUp'); touche('ArrowDown'); touche('KeyM', 'm'); await stabiliser(); expect(envois).toEqual([]);
    poser(zone({ can_set_volume: true, can_mute: false })); touche('ArrowUp'); touche('KeyM', 'm');
    await stabiliser(); expect(envois).toHaveLength(1); expect(envois[0].url).toMatch(/\/volume$/);
  });

  it('le clavier du Grand écran ne contourne pas les capacités', async () => {
    await monter(TvView); arreterClavier = setupKeyboardShortcuts();
    touche('ArrowUp'); touche('ArrowDown'); await stabiliser(); expect(envois).toEqual([]);
    poser(zone({ can_set_volume: true })); touche('ArrowUp'); await stabiliser();
    expect(envois).toHaveLength(1);
  });
});
