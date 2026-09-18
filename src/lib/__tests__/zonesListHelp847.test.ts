// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import { get } from 'svelte/store';
import ZonesV2 from '../../components/v2/ZonesV2.svelte';
import { zones, currentZoneId } from '../stores/zones';
import { CLE_VUE_ZONES } from '../vueZones';
import { locale } from '../i18n';
import fr from '../locales/fr';

let host: HTMLDivElement;
let component: ReturnType<typeof mount> | undefined;
let mutations: { url: string; method: string }[];
let serverZones: { id: number; name: string; state: string; volume: number; output_type: string }[];
const helpText = fr['v2.zones.listActionsHelp'].replace('{view}', fr['v2.zones.viewList']);
const help = () => host.querySelector('#zones-list-help');
const listButton = () => host.querySelector<HTMLButtonElement>(`.bascule button[title="${fr['v2.zones.viewList']}"]`)!;
const gridButton = () => host.querySelector<HTMLButtonElement>(`.bascule button[title="${fr['v2.zones.viewGrid']}"]`)!;
const response = (body: unknown) => new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } });
async function settle() {
  await new Promise((resolve) => setTimeout(resolve, 0));
  flushSync();
}
async function open() {
  component = mount(ZonesV2, { target: host });
  flushSync();
  await settle();
}
beforeEach(() => {
  localStorage.clear();
  locale.set('fr');
  serverZones = [{ id: 1, name: 'Salon', state: 'stopped', volume: 0.4, output_type: 'local' }];
  zones.set(serverZones as never);
  currentZoneId.set(1);
  mutations = [];
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    if (method !== 'GET') mutations.push({ url, method });
    if (url.endsWith('/zones/1') && method === 'DELETE') { serverZones = []; return new Response(null, { status: 204 }); }
    if (url.endsWith('/zones')) return response(serverZones);
    if (url.endsWith('/zones/stereo-pairs')) return response([]);
    if (url.includes('tune-tested.json')) return response({ version: 1, count: 0, devices: [] });
    if (url.endsWith('/system/diagnostics')) return response({ zones_doublons: [] });
    throw new Error(`Unexpected request ${method} ${url}`);
  }));
  host = document.createElement('div');
  document.body.append(host);
});
afterEach(async () => {
  if (component) await unmount(component);
  component = undefined;
  host.remove();
  zones.set([]);
  currentZoneId.set(null);
  localStorage.clear();
  vi.unstubAllGlobals();
});

describe('#847 — grid explains where zone management lives', () => {
  it('renders the translated help and connects the existing List button to it', async () => {
    await open();
    expect(help()?.textContent).toBe(helpText);
    expect(listButton().getAttribute('aria-describedby')).toBe(help()!.id);
    expect(host.querySelector('.grille .carte')).not.toBeNull();
    expect(host.querySelector('.grille .danger')).toBeNull();
    expect(host.querySelector('.grille [aria-label="Renommer"]')).toBeNull();
    expect(mutations).toEqual([]);
  });

  it('uses the existing List switch, with deletion still requiring its second confirmation', async () => {
    await open();
    expect(help()?.textContent).toBe(helpText);
    listButton().click();
    await settle();
    expect(help()).toBeNull();
    expect(listButton().hasAttribute('aria-describedby')).toBe(false);
    expect(listButton().getAttribute('aria-pressed')).toBe('true');
    expect(localStorage.getItem(CLE_VUE_ZONES)).toBe('liste');
    expect(host.querySelector('.list [aria-label="Renommer"]')).not.toBeNull();
    expect(get(currentZoneId)).toBe(1);
    expect(mutations).toEqual([]);
    host.querySelector<HTMLButtonElement>('.list button[aria-label="Supprimer"]')!.click();
    flushSync();
    expect(host.querySelector('.danger.armed')).not.toBeNull();
    expect(mutations).toEqual([]);
    host.querySelector<HTMLButtonElement>('.list button[aria-label="Annuler"]')!.click();
    flushSync();
    expect(host.querySelector('.danger.armed')).toBeNull();
    expect(mutations).toEqual([]);
    host.querySelector<HTMLButtonElement>('.list button[aria-label="Supprimer"]')!.click();
    flushSync();
    host.querySelector<HTMLButtonElement>('.danger.armed')!.click();
    await settle();
    expect(mutations).toEqual([{ url: '/api/v1/zones/1', method: 'DELETE' }]);
    expect(host.querySelector('.zone')).toBeNull();
  });

  it('does not show grid help when the saved view is List', async () => {
    localStorage.setItem(CLE_VUE_ZONES, 'liste');
    await open();
    expect(host.querySelector('.list .zone')).not.toBeNull();
    expect(help()).toBeNull();
    expect(listButton().hasAttribute('aria-describedby')).toBe(false);
    expect(mutations).toEqual([]);
  });

  it('does not point at absent help when there are no zones', async () => {
    serverZones = [];
    zones.set([]);
    await open();
    expect(host.querySelector('.state')).not.toBeNull();
    expect(help()).toBeNull();
    expect(listButton().hasAttribute('aria-describedby')).toBe(false);
    expect(mutations).toEqual([]);
  });

  it('shows the help again when switching back to Grid without mutating a zone', async () => {
    localStorage.setItem(CLE_VUE_ZONES, 'liste');
    await open();
    gridButton().click();
    await settle();
    expect(help()?.textContent).toBe(helpText);
    expect(listButton().getAttribute('aria-describedby')).toBe('zones-list-help');
    expect(localStorage.getItem(CLE_VUE_ZONES)).toBe('grille');
    expect(get(currentZoneId)).toBe(1);
    expect(mutations).toEqual([]);
  });
});
