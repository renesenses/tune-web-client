// @vitest-environment jsdom
//
// Appliance Tune OS : stockage, installation, extinction — PORTÉS en v2 avant
// que la phase 5 (web#1257) ne retire l'ancienne interface, seul chemin qui y
// menait (`docs/capacites-sans-chemin-phase5.md`, domaine « Appliance »).
//
// 🔴 CES TÉMOINS MONTENT LES VRAIS COMPOSANTS. `../api` est bouchonné, on
// clique, et l'on RÉPOND à la confirmation dans le bus `dialogs` comme le
// ferait `DialogContainer` sous le doigt d'un humain. Le témoin ne pose jamais
// lui-même l'état qu'il vérifie.
//
// Contre-épreuve (consignée dans la PR) : retirer l'appel à
// `api.applianceRelocateData`, `api.applianceInstallToDisk`,
// `api.applianceMountVolume` ou `api.applianceShutdown` du composant rend le
// témoin correspondant ROUGE ; retirer le `{#if isAppliance}<ApplianceEteindreV2 />`
// de SettingsV2 rend rouge le témoin de montage.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import { get } from 'svelte/store';

const mocks = vi.hoisted(() => ({
  getApplianceDataStatus: vi.fn(),
  getApplianceStorage: vi.fn(),
  applianceRelocateData: vi.fn(),
  applianceMountVolume: vi.fn(),
  applianceInstallToDisk: vi.fn(),
  applianceInstallStatus: vi.fn(),
  applianceShutdown: vi.fn(),
  addMusicDir: vi.fn(),
  restartServer: vi.fn(),
}));

vi.mock('../api', () => mocks);

import ApplianceStockageV2 from '../../components/v2/ApplianceStockageV2.svelte';
import ApplianceEteindreV2 from '../../components/v2/ApplianceEteindreV2.svelte';
import { dialogs } from '../stores/dialogs';
import lFr from '../locales/fr';
const fr = lFr as unknown as Record<string, string>;

const respirer = () => new Promise((r) => setTimeout(r, 0));
async function laisserFiler() { for (let i = 0; i < 6; i++) await respirer(); flushSync(); }

let hote: HTMLDivElement | null = null;
let monte: Record<string, unknown> | null = null;

async function poser(C: any, props: Record<string, unknown> = {}): Promise<HTMLDivElement> {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(C, { target: hote, props });
  flushSync();
  await laisserFiler();
  return hote;
}

function boutonDe(el: HTMLElement, libelle: string): HTMLButtonElement {
  const b = [...el.querySelectorAll('button')].find((x) => (x.textContent ?? '').trim() === libelle);
  expect(b, `bouton « ${libelle} » absent de l'écran`).toBeDefined();
  return b as HTMLButtonElement;
}

async function repondre(valeur: boolean | string | null) {
  const d = get(dialogs)[0];
  expect(d, 'aucune demande en attente dans le bus `dialogs`').toBeDefined();
  dialogs.settle(d.id, valeur);
  await laisserFiler();
}

const VOL_CLE = { device: '/dev/sda2', mount_path: '/', fs: 'ext4', size_bytes: 32e9, free_bytes: 10e9, uuid: 'u-cle', label: 'TUNEOS', is_data_target: true };
const VOL_SSD = { device: '/dev/sdb1', mount_path: '/mnt/ssd', fs: 'ext4', size_bytes: 500e9, free_bytes: 400e9, uuid: 'u-ssd', label: 'SSD', is_data_target: false };

beforeEach(() => {
  for (const m of Object.values(mocks)) m.mockReset();
  mocks.getApplianceDataStatus.mockResolvedValue({
    db_path: '/var/lib/tune/tune.db', artwork_dir: '/var/lib/tune/art', on_external: false,
    volume_present: true, data_size_bytes: 1_200_000, job: null,
  });
  mocks.getApplianceStorage.mockResolvedValue({
    volumes: [VOL_CLE, VOL_SSD],
    disks: [
      { name: 'sda', size: '32G', model: 'Clé', tran: 'usb', is_boot: true },
      { name: 'nvme0n1', size: '256G', model: 'NVMe', tran: 'nvme', is_boot: false },
    ],
    unmounted_partitions: [
      { name: 'sdc1', uuid: 'u-hdd', fstype: 'ntfs', size: '2T', label: 'Musique', tran: 'sata', disk: 'sdc', disk_model: 'WD' },
    ],
  });
  mocks.restartServer.mockResolvedValue({});
});

afterEach(() => {
  for (const r of get(dialogs)) dialogs.settle(r.id, false);
  if (monte) unmount(monte as any);
  monte = null;
  hote?.remove();
  hote = null;
});

describe('Appliance — stockage (Réglages › Système › Emplacement des données)', () => {
  it('lit l’état et l’inventaire, et ne propose le déplacement que vers un AUTRE volume', async () => {
    const el = await poser(ApplianceStockageV2, { delaiSondage: 0 });
    expect(mocks.getApplianceDataStatus).toHaveBeenCalled();
    expect(mocks.getApplianceStorage).toHaveBeenCalled();
    expect(el.textContent).toContain('/var/lib/tune/tune.db');
    expect(el.textContent).toContain(fr['settings.dataCurrent']);
    expect(el.querySelectorAll('button.deplacer').length).toBe(1);
  });

  it('« Déplacer ici » DEMANDE (danger), puis déplace, sonde et redémarre à la fin', async () => {
    mocks.applianceRelocateData.mockResolvedValue({ started: true });
    const el = await poser(ApplianceStockageV2, { delaiSondage: 0 });
    mocks.getApplianceDataStatus.mockResolvedValue({
      db_path: '/mnt/ssd/tune.db', artwork_dir: '', on_external: true, volume_present: true,
      data_size_bytes: 1, job: { phase: 'done', copied_bytes: 1, total_bytes: 1, error: null, target: 'u-ssd' },
    });
    boutonDe(el, fr['settings.dataMove']).click();
    await laisserFiler();
    expect(get(dialogs)[0]?.danger, 'la confirmation doit être de type danger').toBe(true);
    expect(mocks.applianceRelocateData, 'rien ne part avant la réponse').not.toHaveBeenCalled();
    await repondre(true);
    await laisserFiler();
    expect(mocks.applianceRelocateData).toHaveBeenCalledWith('u-ssd');
    expect(mocks.restartServer).toHaveBeenCalled();
    expect(el.textContent).toContain(fr['settings.dataMoveDone']);
  });

  it('annuler la confirmation ⇒ aucun déplacement', async () => {
    const el = await poser(ApplianceStockageV2, { delaiSondage: 0 });
    boutonDe(el, fr['settings.dataMove']).click();
    await laisserFiler();
    await repondre(false);
    expect(mocks.applianceRelocateData).not.toHaveBeenCalled();
  });

  it('« Utiliser comme dossier musique » monte la partition PUIS l’ajoute à la bibliothèque', async () => {
    mocks.applianceMountVolume.mockResolvedValue({ mount_path: '/media/Musique', label: 'Musique', fstype: 'ntfs' });
    mocks.addMusicDir.mockResolvedValue({});
    const el = await poser(ApplianceStockageV2, { delaiSondage: 0 });
    boutonDe(el, fr['settings.diskUseAsMusic']).click();
    await laisserFiler();
    expect(mocks.applianceMountVolume).toHaveBeenCalledWith('u-hdd');
    expect(mocks.addMusicDir).toHaveBeenCalledWith('/media/Musique');
    expect(el.textContent).toContain(fr['settings.diskMusicAdded'].replace('{name}', 'Musique'));
  });

  it('installation : seul un disque interne non amorçable est offert ; il faut taper EFFACER', async () => {
    mocks.applianceInstallToDisk.mockResolvedValue({ started: true });
    mocks.applianceInstallStatus.mockResolvedValue({ phase: 'done', written_bytes: 4e9, error: null, target: 'nvme0n1' });
    const el = await poser(ApplianceStockageV2, { delaiSondage: 0 });
    const offerts = el.querySelectorAll('button.installer');
    expect(offerts.length, 'la clé de démarrage USB ne doit jamais être offerte').toBe(1);

    (offerts[0] as HTMLButtonElement).click();
    await laisserFiler();
    expect(get(dialogs)[0]?.kind).toBe('prompt');
    await repondre('oui');
    expect(mocks.applianceInstallToDisk, 'une autre saisie que EFFACER ne doit rien effacer').not.toHaveBeenCalled();

    (el.querySelector('button.installer') as HTMLButtonElement).click();
    await laisserFiler();
    await repondre('EFFACER');
    await laisserFiler();
    expect(mocks.applianceInstallToDisk).toHaveBeenCalledWith('nvme0n1');
    expect(mocks.applianceInstallStatus).toHaveBeenCalled();
    expect(el.textContent).toContain(fr['settings.installDone']);
  });
});

describe('Appliance — « Éteindre » (Réglages › Système › Santé du serveur)', () => {
  it('DEMANDE (danger) avant d’éteindre ; annuler n’éteint rien', async () => {
    const el = await poser(ApplianceEteindreV2);
    boutonDe(el, fr['diagnostics.shutdown']).click();
    await laisserFiler();
    expect(get(dialogs)[0]?.danger).toBe(true);
    await repondre(false);
    expect(mocks.applianceShutdown).not.toHaveBeenCalled();
  });

  it('confirmer éteint ; la coupure de transport attendue laisse le bouton en « Extinction… »', async () => {
    mocks.applianceShutdown.mockRejectedValue(new Error('Failed to fetch'));
    const el = await poser(ApplianceEteindreV2);
    boutonDe(el, fr['diagnostics.shutdown']).click();
    await laisserFiler();
    await repondre(true);
    expect(mocks.applianceShutdown).toHaveBeenCalledTimes(1);
    const b = el.querySelector('button.eteindre') as HTMLButtonElement;
    expect(b.textContent?.trim()).toBe(fr['diagnostics.shuttingDown']);
    expect(b.disabled).toBe(true);
  });

  it('un refus HTTP rend le bouton à nouveau utilisable', async () => {
    mocks.applianceShutdown.mockRejectedValue(new Error('403 interdit'));
    const el = await poser(ApplianceEteindreV2);
    boutonDe(el, fr['diagnostics.shutdown']).click();
    await laisserFiler();
    await repondre(true);
    const b = el.querySelector('button.eteindre') as HTMLButtonElement;
    expect(b.disabled).toBe(false);
  });
});
