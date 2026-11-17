// @vitest-environment jsdom
//
// tune-server-rust#8920 — retours d'un testeur Devialet Expert (rc12) sur une
// zone Devialet AIR : l'ampli fait foi pour l'affichage, boutons ±1 dB
// toujours là, pas de zone rouge, ni volume fixe ni plein volume en PURE,
// 192 kHz au plus, DSD en DoP ou PCM, marque « Devialet » pré-remplie.
// Chaque règle a sa contre-épreuve sur une zone DLNA.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import VolumeControl from '../../components/partages/VolumeControl.svelte';
import { preferences } from '../stores/preferences';
import { zones, currentZoneId } from '../stores/zones';
import { zoneVolume } from '../stores/nowPlaying';
import {
  estAir, marqueInitiale, MODELES_DEVIALET, frequencesProposees, modesDsdProposes,
  volumeFixePropose, dbAffiche, plusEnButeeAir, moinsEnButeeAir, GRACE_DU_GESTE_MS,
} from '../devialetAir';
import { fondDesZones } from '../volumeCourseDb';
import fr from '../locales/fr';
import en from '../locales/en';
import de from '../locales/de';
import es from '../locales/es';
import it_ from '../locales/it';
import zh from '../locales/zh';
import ja from '../locales/ja';
import ko from '../locales/ko';
import ro from '../locales/ro';
import sv from '../locales/sv';
import hu from '../locales/hu';
import vi_ from '../locales/vi';
import el from '../locales/el';
import nb from '../locales/nb';
import pl from '../locales/pl';

const AMPLI = 'devialet-air:02:00:5e:00:00:01';
const COURSE = { min_db: -80, max_db: -10, step_db: 0.5 };
// 40 % = −52 dB ; sécurité −45 dB (0,5), confort −59 dB (0,3).
const AIR = {
  id: 1, name: 'Expert', output_type: 'devialet_air', output_device_id: AMPLI, state: 'playing', muted: false,
  volume: 0.4, volume_curve: 'linear',
  device_volume_range: { ...COURSE, floor_db: -80, ceiling_db: -10 },
  volume_limit_safety: 0.5, volume_limit_comfort: 0.3,
  volume_limit_safety_device_db: -45, volume_limit_comfort_device_db: -59, volume_limits_refusal: null,
};
const obs = (db: number) => ({ device_id: AMPLI, volume: Math.min(1, Math.max(0, (db + 80) / 70)), volume_db: db, muted: false });

type Envoi = { url: string; method: string; corps: any };
let envois: Envoi[] = [];
let reponsePas: Record<string, unknown> = {};
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
  reponsePas = { zone_id: 1, volume: 0.4142857, sent: true, limited: false };
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const u = String(url).replace(/\?.*$/, '');
    const method = init?.method ?? 'GET';
    if (method !== 'GET' && /\/zones\/\d+\/volume(\/step)?$/.test(u)) envois.push({ url: u, method, corps: init?.body ? JSON.parse(String(init.body)) : null });
    if (u.endsWith('/volume/step')) return json(reponsePas);
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
  vi.unstubAllGlobals();
});

async function poser(zone: Record<string, unknown>, volume = 0.4) {
  preferences.update((p) => ({ ...p, volumeStepButtons: false, volumeDisplay: 'percent' }));
  zones.set([{ ...zone } as any]);
  currentZoneId.set(1);
  zoneVolume.set(volume);
  monte = mount(VolumeControl, { target: hote!, props: {} });
  flushSync();
  await attendre();
  const boutons = Array.from(hote!.querySelectorAll<HTMLButtonElement>('.step-btn'));
  return { moins: boutons[0], plus: boutons[1], boutons };
}

describe('#8920 — boutons ±1 dB sur Devialet AIR', () => {
  it('toujours affichés sur AIR, même option éteinte ; un clic = un pas de 1 dB d\'ampli', async () => {
    const { moins, plus, boutons } = await poser(AIR);
    expect(boutons).toHaveLength(2);
    expect(plus.getAttribute('aria-label')).toBe('+1 dB');
    expect(moins.getAttribute('aria-label')).toBe('−1 dB');
    plus.click();
    await attendre();
    expect(envois).toEqual([{ url: expect.stringMatching(/\/zones\/1\/volume\/step$/), method: 'POST', corps: { direction: 'up', step_db: 1 } }]);
    moins.click();
    await attendre();
    expect(envois[1].corps).toEqual({ direction: 'down', step_db: 1 });
  });

  it('+ en butée à la sécurité, et quand l\'ampli est déjà au-dessus (télécommande)', async () => {
    const { plus } = await poser({ ...AIR, device_volume_observation: obs(-45) });
    expect(plus.disabled).toBe(true);
    unmount(monte!); monte = null; hote!.innerHTML = '';
    const r = await poser({ ...AIR, device_volume_observation: obs(-20) });
    expect(r.plus.disabled).toBe(true);
    expect(r.moins.disabled).toBe(false);
    expect(hote!.querySelector('[data-testid="volume-db-appareil"]')?.textContent).toBe('-20.0 dB');
    r.plus.click();
    await attendre();
    expect(envois, 'un + désactivé n\'envoie rien').toEqual([]);
  });

  it('un + que le serveur n\'a pas envoyé ne déplace rien', async () => {
    reponsePas = { zone_id: 1, volume: 0.5, sent: false, limited: true };
    const { plus } = await poser(AIR);
    plus.click();
    await attendre();
    expect(envois).toHaveLength(1);
    expect(hote!.querySelector('[data-testid="volume-db-appareil"]')?.textContent).toBe('-52.0 dB');
  });

  it('contre-épreuve : sur DLNA, option éteinte, pas de boutons', async () => {
    const { boutons } = await poser({ id: 1, name: 'Z', output_type: 'dlna', state: 'playing', muted: false, volume: 0.4, volume_limit_safety: 0.7 });
    expect(boutons).toHaveLength(0);
  });

  it('pas de ligne « AIR (observé) »', async () => {
    await poser({ ...AIR, device_volume_observation: obs(-30) });
    expect(hote!.querySelector('.device-volume-observation')).toBeNull();
    expect(hote!.textContent).not.toMatch(/observ/i);
  });
});

describe('#8920 — pas de zone rouge sur AIR', () => {
  it('le fond n\'a pas de rouge sur AIR ; contre-épreuve : il en a ailleurs', async () => {
    await poser(AIR);
    const fond = (hote!.querySelector('.volume-slider') as HTMLInputElement).getAttribute('style') ?? '';
    expect(fond).toContain('--tune-warning');
    expect(fond).not.toContain('--tune-error');
    expect(fondDesZones({ confort: 0.3, securite: 0.5 })).toContain('--tune-error');
    expect(fondDesZones({ confort: 0.3, securite: 0.5 }, { rouge: false })).not.toContain('--tune-error');
  });
});

describe('#8920 — règles d\'affichage', () => {
  it('l\'ampli fait foi, sauf juste après un geste local', () => {
    const z = { ...AIR, device_volume_observation: obs(-24) };
    expect(dbAffiche(z, COURSE, -52, 0, 10_000_000)).toBe(-24);
    expect(dbAffiche(z, COURSE, -52, 10_000_000 - 100, 10_000_000)).toBe(-52);
    expect(dbAffiche(z, COURSE, -52, 10_000_000 - GRACE_DU_GESTE_MS, 10_000_000)).toBe(-24);
    expect(dbAffiche(AIR, COURSE, -52)).toBe(-52);
    // Un relevé d'un autre appareil n'est jamais affiché.
    expect(dbAffiche({ ...z, output_device_id: 'autre' }, COURSE, -52)).toBe(-52);
  });

  it('butées des boutons', () => {
    expect(plusEnButeeAir(AIR, COURSE, -45.5)).toBe(false);
    expect(plusEnButeeAir(AIR, COURSE, -45)).toBe(true);
    expect(plusEnButeeAir(AIR, COURSE, -12)).toBe(true);
    expect(plusEnButeeAir({ ...AIR, volume_limit_safety_device_db: null }, COURSE, -10.5)).toBe(false);
    expect(plusEnButeeAir({ ...AIR, volume_limit_safety_device_db: null }, COURSE, -10)).toBe(true);
    expect(moinsEnButeeAir(COURSE, -80)).toBe(true);
    expect(moinsEnButeeAir(COURSE, -79.5)).toBe(false);
  });
});

describe('#8920 — configuration d\'une zone AIR', () => {
  const RATES = [0, 44100, 48000, 88200, 96000, 176400, 192000, 352800, 384000, 705600];
  it('192 kHz au plus, DoP ou PCM, pas de volume fixe ; contre-épreuve DLNA', () => {
    expect(frequencesProposees(AIR, RATES, (r) => r)).toEqual([0, 44100, 48000, 88200, 96000, 176400, 192000]);
    expect(frequencesProposees({ output_type: 'dlna' }, RATES, (r) => r)).toEqual(RATES);
    expect(modesDsdProposes(AIR, ['auto', 'native', 'dop', 'pcm'])).toEqual(['dop', 'pcm']);
    expect(modesDsdProposes({ output_type: 'dlna' }, ['auto', 'native', 'dop', 'pcm'])).toHaveLength(4);
    expect(volumeFixePropose(AIR)).toBe(false);
    expect(volumeFixePropose({ output_type: 'dlna' })).toBe(true);
    expect(estAir(null)).toBe(false);
  });

  it('marque « Devialet » pré-remplie, choix de l\'utilisateur respecté', () => {
    expect(marqueInitiale(AIR)).toBe('Devialet');
    expect(marqueInitiale({ ...AIR, brand: 'Autre marque' })).toBe('Autre marque');
    expect(marqueInitiale({ output_type: 'dlna' })).toBe('');
    expect(MODELES_DEVIALET).toEqual([
      'D-Premier', 'D110', 'D170', 'D240', 'D120', 'D200', 'D250', 'D400', 'D800', 'D900', 'D1000',
      'D140 Pro', 'D220 Pro', 'D250 Pro', 'D440 Pro', 'D1000 Pro', 'Astra',
    ]);
  });

  it('les écrans branchent ces règles', () => {
    const lire = (f: string) => readFileSync(resolve(__dirname, f), 'utf-8');
    const reglages = lire('../../components/v2/SettingsV2.svelte');
    expect(reglages).toContain('frequencesProposees(z, RATES');
    expect(reglages).toContain('data-air-sans-volume-fixe');
    expect(reglages).toMatch(/\{#if !estAir\(z\)\}<option value="auto">/);
    expect(lire('../../components/partages/ZoneConfigModal.svelte')).toContain('{#if !estAir(zone)}');
    expect(lire('../../components/partages/ZoneDeviceEditor.svelte')).toContain('marqueInitiale(zone)');
    expect(lire('../../components/partages/TransportBar.svelte')).toContain('data-air-sans-plein-volume');
  });
});

describe('#8920 — textes dans les 15 langues', () => {
  const LANGUES: Record<string, Record<string, string>> = { fr, en, de, es, it: it_, zh, ja, ko, ro, sv, hu, vi: vi_, el, nb, pl } as any;
  it.each(Object.keys(LANGUES))('%s', (l) => {
    for (const cle of ['zoneConfig.airFixedVolumeUnavailable', 'audiophile.lockVolumeUnavailableAir']) {
      const v = LANGUES[l][cle];
      expect(typeof v, `${l} ${cle}`).toBe('string');
      expect(v).toContain('Devialet AIR');
      if (l !== 'en') expect(v, `${l} ${cle} non traduit`).not.toBe((en as any)[cle]);
    }
    expect((LANGUES[l] as any)['volume.deviceObserved'], 'la ligne de débogage est retirée').toBeUndefined();
  });
});
