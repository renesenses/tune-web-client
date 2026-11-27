// @vitest-environment jsdom
//
// Trouvé en instruisant le fil forum 2147 (« le curseur de volume ne semble
// plus marcher quand on baisse le son », Tune 1.0.0-rc2).
//
// L'écran Zones (`ZonesV2`) dessine son curseur en POUR-CENT,
// `value={Math.round(z.volume * 100)}`, sur un volume de zone LINÉAIRE (0..1,
// celui de `/zones` et de `playback.volume`). Mais `setVol` recopiait le
// pour-cent tel quel dans le magasin : à 30, la zone valait 30, le curseur se
// redessinait à 3000 — calé au maximum — et le chiffre affichait « 3000 »
// jusqu'à ce que l'écho du serveur le corrige.
//
// Ce banc MONTE l'écran, déplace le vrai curseur de la carte, et lit le
// magasin, le curseur, le chiffre et la requête.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import { get } from 'svelte/store';
import ZonesV2 from '../../components/v2/ZonesV2.svelte';
import { zones, currentZoneId } from '../stores/zones';
import { browserAudioDestroy, browserPlay, browserVolumeDistant } from '../stores/browserAudio';
import { gainDeLaZone } from '../courbeDeVolume';
import { locale } from '../i18n';

let host: HTMLDivElement;
let component: ReturnType<typeof mount> | undefined;
let serverZones: Record<string, unknown>[];
let parties: { url: string; method: string; body: any }[];
const response = (body: unknown) => new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } });
async function settle() {
  for (let i = 0; i < 3; i++) {
    await new Promise((r) => setTimeout(r, 0));
    flushSync();
  }
}

beforeEach(() => {
  localStorage.clear();
  locale.set('fr');
  parties = [];
  serverZones = [
    { id: 1, name: 'Salon', state: 'playing', output_type: 'dlna', volume: 0.5 },
    { id: 2, name: 'Bureau', state: 'stopped', output_type: 'dlna', volume: 0.2 },
  ];
  zones.set(serverZones as never);
  currentZoneId.set(1);
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = (init?.method ?? 'GET').toUpperCase();
    parties.push({ url, method, body: init?.body ? JSON.parse(String(init.body)) : null });
    if (/\/zones(?:\?lang=[a-z]{2})?$/.test(url)) return response(serverZones);
    if (url.endsWith('/zones/stereo-pairs')) return response([]);
    if (url.includes('tune-tested.json')) return response({ version: 1, count: 0, devices: [] });
    if (url.endsWith('/system/diagnostics')) return response({ zones_doublons: [] });
    return response({});
  }));
  host = document.createElement('div');
  document.body.append(host);
});

afterEach(async () => {
  if (component) await unmount(component);
  component = undefined;
  host.remove();
  zones.set([]);
  currentZoneId.set(null);
  localStorage.clear();
  vi.unstubAllGlobals();
});

function curseurs(): HTMLInputElement[] {
  return [...host.querySelectorAll<HTMLInputElement>('input[type="range"]')];
}

async function deplacer(curseur: HTMLInputElement, pourcent: number) {
  curseur.value = String(pourcent);
  curseur.dispatchEvent(new Event('input', { bubbles: true }));
  flushSync();
  await settle();
}

describe('écran Zones — le curseur de volume pose un volume LINÉAIRE', () => {
  it('🔴 baisser à 30 : la zone vaut 0,3, le curseur reste à 30, le chiffre dit 30', async () => {
    component = mount(ZonesV2, { target: host });
    flushSync();
    await settle();
    const curseur = curseurs()[0];
    expect(curseur, 'la carte de la zone porte un curseur').toBeTruthy();
    expect(curseur.value).toBe('50');

    await deplacer(curseur, 30);

    const salon = get(zones).find((z: any) => z.id === 1) as any;
    expect(salon.volume, 'le magasin porte le volume linéaire de la zone').toBeCloseTo(0.3, 6);
    expect(curseurs()[0].value, 'le curseur reste là où on l’a posé').toBe('30');
    const chiffre = curseurs()[0].parentElement?.querySelector('.vn')?.textContent?.trim();
    expect(chiffre).toBe('30');

    const puts = parties.filter((p) => p.method === 'PUT' && /\/zones\/1\/volume(?:\?lang=[a-z]{2})?$/.test(p.url));
    expect(puts.length).toBe(1);
    expect(puts[0].body.volume).toBeCloseTo(0.3, 6);
  });

  it('applique le curseur au média de cet onglet et borne les échos de volume', async () => {
    const audio = document.createElement('audio');
    audio.load = vi.fn();
    audio.play = vi.fn().mockResolvedValue(undefined);
    audio.pause = vi.fn();
    vi.stubGlobal('Audio', function () { return audio; });
    Object.assign(serverZones[0], { output_type: 'browser', name: 'Ce navigateur', volume_curve: 'db60' });
    Object.assign(serverZones[1], { output_type: 'browser' });
    component = mount(ZonesV2, { target: host });
    flushSync();
    await settle();
    try {
      browserPlay('/stream/1', false, 1);
      await deplacer(curseurs()[0], 30);
      const demande = gainDeLaZone({ volume_curve: 'db60' }, 0.3);
      expect(audio.volume).toBeCloseTo(demande, 8);
      browserVolumeDistant(1, 0.8);
      expect(audio.volume).toBeCloseTo(demande, 8);
      await deplacer(curseurs()[1], 90);
      browserVolumeDistant(2, 0.9);
      expect(audio.volume).toBeCloseTo(demande, 8);
      browserVolumeDistant(1, demande / 2);
      expect(audio.volume).toBeCloseTo(demande / 2, 8);
      await deplacer(curseurs()[0], 60);
      expect(audio.volume).toBeCloseTo(demande / 2, 8);
      const accepte = gainDeLaZone({ volume_curve: 'db60' }, 0.45);
      browserVolumeDistant(1, accepte);
      expect(audio.volume).toBeCloseTo(accepte, 8);
      zones.update(liste => liste.map(z => z.id === 1 ? { ...z, muted: true } : z));
      browserVolumeDistant(1, accepte);
      expect(audio.volume).toBe(0);
    } finally {
      browserAudioDestroy();
    }
  });

  it('témoin : l’autre zone n’est pas touchée', async () => {
    component = mount(ZonesV2, { target: host });
    flushSync();
    await settle();
    await deplacer(curseurs()[0], 10);
    const bureau = get(zones).find((z: any) => z.id === 2) as any;
    expect(bureau.volume).toBe(0.2);
  });
});
