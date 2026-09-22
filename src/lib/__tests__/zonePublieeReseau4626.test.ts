// @vitest-environment jsdom
//
// renesenses/tune-server-rust#4626 — « Publier cette zone sur le réseau », dans
// les réglages par zone de `SettingsV2` (onglet Appareils, section « Réglages
// par zone »).
//
// Ce que cette garde tient, et POURQUOI elle existe : la publication
// MediaRenderer par zone est livrée depuis #1750, mais elle était introuvable —
// une case nommée d'après son protocole (« Renderer UPnP »), sans une ligne
// d'aide, noyée dans une rangée de cases. Un testeur l'a redemandée comme une
// nouveauté (fil forum 1867). La visibilité EST la fonction livrée ici : elle
// se garde donc, sinon la prochaine refonte de cet écran la reperdra en
// silence, exactement comme la phase 5 avait perdu la ligne d'aide d'origine.
//
// On regarde ce qui PART SUR LE RÉSEAU (le corps du PATCH), pas un appel de
// fonction simulé : un nom de champ mal orthographié passerait sinon au vert.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return {
    ...actual,
    // Ce que l'écran interroge au montage : réponses inertes.
    getConfig: vi.fn(async () => ({ music_dirs: [], quality_split: true })),
    getScanSchedule: vi.fn(async () => ({ enabled: false, time: '03:00' })),
    getScanStatus: vi.fn(async () => ({ scanning: false })),
    getScanReport: vi.fn(async () => null),
    getStats: vi.fn(async () => ({})),
  };
});

import SettingsV2 from '../../components/v2/SettingsV2.svelte';
import { preferences } from '../stores/preferences';
import { zones } from '../stores/zones';
import lFr from '../locales/fr';

const fr = lFr as unknown as Record<string, string>;

let hote: HTMLDivElement | null = null;
let monte: Record<string, any> | null = null;
let patches: { url: string; corps: unknown }[] = [];
/** Ce que `GET /zones` rend : l'écran recharge la liste au montage, et une
 *  liste vide effacerait la zone posée dans le magasin. */
let zonesServeur: unknown[] = [];

function zone(over: Record<string, unknown> = {}) {
  return { id: 21, name: 'Bureau', output_type: 'local', volume: 1, state: 'stopped', ...over };
}

async function attendre(tours = 4) {
  for (let i = 0; i < tours; i++) {
    await new Promise((r) => setTimeout(r, 0));
    flushSync();
  }
}

async function poser(z: Record<string, unknown>): Promise<HTMLDivElement> {
  zonesServeur = [z];
  zones.set([z] as any);
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(SettingsV2, { target: hote, props: {} });
  flushSync();
  const onglet = [...hote.querySelectorAll('button')].find(
    (b) => (b.textContent ?? '').trim() === fr['settings.tabDevices'],
  );
  expect(onglet, 'onglet Appareils introuvable').toBeDefined();
  (onglet as HTMLButtonElement).click();
  await attendre();
  // Témoin : la carte de la zone est bien rendue, sinon « absent » ne prouve rien.
  expect(hote.querySelector('#zc-21'), 'carte de zone absente — témoin sans objet').not.toBeNull();
  return hote;
}

function interrupteur(h: HTMLElement): HTMLInputElement | null {
  return h.querySelector<HTMLInputElement>('#zc-21 .publier-zone input[type="checkbox"]');
}

function bloc(h: HTMLElement): HTMLElement | null {
  return h.querySelector<HTMLElement>('#zc-21 .publi-bloc');
}

beforeEach(() => {
  patches = [];
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} } as any);
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    if (init?.method === 'PATCH') {
      const corps = JSON.parse(String(init.body ?? '{}'));
      patches.push({ url: String(url), corps });
      return new Response(JSON.stringify({ ...zone(), ...corps }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    const u = String(url);
    const corps = /\/zones(\?|$)/.test(u) ? zonesServeur
      : /\/(profiles|devices|playlists|shortcuts)(\?|$)/.test(u) ? [] : {};
    return new Response(JSON.stringify(corps), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }));
  preferences.update((p) => ({ ...p, settingsLevel: 'expert' }));
});

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  hote?.remove();
  hote = null;
  vi.unstubAllGlobals();
});

describe('#4626 — « Publier cette zone sur le réseau », visible et expliquée', () => {
  it('la case a sa ligne d’aide, et l’aide nomme l’autre Tune', { timeout: 60_000 }, async () => {
    const h = await poser(zone({ upnp_renderer: false }));
    const b = bloc(h);
    expect(b, 'bloc de publication absent : la case est de nouveau noyée dans la rangée').not.toBeNull();
    expect(interrupteur(h), 'case de publication absente').not.toBeNull();
    expect(b!.textContent).toContain(fr['devices.upnpRenderer']);
    expect(b!.textContent).toContain(fr['devices.upnpRendererHint']);
    // Le point du ticket : le libellé dit ce que la case FAIT, l'aide dit QUI
    // verra la zone. Un libellé de protocole nu est précisément ce qui l'a
    // rendue introuvable.
    expect(fr['devices.upnpRenderer']).toMatch(/Publier/i);
    expect(fr['devices.upnpRendererHint']).toMatch(/Tune/);
    expect(fr['devices.upnpRendererHint']).toMatch(/UPnP/);
  });

  it('cochée : l’écran dit aussi ce que DÉCOCHER fera ; décochée : il se tait', { timeout: 60_000 }, async () => {
    // Le serveur n'émet aucun `ssdp:byebye` (docs/UPNP-RENDERER.md §4) : la
    // zone peut rester affichée chez le lecteur jusqu'à l'expiration du cache.
    // Cette phrase ne sert qu'à l'instant d'avant le décochage.
    const h1 = await poser(zone({ upnp_renderer: true }));
    expect(bloc(h1)!.textContent).toContain(fr['devices.upnpRendererStopHint']);
    if (monte) unmount(monte);
    monte = null;
    hote?.remove();
    const h2 = await poser(zone({ upnp_renderer: false }));
    expect(bloc(h2)!.textContent).not.toContain(fr['devices.upnpRendererStopHint']);
  });

  it('champ à false : décochée ; champ à true : cochée', { timeout: 60_000 }, async () => {
    const h1 = await poser(zone({ upnp_renderer: false }));
    expect(interrupteur(h1)!.checked).toBe(false);
    if (monte) unmount(monte);
    monte = null;
    hote?.remove();
    const h2 = await poser(zone({ upnp_renderer: true }));
    expect(interrupteur(h2)!.checked).toBe(true);
  });

  it('cocher envoie PATCH /zones/21 avec {"upnp_renderer": true}', { timeout: 60_000 }, async () => {
    const h = await poser(zone({ upnp_renderer: false }));
    const boite = interrupteur(h)!;
    boite.checked = true;
    boite.dispatchEvent(new Event('change', { bubbles: true }));
    await vi.waitFor(() => expect(patches.length).toBeGreaterThan(0));
    const p = patches[patches.length - 1];
    expect(p.url).toMatch(/\/zones\/21$/);
    expect(p.corps).toEqual({ upnp_renderer: true });
  });

  it('décocher envoie {"upnp_renderer": false} — c’est le retrait de l’annonce', { timeout: 60_000 }, async () => {
    const h = await poser(zone({ upnp_renderer: true }));
    const boite = interrupteur(h)!;
    boite.checked = false;
    boite.dispatchEvent(new Event('change', { bubbles: true }));
    await vi.waitFor(() => expect(patches.length).toBeGreaterThan(0));
    expect(patches[patches.length - 1].corps).toEqual({ upnp_renderer: false });
  });
});
