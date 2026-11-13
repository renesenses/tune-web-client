// @vitest-environment jsdom
//
// tune-server-rust#8481 — le pays du catalogue TIDAL (« PL » de LMS) se
// choisit sur la carte Streaming des Réglages. Le champ ne s'affiche que si le
// serveur dit le réglage possible.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';

const mocks = vi.hoisted(() => ({
  getCatalogCountry: vi.fn(),
  setCatalogCountry: vi.fn(),
}));
vi.mock('../api', async (importOriginal) => ({ ...(await importOriginal<object>()), ...mocks }));

import PaysDuCatalogueV2 from '../../components/v2/PaysDuCatalogueV2.svelte';
import { locale } from '../i18n';

const attendre = () => new Promise((r) => setTimeout(r, 0));
const respirer = async () => { for (let i = 0; i < 8; i++) await attendre(); flushSync(); };

let hote: HTMLDivElement;
let instance: Record<string, unknown> | null = null;

function monter(service = 'tidal') {
  instance = mount(PaysDuCatalogueV2, { target: hote, props: { service } });
  flushSync();
}

beforeEach(() => {
  for (const fn of Object.values(mocks)) fn.mockReset();
  locale.set('fr');
  hote = document.createElement('div');
  document.body.append(hote);
});
afterEach(() => {
  if (instance) unmount(instance as any);
  instance = null;
  hote?.remove();
});

describe('pays du catalogue (#8481)', () => {
  it('enregistre PL en majuscules puis revient au pays du compte', async () => {
    mocks.getCatalogCountry.mockResolvedValue({ service: 'tidal', supported: true, account_country: 'FR', chosen_country: null, effective_country: 'FR' });
    mocks.setCatalogCountry.mockResolvedValueOnce({ service: 'tidal', supported: true, account_country: 'FR', chosen_country: 'PL', effective_country: 'PL' });
    monter();
    await respirer();
    const champ = hote.querySelector<HTMLInputElement>('[data-pays-catalogue] input')!;
    expect(champ, 'le champ est affiché').not.toBeNull();
    expect(hote.textContent).toContain('FR');
    champ.value = 'pl';
    champ.dispatchEvent(new Event('input'));
    flushSync();
    hote.querySelector<HTMLButtonElement>('[data-pays-enregistrer]')!.click();
    await respirer();
    expect(mocks.setCatalogCountry).toHaveBeenCalledWith('tidal', 'PL');

    mocks.setCatalogCountry.mockResolvedValueOnce({ service: 'tidal', supported: true, account_country: 'FR', chosen_country: null, effective_country: 'FR' });
    hote.querySelector<HTMLButtonElement>('[data-pays-compte]')!.click();
    await respirer();
    expect(mocks.setCatalogCountry).toHaveBeenLastCalledWith('tidal', null);
    expect(hote.querySelector('[data-pays-compte]'), 'plus de choix à annuler').toBeNull();
  });

  it("refuse un code de trois lettres sans appeler le serveur", async () => {
    mocks.getCatalogCountry.mockResolvedValue({ service: 'tidal', supported: true, account_country: 'FR', chosen_country: null, effective_country: 'FR' });
    monter();
    await respirer();
    const champ = hote.querySelector<HTMLInputElement>('[data-pays-catalogue] input')!;
    champ.value = 'POL';
    champ.dispatchEvent(new Event('input'));
    flushSync();
    expect(hote.querySelector<HTMLButtonElement>('[data-pays-enregistrer]')!.disabled).toBe(true);
    expect(mocks.setCatalogCountry).not.toHaveBeenCalled();
  });

  it('ne montre rien quand le serveur refuse (Qobuz 422, serveur ancien 404)', async () => {
    mocks.getCatalogCountry.mockRejectedValue(Object.assign(new Error('422'), { status: 422 }));
    monter('qobuz');
    await respirer();
    expect(hote.querySelector('[data-pays-catalogue]')).toBeNull();
  });
});
