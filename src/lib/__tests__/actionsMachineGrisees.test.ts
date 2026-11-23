// @vitest-environment jsdom
//
// 🔴 rc14 — capture d'Yves (serveur rc13.1, interface ouverte depuis un Mac du
// réseau) : dans Réglages › Système, « Redémarrer le serveur » restait
// CLIQUABLE, puis un long refus rouge tombait APRÈS le clic, avec des
// commandes fausses pour Tune OS (« SSH »).
//
// Désormais, l'écran lit `GET /auth/activation` (`auth_enabled`,
// `from_this_machine`) et `GET /auth/me` (`role`) AVANT tout geste :
//  - authentification coupée hors de la machine du serveur → boutons grisés ;
//  - authentification active, compte non administrateur → boutons grisés ;
//  - sous les boutons, une ligne courte et le lien « Comment faire ? » vers le
//    fil épinglé du forum.
// Ce qui ne se lit pas (serveur ancien) laisse les boutons actifs.
//
// Le témoin MONTE le vrai SettingsV2 et ouvre l'onglet Système comme un
// humain : seules les deux lectures du serveur sont bouchonnées.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';

const getAuthActivation = vi.fn();
const getAuthMe = vi.fn();
const restartServer = vi.fn();
const stopServer = vi.fn();
const getConfig = vi.fn();

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return {
    ...actual,
    getAuthActivation: () => getAuthActivation(),
    getAuthMe: () => getAuthMe(),
    restartServer: () => restartServer(),
    stopServer: () => stopServer(),
    apiFetch: vi.fn(async () => ({} as any)),
    getStats: vi.fn(async () => ({})),
    getConfig: () => getConfig(),
    getApplianceStatus: vi.fn(async () => ({ appliance: true })),
    applianceWifiScan: vi.fn(async () => ({ networks: [] })),
    getScanSchedule: vi.fn(async () => ({ enabled: false, time: '03:00' })),
    getScanStatus: vi.fn(async () => ({ scanning: false })),
    getScanReport: vi.fn(async () => null),
    listServiceTokens: vi.fn(async () => []),
  };
});

import SettingsV2 from '../../components/v2/SettingsV2.svelte';
import { preferences } from '../stores/preferences';
import { FIL_AIDE_ACTIONS_MACHINE, refusActionsMachine } from '../droitActionsMachine';
import { clearToken, setToken } from '../auth';
import lFr from '../locales/fr';
import { ONZE_LANGUES, dictionnaire } from './onzeDictionnaires';
const fr = lFr as unknown as Record<string, string>;

class ResizeObserverInerte {
  observe() {}
  unobserve() {}
  disconnect() {}
}

let hote: HTMLDivElement | null = null;
let monte: Record<string, any> | null = null;

const attendre = () => new Promise((r) => setTimeout(r, 0));
async function respirer() {
  for (let i = 0; i < 10; i++) await attendre();
  flushSync();
}

async function monterSysteme(): Promise<HTMLDivElement> {
  preferences.update((p) => ({ ...p, settingsLevel: 'intermediate' }));
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(SettingsV2, { target: hote, props: {} });
  flushSync();
  await respirer();
  const onglet = [...hote.querySelectorAll('button')].find(
    (b) => (b.textContent ?? '').trim() === fr['settings.tabSystem'],
  );
  expect(onglet, 'onglet Système introuvable à l’écran').toBeDefined();
  (onglet as HTMLButtonElement).click();
  flushSync();
  await respirer();
  return hote;
}

function bouton(el: HTMLElement, libelle: string): HTMLButtonElement {
  const b = [...el.querySelectorAll('[data-actions-serveur] button')].find(
    (x) => (x.textContent ?? '').trim() === libelle,
  ) as HTMLButtonElement | undefined;
  expect(b, `bouton « ${libelle} » introuvable`).toBeDefined();
  return b!;
}

const note = (el: HTMLElement) => el.querySelector<HTMLElement>('[data-actions-machine-indisponibles]');

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', ResizeObserverInerte);
  for (const f of [getAuthActivation, getAuthMe, restartServer, stopServer, getConfig]) f.mockReset();
  getAuthMe.mockResolvedValue({ error: 'unauthorized' });
  getConfig.mockResolvedValue({ music_dirs: [] });
});

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  if (hote) hote.remove();
  hote = null;
  vi.unstubAllGlobals();
  try { localStorage.removeItem('tune_jwt_token'); } catch { /* rien */ }
});

describe('rc14 — Réglages › Système : les actions de la machine sont grisées AVANT le clic', () => {
  it('🔴 authentification coupée, autre appareil : Redémarrer / Arrêter grisés, ligne courte + « Comment faire ? »', async () => {
    getAuthActivation.mockResolvedValue({ auth_enabled: false, from_this_machine: false, code_required: true });
    const el = await monterSysteme();

    const redemarrer = bouton(el, fr['settings.restartServer']);
    const arreter = bouton(el, fr['settings.stopServer']);
    expect(redemarrer.disabled, '« Redémarrer le serveur » reste cliquable : le refus tombera APRÈS le clic (capture d’Yves).').toBe(true);
    expect(arreter.disabled, '« Arrêter le serveur » reste cliquable.').toBe(true);

    const n = note(el);
    expect(n, 'aucune ligne sous les boutons grisés : l’utilisateur ne sait pas pourquoi').not.toBeNull();
    expect(n!.textContent).toContain(fr['machineAction.unavailableHere']);
    const lien = n!.querySelector('a');
    expect(lien?.textContent?.trim()).toBe(fr['machineAction.howTo']);
    expect(lien?.getAttribute('href')).toBe(FIL_AIDE_ACTIONS_MACHINE);
    expect(n!.textContent).not.toContain('SSH');

    redemarrer.click();
    await respirer();
    expect(restartServer).not.toHaveBeenCalled();
  });

  it('🔴 authentification active, compte non administrateur : grisés, « réservé à un administrateur »', async () => {
    getAuthActivation.mockResolvedValue({ auth_enabled: true, from_this_machine: false, code_required: false });
    getAuthMe.mockResolvedValue({ id: 2, username: 'yves', role: 'user' });
    const el = await monterSysteme();
    expect(bouton(el, fr['settings.restartServer']).disabled).toBe(true);
    expect(bouton(el, fr['settings.stopServer']).disabled).toBe(true);
    expect(note(el)?.textContent).toContain(fr['machineAction.adminOnly']);
  });

  it('sur la machine du serveur : actifs, aucune ligne', async () => {
    getAuthActivation.mockResolvedValue({ auth_enabled: false, from_this_machine: true, code_required: false });
    const el = await monterSysteme();
    expect(bouton(el, fr['settings.restartServer']).disabled).toBe(false);
    expect(bouton(el, fr['settings.stopServer']).disabled).toBe(false);
    expect(note(el)).toBeNull();
  });

  it('administrateur connecté : actifs', async () => {
    getAuthActivation.mockResolvedValue({ auth_enabled: true, from_this_machine: false, code_required: false });
    getAuthMe.mockResolvedValue({ id: 1, username: 'admin', role: 'admin' });
    const el = await monterSysteme();
    expect(bouton(el, fr['settings.restartServer']).disabled).toBe(false);
    expect(note(el)).toBeNull();
  });

  it('🔴 activation de l’authentification dans l’écran : les boutons se dégrisent SANS recharger', async () => {
    getAuthActivation.mockResolvedValue({ auth_enabled: false, from_this_machine: false, code_required: true });
    const el = await monterSysteme();
    expect(bouton(el, fr['settings.restartServer']).disabled).toBe(true);

    // Ce que fait `ActivationAuthV2` après une activation réussie : le serveur
    // rend un jeton administrateur, l'écran le pose.
    getAuthActivation.mockResolvedValue({ auth_enabled: true, from_this_machine: false, code_required: false });
    getAuthMe.mockResolvedValue({ id: 1, username: 'admin', role: 'admin' });
    setToken('jeton-admin');
    await respirer();
    expect(
      bouton(el, fr['settings.restartServer']).disabled,
      'authentification activée en administrateur, et le bouton reste grisé jusqu’au rechargement',
    ).toBe(false);
    expect(bouton(el, fr['settings.stopServer']).disabled).toBe(false);
    expect(note(el)).toBeNull();

    // Déconnexion : l'écran se relit encore.
    getAuthMe.mockResolvedValue({ error: 'unauthorized' });
    getAuthActivation.mockResolvedValue({ auth_enabled: true, from_this_machine: false, code_required: false });
    getAuthMe.mockResolvedValue({ id: 2, username: 'yves', role: 'user' });
    clearToken();
    await respirer();
    expect(bouton(el, fr['settings.restartServer']).disabled).toBe(true);
  });

  it('🔴 Tune OS : Éteindre / Redémarrer la machine grisés, texte neutre (relais du port 80)', async () => {
    getConfig.mockResolvedValue({ music_dirs: [], appliance: true });
    getAuthActivation.mockResolvedValue({ auth_enabled: false, from_this_machine: false, code_required: true });
    const el = await monterSysteme();
    expect(bouton(el, fr['diagnostics.shutdown']).disabled, '« Éteindre » reste cliquable').toBe(true);
    expect(bouton(el, fr['diagnostics.reboot']).disabled, '« Redémarrer la machine » reste cliquable').toBe(true);
    expect(bouton(el, fr['settings.restartServer']).disabled).toBe(true);
    const n = note(el)!;
    // Sur la machine elle-même, le relais du port 80 rend aussi
    // `from_this_machine` faux : « disponible sur la machine du serveur » mentirait.
    expect(n.textContent).toContain(fr['machineAction.signInAsAdmin']);
    expect(n.textContent).not.toContain(fr['machineAction.unavailableHere']);
  });

  it('Tune OS, administrateur connecté : Éteindre / Redémarrer la machine actifs', async () => {
    getConfig.mockResolvedValue({ music_dirs: [], appliance: true });
    getAuthActivation.mockResolvedValue({ auth_enabled: true, from_this_machine: false, code_required: false });
    getAuthMe.mockResolvedValue({ id: 1, username: 'admin', role: 'admin' });
    const el = await monterSysteme();
    expect(bouton(el, fr['diagnostics.shutdown']).disabled).toBe(false);
    expect(bouton(el, fr['diagnostics.reboot']).disabled).toBe(false);
  });

  it('serveur ancien (pas de /auth/activation) : actifs, le serveur reste juge', async () => {
    getAuthActivation.mockResolvedValue(null);
    const el = await monterSysteme();
    expect(bouton(el, fr['settings.restartServer']).disabled).toBe(false);
    expect(note(el)).toBeNull();
  });
});

describe('rc14 — refusActionsMachine', () => {
  it('les quatre cas', () => {
    expect(refusActionsMachine({ auth_enabled: false, from_this_machine: false }, undefined)).toBe('hors_machine');
    expect(refusActionsMachine({ auth_enabled: false, from_this_machine: true }, undefined)).toBeNull();
    expect(refusActionsMachine({ auth_enabled: true, from_this_machine: false }, 'user')).toBe('non_admin');
    expect(refusActionsMachine({ auth_enabled: true, from_this_machine: false }, 'admin')).toBeNull();
    // Rôle illisible : on ne grise pas, le serveur jugera.
    expect(refusActionsMachine({ auth_enabled: true, from_this_machine: false }, undefined)).toBeNull();
    expect(refusActionsMachine(null, 'user')).toBeNull();
  });

  it('les quatre libellés existent en 20 langues', () => {
    for (const l of ONZE_LANGUES) {
      for (const cle of ['machineAction.unavailableHere', 'machineAction.adminOnly', 'machineAction.howTo', 'machineAction.signInAsAdmin']) {
        expect(String(dictionnaire(l)[cle] ?? '').trim(), `${l} ${cle}`).not.toBe('');
      }
    }
  });
});
