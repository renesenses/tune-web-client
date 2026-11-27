// @vitest-environment jsdom
//
// Recette rc14 du 24/11, point 8 — authentification coupée, appareil autre
// que la machine du serveur : Réglages › Sauvegarde dans le cloud appelait
// `GET /system/config-backup/cloud/snapshots`, que le serveur refuse par sa
// garde `AdminOuCetteMachine` (403 `auth_required` / `not_local`). L'écran
// affichait une erreur brute.
//
// L'écran lit désormais le droit (`droitActionsMachine`) AVANT de demander la
// liste : sans le droit, il ne l'appelle pas et dit l'explication habituelle.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';

const mocks = vi.hoisted(() => ({
  getAuthActivation: vi.fn(),
  getAuthMe: vi.fn(),
  getCloudBackupStatus: vi.fn(),
  listCloudBackups: vi.fn(),
  enableCloudBackup: vi.fn(),
  disableCloudBackup: vi.fn(),
  backupCloudNow: vi.fn(),
}));
vi.mock('../api', async (importOriginal) => ({ ...(await importOriginal<object>()), ...mocks }));

import SauvegardeCloudV2 from '../../components/v2/SauvegardeCloudV2.svelte';
import { locale } from '../i18n';
import { listeDesInstantanesPermise } from '../sauvegardeCloud';
import { dictionnaire, fr, ONZE_LANGUES } from './onzeDictionnaires';

const attendre = () => new Promise((r) => setTimeout(r, 0));
const respirer = async () => { for (let i = 0; i < 8; i++) await attendre(); flushSync(); };

const ETAT = {
  premium: true, account_linked: true, enabled: true, key_configured: true,
  last_backup_at: '2026-11-24T08:00:00Z', last_attempt_at: null, last_error: null,
  pending_since: null, debounce_minutes: 10, max_snapshots: 3,
};
const COUPEE_RESEAU = { auth_enabled: false, from_this_machine: false, machine_actions_allowed: true, code_required: true, min_password_length: 8 };
const COUPEE_MACHINE = { ...COUPEE_RESEAU, from_this_machine: true, code_required: false };

let hote: HTMLDivElement;
let instance: Record<string, unknown> | null = null;

async function monter() {
  hote = document.createElement('div');
  document.body.append(hote);
  instance = mount(SauvegardeCloudV2, { target: hote });
  await respirer();
}

beforeEach(() => {
  for (const fn of Object.values(mocks)) fn.mockReset();
  mocks.getCloudBackupStatus.mockResolvedValue(ETAT);
  mocks.listCloudBackups.mockResolvedValue({ backups: [], max: 3 });
  locale.set('fr');
});
afterEach(() => {
  if (instance) unmount(instance as any);
  instance = null;
  hote?.remove();
  document.body.innerHTML = '';
});

describe('rc14 point 8 — la liste des instantanés n’est demandée qu’avec le droit', () => {
  it('🔴 auth coupée, appareil distant : aucun appel à /snapshots, explication habituelle', async () => {
    mocks.getAuthActivation.mockResolvedValue(COUPEE_RESEAU);
    await monter();
    expect(mocks.listCloudBackups).not.toHaveBeenCalled();
    const note = hote.querySelector('[data-sauvegarde-hors-machine]');
    expect(note).not.toBeNull();
    expect(note!.textContent).toContain(fr['machineAction.unavailableHere']);
    // Pas d'erreur brute.
    expect(hote.textContent).not.toContain('auth_required');
    expect(hote.querySelector('.errline')).toBeNull();
  });

  it('auth active, compte non administrateur : pas d’appel non plus', async () => {
    mocks.getAuthActivation.mockResolvedValue({ ...COUPEE_RESEAU, auth_enabled: true });
    mocks.getAuthMe.mockResolvedValue({ role: 'user' });
    mocks.getCloudBackupStatus.mockRejectedValue(new Error('admin role required'));
    await monter();
    expect(mocks.getCloudBackupStatus).not.toHaveBeenCalled();
    expect(mocks.listCloudBackups).not.toHaveBeenCalled();
    expect(hote.querySelector('[data-sauvegarde-hors-machine]')!.textContent).toContain(fr['machineAction.adminOnly']);
  });

  it('contre-épreuve : depuis la machine du serveur, la liste est demandée', async () => {
    mocks.getAuthActivation.mockResolvedValue(COUPEE_MACHINE);
    await monter();
    expect(mocks.listCloudBackups).toHaveBeenCalledTimes(1);
    expect(hote.querySelector('[data-sauvegarde-hors-machine]')).toBeNull();
  });

  it('contre-épreuve : serveur ancien (état d’authentification illisible), la liste est demandée', async () => {
    mocks.getAuthActivation.mockResolvedValue(null);
    await monter();
    expect(mocks.listCloudBackups).toHaveBeenCalledTimes(1);
  });

  it.each([false, true])('réseau local autorisé aux actions ordinaires, sauvegarde active %s', async (enabled) => {
    mocks.getCloudBackupStatus.mockResolvedValue({ ...ETAT, enabled });
    mocks.getAuthActivation.mockResolvedValue(COUPEE_RESEAU);
    await monter();
    const boutons = [...hote.querySelectorAll<HTMLButtonElement>('button')];
    expect(boutons).toHaveLength(enabled ? 2 : 1);
    for (const bouton of boutons) {
      const desactive = bouton.textContent?.trim() === fr['cloudBackup.disable'];
      expect(bouton.disabled).toBe(!desactive);
      bouton.click();
    }
    expect(mocks.enableCloudBackup).not.toHaveBeenCalled();
    expect(mocks.disableCloudBackup).toHaveBeenCalledTimes(enabled ? 1 : 0);
    expect(mocks.backupCloudNow).not.toHaveBeenCalled();
    expect(mocks.listCloudBackups).not.toHaveBeenCalled();
  });

  it.each([
    { etat: COUPEE_MACHINE, role: undefined, permis: true },
    { etat: { ...COUPEE_RESEAU, auth_enabled: true }, role: 'admin', permis: true },
    { etat: { ...COUPEE_MACHINE, auth_enabled: true }, role: 'user', permis: false },
  ])('auth $etat.auth_enabled, rôle $role, boutons permis $permis', async ({ etat, role, permis }) => {
    mocks.getAuthActivation.mockResolvedValue(etat);
    mocks.getAuthMe.mockResolvedValue({ role });
    await monter();
    const boutons = [...hote.querySelectorAll<HTMLButtonElement>('button')];
    expect(boutons).toHaveLength(2);
    expect(boutons.map((b) => b.disabled)).toEqual([!permis, !permis]);
    expect(mocks.listCloudBackups).toHaveBeenCalledTimes(permis ? 1 : 0);
  });

  it('explique le refus de la machine et celui du rôle dans chaque langue livrée', () => {
    for (const langue of ONZE_LANGUES) {
      for (const cle of ['machineAction.unavailableHere', 'machineAction.signInAsAdmin', 'machineAction.adminOnly']) {
        expect(dictionnaire(langue)[cle]?.trim(), `${langue} ${cle}`).toBeTruthy();
      }
    }
  });

  it('la règle', () => {
    expect(listeDesInstantanesPermise(ETAT as any, null)).toBe(true);
    expect(listeDesInstantanesPermise(ETAT as any, 'hors_machine')).toBe(false);
    expect(listeDesInstantanesPermise(ETAT as any, 'non_admin')).toBe(false);
    expect(listeDesInstantanesPermise({ ...ETAT, premium: false } as any, null)).toBe(false);
  });
});
