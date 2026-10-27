// @vitest-environment jsdom
//
// Réglages › Accès distant quand l'écoute à distance passe par le compte
// mozaiklabs (tune-server-rust#6603) :
//  - `acces_par_compte` dans `GET /cloud/bridge/status` : ni lien, ni QR code,
//    ni jeton, et le lien (qui porte le jeton) n'est même pas demandé ;
//  - servie par le relais avec un compte relié : les appareils du compte
//    (5 au plus) et leur retrait, après confirmation ;
//  - sur le réseau local : renvoi vers l'espace client, seul à tenir le
//    jeton OAuth du compte.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import { writable } from 'svelte/store';

const etatFactice = writable<any>({ type: 'ouverte', expire: 0, renouvelerA: 0, secours: false });
let machineFactice: any = null;

vi.mock('../laissezPasser/accesParCompte', async (importOriginal) => {
  const vrai: any = await importOriginal();
  return {
    ...vrai,
    accesParCompte: () => machineFactice,
    etatAccesParCompte: { subscribe: etatFactice.subscribe },
  };
});

import SettingsV2 from '../../components/v2/SettingsV2.svelte';
import ReglagesAccesParCompte from '../../components/v2/ReglagesAccesParCompte.svelte';
import { preferences } from '../stores/preferences';
import { v2SettingsTarget } from '../stores/v2SettingsNav';
import { dialogs } from '../stores/dialogs';

const SID = '75f24b9e-0000-4000-8000-000000000001';

let hote: HTMLDivElement | null = null;
let monte: Record<string, any> | null = null;
let statut: Record<string, unknown>;
const appelsServeur: string[] = [];

function json(corps: unknown, status = 200) {
  return new Response(JSON.stringify(corps), { status, headers: { 'Content-Type': 'application/json' } });
}

async function attendre(tours = 6) {
  for (let i = 0; i < tours; i++) {
    await new Promise((r) => setTimeout(r, 0));
    flushSync();
  }
}

async function monter(composant: any, cible?: () => void): Promise<HTMLElement> {
  cible?.();
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(composant, { target: hote, props: {} });
  flushSync();
  await attendre();
  return hote;
}

function machine(appareils: any[], courant: string | null) {
  const liste = [...appareils];
  return {
    compteRelie: () => true,
    listerAppareils: vi.fn(async () => ({ ok: true, max: 5, appareils: [...liste], courant })),
    retirerAppareil: vi.fn(async (id: string) => {
      const i = liste.findIndex((a) => a.device_id === id);
      if (i < 0) return { ok: false, raison: 'appareil_inconnu' };
      liste.splice(i, 1);
      return { ok: true, courant: id === courant };
    }),
  };
}

const IPHONE = { device_id: 'dev_iphone', name: 'iPhone de Bertrand', platform: 'ios', last_pass_at: '2026-10-26T20:00:00Z' };
const FIREFOX = { device_id: 'dev_firefox', name: 'Firefox', platform: 'web', last_pass_at: null };

beforeEach(() => {
  appelsServeur.length = 0;
  machineFactice = null;
  statut = {
    enabled: true, connected: true, server_id: SID, has_token: true,
    access_url: `https://bridge.mozaiklabs.fr/${SID}/`,
    acces_par_compte: 'Ouvrez Tune Remote et connectez-vous à votre compte mozaiklabs',
    lien_obsolete: true, lien_herite_coupe: false,
  };
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} } as any);
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    const u = String(url);
    appelsServeur.push(u);
    if (u.endsWith('/cloud/bridge/status')) return json(statut);
    if (u.endsWith('/cloud/bridge/access-link')) {
      return json({ server_id: SID, access_url: `https://bridge.mozaiklabs.fr/${SID}/`, link: `https://bridge.mozaiklabs.fr/${SID}/#token=FAUX` });
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

const ecranPont = () => v2SettingsTarget.set({ tab: 'audio', section: 'bridge' } as any);

describe('Réglages › Accès distant par compte', () => {
  it('ni lien, ni QR code : l’explication, et le lien n’est pas demandé', { timeout: 60_000 }, async () => {
    const el = await monter(SettingsV2, ecranPont);
    expect(el.querySelector('[data-acces="par-compte"]'), 'explication absente').not.toBeNull();
    expect(el.querySelector('[data-acces="qr"]')).toBeNull();
    expect(el.querySelector('[data-acces="copier"]')).toBeNull();
    expect(el.querySelector('[data-acces="renouveler"]')).toBeNull();
    expect(appelsServeur.some((u) => u.endsWith('/cloud/bridge/access-link'))).toBe(false);
    expect(el.innerHTML).not.toContain('#token=');
  });

  it('sans `acces_par_compte` (serveur antérieur) : l’écran d’avant, avec son QR code', { timeout: 60_000 }, async () => {
    delete statut.acces_par_compte;
    const el = await monter(SettingsV2, ecranPont);
    expect(el.querySelector('[data-acces="par-compte"]')).toBeNull();
    expect(el.querySelector('[data-acces="qr"]')).not.toBeNull();
  });

  it('sur le réseau local : renvoi vers l’espace client, aucun appel au site', { timeout: 60_000 }, async () => {
    const el = await monter(SettingsV2, ecranPont);
    const lien = el.querySelector<HTMLAnchorElement>('[data-acces="espace-client"]');
    expect(lien, 'aucun lien vers l’espace client').not.toBeNull();
    expect(lien!.href).toBe('https://mozaiklabs.fr/account/remote');
    expect(appelsServeur.some((u) => u.startsWith('https://mozaiklabs.fr'))).toBe(false);
  });
});

describe('Appareils du compte, par le relais', () => {
  it('liste les appareils, marque ce navigateur, sans clé ni jeton', { timeout: 60_000 }, async () => {
    machineFactice = machine([IPHONE, FIREFOX], 'dev_firefox');
    const el = await monter(ReglagesAccesParCompte);
    const lignes = [...el.querySelectorAll('[data-appareil]')];
    expect(lignes.map((l) => l.getAttribute('data-appareil'))).toEqual(['dev_iphone', 'dev_firefox']);
    expect(lignes[0].textContent).toContain('iPhone de Bertrand');
    expect(lignes[1].querySelector('.apr-ici'), 'ce navigateur n’est pas marqué').not.toBeNull();
    expect(lignes[0].querySelector('.apr-ici')).toBeNull();
    expect(el.textContent).toContain('2');
    expect(machineFactice.listerAppareils).toHaveBeenCalledTimes(1);
  });

  it('retire un appareil après confirmation, et la liste suit', { timeout: 60_000 }, async () => {
    machineFactice = machine([IPHONE, FIREFOX], 'dev_firefox');
    const confirmer = vi.spyOn(dialogs, 'confirm').mockResolvedValue(true);
    const el = await monter(ReglagesAccesParCompte);
    el.querySelector<HTMLButtonElement>('[data-appareil="dev_iphone"] [data-acces="retirer"]')!.click();
    await attendre();
    expect(confirmer).toHaveBeenCalledTimes(1);
    expect(confirmer.mock.calls[0][0]).toContain('iPhone de Bertrand');
    expect(confirmer.mock.calls[0][1]).toEqual({ danger: true });
    expect(machineFactice.retirerAppareil).toHaveBeenCalledWith('dev_iphone');
    expect([...el.querySelectorAll('[data-appareil]')].map((l) => l.getAttribute('data-appareil'))).toEqual(['dev_firefox']);
  });

  it('ne retire rien si la confirmation est refusée', { timeout: 60_000 }, async () => {
    machineFactice = machine([IPHONE], null);
    vi.spyOn(dialogs, 'confirm').mockResolvedValue(false);
    const el = await monter(ReglagesAccesParCompte);
    el.querySelector<HTMLButtonElement>('[data-acces="retirer"]')!.click();
    await attendre();
    expect(machineFactice.retirerAppareil).not.toHaveBeenCalled();
    expect(el.querySelectorAll('[data-appareil]')).toHaveLength(1);
  });

  it('un refus du site s’affiche avec son code, et l’appareil reste listé', { timeout: 60_000 }, async () => {
    machineFactice = machine([IPHONE], null);
    machineFactice.retirerAppareil = vi.fn(async () => ({ ok: false, raison: 'site_injoignable' }));
    vi.spyOn(dialogs, 'confirm').mockResolvedValue(true);
    const el = await monter(ReglagesAccesParCompte);
    el.querySelector<HTMLButtonElement>('[data-acces="retirer"]')!.click();
    await attendre();
    expect(el.querySelector('[data-acces="erreur"]')?.textContent).toContain('site_injoignable');
    expect(el.querySelectorAll('[data-appareil]')).toHaveLength(1);
  });
});
