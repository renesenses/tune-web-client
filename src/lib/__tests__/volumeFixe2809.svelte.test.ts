// @vitest-environment jsdom
// web#2809 — une zone en VOLUME FIXE (bit-perfect, `fixed_volume: true`) ne
// montre plus de curseur de volume : la mention « Volume fixe » le remplace
// dans le lecteur, le popup mobile, la liste des zones et la vue mini. Une
// zone à volume réglable garde son curseur.
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
import ZonesMini from '../../components/v2/mini/ZonesMini.svelte';
import { zones, currentZoneId } from '../stores/zones';
import { stopSeekTimer, zoneVolume } from '../stores/nowPlaying';
import { preferences } from '../stores/preferences';
import { volumeFixe } from '../capacitesVolumeSortie';
import fr from '../locales/fr';

let host: HTMLDivElement;
let component: ReturnType<typeof mount> | null;
const attendre = (ms = 0) => new Promise((r) => setTimeout(r, ms));
async function stabiliser() {
  for (let i = 0; i < 5; i++) { await attendre(); flushSync(); }
}
function zone(fixed_volume: boolean | undefined, id = 1) {
  return { id, name: `Zone ${id}`, output_type: 'oaat', state: 'stopped', online: true,
    volume: 1, muted: false, fixed_volume } as any;
}
async function monter(c: any, zs: any[]) {
  zones.set(zs); currentZoneId.set(zs[0].id); zoneVolume.set(zs[0].volume); flushSync();
  component = mount(c, { target: host }); flushSync(); await stabiliser();
}
const curseurs = () => [...host.querySelectorAll<HTMLInputElement>('input[type="range"]')];
const mentions = () => [...host.querySelectorAll<HTMLElement>('[data-testid="volume-fixe"]')];

beforeEach(() => {
  component = null;
  host = document.createElement('div'); document.body.appendChild(host);
  preferences.update((p) => ({ ...p, volumeDisplay: 'percent', volumeStepButtons: true }));
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    const u = String(url).replace(/\?.*$/, '');
    const body = u.includes('tune-tested.json') ? { version: 1, count: 0, devices: [] }
      : u.endsWith('/system/diagnostics') ? { zones_doublons: [] }
      : /\/zones$/.test(u) ? get(zones)
      : /\/(devices|outputs|stereo-pairs|group-delays|profiles|playlists|shortcuts|groups)$|\/devices\/all$/.test(u) ? []
      : {};
    return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }));
});

afterEach(async () => {
  if (component) await unmount(component);
  host.remove(); stopSeekTimer(); zones.set([]); currentZoneId.set(null);
  vi.unstubAllGlobals(); localStorage.clear();
});

describe('#2809 — volume fixe : la mention remplace le curseur', () => {
  it('seul fixed_volume === true compte', () => {
    expect(volumeFixe(zone(true))).toBe(true);
    for (const v of [false, undefined, null]) expect(volumeFixe(zone(v as any))).toBe(false);
    expect(volumeFixe(null)).toBe(false);
  });

  it('lecteur : pas de curseur ni de boutons ±, la mention à la place, la sourdine reste', async () => {
    await monter(VolumeControl, [zone(true)]);
    expect(host.querySelector('.volume-slider')).toBeNull();
    expect(host.querySelectorAll('.step-btn')).toHaveLength(0);
    expect(host.querySelector('.volume-value')).toBeNull();
    expect(mentions()).toHaveLength(1);
    expect(mentions()[0].textContent).toBe(fr['volume.fixed']);
    expect(mentions()[0].closest('button, a')).toBeNull();
    expect(host.querySelector('.volume-btn')).not.toBeNull();
  });

  it('lecteur : volume réglable inchangé (contrôle)', async () => {
    await monter(VolumeControl, [zone(false)]);
    expect(host.querySelector('.volume-slider')).not.toBeNull();
    expect(host.querySelectorAll('.step-btn')).toHaveLength(2);
    expect(mentions()).toHaveLength(0);
  });

  it('la mention suit la zone : réglable → fixe → réglable', async () => {
    await monter(VolumeControl, [zone(false)]);
    zones.set([zone(true)]); flushSync();
    expect(host.querySelector('.volume-slider')).toBeNull(); expect(mentions()).toHaveLength(1);
    zones.set([zone(false)]); flushSync();
    expect(host.querySelector('.volume-slider')).not.toBeNull(); expect(mentions()).toHaveLength(0);
  });

  it.each([true, false])('popup mobile du lecteur (fixe=%s)', async (fixe) => {
    await monter(TransportBar, [zone(fixe)]);
    host.querySelector<HTMLButtonElement>('.mobile-volume-btn')!.click(); flushSync();
    const popup = host.querySelector<HTMLElement>('.mobile-volume-popup')!;
    expect(popup).not.toBeNull();
    expect(popup.querySelector('.mobile-volume-slider') === null).toBe(fixe);
    expect(popup.querySelectorAll('.mobile-step-btn')).toHaveLength(fixe ? 0 : 2);
    expect(popup.querySelectorAll('[data-testid="volume-fixe"]')).toHaveLength(fixe ? 1 : 0);
  });

  it('liste des zones : seule la zone fixe perd son curseur', async () => {
    await monter(ZonesV2, [zone(true, 1), zone(false, 2)]);
    const fixes = curseurs().filter((c) => c.getAttribute('aria-label') === 'Volume de Zone 1');
    const reglables = curseurs().filter((c) => c.getAttribute('aria-label') === 'Volume de Zone 2');
    expect(fixes).toHaveLength(0);
    expect(reglables.length).toBeGreaterThan(0);
    // Une mention par curseur retiré : autant que de curseurs de la zone réglable.
    expect(mentions()).toHaveLength(reglables.length);
  });

  it('vue mini des zones : zone choisie et autre zone en volume fixe', async () => {
    await monter(ZonesMini, [zone(true, 1), zone(true, 2)]);
    expect(curseurs()).toHaveLength(0);
    expect(host.querySelector('.vol-lu')).toBeNull();
    expect(mentions()).toHaveLength(2);
  });

  it('vue mini des zones : volume réglable inchangé (contrôle)', async () => {
    await monter(ZonesMini, [zone(false, 1), zone(false, 2)]);
    expect(curseurs()).toHaveLength(1);
    expect(mentions()).toHaveLength(0);
  });
});
