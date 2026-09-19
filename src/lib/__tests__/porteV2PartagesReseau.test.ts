// @vitest-environment jsdom
//
// Phase 5 — AUCUNE PERTE D'ACCÈS : les partages réseau (SMB) en v2.
//
// `discoverSmbShares`, `scanHost`, `testSmbConnection`, `mountSmbShare` (de
// `SmbWizard`) et `listSmbMounts` (de `SettingsView`, #2069) n'avaient aucun
// appelant en v2. Sans l'ancienne interface, un NAS ne s'ajoutait plus à la
// bibliothèque depuis l'interface, et un montage en échec ne se voyait plus.
//
// 🔴 Les témoins MONTENT l'écran et CLIQUENT. Les réponses stubées sont celles
// que le serveur rend VRAIMENT (`network.rs`) : un hôte découvert SANS champ
// `shares` (#3637), et `scan-host` qui rend un tableau d'OBJETS.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';

const discoverSmbShares = vi.fn();
const scanHost = vi.fn();
const testSmbConnection = vi.fn();
const mountSmbShare = vi.fn();
const listSmbMounts = vi.fn();
const addMusicDir = vi.fn();
const triggerScan = vi.fn();

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return {
    ...actual,
    discoverSmbShares: () => discoverSmbShares(),
    scanHost: (...a: unknown[]) => scanHost(...a),
    testSmbConnection: (...a: unknown[]) => testSmbConnection(...a),
    mountSmbShare: (...a: unknown[]) => mountSmbShare(...a),
    listSmbMounts: () => listSmbMounts(),
    addMusicDir: (p: string) => addMusicDir(p),
    triggerScan: (...a: unknown[]) => triggerScan(...a),
    getConfig: vi.fn(async () => ({ music_dirs: [] })),
    getScanSchedule: vi.fn(async () => ({ enabled: false, time: '03:00' })),
    getScanStatus: vi.fn(async () => ({ scanning: false })),
  };
});

import PartagesReseauV2 from '../../components/v2/PartagesReseauV2.svelte';
import SettingsV2 from '../../components/v2/SettingsV2.svelte';
import { V2_SETTINGS } from '../v2Settings';
import { preferences } from '../stores/preferences';
import lFr from '../locales/fr';

const fr = lFr as unknown as Record<string, string>;

class ResizeObserverInerte { observe() {} unobserve() {} disconnect() {} }

const HOTE_DECOUVERT = { id: 'smb://192.168.1.50', name: 'NAS-Salon', host: '192.168.1.50',
  hostname: 'nas-salon.local', port: 445, protocol: 'smb', available: true };
const PARTAGES = [
  { name: 'Musique', type: 'Disk', host: '192.168.1.50', protocol: 'smb', path: '//192.168.1.50/Musique' },
  { name: 'Photos', type: 'Disk', host: '192.168.1.50', protocol: 'smb', path: '//192.168.1.50/Photos' },
];

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
async function attendre(tours = 6) {
  for (let i = 0; i < tours; i++) { await new Promise((r) => setTimeout(r, 0)); flushSync(); }
}
function bouton(el: HTMLElement, texte: string): HTMLButtonElement {
  const b = [...el.querySelectorAll('button')].find((x) => (x.textContent ?? '').trim().startsWith(texte));
  expect(b, `bouton « ${texte} » introuvable`).toBeDefined();
  return b as HTMLButtonElement;
}
async function cliquer(el: HTMLElement, texte: string) { bouton(el, texte).click(); await attendre(); }

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', ResizeObserverInerte);
  for (const f of [discoverSmbShares, scanHost, testSmbConnection, mountSmbShare, listSmbMounts, addMusicDir, triggerScan]) f.mockReset();
  discoverSmbShares.mockResolvedValue([HOTE_DECOUVERT]);
  scanHost.mockResolvedValue(PARTAGES);
  testSmbConnection.mockResolvedValue({ ok: true });
  mountSmbShare.mockResolvedValue({ mount_path: '/mnt/tune/nas-musique', id: 7 });
  listSmbMounts.mockResolvedValue([]);
  addMusicDir.mockResolvedValue({ music_dirs: ['/mnt/tune/nas-musique'] });
  triggerScan.mockResolvedValue({});
  preferences.update((p) => ({ ...p, settingsLevel: 'beginner' }));
});

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  hote?.remove();
  hote = null;
  vi.unstubAllGlobals();
});

describe('la carte des Réglages v2 porte « Partages réseau »', () => {
  it('dans l’onglet Bibliothèque, au niveau débutant, juste après les dossiers', () => {
    const lib = V2_SETTINGS.find((t) => t.id === 'library')!;
    const ids = lib.sections.map((s) => s.id);
    expect(ids).toContain('networkShares');
    expect(ids.indexOf('networkShares')).toBe(ids.indexOf('musicDirs') + 1);
    expect(lib.sections.find((s) => s.id === 'networkShares')!.min).toBe('beginner');
  });

  it('Réglages v2 → Bibliothèque affiche l’accès à l’assistant', async () => {
    const el = poser(SettingsV2);
    await attendre();
    await cliquer(el, fr['settings.tabLibrary']);
    expect(bouton(el, fr['settings.addSmbShare'])).toBeDefined();
    expect(listSmbMounts).toHaveBeenCalled();
  });
});

describe('assistant SMB v2 — de la découverte au scan', () => {
  it('découvrir, choisir l’hôte, le partage, tester, monter, ajouter, analyser', async () => {
    const dossiers = vi.fn();
    const el = poser(PartagesReseauV2, { onDossiersChanges: dossiers });
    await attendre();
    await cliquer(el, fr['settings.addSmbShare']);
    await cliquer(el, fr['smb.scanNetwork']);
    expect(discoverSmbShares).toHaveBeenCalledTimes(1);

    await cliquer(el, 'NAS-Salon');
    // #3637 : l'hôte découvert n'a pas de partages ; on les demande à scan-host
    // avec l'HÔTE, jamais à /network/shares/{id}.
    expect(scanHost).toHaveBeenCalledWith('192.168.1.50', 'smb', undefined, undefined);
    expect(el.textContent).not.toContain('[object Object]');

    await cliquer(el, 'Musique');
    await cliquer(el, fr['smb.testConnection']);
    expect(testSmbConnection).toHaveBeenCalledWith('192.168.1.50', 'Musique', 'guest', undefined);
    expect(el.textContent).toContain(fr['smb.connectionSuccess']);

    await cliquer(el, fr['smb.mountShare']);
    expect(mountSmbShare).toHaveBeenCalledWith('192.168.1.50', 'Musique', 'guest', undefined);
    expect(el.textContent).toContain('/mnt/tune/nas-musique');

    await cliquer(el, fr['smb.addToLibrary']);
    expect(addMusicDir).toHaveBeenCalledWith('/mnt/tune/nas-musique');
    expect(dossiers).toHaveBeenCalledWith(['/mnt/tune/nas-musique']);

    await cliquer(el, fr['smb.scanLibrary']);
    expect(triggerScan).toHaveBeenCalledWith('/mnt/tune/nas-musique');
  });

  it('une adresse Windows complète : l’hôte est extrait, le partage cité présélectionné (#1846)', async () => {
    const el = poser(PartagesReseauV2);
    await attendre();
    await cliquer(el, fr['settings.addSmbShare']);
    const champ = el.querySelector('input.txt') as HTMLInputElement;
    champ.value = '\\\\192.168.1.50\\musique\\Albums';
    champ.dispatchEvent(new Event('input', { bubbles: true }));
    await attendre();
    // « Scanner » est aussi le début de « Scanner le réseau » : le bouton de
    // l'adresse est désigné par sa classe.
    (el.querySelector('button.sonder') as HTMLButtonElement).click();
    await attendre();
    expect(scanHost).toHaveBeenCalledWith('192.168.1.50', 'smb', undefined, undefined);
    // Présélection insensible à la casse : le bouton de montage est là.
    expect(bouton(el, fr['smb.mountShare']).disabled).toBe(false);
  });

  it('un montage en échec se voit, avec sa cause (#2069)', async () => {
    listSmbMounts.mockResolvedValue([{ id: 3, server: 'nas', share: 'Musique', mount_path: '/mnt/x',
      username: null, active: true, mounted: false, mount_state: 'failed',
      last_mount_error: 'mount error(13): Permission denied', smb_version: null }]);
    const el = poser(PartagesReseauV2);
    await attendre();
    expect(el.textContent).toContain(fr['settings.smbNotMounted']);
    expect(el.textContent).toContain('Permission denied');
  });
});
