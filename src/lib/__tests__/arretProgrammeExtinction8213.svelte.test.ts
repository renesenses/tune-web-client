// @vitest-environment jsdom
//
// tune-server-rust#8213 (web #2802) — l'arrêt programmé à heure fixe, et le
// choix « éteindre la machine » (réponse forum 10786), proposé SEULEMENT quand
// le serveur dit que c'est possible (`poweroff_available`, Tune OS).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import { readFileSync } from 'node:fs';

const mocks = vi.hoisted(() => ({
  getArretProgramme: vi.fn(),
  setArretProgramme: vi.fn(),
  supprimerArretProgramme: vi.fn(),
  fetchJSON: vi.fn(),
  confirm: vi.fn(),
}));
vi.mock('../api', async (importOriginal) => {
  const { confirm: _c, ...api } = mocks;
  return { ...(await importOriginal<object>()), ...api };
});
vi.mock('../stores/dialogs', () => ({ dialogs: { confirm: mocks.confirm } }));

import ArretProgrammeV2 from '../../components/v2/ArretProgrammeV2.svelte';
import { locale } from '../i18n';

const attendre = () => new Promise((r) => setTimeout(r, 0));
const respirer = async () => { for (let i = 0; i < 8; i++) await attendre(); flushSync(); };

const REGLAGE = { enabled: true, time: '23:00', days_of_week: '1111111', zone_ids: null, action: 'stop_playback' };

let hote: HTMLDivElement;
let instance: Record<string, unknown> | null = null;

async function monter(etat: any) {
  mocks.getArretProgramme.mockResolvedValue(etat);
  hote = document.createElement('div');
  document.body.append(hote);
  instance = mount(ArretProgrammeV2, { target: hote });
  await respirer();
}

beforeEach(() => {
  for (const fn of Object.values(mocks)) fn.mockReset();
  mocks.fetchJSON.mockResolvedValue([{ id: 1, name: 'Salon' }, { id: 2, name: 'Chambre' }]);
  mocks.setArretProgramme.mockImplementation(async (r: any) => ({ scheduled_stop: r, next_stop_at: null, poweroff_available: true }));
  locale.set('fr');
});
afterEach(() => {
  if (instance) unmount(instance as any);
  instance = null;
  document.body.innerHTML = '';
});

const radioExtinction = () => hote.querySelector<HTMLInputElement>('input[type=radio][value=poweroff]');
const enregistrer = () => [...hote.querySelectorAll<HTMLButtonElement>('button.v2-btn')].at(-1)!;

describe('#8213 — arrêt programmé : le choix « éteindre la machine »', () => {
  it('🔴 hors Tune OS (poweroff_available faux), le choix n’est PAS proposé', async () => {
    await monter({ scheduled_stop: REGLAGE, next_stop_at: null, poweroff_available: false });
    expect(hote.querySelector('[data-arret-programme]')).not.toBeNull();
    expect(radioExtinction()).toBeNull();
  });

  it('un serveur d’avant l’option (champ absent) ne le propose pas non plus', async () => {
    await monter({ scheduled_stop: null, next_stop_at: null });
    expect(radioExtinction()).toBeNull();
  });

  it('🔴 sur Tune OS, « éteindre » est proposé, confirmé, puis envoyé en `poweroff`', async () => {
    await monter({ scheduled_stop: REGLAGE, next_stop_at: null, poweroff_available: true });
    const r = radioExtinction();
    expect(r, 'le choix doit être proposé sur Tune OS').not.toBeNull();
    r!.click();
    flushSync();
    mocks.confirm.mockResolvedValue(true);
    enregistrer().click();
    await respirer();
    expect(mocks.confirm).toHaveBeenCalledTimes(1);
    expect(mocks.setArretProgramme).toHaveBeenCalledTimes(1);
    expect(mocks.setArretProgramme.mock.calls[0][0]).toMatchObject({ action: 'poweroff', time: '23:00', days_of_week: '1111111', zone_ids: null });
  });

  it('confirmation refusée : rien n’est écrit', async () => {
    await monter({ scheduled_stop: REGLAGE, next_stop_at: null, poweroff_available: true });
    radioExtinction()!.click();
    flushSync();
    mocks.confirm.mockResolvedValue(false);
    enregistrer().click();
    await respirer();
    expect(mocks.setArretProgramme).not.toHaveBeenCalled();
  });

  it('arrêter la musique (défaut) : pas de confirmation, `stop_playback` envoyé', async () => {
    await monter({ scheduled_stop: null, next_stop_at: null, poweroff_available: true });
    enregistrer().click();
    await respirer();
    expect(mocks.confirm).not.toHaveBeenCalled();
    expect(mocks.setArretProgramme.mock.calls[0][0]).toMatchObject({ action: 'stop_playback', enabled: true });
  });

  it('aucune écriture au chargement', async () => {
    await monter({ scheduled_stop: REGLAGE, next_stop_at: '2026-11-11T23:00:00', poweroff_available: true });
    expect(mocks.setArretProgramme).not.toHaveBeenCalled();
    expect(mocks.supprimerArretProgramme).not.toHaveBeenCalled();
    expect(hote.querySelector('[data-prochain-arret]')!.textContent).toContain('23:00');
  });
});

describe('#8213 — Réglages › Système : « Redémarrer la machine »', () => {
  const V2 = readFileSync('src/components/v2/SettingsV2.svelte', 'utf8');
  it('confirmé, et offert seulement sur l’appliance', () => {
    const i = V2.indexOf('async function redemarrerLaMachine(');
    expect(i).toBeGreaterThan(-1);
    const c = V2.slice(i, V2.indexOf('\n  }\n', i));
    expect(c.indexOf('dialogs.confirm(')).toBeGreaterThan(-1);
    expect(c.indexOf('dialogs.confirm(')).toBeLessThan(c.indexOf('api.applianceReboot()'));
    const b = V2.indexOf('onclick={redemarrerLaMachine}');
    expect(b).toBeGreaterThan(-1);
    expect(V2.lastIndexOf('{#if isAppliance === true}', b)).toBeGreaterThan(V2.lastIndexOf('{/if}', b));
  });
});
