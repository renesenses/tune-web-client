// @vitest-environment jsdom
//
// rc14 — sans authentification, les actions d'administration (redémarrer,
// arrêter, installer une extension…) sont acceptées depuis le RÉSEAU LOCAL
// (tune-server-rust, garde `AdminOuCetteMachine`). Jamais depuis Internet,
// l'accès à distance, un mandataire ; Tune OS (relais du port 80) et un
// conteneur en réseau en pont gardent la règle stricte.
//
// Ce que tient ce banc :
//  - les boutons ne sont grisés que si le serveur le dit
//    (`machine_actions_allowed`), avec la note qui correspond au motif ;
//  - un serveur plus ancien (sans ce champ) garde la lecture rc14
//    (`from_this_machine`) ;
//  - le refus `container_network` garde la phrase traduite du serveur ;
//  - le réglage « Administration depuis cette machine seulement » (Réglages ›
//    Système › Authentification) s'allume, et son refus est dit ;
//  - les libellés existent dans les 20 langues.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';

const mocks = vi.hoisted(() => ({
  getAuthActivation: vi.fn(),
  getAuthMe: vi.fn(),
  setAdminScope: vi.fn(),
  disableAuth: vi.fn(),
  activateAuth: vi.fn(),
  requestAuthActivationCode: vi.fn(),
}));
vi.mock('../api', async (importOriginal) => ({ ...(await importOriginal<object>()), ...mocks }));

import ActivationAuthV2 from '../../components/v2/ActivationAuthV2.svelte';
import { locale } from '../i18n';
import fr from '../locales/fr';
import en from '../locales/en';
import { cleNoteActionsMachine, refusActionsMachine } from '../droitActionsMachine';
import { messageRefusHorsMachine, motifHorsMachine } from '../refusHorsMachine';
import { ONZE_LANGUES, dictionnaire } from './onzeDictionnaires';

const attendre = () => new Promise((r) => setTimeout(r, 0));
const respirer = async () => { for (let i = 0; i < 8; i++) await attendre(); flushSync(); };

const COUPEE = {
  auth_enabled: false,
  from_this_machine: false,
  code_required: true,
  admin_username: 'admin',
  accounts: [],
  min_password_length: 8,
  machine_actions_allowed: true,
  machine_actions_refusal: null,
  admin_this_machine_only: false,
};

let hote: HTMLDivElement;
let instance: Record<string, unknown> | null = null;

async function monter() {
  hote = document.createElement('div');
  document.body.append(hote);
  instance = mount(ActivationAuthV2, { target: hote });
  await respirer();
}

const caseStricte = () => hote.querySelector<HTMLInputElement>('[data-portee-cette-machine]');

beforeEach(() => {
  for (const fn of Object.values(mocks)) fn.mockReset();
  locale.set('fr');
});
afterEach(() => {
  if (instance) unmount(instance as any);
  instance = null;
  hote?.remove();
  document.body.innerHTML = '';
});

describe('rc14 — boutons des actions de la machine, authentification coupée', () => {
  const etat = (autres: Record<string, unknown>) => ({ auth_enabled: false, from_this_machine: false, ...autres });

  it('🔴 réseau local permis par le serveur : rien de grisé, même hors de la machine', () => {
    expect(refusActionsMachine(etat({ machine_actions_allowed: true }), undefined)).toBeNull();
  });

  it('hors du réseau local : grisé, note « depuis un appareil du réseau local »', () => {
    const r = refusActionsMachine(etat({ machine_actions_allowed: false, machine_actions_refusal: 'not_local_network' }), undefined);
    expect(r).toBe('hors_reseau_local');
    expect(cleNoteActionsMachine(r!, false)).toBe('machineAction.unavailableOutsideLan');
  });

  it('conteneur en pont ou relais du port 80 : seule la connexion administrateur est proposée', () => {
    for (const motif of ['container_network', 'port80_relay']) {
      const r = refusActionsMachine(etat({ machine_actions_allowed: false, machine_actions_refusal: motif }), undefined);
      expect(r).toBe('adresse_masquee');
      expect(cleNoteActionsMachine(r!, null)).toBe('machineAction.signInAsAdmin');
    }
  });

  it('réglage strict allumé : la note de la rc14 (« sur la machine du serveur »)', () => {
    const r = refusActionsMachine(etat({ machine_actions_allowed: false, machine_actions_refusal: 'not_local' }), undefined);
    expect(r).toBe('hors_machine');
    expect(cleNoteActionsMachine(r!, false)).toBe('machineAction.unavailableHere');
  });

  it('serveur plus ancien (champ absent) : lecture par `from_this_machine`', () => {
    expect(refusActionsMachine(etat({}), undefined)).toBe('hors_machine');
    expect(refusActionsMachine(etat({ from_this_machine: true }), undefined)).toBeNull();
  });

  it('authentification active : le rôle décide, comme avant', () => {
    expect(refusActionsMachine({ auth_enabled: true, from_this_machine: false, machine_actions_allowed: null }, 'user')).toBe('non_admin');
    expect(refusActionsMachine({ auth_enabled: true, from_this_machine: false, machine_actions_allowed: null }, 'admin')).toBeNull();
  });
});

describe('rc14 — refus `container_network`', () => {
  it('garde la phrase traduite du serveur, suivie du chemin du réglage', () => {
    const e = Object.assign(new Error('refus'), {
      status: 403,
      corps: { error: 'auth_required', reason: 'container_network', message: 'Redémarrer : …', message_key: 'api.machine.reservedContainerNetwork' },
    });
    expect(motifHorsMachine(e)).toBe('container_network');
    const tr = (c: string) => (en as Record<string, string>)[c] ?? c;
    expect(messageRefusHorsMachine(e, tr)).toBe(`Redémarrer : … ${en['machineAction.whereToEnable']}`);
  });
});

describe('rc14 — Réglages › Système › « Administration depuis cette machine seulement »', () => {
  it('🔴 la case est offerte, éteinte par défaut, et l’allumer l’envoie au serveur', async () => {
    mocks.getAuthActivation.mockResolvedValue(COUPEE);
    mocks.setAdminScope.mockResolvedValue({ admin_this_machine_only: true });
    await monter();
    const c = caseStricte();
    expect(c).not.toBeNull();
    expect(c!.checked).toBe(false);
    expect(hote.textContent).toContain(fr['authActivation.adminScopeLabel']);
    expect(hote.textContent).toContain(fr['authActivation.adminScopeHint']);
    mocks.getAuthActivation.mockResolvedValue({ ...COUPEE, admin_this_machine_only: true });
    c!.click();
    await respirer();
    expect(mocks.setAdminScope).toHaveBeenCalledWith(true);
    expect(caseStricte()!.checked).toBe(true);
    expect(hote.querySelector('[data-portee-refus]')).toBeNull();
  });

  it('🔴 l’éteindre hors de la machine : refusé, la phrase est dite et la case reste allumée', async () => {
    const allume = { ...COUPEE, admin_this_machine_only: true, machine_actions_allowed: false, machine_actions_refusal: 'not_local' };
    mocks.getAuthActivation.mockResolvedValue(allume);
    mocks.setAdminScope.mockResolvedValue({ error: 'auth_required', reason: 'not_local' });
    await monter();
    const c = caseStricte()!;
    expect(c.checked).toBe(true);
    c.click();
    await respirer();
    expect(mocks.setAdminScope).toHaveBeenCalledWith(false);
    expect(caseStricte()!.checked).toBe(true);
    expect(hote.querySelector('[data-portee-refus]')?.textContent).toBe(fr['machineAction.notLocal']);
  });

  it('serveur plus ancien (sans le réglage) : pas de case', async () => {
    const { admin_this_machine_only: _, ...ancien } = COUPEE;
    mocks.getAuthActivation.mockResolvedValue(ancien);
    await monter();
    expect(caseStricte()).toBeNull();
  });

  it('authentification active : pas de case (l’administrateur agit de partout)', async () => {
    mocks.getAuthActivation.mockResolvedValue({ auth_enabled: true, from_this_machine: false, code_required: false, admin_this_machine_only: false });
    mocks.getAuthMe.mockResolvedValue({ role: 'user' });
    await monter();
    expect(caseStricte()).toBeNull();
  });
});

describe('rc14 — libellés dans les 20 langues', () => {
  const CLES = [
    'authActivation.intro',
    'authActivation.adminScopeLabel',
    'authActivation.adminScopeHint',
    'machineAction.unavailableOutsideLan',
  ];
  it('chaque clé existe, non vide, traduite hors de l’anglais', () => {
    expect(ONZE_LANGUES.length).toBe(20);
    for (const l of ONZE_LANGUES) {
      const d = dictionnaire(l);
      for (const c of CLES) {
        expect(d[c], `${l} ${c}`).toBeTruthy();
        if (l !== 'en') expect(d[c], `${l} ${c} non traduit`).not.toBe((en as Record<string, string>)[c]);
      }
    }
  });

  it('la règle tient en une phrase dans l’écran d’activation (réseau local, jamais Internet)', () => {
    expect(fr['authActivation.intro']).toContain('réseau local');
    expect(fr['authActivation.intro']).toContain('Internet');
    expect(en['authActivation.intro']).toContain('local network');
    expect(en['authActivation.intro']).not.toContain('only accepted from the machine running Tune');
  });
});
