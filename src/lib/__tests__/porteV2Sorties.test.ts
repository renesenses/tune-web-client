// @vitest-environment jsdom
//
// Phase 5 — AUCUNE PERTE D'ACCÈS : sorties (appairage AirPlay par PIN,
// préréglage d'appareil, envoi de fichier) en v2.
//
// Avant ce portage, ces cinq fonctions n'étaient appelées que par des écrans
// que la phase 5 supprime :
//   - `startAirplayPairing`, `getAirplayPairStatus`, `submitAirplayPairPin` —
//     `AirplayPairingModal`, ouverte depuis `ZoneManagerView` ;
//   - `getZoneDevicePresets` — `DevicesSettings` ;
//   - `uploadAudioFile` — le dépôt de fichiers de `QueueView`.
//
// 🔴 Chaque témoin MONTE l'écran v2 et fait le geste : cliquer, taper le code,
// choisir un fichier, le déposer.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';

const startAirplayPairing = vi.fn();
const getAirplayPairStatus = vi.fn();
const submitAirplayPairPin = vi.fn();
const getZoneDevicePresets = vi.fn();
const applyZoneDevicePreset = vi.fn();
const uploadAudioFile = vi.fn();
const addToQueue = vi.fn();

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return {
    ...actual,
    startAirplayPairing: (id: string) => startAirplayPairing(id),
    getAirplayPairStatus: (id: string) => getAirplayPairStatus(id),
    submitAirplayPairPin: (id: string, pin: string) => submitAirplayPairPin(id, pin),
    getZoneDevicePresets: (id: number) => getZoneDevicePresets(id),
    applyZoneDevicePreset: (id: number, s: Record<string, unknown>) => applyZoneDevicePreset(id, s),
    uploadAudioFile: (f: File) => uploadAudioFile(f),
    addToQueue: (id: number, b: unknown) => addToQueue(id, b),
    getZones: vi.fn(async () => ZONES),
    listStereoPairs: vi.fn(async () => []),
    getZonesDoublons: vi.fn(async () => []),
    getQueue: vi.fn(async () => ({ tracks: [], position: 0 })),
  };
});

import AppairageAirplayV2 from '../../components/v2/AppairageAirplayV2.svelte';
import PrereglageAppareilV2 from '../../components/v2/PrereglageAppareilV2.svelte';
import ZonesV2 from '../../components/v2/ZonesV2.svelte';
import QueueV2 from '../../components/v2/QueueV2.svelte';
import SettingsV2 from '../../components/v2/SettingsV2.svelte';
import { zones, currentZoneId } from '../stores/zones';
import { preferences } from '../stores/preferences';
import { ecrireVueZones } from '../vueZones';
import lFr from '../locales/fr';

const fr = lFr as unknown as Record<string, string>;

const ZONES = [
  { id: 1, name: 'Salon', state: 'stopped', volume: 0.4, output_type: 'airplay2',
    output_device_id: 'airplay2:AA:BB:CC:DD:EE:FF' },
  { id: 2, name: 'Bureau', state: 'stopped', volume: 0.3, output_type: 'dlna',
    output_device_id: 'uuid:eversolo', brand: 'Eversolo', model: 'DMP-A6' },
];

class ResizeObserverInerte { observe() {} unobserve() {} disconnect() {} }

let hote: HTMLDivElement | null = null;
let monte: Record<string, any> | null = null;

function poser(composant: any, props: Record<string, unknown> = {}): HTMLDivElement {
  hote = document.createElement('div');
  hote.className = 'tune-v2';
  document.body.appendChild(hote);
  monte = mount(composant, { target: hote, props });
  flushSync();
  return hote;
}
async function attendre(tours = 8) {
  for (let i = 0; i < tours; i++) { await new Promise((r) => setTimeout(r, 0)); flushSync(); }
}
function bouton(el: HTMLElement, texte: string): HTMLButtonElement {
  const b = [...el.querySelectorAll('button')].find((x) => (x.textContent ?? '').trim() === texte);
  expect(b, `bouton « ${texte} » introuvable`).toBeDefined();
  return b as HTMLButtonElement;
}
function fichierAudio(nom = 'prise-live.flac'): File {
  return new File([new Uint8Array([1, 2, 3])], nom, { type: 'audio/flac' });
}

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', ResizeObserverInerte);
  // Le catalogue « Tune tested » part sur mozaiklabs.fr : réponse vide.
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ version: 1, count: 0, devices: [] }),
    { headers: { 'content-type': 'application/json' } })));
  for (const f of [startAirplayPairing, getAirplayPairStatus, submitAirplayPairPin, getZoneDevicePresets,
    applyZoneDevicePreset, uploadAudioFile, addToQueue]) f.mockReset();
  startAirplayPairing.mockResolvedValue({ ok: true, status: 'starting' });
  submitAirplayPairPin.mockResolvedValue({ ok: true });
  getZoneDevicePresets.mockResolvedValue({ presets: [
    { settings: { dlna_native_flac: true }, output_type: 'dlna', occurrences: 4 },
  ] });
  applyZoneDevicePreset.mockImplementation(async (id: number) => ({ ...ZONES[1], id, dlna_native_flac: true }));
  uploadAudioFile.mockResolvedValue({ file_id: 'f1', file_path: '/tmp/tune-upload/prise-live.flac',
    title: 'Prise live', artist: 'Moi', album: 'Démo', duration_ms: 61000, format: 'flac' });
  addToQueue.mockResolvedValue({ queue_length: 1 });
  zones.set(ZONES as never);
  currentZoneId.set(1);
  preferences.update((p) => ({ ...p, settingsLevel: 'expert' }));
});

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  hote?.remove();
  hote = null;
  zones.set([]);
  currentZoneId.set(null);
  localStorage.clear();
  vi.unstubAllGlobals();
});

describe('appairage AirPlay 2 par code PIN (#1135)', () => {
  it('Zones v2 (liste) : une zone AirPlay porte le bouton, qui ouvre le panneau', async () => {
    ecrireVueZones('liste');
    const el = poser(ZonesV2);
    await attendre();
    const b = el.querySelector(`button.appairer[aria-label="${fr['zone.airplayPair']}"]`) as HTMLButtonElement | null;
    expect(b, 'pas de bouton d’appairage sur la zone AirPlay').not.toBeNull();
    // Une seule zone AirPlay sur deux : la zone DLNA n'a pas le bouton.
    expect(el.querySelectorAll('button.appairer')).toHaveLength(1);
    b!.click();
    await attendre();
    bouton(el, fr['airplay.pairStart']).click();
    await attendre();
    expect(startAirplayPairing).toHaveBeenCalledWith('airplay2:AA:BB:CC:DD:EE:FF');
  });

  it('démarrer, attendre le code, l’envoyer, puis connecté', async () => {
    // Le récepteur réclame son code tant qu'on ne l'a pas envoyé.
    getAirplayPairStatus.mockImplementation(async () =>
      ({ status: submitAirplayPairPin.mock.calls.length ? 'connected' : 'pin_requested' }));
    const onClose = vi.fn();
    const el = poser(AppairageAirplayV2, { deviceId: 'airplay2:AA', deviceName: 'TV', onClose, intervalle: 0 });
    bouton(el, fr['airplay.pairStart']).click();
    await attendre();
    expect(startAirplayPairing).toHaveBeenCalledWith('airplay2:AA');
    expect(getAirplayPairStatus).toHaveBeenCalledWith('airplay2:AA');
    const champ = el.querySelector('input.pin') as HTMLInputElement;
    expect(champ, 'le champ du code n’est pas apparu sur pin_requested').not.toBeNull();
    champ.value = '4821';
    champ.dispatchEvent(new Event('input', { bubbles: true }));
    flushSync();
    bouton(el, fr['airplay.pairSubmit']).click();
    await attendre();
    expect(submitAirplayPairPin).toHaveBeenCalledWith('airplay2:AA', '4821');
    expect(el.textContent).toContain(fr['airplay.pairConnected']);
  });

  it('un échec du démon se lit, et se relance', async () => {
    getAirplayPairStatus.mockResolvedValue({ status: 'failed:mauvais code' });
    const el = poser(AppairageAirplayV2, { deviceId: 'airplay2:AA', onClose: () => {}, intervalle: 0 });
    bouton(el, fr['airplay.pairStart']).click();
    await attendre();
    expect(el.textContent).toContain('mauvais code');
    expect(bouton(el, fr['airplay.pairRetry'])).toBeDefined();
  });
});

describe('préréglage communautaire d’appareil (#1743)', () => {
  it('proposé pour un appareil identifié sans réglage local, appliqué au clic', async () => {
    const el = poser(PrereglageAppareilV2, { zone: ZONES[1] });
    await attendre();
    expect(getZoneDevicePresets).toHaveBeenCalledWith(2);
    expect(el.textContent).toContain(fr['devices.presetTitle'].replace('{count}', '4'));
    bouton(el, fr['devices.presetApply']).click();
    await attendre();
    expect(applyZoneDevicePreset).toHaveBeenCalledWith(2, { dlna_native_flac: true });
    expect(el.querySelector('.preset')).toBeNull();
  });

  it('muet pour un appareil non identifié, ou sous le seuil de trois', async () => {
    let el = poser(PrereglageAppareilV2, { zone: ZONES[0] });
    await attendre();
    expect(getZoneDevicePresets).not.toHaveBeenCalled();
    unmount(monte!); hote!.remove();
    getZoneDevicePresets.mockResolvedValue({ presets: [{ settings: { dlna_lpcm: true }, occurrences: 2 }] });
    el = poser(PrereglageAppareilV2, { zone: ZONES[1] });
    await attendre();
    expect(el.querySelector('.preset')).toBeNull();
  });

  it('Réglages v2 → Appareils → Réglages par zone interroge le catalogue', async () => {
    const el = poser(SettingsV2);
    await attendre();
    bouton(el, fr['settings.tabDevices']).click();
    await attendre();
    expect(getZoneDevicePresets).toHaveBeenCalledWith(2);
    expect(el.textContent).toContain(fr['devices.presetApply']);
  });
});

describe('envoi d’un fichier audio hors bibliothèque dans la file', () => {
  it('« Ajouter un fichier » : envoi puis ajout à la file de la zone', async () => {
    const el = poser(QueueV2);
    await attendre();
    const champ = el.querySelector('input[type="file"]') as HTMLInputElement;
    expect(champ, 'pas de sélecteur de fichier dans la file v2').not.toBeNull();
    expect(bouton(el, fr['v2.queue.addFile'])).toBeDefined();
    Object.defineProperty(champ, 'files', { value: [fichierAudio(), fichierAudio('notes.txt')], configurable: true });
    champ.dispatchEvent(new Event('change', { bubbles: true }));
    await attendre();
    // Le .txt est écarté : seul le fichier audio part.
    expect(uploadAudioFile).toHaveBeenCalledTimes(1);
    expect(addToQueue).toHaveBeenCalledWith(1, expect.objectContaining({
      source: 'upload', source_id: '/tmp/tune-upload/prise-live.flac', title: 'Prise live', duration_ms: 61000,
    }));
  });

  it('le dépôt d’un fichier sur la file passe par le même chemin', async () => {
    const el = poser(QueueV2);
    await attendre();
    const zone = el.querySelector('section.v2-queue') as HTMLElement;
    const depot = new Event('drop', { bubbles: true, cancelable: true }) as any;
    depot.dataTransfer = { types: ['Files'], files: [fichierAudio()] };
    zone.dispatchEvent(depot);
    await attendre();
    expect(uploadAudioFile).toHaveBeenCalledTimes(1);
    expect(addToQueue).toHaveBeenCalledWith(1, expect.objectContaining({ source: 'upload' }));
  });
});
