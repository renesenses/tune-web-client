// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import { get } from 'svelte/store';
import ZonesV2 from '../../components/v2/ZonesV2.svelte';
import { zones, currentZoneId } from '../stores/zones';
import { CLE_VUE_ZONES } from '../vueZones';
import { dialogs } from '../stores/dialogs';
import { locale } from '../i18n';
import fr from '../locales/fr';

let host: HTMLDivElement;
let component: ReturnType<typeof mount> | undefined;
let mutations: { url: string; method: string }[];
let serverZones: { id: number; name: string; state: string; volume: number; output_type: string }[];
const help = () => host.querySelector('#zones-list-help');
const listButton = () => host.querySelector<HTMLButtonElement>(`.bascule button[title="${fr['v2.zones.viewList']}"]`)!;
const roue = () => host.querySelector<HTMLButtonElement>('.mz-roue')!;
const panneau = () => host.querySelector('.mz-panneau');
const items = () => [...host.querySelectorAll('.mz-panneau .mz-item')].map((b) => b.textContent?.trim());
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
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

//
// #847 demandait d'arbitrer : « aucune corbeille sur les cartes de la grille
// alors que chaque ligne de la liste en a une ». La réponse tenue ici est
// celle de #1392 — ni corbeille nue sur la carte, ni renvoi vers la liste :
// une ROUE CRANTÉE dans les deux vues, et le geste destructif à un cran de
// distance, nommé, sous son filet.
//
// Ce fichier gardait l'ancienne réponse (un paragraphe d'aide « passez en vue
// liste », et des gestes réservés à la liste). Il garde son nom : c'est la
// même question, c'est la réponse qui a changé.
describe('#847 / #1392 — la gestion d’une zone vit dans les DEUX vues', () => {
  it('pose la roue sur la carte, et ne renvoie plus vers la vue liste', async () => {
    await open();
    expect(host.querySelector('.grille .carte')).not.toBeNull();
    expect(host.querySelector('.grille .carte .mz-roue')).not.toBeNull();
    // L'aide n'a plus d'objet : la carte porte le menu.
    expect(help()).toBeNull();
    expect(listButton().hasAttribute('aria-describedby')).toBe(false);
    // Rien de destructif n'est atteignable en UN clic depuis la carte.
    expect(host.querySelector('.grille .mz-item')).toBeNull();
    expect(mutations).toEqual([]);
  });

  it('ouvre le menu au clic, la suppression en dernier et sous son filet', async () => {
    await open();
    expect(panneau()).toBeNull();
    expect(roue().getAttribute('aria-expanded')).toBe('false');
    roue().click();
    flushSync();
    expect(panneau()).not.toBeNull();
    expect(roue().getAttribute('aria-expanded')).toBe('true');
    // Le niveau par défaut est EXPERT : la latence figure donc au menu, entre
    // les réglages et la suppression. Voir `lib/menuZone`.
    expect(items()).toEqual([
      fr['zone.rename'], fr['v2.zone.changeImage'], fr['v2.zone.openSettings'],
      fr['zone.latency'], fr['zone.deleteZone'],
    ]);
    const danger = host.querySelectorAll('.mz-panneau .mz-item.danger');
    expect(danger.length).toBe(1);
    expect(danger[0].textContent?.trim()).toBe(fr['zone.deleteZone']);
    expect(host.querySelector('.mz-panneau .mz-filet')).not.toBeNull();
    expect(mutations).toEqual([]);
  });

  it('referme le menu à Échap', async () => {
    await open();
    roue().click();
    flushSync();
    expect(panneau()).not.toBeNull();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    flushSync();
    expect(panneau()).toBeNull();
    expect(mutations).toEqual([]);
  });

  it('demande une confirmation qui NOMME la zone, et ne supprime rien si elle est refusée', async () => {
    const confirm = vi.spyOn(dialogs, 'confirm').mockResolvedValue(false);
    await open();
    roue().click();
    flushSync();
    host.querySelector<HTMLButtonElement>('.mz-panneau .mz-item.danger')!.click();
    await settle();
    expect(confirm).toHaveBeenCalledOnce();
    expect(confirm.mock.calls[0][0]).toBe(fr['v2.zone.deleteExplain'].replace('{name}', 'Salon'));
    expect(confirm.mock.calls[0][1]).toEqual({ danger: true });
    expect(mutations).toEqual([]);
    expect(host.querySelector('.grille .carte')).not.toBeNull();
  });

  it('supprime la zone quand la confirmation est acceptée', async () => {
    vi.spyOn(dialogs, 'confirm').mockResolvedValue(true);
    await open();
    roue().click();
    flushSync();
    host.querySelector<HTMLButtonElement>('.mz-panneau .mz-item.danger')!.click();
    await settle();
    await settle();
    expect(mutations).toEqual([{ url: '/api/v1/zones/1', method: 'DELETE' }]);
    expect(host.querySelector('.grille .carte')).toBeNull();
  });

  it('porte la MÊME roue dans la vue liste', async () => {
    localStorage.setItem(CLE_VUE_ZONES, 'liste');
    await open();
    expect(host.querySelector('.list .zone')).not.toBeNull();
    expect(host.querySelector('.list .zacts .mz-roue')).not.toBeNull();
    roue().click();
    flushSync();
    expect(items()).toEqual([
      fr['zone.rename'], fr['v2.zone.changeImage'], fr['v2.zone.openSettings'],
      fr['zone.latency'], fr['zone.deleteZone'],
    ]);
    expect(get(currentZoneId)).toBe(1);
    expect(mutations).toEqual([]);
  });

  it('n’ouvre aucune roue quand il n’y a aucune zone', async () => {
    serverZones = [];
    zones.set([]);
    await open();
    expect(host.querySelector('.state')).not.toBeNull();
    expect(host.querySelector('.mz-roue')).toBeNull();
    expect(mutations).toEqual([]);
  });
});
