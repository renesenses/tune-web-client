// @vitest-environment jsdom
//
// rc14 (web#3438) — authentification coupée, le réseau local administre
// (`machine_actions_allowed: true`), MAIS le pont d'accès à distance reste
// sous la garde stricte du serveur (`AdminOuCetteMachineStricte`) : l'activer
// (`POST /cloud/bridge/enable`), renouveler son jeton
// (`POST /cloud/bridge/rotate-token`) et lire son lien
// (`GET /cloud/bridge/access-link`) rendent 403 `not_local` hors de la
// machine de Tune. L'écran grise donc ces trois gestes selon
// `from_this_machine` (ou le rôle administrateur, authentification active),
// jamais selon `machine_actions_allowed`, et dit pourquoi. L'éteindre reste
// une action de la machine ordinaire, permise depuis le réseau local.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';

import SettingsV2 from '../../components/v2/SettingsV2.svelte';
import { preferences } from '../stores/preferences';
import { v2SettingsTarget } from '../stores/v2SettingsNav';
import { lireRefusDesActions, refusActionsMachine, refusActionsPont } from '../droitActionsMachine';
import en from '../locales/en';
import { ONZE_LANGUES, dictionnaire } from './onzeDictionnaires';

const SID = '75f24b9e-0000-4000-8000-000000000001';
const LIEN = `https://bridge.mozaiklabs.fr/${SID}/#token=FAUX-jeton-1`;

/** Authentification coupée, appareil du réseau local (pas la machine). */
const RESEAU_LOCAL = {
  auth_enabled: false,
  from_this_machine: false,
  code_required: true,
  machine_actions_allowed: true,
  machine_actions_refusal: null,
  admin_this_machine_only: false,
};

let hote: HTMLDivElement | null = null;
let monte: Record<string, any> | null = null;
let activation: Record<string, unknown>;
let moi: Record<string, unknown>;
let pontActive: boolean;
let appels: string[];

function json(corps: unknown, status = 200) {
  return new Response(JSON.stringify(corps), { status, headers: { 'Content-Type': 'application/json' } });
}

async function attendre(tours = 8) {
  for (let i = 0; i < tours; i++) {
    await new Promise((r) => setTimeout(r, 0));
    flushSync();
  }
}

async function ecranPont(): Promise<HTMLElement> {
  v2SettingsTarget.set({ tab: 'audio', section: 'bridge' } as any);
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(SettingsV2, { target: hote, props: {} });
  flushSync();
  await attendre();
  return hote;
}

const boutonActiver = (el: HTMLElement) => el.querySelector<HTMLButtonElement>('[data-acces="activer"]');
const appelsAuLien = () => appels.filter((u) => u.endsWith('/cloud/bridge/access-link'));

beforeEach(() => {
  activation = { ...RESEAU_LOCAL };
  moi = {};
  pontActive = false;
  appels = [];
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} } as any);
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    const u = String(url);
    appels.push(u);
    if (u.endsWith('/auth/activation')) return json(activation);
    if (u.endsWith('/auth/me')) return json(moi);
    if (u.endsWith('/cloud/bridge/status')) {
      return json({ enabled: pontActive, connected: pontActive, server_id: SID, has_token: pontActive,
        access_url: pontActive ? `https://bridge.mozaiklabs.fr/${SID}/` : null });
    }
    if (u.endsWith('/cloud/bridge/access-link')) {
      // Le serveur : garde stricte, la machine (ou l'administrateur) seulement.
      const permis = activation.auth_enabled ? moi.role === 'admin' : activation.from_this_machine === true;
      return permis ? json({ server_id: SID, link: LIEN }) : json({ error: 'forbidden', reason: 'not_local' }, 403);
    }
    return json(/\/(zones|profiles|devices|playlists|shortcuts)(\?|$)/.test(u) ? [] : {});
  }));
  preferences.update((p) => ({ ...p, settingsLevel: 'expert' }));
});

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  hote?.remove();
  hote = null;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('web#3438 — le pont reste à la machine, même quand le réseau local administre', () => {
  it('🔴 la règle : `machine_actions_allowed` ne dit rien du pont', () => {
    expect(refusActionsMachine(RESEAU_LOCAL, undefined)).toBeNull();
    expect(refusActionsPont(RESEAU_LOCAL, undefined)).toBe('hors_machine');
    expect(refusActionsPont({ ...RESEAU_LOCAL, from_this_machine: true }, undefined)).toBeNull();
    // Authentification active : le rôle décide.
    const active = { auth_enabled: true, from_this_machine: false };
    expect(refusActionsPont(active, 'user')).toBe('non_admin');
    expect(refusActionsPont(active, 'admin')).toBeNull();
    // Serveur muet : le serveur reste juge, rien de grisé.
    expect(refusActionsPont(null, undefined)).toBeNull();
  });

  it('les deux refus se lisent en un seul aller-retour ; une erreur ne grise rien', async () => {
    const lireEtat = vi.fn(async () => RESEAU_LOCAL as any);
    expect(await lireRefusDesActions(lireEtat, async () => null)).toEqual({ machine: null, pont: 'hors_machine' });
    expect(lireEtat).toHaveBeenCalledTimes(1);
    expect(await lireRefusDesActions(async () => { throw new Error('x'); }, async () => null))
      .toEqual({ machine: null, pont: null });
  });

  it('🔴 réseau local, pont éteint : « Activer » grisé, et la raison est dite', { timeout: 60_000 }, async () => {
    const el = await ecranPont();
    const bouton = boutonActiver(el);
    expect(bouton, 'aucun bouton d’activation du pont').not.toBeNull();
    expect(bouton!.disabled).toBe(true);
    expect(el.querySelector('[data-pont-reserve="hors_machine"]'), 'aucune explication').not.toBeNull();
    bouton!.click();
    await attendre();
    expect(appels.filter((u) => u.endsWith('/cloud/bridge/enable'))).toEqual([]);
  });

  it('🔴 réseau local, pont allumé : le lien n’est pas demandé, l’éteindre reste offert', { timeout: 60_000 }, async () => {
    pontActive = true;
    const el = await ecranPont();
    expect(appelsAuLien(), 'lien demandé hors de la machine (403 not_local)').toEqual([]);
    expect(el.querySelector('[data-acces="copier"]')).toBeNull();
    expect(el.querySelector('[data-acces="renouveler"]')).toBeNull();
    expect(boutonActiver(el)!.disabled, '« Désactiver » grisé à tort').toBe(false);
  });

  it('sur la machine de Tune : activer et lire le lien restent offerts', { timeout: 60_000 }, async () => {
    activation = { ...RESEAU_LOCAL, from_this_machine: true };
    pontActive = true;
    const el = await ecranPont();
    expect(el.querySelector('[data-pont-reserve]')).toBeNull();
    expect(appelsAuLien().length).toBeGreaterThan(0);
    expect(el.querySelector('[data-acces="copier"]')).not.toBeNull();
    expect(el.querySelector<HTMLButtonElement>('[data-acces="renouveler"]')!.disabled).toBe(false);
  });

  it('authentification active : grisé pour un compte standard, offert à l’administrateur', { timeout: 60_000 }, async () => {
    activation = { auth_enabled: true, from_this_machine: false, code_required: false, machine_actions_allowed: null };
    moi = { role: 'user' };
    let el = await ecranPont();
    expect(boutonActiver(el)!.disabled).toBe(true);
    expect(el.querySelector('[data-pont-reserve="non_admin"]')).not.toBeNull();
    unmount(monte!);
    hote!.remove();

    moi = { role: 'admin' };
    el = await ecranPont();
    expect(boutonActiver(el)!.disabled).toBe(false);
    expect(el.querySelector('[data-pont-reserve]')).toBeNull();
  });

  it('l’explication existe dans les 20 langues, traduite hors de l’anglais', () => {
    const cle = 'settings.remoteAccessThisMachineOnly';
    expect(ONZE_LANGUES.length).toBe(20);
    for (const l of ONZE_LANGUES) {
      const d = dictionnaire(l);
      expect(d[cle], `${l}`).toBeTruthy();
      if (l !== 'en') expect(d[cle], `${l} non traduit`).not.toBe((en as Record<string, string>)[cle]);
    }
  });
});
