// @vitest-environment jsdom
//
// renesenses/tune-web-client#1865 — une zone ARRÊTÉE affichait la pochette du
// dernier morceau et masquait la photo de l'appareil.
//
// La vignette se décidait sur `current_track` seul. Or la piste courante
// survit à un arrêt (web#1652) : la photo que Réglages › Appareils promet
// « quand rien n'y joue » (`v2.zone.deviceImageHint`) n'apparaissait jamais,
// et une photo changée restait invisible sur l'écran Zones.
//
// Ce banc MONTE l'écran Zones en grille et regarde ce que chaque carte dessine.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import ZonesV2 from '../../components/v2/ZonesV2.svelte';
import { zones, currentZoneId } from '../stores/zones';
import { vignetteDeZone } from '../vueZones';
import { locale } from '../i18n';

const PISTE = { title: 'Dream Within A Dream', album_id: 42, cover_path: 'covers/propaganda.jpg' };
const PHOTO = 'zone_images/marantz-av7706.jpg';

let host: HTMLDivElement;
let component: ReturnType<typeof mount> | undefined;
let serverZones: Record<string, unknown>[];
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
  serverZones = [
    // Le cas du testeur : arrêtée, piste conservée, photo posée.
    { id: 1, name: 'Marantz DLNA', state: 'stopped', output_type: 'dlna', current_track: PISTE, image_path: PHOTO },
    { id: 2, name: 'Salon', state: 'playing', output_type: 'dlna', current_track: PISTE, image_path: PHOTO },
    { id: 3, name: 'Chambre', state: 'paused', output_type: 'airplay', current_track: PISTE, image_path: PHOTO },
    // Arrêtée, piste conservée, SANS photo : la pochette reste mieux que rien.
    { id: 4, name: 'This Computer', state: 'stopped', output_type: 'local', current_track: PISTE },
  ];
  zones.set(serverZones as never);
  currentZoneId.set(2);
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.endsWith('/zones')) return response(serverZones);
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

describe('#1865 — la règle de la vignette', () => {
  it('suit l’ÉTAT de lecture, pas la seule présence d’une piste', () => {
    expect(vignetteDeZone({ state: 'stopped', current_track: PISTE, image_path: PHOTO })).toBe('photo');
    expect(vignetteDeZone({ state: 'playing', current_track: PISTE, image_path: PHOTO })).toBe('pochette');
    expect(vignetteDeZone({ state: 'paused', current_track: PISTE, image_path: PHOTO })).toBe('pochette');
    // Sans `state` (serveur ancien) : rien ne prouve que ça joue → photo.
    expect(vignetteDeZone({ current_track: PISTE, image_path: PHOTO })).toBe('photo');
    // Sans photo, la dernière pochette plutôt que l'icône (#1394).
    expect(vignetteDeZone({ state: 'stopped', current_track: PISTE })).toBe('pochette');
    expect(vignetteDeZone({ state: 'stopped', image_path: PHOTO })).toBe('photo');
    expect(vignetteDeZone({ state: 'stopped', image_path: '' })).toBe('type');
    expect(vignetteDeZone({ state: 'playing' })).toBe('type');
  });
});

describe('#1865 — l’écran Zones en grille', () => {
  it('🔴 une zone ARRÊTÉE montre la photo de son appareil, pas la pochette du dernier morceau', async () => {
    component = mount(ZonesV2, { target: host });
    flushSync();
    await settle();
    const cartes = [...host.querySelectorAll<HTMLElement>('.grille .carte')];
    expect(cartes.length).toBe(4);
    const vignette = (i: number) => cartes[i].querySelector<HTMLElement>('.cpoch')!;
    const src = (i: number) => vignette(i).querySelector('img')?.getAttribute('src') ?? '';

    // Arrêtée + photo : la photo, et le clic active la zone (pas Lecture en cours).
    expect(vignette(0).classList.contains('crepli')).toBe(true);
    expect(src(0)).toContain('marantz-av7706');
    expect(src(0)).not.toContain('propaganda');

    // En lecture et en pause : la pochette, qui ouvre Lecture en cours.
    for (const i of [1, 2]) {
      expect(vignette(i).classList.contains('crepli'), `carte ${i}`).toBe(false);
      expect(src(i), `carte ${i}`).toContain('propaganda');
    }

    // Arrêtée sans photo : la dernière pochette reste affichée.
    expect(src(3)).toContain('propaganda');
  });
});
