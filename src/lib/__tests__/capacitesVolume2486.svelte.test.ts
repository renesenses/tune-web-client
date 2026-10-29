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
import SettingsV2 from '../../components/v2/SettingsV2.svelte';
import { v2SettingsTarget } from '../stores/v2SettingsNav';
import { zones, currentZoneId } from '../stores/zones';
import { stopSeekTimer, zoneVolume } from '../stores/nowPlaying';
import { preferences } from '../stores/preferences';
import { audiophileEnabled, audiophileLockVolume, audiophileGlobalLockVolume } from '../stores/audiophile';
import { activeView } from '../stores/navigation';
import { setupKeyboardShortcuts } from '../keyboard';
import { DELAI_VOLUME_MS } from '../limiteurVolume';
import { notifications } from '../stores/notifications';

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
  for (const n of get(notifications)) notifications.dismiss(n.id);
  host = document.createElement('div'); document.body.appendChild(host);
  audiophileEnabled.set(false); audiophileLockVolume.set(false); audiophileGlobalLockVolume.set(false);
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
      : /\/(devices|outputs|stereo-pairs|group-delays|profiles|playlists|shortcuts|groups)$|\/devices\/all$/.test(u) ? []
      : u.endsWith('/volume/step') ? { zone_id: 1, volume: 0.41, limited: false } : {};
    return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }));
});

afterEach(async () => {
  arreterClavier?.(); arreterClavier = undefined;
  if (component) await unmount(component);
  host.remove(); stopSeekTimer(); zones.set([]); currentZoneId.set(null);
  audiophileEnabled.set(false); audiophileLockVolume.set(false); audiophileGlobalLockVolume.set(false);
  v2SettingsTarget.set(null);
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

  it.each(['zone', 'capacite', 'PURE', 'demontage'])('annule le volume mobile différé après %s', async (changement) => {
    await monter(TransportBar, zone({})); host.querySelector<HTMLButtonElement>('.mobile-volume-btn')!.click(); flushSync();
    const slider = host.querySelector<HTMLInputElement>('.mobile-volume-slider')!;
    input(slider, '0.5'); input(slider, '0.7'); expect(envois).toHaveLength(1);
    if (changement === 'zone') poser(zone({}, 2));
    if (changement === 'capacite') poser(zone(refus));
    if (changement === 'PURE') { audiophileEnabled.set(true); audiophileLockVolume.set(true); flushSync(); }
    if (changement === 'demontage') { await unmount(component!); component = null; }
    await attendre(DELAI_VOLUME_MS + 30); expect(envois).toHaveLength(1);
  });

  it.each([true, false])('le popup mobile sépare volume et sourdine (volume autorisé=%s)', async (volume) => {
    await monter(TransportBar, { ...zone({ can_set_volume: volume, can_mute: !volume }), muted: volume });
    host.querySelector<HTMLButtonElement>('.mobile-volume-btn')!.click(); flushSync();
    const slider = host.querySelector<HTMLInputElement>('.mobile-volume-slider')!;
    const mute = host.querySelector<HTMLButtonElement>('.mobile-mute-btn')!;
    expect(slider.disabled).toBe(!volume); expect(mute.disabled).toBe(volume);
    if (volume) input(slider); else mute.click();
    await stabiliser();
    expect(envois).toHaveLength(1);
    expect(envois[0].url).toMatch(volume ? /\/volume$/ : /\/mute$/);
  });

  it('chaque zone garde ses propres capacités même si la zone sélectionnée refuse le volume', async () => {
    await monter(ZonesV2);
    zones.set([zone(refus), zone({ can_set_volume: true }, 2)]); flushSync(); await stabiliser();
    const sliders = [...host.querySelectorAll<HTMLInputElement>('.vol input[type="range"], .cvol input[type="range"]')];
    const autorises = sliders.filter((slider) => !slider.disabled);
    expect(autorises.length).toBeGreaterThan(0);
    expect(sliders.some((slider) => slider.disabled)).toBe(true);
    input(autorises[0], '60'); await stabiliser();
    expect(envois).toHaveLength(1); expect(envois[0].url).toMatch(/\/zones\/2\/volume$/);
    expect(envois[0].body.volume).toBeCloseTo(0.6);
  });

  it('garde les curseurs des cartes de zone inertes sur refus explicite', async () => {
    await monter(ZonesV2);
    const sliders = [...host.querySelectorAll<HTMLInputElement>('.vol input[type="range"], .cvol input[type="range"]')];
    expect(sliders.length).toBeGreaterThan(0);
    for (const slider of sliders) { expect(slider.disabled, slider.outerHTML).toBe(true); input(slider, '60'); }
    await stabiliser(); expect(envois).toEqual([]);
  });

  it('les raccourcis globaux respectent volume et mute indépendamment', async () => {
    poser(zone(refus)); arreterClavier = setupKeyboardShortcuts();
    touche('ArrowUp'); touche('ArrowDown'); touche('KeyM', 'm'); await stabiliser(); expect(envois).toEqual([]);
    poser(zone({ can_set_volume: true, can_mute: false })); touche('ArrowUp'); touche('KeyM', 'm');
    await stabiliser(); expect(envois).toHaveLength(1); expect(envois[0].url).toMatch(/\/volume$/);
  });

  it.each([refus, undefined])('la confirmation PURE ne demande pas un volume interdit (%j)', async (caps) => {
    v2SettingsTarget.set({ tab: 'general', section: 'playback' });
    await monter(SettingsV2, zone(caps));
    audiophileEnabled.set(true); flushSync();
    const lecture = host.querySelector<HTMLElement>('[data-section="playback"]')!;
    expect(lecture).not.toBeNull();
    lecture.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click(); flushSync();
    expect(envois).toEqual([]);
    const confirmation = lecture.querySelector<HTMLInputElement>('.danger-box input[type="checkbox"]')!;
    expect(confirmation).not.toBeNull(); confirmation.click(); await stabiliser();
    expect(get(audiophileGlobalLockVolume)).toBe(true);
    expect(envois).toHaveLength(caps === refus ? 0 : 1);
    if (caps !== refus) expect(envois[0].body.volume).toBe(1);
  });

  it('le clavier du Grand écran ne contourne pas les capacités', async () => {
    await monter(TvView); arreterClavier = setupKeyboardShortcuts();
    touche('ArrowUp'); touche('ArrowDown'); await stabiliser(); expect(envois).toEqual([]);
    poser(zone({ can_set_volume: true })); touche('ArrowUp'); await stabiliser();
    expect(envois).toHaveLength(1);
  });
});


const plageDecalee = { can_set_volume: true, can_mute: true,
  volume_percent_range: { min: 5, max: 80, step: 7 } };
async function monterVolumePlage(mobile: boolean, z = zone(plageDecalee)) {
  await monter(mobile ? TransportBar : VolumeControl, z);
  if (mobile) { host.querySelector<HTMLButtonElement>('.mobile-volume-btn')!.click(); flushSync(); }
  return host.querySelector<HTMLInputElement>(mobile ? '.mobile-volume-slider' : '.volume-slider')!;
}

describe('#2486 / serveur #7333 — plage de volume annoncée', () => {
  it.each([false, true])('curseur sur la grille5/80/pas7, mobile=%s', async (mobile) => {
    const slider = await monterVolumePlage(mobile);
    expect(Number(slider.min)).toBeCloseTo(0.05);
    expect(Number(slider.max)).toBeCloseTo(0.75);
    expect(Number(slider.step)).toBeCloseTo(0.07);
    input(slider, '0.28'); await stabiliser();
    expect(envois).toHaveLength(1); expect(envois[0].body).toEqual({ volume: 0.26 });
    expect(get(zoneVolume)).toBeCloseTo(0.26);
  });

  it.each([false, true])('les boutons franchissent le cran, sans route step inadaptée, mobile=%s', async (mobile) => {
    await monterVolumePlage(mobile, { ...zone(plageDecalee), volume: 0.26, volume_limit_safety: 1 });
    const boutons = host.querySelectorAll<HTMLButtonElement>(mobile ? '.mobile-step-btn' : '.step-btn');
    boutons[1].click(); await stabiliser();
    expect(envois).toHaveLength(1); expect(envois[0].url).toMatch(/\/volume$/);
    expect(envois[0].body.volume).toBeCloseTo(0.33);
    boutons[0].click(); await stabiliser();
    expect(envois).toHaveLength(2); expect(envois[1].body.volume).toBeCloseTo(0.26);
  });

  it.each([false, true])('minimum5% : moins ne demande pas0, la vraie sourdine reste disponible, mobile=%s', async (mobile) => {
    await monterVolumePlage(mobile, { ...zone(plageDecalee), volume: 0.05 });
    const moins = host.querySelector<HTMLButtonElement>(mobile ? '.mobile-step-btn' : '.step-btn')!;
    expect(moins.disabled).toBe(true); moins.click();
    host.querySelector<HTMLButtonElement>(mobile ? '.mobile-mute-btn' : '.volume-btn')!.click(); await stabiliser();
    expect(envois).toHaveLength(1); expect(envois[0].url).toMatch(/\/mute$/);
    expect(envois[0].body).toEqual({ muted: true });
  });

  it.each([false, true])('arrondi du cran sous la sécurité, mobile=%s', async (mobile) => {
    const slider = await monterVolumePlage(mobile, { ...zone(plageDecalee), volume_limit_safety: 0.3 });
    input(slider, '0.32'); await stabiliser();
    expect(envois).toHaveLength(1); expect(envois[0].body.volume).toBeCloseTo(0.26);
  });

  it.each([false, true])('nouvelle plage annule la consigne différée, mobile=%s', async (mobile) => {
    const slider = await monterVolumePlage(mobile);
    input(slider, '0.26'); input(slider, '0.47'); expect(envois).toHaveLength(1);
    poser(zone({ ...plageDecalee, volume_percent_range: { min: 5, max: 80, step: 5 } }));
    await attendre(DELAI_VOLUME_MS + 30); expect(envois).toHaveLength(1);
  });

  it.each([false, true])('un écho de la même plage conserve la dernière consigne, mobile=%s', async (mobile) => {
    const slider = await monterVolumePlage(mobile);
    input(slider, '0.26'); input(slider, '0.47');
    poser(zone({ ...plageDecalee, volume_percent_range: { ...plageDecalee.volume_percent_range } }));
    await attendre(DELAI_VOLUME_MS + 30);
    expect(envois).toHaveLength(2); expect(envois[1].body.volume).toBeCloseTo(0.47);
  });

  it.each([0.01, 0.28, 0.8, 0.9])('une saisie dB respecte plage et pas (gain=%s)', async (gain) => {
    preferences.update((p) => ({ ...p, volumeDisplay: 'dB' }));
    await monter(VolumeControl, { ...zone(plageDecalee), muted: true });
    const champ = host.querySelector<HTMLInputElement>('.volume-db-input')!;
    input(champ, String(20 * Math.log10(gain))); champ.dispatchEvent(new FocusEvent('blur')); await stabiliser();
    if (gain < 0.05 || gain > 0.8) {
      expect(envois).toEqual([]); expect(get(zoneVolume)).toBeCloseTo(0.4);
      expect(get(notifications).some((n) => n.message.includes('5') && n.message.includes('80') && n.message.includes('7'))).toBe(true);
    } else {
      expect(envois.some((e) => e.body.volume_db != null)).toBe(false);
      const volumes = envois.filter((e) => /\/volume$/.test(e.url));
      expect(volumes).toHaveLength(1); expect(volumes[0].body.volume).toBeCloseTo(gain === 0.28 ? 0.26 : 0.75);
    }
  });

  it('la saisie dB suit aussi l’arrondi entier du setter avant un pas pair', async () => {
    preferences.update((p) => ({ ...p, volumeDisplay: 'dB' }));
    await monter(VolumeControl, zone({ ...plageDecalee, volume_percent_range: { min: 5, max: 80, step: 4 } }));
    const champ = host.querySelector<HTMLInputElement>('.volume-db-input')!;
    input(champ, String(20 * Math.log10(0.066))); champ.dispatchEvent(new FocusEvent('blur')); await stabiliser();
    expect(envois).toHaveLength(1); expect(envois[0].body.volume).toBeCloseTo(0.09);
  });

  it('les cartes de zone affichent et envoient leur propre grille', async () => {
    await monter(ZonesV2, zone(plageDecalee));
    const sliders = [...host.querySelectorAll<HTMLInputElement>('.vol input[type="range"], .cvol input[type="range"]')];
    expect(sliders.length).toBeGreaterThan(0);
    for (const slider of sliders) { expect(Number(slider.min)).toBe(5); expect(Number(slider.max)).toBe(75); expect(Number(slider.step)).toBe(7); }
    input(sliders[0], '28'); await stabiliser();
    expect(envois).toHaveLength(1); expect(envois[0].body.volume).toBeCloseTo(0.26);
  });

  it('le cran des cartes ne dépasse pas la sécurité entre deux niveaux', async () => {
    await monter(ZonesV2, { ...zone(plageDecalee), volume_limit_safety: 0.3 });
    const slider = host.querySelector<HTMLInputElement>('.vol input[type="range"], .cvol input[type="range"]')!;
    input(slider, '32'); await stabiliser();
    expect(envois).toHaveLength(1); expect(envois[0].body.volume).toBeCloseTo(0.26);
  });

  it.each([{ tv: false, courbe: 'linear' }, { tv: true, courbe: 'linear' }, { tv: false, courbe: 'db60' }, { tv: true, courbe: 'db60' }])('clavier : un cran, une seule commande, jamais sous le minimum, TV=$tv/courbe=$courbe', async ({ tv, courbe }) => {
    const z = { ...zone(plageDecalee), volume_curve: courbe };
    if (tv) await monter(TvView, { ...z, volume: 0.26 });
    else poser({ ...z, volume: 0.26 });
    arreterClavier = setupKeyboardShortcuts(); touche('ArrowUp'); await stabiliser();
    expect(envois).toHaveLength(1); expect(envois[0].body.volume).toBeCloseTo(0.33);
    poser({ ...z, volume: 0.05 }); touche('ArrowDown'); await stabiliser();
    expect(envois).toHaveLength(1);
  });

  it.each([{ min: 5, max: 80, step: 7 }, { min: 5, max: 100, step: 7 }, { min: 5, max: 100, step: 5 }])('PURE additionnel : ne substitue pas un autre niveau à100% (%j)', async (plage) => {
    v2SettingsTarget.set({ tab: 'general', section: 'playback' });
    await monter(SettingsV2, zone({ ...plageDecalee, volume_percent_range: plage }));
    audiophileEnabled.set(true); flushSync();
    const lecture = host.querySelector<HTMLElement>('[data-section="playback"]')!;
    lecture.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click(); flushSync();
    lecture.querySelector<HTMLInputElement>('.danger-box input[type="checkbox"]')!.click(); await stabiliser();
    expect(get(audiophileGlobalLockVolume)).toBe(true);
    expect(envois).toHaveLength(plage.step === 5 ? 1 : 0);
    if (plage.step === 5) expect(envois[0].body.volume).toBe(1);
  });

  it.each([{ min: 5, max: 80, step: 0 }, { min: 90, max: 80, step: 7 }])('une plage incohérente ne permet pas de commande inventée (%j)', async (plage) => {
    const slider = await monterVolumePlage(false, zone({ ...plageDecalee, volume_percent_range: plage }));
    expect(slider.disabled).toBe(true); input(slider); await stabiliser(); expect(envois).toEqual([]);
  });

  it('le navigateur garde sa grille locale malgré une plage distante', async () => {
    const slider = await monterVolumePlage(false, zone(plageDecalee, 1, 'browser'));
    expect(slider.min).toBe('0'); expect(slider.max).toBe('1'); expect(slider.step).toBe('0.01');
    input(slider, '0.4'); await stabiliser();
    expect(envois).toHaveLength(1); expect(envois[0].body.volume).toBeCloseTo(0.4);
  });
});
