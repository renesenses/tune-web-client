// @vitest-environment jsdom
// #8428 / web#2832 : sélecteur de cadence fixe par zone, PATCH réel simulé.
// Un serveur sans le champ et les sorties AirPlay ne proposent pas ce réglage.
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
let patchesZone: { url: string; corps: unknown }[] = [];
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
  hote.querySelector<HTMLButtonElement>('button.ligne')?.click(); // web#2451 : les détails s'ouvrent au clic
  await attendre();
  // Témoin : la carte de la zone est bien rendue, sinon « masqué » ne prouve rien.
  expect(hote.querySelector('#zc-21'), 'carte de zone absente — témoin sans objet').not.toBeNull();
  return hote;
}


beforeEach(() => {
  patchesZone = [];
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} } as any);
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const u = String(url);
    if (init?.method === 'PATCH') {
      const corps = JSON.parse(String(init.body ?? '{}'));
      // Observer tous les PATCH de la zone, y compris un éventuel plafond
      // parasite, sans confondre la sauvegarde des préférences de l'écran.
      if (/\/zones\/21(\?|$)/.test(u)) {
        patchesZone.push({ url: u, corps });
        zonesServeur[0] = { ...(zonesServeur[0] as Record<string, unknown>), ...corps };
        return new Response(JSON.stringify(zonesServeur[0]), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      return new Response(JSON.stringify(corps), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
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

describe('#8428 — fréquence fixe', () => {
  it('masque le réglage sur un ancien serveur', async () => {
    const h = await poser(zone());
    expect(h.querySelector('[data-reglage="zone-frequence-fixe"]')).toBeNull();
  });
  it('envoie 48000 puis null, sans modifier le plafond', { timeout: 60_000 }, async () => {
    const h = await poser(zone({ fixed_sample_rate: null, max_sample_rate: 96000 }));
    const choix = h.querySelector<HTMLSelectElement>('[data-reglage="zone-frequence-fixe"] select');
    expect(choix, 'le réglage de fréquence fixe doit apparaître').not.toBeNull();
    expect(choix!.labels?.[0]?.textContent?.trim()).toBe(fr['settings.fixedSampleRate']);
    const aide = h.querySelector(`#${choix!.getAttribute('aria-describedby')}`);
    expect(aide?.textContent).toBe(fr['settings.fixedSampleRateHint']);
    const plafond = h.querySelector<HTMLSelectElement>('[data-reglage="zone-debit-max"] select');
    expect(plafond?.value).toBe('96000');
    choix!.value = '48000';
    choix!.dispatchEvent(new Event('change', { bubbles: true }));
    await vi.waitFor(() => expect(patchesZone.at(-1)?.corps).toEqual({ fixed_sample_rate: 48000 }));
    choix!.value = '0';
    choix!.dispatchEvent(new Event('change', { bubbles: true }));
    await vi.waitFor(() => expect(patchesZone.at(-1)?.corps).toEqual({ fixed_sample_rate: null }));
    expect(patchesZone.map((p) => p.corps)).toEqual([{ fixed_sample_rate: 48000 }, { fixed_sample_rate: null }]);
    expect(plafond?.value).toBe('96000');
  });
  it.each(['airplay', 'airplay2'])('masque le réglage pour %s', async (output_type) => {
    const h = await poser(zone({ fixed_sample_rate: null, output_type }));
    expect(h.querySelector('[data-reglage="zone-frequence-fixe"]')).toBeNull();
  });
  // #8520 ne refuse la cadence fixe qu'à AirPlay (`sortie_compatible`) :
  // DLNA et Chromecast l'acceptent, bornée par le plafond de la zone.
  it.each(['dlna', 'chromecast'])('propose le réglage pour %s', async (output_type) => {
    const h = await poser(zone({ fixed_sample_rate: 96000, output_type }));
    const choix = h.querySelector<HTMLSelectElement>('[data-reglage="zone-frequence-fixe"] select');
    expect(choix, `${output_type} accepte la cadence fixe côté serveur`).not.toBeNull();
    expect(choix!.value).toBe('96000');
  });
  it('permet une demande au-dessus du plafond, appliqué par le serveur', async () => {
    const h = await poser(zone({ fixed_sample_rate: null, max_sample_rate: 96000 }));
    const choix = h.querySelector<HTMLSelectElement>('[data-reglage="zone-frequence-fixe"] select')!;
    choix.value = '192000';
    choix.dispatchEvent(new Event('change', { bubbles: true }));
    await vi.waitFor(() => expect(patchesZone.map((p) => p.corps)).toEqual([{ fixed_sample_rate: 192000 }]));
    expect(h.querySelector<HTMLSelectElement>('[data-reglage="zone-debit-max"] select')?.value).toBe('96000');
  });

});
