// @vitest-environment jsdom
//
// Fil 2132 — en vue Grille de l'écran Zones, « Rename » (menu ⚙ de la carte)
// ne faisait rien de visible.
//
// Le menu est commun aux deux vues (#1392) : « Rename » posait bien
// `renaming = z.id`, mais seule la LISTE dessinait le champ de saisie. La carte
// de la grille affichait toujours le nom figé.
//
// Ce banc MONTE l'écran Zones en grille, passe par le vrai menu de la carte et
// lit la requête qui part.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import ZonesV2 from '../../components/v2/ZonesV2.svelte';
import { zones, currentZoneId } from '../stores/zones';
import { locale } from '../i18n';

let host: HTMLDivElement;
let component: ReturnType<typeof mount> | undefined;
let serverZones: Record<string, unknown>[];
let parties: { url: string; method: string; body: any }[];
const response = (body: unknown) => new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } });
async function settle() {
  for (let i = 0; i < 3; i++) {
    await new Promise((r) => setTimeout(r, 0));
    flushSync();
  }
}

beforeEach(() => {
  localStorage.clear();
  locale.set('fr');
  parties = [];
  serverZones = [
    { id: 1, name: 'Browser', state: 'stopped', output_type: 'local' },
    { id: 2, name: 'Salon', state: 'stopped', output_type: 'dlna' },
  ];
  zones.set(serverZones as never);
  currentZoneId.set(1);
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = (init?.method ?? 'GET').toUpperCase();
    parties.push({ url, method, body: init?.body ? JSON.parse(String(init.body)) : null });
    if (/\/zones\/\d+$/.test(url) && method === 'PATCH') return response({ ...serverZones[0], name: 'Bureau' });
    if (url.endsWith('/zones')) return response(serverZones);
    if (url.endsWith('/zones/stereo-pairs')) return response([]);
    if (url.includes('tune-tested.json')) return response({ version: 1, count: 0, devices: [] });
    if (url.endsWith('/system/diagnostics')) return response({ zones_doublons: [] });
    return response({});
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

async function ouvrirRenommer(carte: HTMLElement) {
  carte.querySelector<HTMLButtonElement>('.mz-roue')!.click();
  flushSync();
  const items = [...document.querySelectorAll<HTMLButtonElement>('.mz-panneau .mz-item')];
  const renommer = items[0];
  expect(renommer, 'le menu porte « Renommer » en tête').toBeTruthy();
  renommer.click();
  flushSync();
}

describe('fil 2132 — renommer une zone en vue Grille', () => {
  it('🔴 « Renommer » fait apparaître le champ DANS la carte, à la place du nom', async () => {
    component = mount(ZonesV2, { target: host });
    flushSync();
    await settle();
    const cartes = [...host.querySelectorAll<HTMLElement>('.grille .carte')];
    expect(cartes.length).toBe(2);
    expect(cartes[0].querySelector('input.rn')).toBeNull();

    await ouvrirRenommer(cartes[0]);

    const champ = cartes[0].querySelector<HTMLInputElement>('input.rn');
    expect(champ, 'le champ de saisie est dessiné sur la carte').not.toBeNull();
    expect(champ!.value).toBe('Browser');
    expect(cartes[0].querySelector('.cnom')).toBeNull();
    // Balisage valide (#1006) : le champ n'est pas dans le bouton d'activation.
    expect(champ!.closest('button')).toBeNull();
    // L'autre carte n'est pas touchée.
    expect(cartes[1].querySelector('input.rn')).toBeNull();
    expect(cartes[1].querySelector('.cnom')?.textContent).toBe('Salon');
  });

  it('🔴 Entrée envoie le nouveau nom au serveur, une seule fois', async () => {
    component = mount(ZonesV2, { target: host });
    flushSync();
    await settle();
    const carte = host.querySelector<HTMLElement>('.grille .carte')!;
    await ouvrirRenommer(carte);
    const champ = carte.querySelector<HTMLInputElement>('input.rn')!;
    champ.value = 'Bureau';
    champ.dispatchEvent(new Event('input', { bubbles: true }));
    champ.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    champ.dispatchEvent(new FocusEvent('blur'));
    flushSync();
    await settle();
    const patchs = parties.filter((p) => p.method === 'PATCH');
    expect(patchs).toEqual([{ url: expect.stringMatching(/\/zones\/1$/), method: 'PATCH', body: { name: 'Bureau' } }]);
    expect(carte.querySelector('input.rn')).toBeNull();
  });

  it('Échap referme le champ sans rien envoyer', async () => {
    component = mount(ZonesV2, { target: host });
    flushSync();
    await settle();
    const carte = host.querySelector<HTMLElement>('.grille .carte')!;
    await ouvrirRenommer(carte);
    const champ = carte.querySelector<HTMLInputElement>('input.rn')!;
    champ.value = 'Autre';
    champ.dispatchEvent(new Event('input', { bubbles: true }));
    champ.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    champ.dispatchEvent(new FocusEvent('blur'));
    flushSync();
    await settle();
    expect(parties.filter((p) => p.method === 'PATCH')).toEqual([]);
    expect(carte.querySelector('input.rn')).toBeNull();
    expect(carte.querySelector('.cnom')?.textContent).toBe('Browser');
  });
});
