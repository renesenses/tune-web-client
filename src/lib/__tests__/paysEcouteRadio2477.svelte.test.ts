// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import { get } from 'svelte/store';
import PaysEcouteRadios from '../../components/v2/PaysEcouteRadios.svelte';
import * as api from '../api';
import { ecouterFicheAnnuaire } from '../ecouteFicheAnnuaire';
import { locale } from '../i18n';
import fr from '../locales/fr';
import { notifications } from '../stores/notifications';

let config: Record<string, unknown>;
let echecSauvegarde: boolean;
let appels: { url: string; method: string; body: unknown }[];
let hote: HTMLDivElement | null = null;
let instance: Record<string, unknown> | null = null;
const respirer = async () => { for (let i = 0; i < 8; i++) { await new Promise(r => setTimeout(r, 0)); flushSync(); } };
const reponse = (status: number, corps: unknown) => new Response(JSON.stringify(corps), {
  status, headers: { 'Content-Type': 'application/json' },
});

beforeEach(() => {
  config = { radios_country: '' }; echecSauvegarde = false; appels = [];
  locale.set('fr');
  for (const notification of get(notifications)) notifications.dismiss(notification.id);
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.stubGlobal('fetch', vi.fn(async (input: unknown, options?: RequestInit) => {
    const url = String(input);
    const method = options?.method ?? 'GET';
    const body = options?.body ? JSON.parse(String(options.body)) : null;
    appels.push({ url, method, body });
    if (/\/system\/config$/.test(url)) {
      if (method === 'PATCH') {
        if (echecSauvegarde) return reponse(500, { error: 'synthetic write failure' });
        Object.assign(config, body);
        return reponse(200, { status: 'ok' });
      }
      return reponse(200, config);
    }
    if (/\/radios\/(directory\/[^/]+|\d+)\/play\/\d+$/.test(url)) {
      return reponse(422, { output_sent: false, error: 'Aucun flux autorisé dans votre pays.',
        error_code: 'radio_country_unavailable', country: 'FR' });
    }
    return reponse(200, []);
  }));
});

afterEach(async () => {
  if (instance) await unmount(instance);
  instance = null; hote?.remove(); hote = null;
  vi.unstubAllGlobals(); vi.restoreAllMocks();
});

async function monter() {
  hote = document.createElement('div'); document.body.append(hote);
  instance = mount(PaysEcouteRadios, { target: hote });
  flushSync(); await respirer();
  return hote;
}
const ecritures = () => appels.filter(a => a.method === 'PATCH');
function choisir(pays: string) {
  const select = hote!.querySelector('select')!;
  select.value = pays; select.dispatchEvent(new Event('change', { bubbles: true })); flushSync();
}

describe('web#2477 — pays déclaré des radios rc9', () => {
  it('ne déduit pas FR de la langue et conserve le pays choisi après remontage', async () => {
    const page = await monter();
    expect(page.querySelector('select')!.value).toBe('');
    expect(ecritures(), 'aucune écriture sans geste').toHaveLength(0);
    choisir('GB'); page.querySelector('button')!.click(); await respirer();
    expect(ecritures()).toHaveLength(1);
    expect(ecritures()[0].body).toEqual({ radios_country: 'GB' });
    await unmount(instance!); instance = null; hote!.remove();
    await monter();
    expect(hote!.querySelector('select')!.value).toBe('GB');
    expect(ecritures()).toHaveLength(1);
  });
  it('peut retirer un pays enregistré pour ne retenir que les flux sans restriction', async () => {
    config = { radios_country: 'fr' };
    const page = await monter();
    expect(page.querySelector('select')!.value).toBe('FR');
    expect(ecritures()).toHaveLength(0);
    choisir(''); page.querySelector('button')!.click(); await respirer();
    expect(ecritures()[0].body).toEqual({ radios_country: '' });
  });
  it('un serveur ancien sans cette clé ne reçoit aucune écriture fictive', async () => {
    config = {};
    const page = await monter();
    expect(page.querySelector('select')!.disabled).toBe(true);
    expect(page.textContent).toContain(fr['v2.radio.countryNeedsServer']);
    page.querySelector('button')!.click(); await respirer();
    expect(ecritures()).toHaveLength(0);
  });
  it('un refus de sauvegarde garde le choix et ne prétend pas l’avoir enregistré', async () => {
    config = { radios_country: 'FR' }; echecSauvegarde = true;
    const page = await monter();
    choisir('GB'); page.querySelector('button')!.click(); await respirer();
    expect(config.radios_country).toBe('FR');
    expect(page.querySelector('select')!.value).toBe('GB');
    expect(page.querySelector('[role="alert"]')?.textContent).toBeTruthy();
    expect(get(notifications).some(n => n.level === 'success')).toBe(false);
  });
  it('Mes radios reconnaît error_code et affiche un refus traduit au lieu de rester muet', async () => {
    await expect(api.playRadio(7, 3)).rejects.toMatchObject({
      code: 'radio_country_unavailable', message: fr['playback.errorRadioCountry'],
    });
    expect(get(notifications).filter(n => n.message === fr['playback.errorRadioCountry'])).toHaveLength(1);
  });
  it('le client HTTP de l’Annuaire porte la même explication une fois et la rend à l’écran', async () => {
    const refus = vi.fn();
    const ok = await ecouterFicheAnnuaire({ external_id: 'S000973', my_radio_id: null }, 3, refus);
    expect(ok).toBe(false);
    expect(refus).toHaveBeenCalledWith(fr['playback.errorRadioCountry']);
    expect(get(notifications).filter(n => n.message === fr['playback.errorRadioCountry'])).toHaveLength(1);
  });
});
