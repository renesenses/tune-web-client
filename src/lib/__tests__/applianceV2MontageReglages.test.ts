// @vitest-environment jsdom
//
// Les gestes d'appliance portés en v2 (voir `applianceV2Phase5.test.ts`) ne
// servent à rien s'ils ne sont pas MONTÉS dans les Réglages. Ce témoin ouvre
// le vrai `SettingsV2` à l'onglet Système, niveau Expert, et vérifie que :
//  · sur une appliance (`config.appliance = true`), « Éteindre » est à l'écran
//    et l'inventaire du stockage est demandé au serveur ;
//  · ailleurs, ni l'un ni l'autre — les routes y rendent 404.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';

let configServeur: Record<string, unknown> = {};
const getApplianceStorage = vi.fn();
const getApplianceDataStatus = vi.fn();

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return {
    ...actual,
    apiFetch: vi.fn(async () => ({} as any)),
    getConfig: vi.fn(async () => configServeur),
    getHealth: vi.fn(async () => ({ status: 'ok' })),
    getStats: vi.fn(async () => ({})),
    getScanSchedule: vi.fn(async () => ({ enabled: false, time: '03:00' })),
    getScanStatus: vi.fn(async () => ({ scanning: false })),
    getScanReport: vi.fn(async () => null),
    listServiceTokens: vi.fn(async () => []),
    getApplianceStatus: vi.fn(async () => ({ appliance: true, wifi: [] })),
    applianceWifiScan: vi.fn(async () => ({ networks: [] })),
    getApplianceStorage: (...a: unknown[]) => getApplianceStorage(...a),
    getApplianceDataStatus: (...a: unknown[]) => getApplianceDataStatus(...a),
  };
});

import SettingsV2 from '../../components/v2/SettingsV2.svelte';
import { preferences } from '../stores/preferences';
import lFr from '../locales/fr';
const fr = lFr as unknown as Record<string, string>;

class ResizeObserverInerte { observe() {} unobserve() {} disconnect() {} }
const respirer = () => new Promise((r) => setTimeout(r, 0));
async function laisserFiler() { for (let i = 0; i < 8; i++) await respirer(); flushSync(); }

let hote: HTMLDivElement | null = null;
let monte: Record<string, any> | null = null;

async function ouvrirSysteme(): Promise<HTMLDivElement> {
  preferences.update((p) => ({ ...p, settingsLevel: 'expert' }));
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(SettingsV2, { target: hote, props: {} });
  flushSync();
  await laisserFiler();
  const onglet = [...hote.querySelectorAll('button')].find(
    (b) => (b.textContent ?? '').trim() === fr['settings.tabSystem'],
  ) as HTMLButtonElement | undefined;
  expect(onglet, 'onglet Système introuvable').toBeDefined();
  onglet!.click();
  flushSync();
  await laisserFiler();
  return hote;
}

const aLeBouton = (el: HTMLElement, libelle: string) =>
  [...el.querySelectorAll('button')].some((b) => (b.textContent ?? '').trim() === libelle);

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', ResizeObserverInerte);
  getApplianceStorage.mockReset().mockResolvedValue({ volumes: [], disks: [], unmounted_partitions: [] });
  getApplianceDataStatus.mockReset().mockResolvedValue({
    db_path: '/var/lib/tune/tune.db', artwork_dir: '', on_external: false, volume_present: true, data_size_bytes: 0, job: null,
  });
});

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  hote?.remove();
  hote = null;
  vi.unstubAllGlobals();
});

describe('Réglages v2 › Système — appliance Tune OS', () => {
  it('sur une appliance : « Éteindre » et le stockage sont là', async () => {
    configServeur = { appliance: true };
    const el = await ouvrirSysteme();
    expect(aLeBouton(el, fr['diagnostics.shutdown']), '« Éteindre » absent des Réglages v2').toBe(true);
    expect(getApplianceStorage, 'l’inventaire du stockage n’est jamais demandé').toHaveBeenCalled();
    expect(el.textContent).toContain('/var/lib/tune/tune.db');
  });

  it('hors appliance : rien de tout cela', async () => {
    configServeur = { appliance: false };
    const el = await ouvrirSysteme();
    expect(aLeBouton(el, fr['diagnostics.shutdown'])).toBe(false);
    expect(getApplianceStorage).not.toHaveBeenCalled();
  });
});
