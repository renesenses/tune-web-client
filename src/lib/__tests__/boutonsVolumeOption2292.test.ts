// @vitest-environment jsdom
//
// web#2292 (fil 2366) — boutons − et + de part et d'autre du curseur de
// volume, derrière une option des Réglages, DÉSACTIVÉE par défaut, au pas
// d'un point. Ils passent par les limites de la zone (tune-server-rust#6541) :
// + ne franchit jamais la limite de sécurité, ni 100 %.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// L'élément <audio> d'une zone navigateur : jsdom n'en a pas de jouable.
vi.hoisted(() => {
  class FauxAudio {
    volume = 1; muted = false; src = ''; crossOrigin = ''; preload = ''; currentTime = 0;
    addEventListener() {} removeEventListener() {} load() {} pause() {}
    play() { return Promise.resolve(); }
  }
  (globalThis as any).Audio = FauxAudio;
});

import VolumeControl from '../../components/partages/VolumeControl.svelte';
import { preferences } from '../stores/preferences';
import { zones, currentZoneId } from '../stores/zones';
import { zoneVolume } from '../stores/nowPlaying';
import { PAS_BOUTON, cibleDuPas } from '../limitesVolume';

const DELAI = 60_000;

type Envoi = { url: string; method: string; corps: any };
let envois: Envoi[] = [];
let hote: HTMLDivElement | null = null;
let monte: Record<string, any> | null = null;

function json(corps: unknown, status = 200) {
  return new Response(JSON.stringify(corps), { status, headers: { 'Content-Type': 'application/json' } });
}
async function attendre(tours = 5) {
  for (let i = 0; i < tours; i++) {
    await new Promise((r) => setTimeout(r, 0));
    flushSync();
  }
}

beforeEach(() => {
  envois = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const u = String(url).replace(/\?.*$/, '');
    const method = init?.method ?? 'GET';
    // Seules les écritures de VOLUME comptent (l'option posée dans les
    // préférences part aussi vers le serveur, ce n'est pas le sujet).
    if (method !== 'GET' && /\/zones\/\d+\/volume(\/step)?$/.test(u)) envois.push({ url: u, method, corps: init?.body ? JSON.parse(String(init.body)) : null });
    if (u.endsWith('/volume/step')) return json({ zone_id: 1, volume: 0.31, limited: false });
    if (method === 'PUT') return new Response(null, { status: 204 });
    return json({});
  }));
  hote = document.createElement('div');
  document.body.appendChild(hote);
});

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  hote?.remove();
  hote = null;
  preferences.update((p) => ({ ...p, volumeStepButtons: false }));
  vi.unstubAllGlobals();
});

async function poser(zone: Record<string, unknown>, volume: number, option: boolean) {
  preferences.update((p) => ({ ...p, volumeStepButtons: option, volumeDisplay: 'percent' }));
  zones.set([{ id: 1, name: 'Z', state: 'playing', muted: false, volume, ...zone } as any]);
  currentZoneId.set(1);
  zoneVolume.set(volume);
  monte = mount(VolumeControl, { target: hote!, props: {} });
  flushSync();
  await attendre();
  const boutons = Array.from(hote!.querySelectorAll<HTMLButtonElement>('.step-btn'));
  return { moins: boutons[0], plus: boutons[1], boutons };
}

const RESEAU = { output_type: 'dlna', volume_limit_safety: 0.7, volume_limit_comfort: null };
const NAVIGATEUR = { output_type: 'browser', volume_limit_safety: 0.7, volume_limit_comfort: null };
const ANCIEN = { output_type: 'dlna' }; // serveur antérieur : ni limites ni route /volume/step

describe('#2292 — l’option des Réglages', () => {
  it('🔴 désactivée par défaut', () => {
    const src = readFileSync(resolve(process.cwd(), 'src/lib/stores/preferences.ts'), 'utf-8');
    expect(src).toMatch(/volumeStepButtons: false,/);
  });

  it('🔴 option inactive : seul le curseur s’affiche', { timeout: DELAI }, async () => {
    const { boutons } = await poser(RESEAU, 0.3, false);
    expect(boutons).toHaveLength(0);
    expect(hote!.querySelector('.volume-slider')).not.toBeNull();
  });

  it('option active : − à gauche du curseur, + à droite', { timeout: DELAI }, async () => {
    const { boutons } = await poser(RESEAU, 0.3, true);
    expect(boutons).toHaveLength(2);
    const ordre = Array.from(hote!.querySelector('.volume-control')!.children).map((e) => e.className.split(' ')[0]);
    // #7517 : le curseur vit désormais dans son habillage de graduations.
    const curseur = ordre.indexOf('volume-curseur');
    expect(ordre.indexOf('step-btn')).toBeLessThan(curseur);
    expect(ordre.lastIndexOf('step-btn')).toBeGreaterThan(curseur);
  });

  it('Réglages › Général porte l’interrupteur, libellé et explication', () => {
    const src = readFileSync(resolve(process.cwd(), 'src/components/v2/SettingsV2.svelte'), 'utf-8');
    expect(src).toContain("$t('settings.volumeStepButtons' as any)");
    expect(src).toContain("$t('settings.volumeStepButtonsHint' as any)");
    expect(src).toContain('volumeStepButtons: (e.currentTarget as HTMLInputElement).checked');
  });
});

describe('#2292 — un point par clic, borné par la sécurité', () => {
  it('🔴 le pas vaut un point (0,01)', () => {
    expect(PAS_BOUTON).toBe(0.01);
  });

  it('🔴 zone d’un serveur récent : + demande au serveur un pas de 0,01', { timeout: DELAI }, async () => {
    const { plus } = await poser(RESEAU, 0.3, true);
    plus.click();
    await attendre();
    expect(envois).toEqual([{ url: expect.stringMatching(/\/zones\/1\/volume\/step$/), method: 'POST', corps: { direction: 'up', step: 0.01 } }]);
  });

  it('🔴 zone navigateur, à 69 % sous une sécurité de 70 % : + pose 70, puis se désactive', { timeout: DELAI }, async () => {
    const { plus } = await poser(NAVIGATEUR, 0.69, true);
    plus.click();
    await attendre();
    expect(envois.map((e) => e.corps)).toEqual([{ volume: 0.7 }]);
    expect(plus.disabled).toBe(true);
  });

  it('🔴 zone navigateur déjà à la sécurité : + n’envoie rien', { timeout: DELAI }, async () => {
    const { plus } = await poser(NAVIGATEUR, 0.7, true);
    // Le bouton est grisé ; on appelle quand même son geste.
    plus.disabled = false;
    plus.click();
    await attendre();
    expect(envois).toEqual([]);
  });

  it('serveur antérieur, à 99,5 % : + ne dépasse pas 100', { timeout: DELAI }, async () => {
    const { plus } = await poser(ANCIEN, 0.995, true);
    plus.click();
    await attendre();
    expect(envois).toHaveLength(1);
    expect(envois[0].corps.volume).toBeLessThanOrEqual(1);
  });

  it('− descend d’un point, jamais sous 0', { timeout: DELAI }, async () => {
    const { moins } = await poser(NAVIGATEUR, 0.3, true);
    moins.click();
    await attendre();
    expect(envois.map((e) => e.corps)).toEqual([{ volume: 0.29 }]);
    expect(cibleDuPas(NAVIGATEUR, 0.004, 'down')).toBe(0);
  });

  it('🔴 balayage : + ne franchit jamais la sécurité ni 100, et ne fait jamais baisser', () => {
    const fautes: string[] = [];
    for (const s of [null, 0.05, 0.3, 0.7, 0.995, 1]) {
      const zone = { volume_limit_safety: s };
      const plafond = Math.min(s ?? 1, 1);
      for (let i = 0; i <= 1000; i++) {
        const actuel = i / 1000;
        const c = cibleDuPas(zone, actuel, 'up');
        if (c > 1 || c < actuel - 1e-9 || (actuel < plafond && c > plafond + 1e-9) || (actuel >= plafond && c !== actuel)) {
          fautes.push(`s=${s} actuel=${actuel} → ${c}`);
        }
      }
    }
    expect(fautes.slice(0, 5)).toEqual([]);
  });

  it('les boutons − et + du téléphone passent par la même borne', () => {
    const src = readFileSync(resolve(process.cwd(), 'src/components/partages/TransportBar.svelte'), 'utf-8');
    const fn = src.slice(src.indexOf('async function mobileVolumeStep('), src.indexOf('async function toggleMobileMute('));
    expect(fn).toContain("cibleDuPas(z, mobileVol, delta > 0 ? 'up' : 'down')");
    expect(fn).not.toMatch(/Math\.min\(1, mobileVol \+ delta\)/);
  });
});
