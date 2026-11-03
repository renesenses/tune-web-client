// @vitest-environment jsdom
// web#7517 (fil 2554, alec_eiffel) — le curseur de volume gradué en dB pour une
// sortie qui annonce une course en dB (Devialet AIR), colorié par les limites ;
// le curseur en pour-cent reste pour les autres.
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
import { zones, currentZoneId } from '../stores/zones';
import { stopSeekTimer, zoneVolume } from '../stores/nowPlaying';
import { preferences } from '../stores/preferences';
import { audiophileEnabled, audiophileLockVolume, audiophileGlobalLockVolume } from '../stores/audiophile';

type Envoi = { url: string; body: any };
let envois: Envoi[];
let host: HTMLDivElement;
let component: ReturnType<typeof mount> | null;
const attendre = (ms = 0) => new Promise((r) => setTimeout(r, ms));
async function stabiliser() { for (let i = 0; i < 5; i++) { await attendre(); flushSync(); } }

const COURSE = { min_db: -80, max_db: -10, step_db: 0.5, floor_db: -80, ceiling_db: -10 };
function air(extra: Record<string, unknown> = {}) {
  return { id: 1, name: 'Devialet', output_type: 'devialet_air', state: 'stopped', online: true,
    volume: 0.5, muted: false, volume_curve: 'linear', device_volume_range: COURSE, device_volume_db: -45,
    volume_limit_safety: null, volume_limit_comfort: null, ...extra } as any;
}
async function monter(z: any) {
  zones.set([z]); currentZoneId.set(z.id); zoneVolume.set(z.volume); flushSync();
  component = mount(VolumeControl, { target: host }); flushSync(); await stabiliser();
  envois.length = 0;
  return host.querySelector<HTMLInputElement>('.volume-slider')!;
}
function input(el: HTMLInputElement, value: string) {
  el.value = value; el.dispatchEvent(new Event('input', { bubbles: true })); flushSync();
}

beforeEach(() => {
  envois = []; component = null;
  host = document.createElement('div'); document.body.appendChild(host);
  audiophileEnabled.set(false); audiophileLockVolume.set(false); audiophileGlobalLockVolume.set(false);
  preferences.update((p) => ({ ...p, volumeDisplay: 'percent', volumeStepButtons: false }));
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const u = String(url).replace(/\?.*$/, '');
    if ((init?.method ?? 'GET') !== 'GET' && /\/volume$/.test(u)) {
      envois.push({ url: u, body: init?.body ? JSON.parse(String(init.body)) : null });
    }
    return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } });
  }));
});

afterEach(async () => {
  if (component) await unmount(component);
  host.remove(); stopSeekTimer(); zones.set([]); currentZoneId.set(null);
  vi.unstubAllGlobals(); localStorage.clear();
});

describe('#7517 — curseur en dB sur une sortie à course en dB', () => {
  it('graduée en dB sur la course annoncée, valeur lue en dB, traits tous les 10 dB', async () => {
    const slider = await monter(air());
    expect(Number(slider.min)).toBe(-80);
    expect(Number(slider.max)).toBe(-10);
    expect(Number(slider.step)).toBe(0.5);
    expect(Number(slider.value)).toBe(-45);
    expect(host.querySelector('[data-testid="volume-db-appareil"]')!.textContent).toBe('-45.0 dB');
    expect(host.querySelectorAll('.graduations .trait')).toHaveLength(8);
    // Aucune limite : pas de fond coloré.
    expect(slider.getAttribute('style')).toBeNull();
  });

  it('un geste en dB envoie la même fraction que le curseur 0..1 (−24 dB = 0,8)', async () => {
    const slider = await monter(air());
    input(slider, '-24'); await stabiliser();
    expect(envois).toHaveLength(1);
    expect(envois[0].body.volume).toBeCloseTo(0.8, 10);
  });

  it('les limites colorent le curseur : vert, orange, rouge', async () => {
    const slider = await monter(air({ volume_limit_comfort: 0.4, volume_limit_safety: 0.7 }));
    const style = slider.getAttribute('style') ?? '';
    expect(style).toContain('linear-gradient');
    expect(style).toContain('--tune-success');
    expect(style).toContain('--tune-warning');
    expect(style).toContain('--tune-error');
    expect(slider.title).not.toBe('');
  });

  it('la sécurité plafonne le geste ET le curseur le montre en dB (sécurité 0,7 = −31 dB)', async () => {
    const slider = await monter(air({ volume_limit_safety: 0.7, volume: 0.6 }));
    input(slider, '-12'); await stabiliser();
    expect(envois).toHaveLength(1);
    expect(envois[0].body.volume).toBeCloseTo(0.7, 10);
    expect(Number(slider.value)).toBe(-31);
  });

  it('le confort retient le curseur qui monte, comme avant', async () => {
    const slider = await monter(air({ volume_limit_comfort: 0.4, volume_limit_safety: 0.7, volume: 0.3 }));
    input(slider, '-12'); await stabiliser();
    expect(envois[0].body.volume).toBeCloseTo(0.4, 10);
    expect(Number(slider.value)).toBe(-52);
  });

  it('contre-épreuve : sans course annoncée, le curseur reste en pour-cent, sans traits ni dB d’appareil', async () => {
    const slider = await monter({ ...air(), output_type: 'dlna', device_volume_range: null, device_volume_db: null });
    expect(Number(slider.min)).toBe(0);
    expect(Number(slider.max)).toBe(1);
    expect(Number(slider.step)).toBeCloseTo(0.01);
    expect(Number(slider.value)).toBe(0.5);
    expect(host.querySelector('.graduations')).toBeNull();
    expect(host.querySelector('[data-testid="volume-db-appareil"]')).toBeNull();
    input(slider, '0.6'); await stabiliser();
    expect(envois[0].body.volume).toBeCloseTo(0.6);
    expect(get(zoneVolume)).toBeCloseTo(0.6);
  });
});
