// @vitest-environment jsdom
//
// #2513 (tune-server-rust#7372, ASIO Topping) — le serveur publie désormais le
// MOTIF de son diagnostic DSD, à côté de `dsd_transport` :
//
//   dsd_transport: null                 + reason "capacite_non_sondee"
//   dsd_transport: "natif_servi_en_dop" + reason "sortie_non_asio" | "pilote_sans_dsd"
//   dsd_transport: "natif" | "dop" | "pcm" + reason null
//   dsd_transport_scope: "output_capability"
//
// (`diagnostic_transport_dsd`, tune-server/src/routes/zones/lecture.rs.)
//
// Avant ce correctif, une capacité NON SONDÉE (`null`) ne disait rien, et un
// repli connu affichait la phrase générique sans sa cause. Ce témoin MONTE
// l'écran Réglages et lit le texte rendu sous le sélecteur DSD.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return {
    ...actual,
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
import { diagnosticDsd, CLE_MOTIF_DSD } from '../transportDsd';
import { dictionnaire, ONZE_LANGUES } from './onzeDictionnaires';

const fr = dictionnaire('fr');
const INCONNUE = 'v2.set.dsdCapabilityUnknown';
const NON_ASIO = 'v2.set.dsdDopNotAsio';
const SANS_DSD = 'v2.set.dsdDopDriverWithoutDsd';
const GENERIQUE = 'v2.set.dsdNativeServedAsDop';

let hote: HTMLDivElement | null = null;
let monte: Record<string, any> | null = null;
let zonesServeur: unknown[] = [];
let appels: string[] = [];

function zone(over: Record<string, unknown> = {}) {
  return {
    id: 21, name: 'Topping', output_type: 'local', output_device_id: 'local:Topping ASIO',
    volume: 1, state: 'stopped', dsd_mode: 'native',
    dsd_transport: null, dsd_transport_reason: 'capacite_non_sondee', dsd_transport_scope: 'output_capability',
    ...over,
  };
}

async function attendre(tours = 4) {
  for (let i = 0; i < tours; i++) {
    await new Promise((r) => setTimeout(r, 0));
    flushSync();
  }
}

function selecteurDsd(h: HTMLElement): HTMLSelectElement | null {
  const champ = [...h.querySelectorAll<HTMLElement>('#zc-21 .zf')]
    .find((l) => l.querySelector(':scope > span')?.textContent?.trim() === 'DSD');
  return champ?.querySelector('select') ?? null;
}
const mention = (h: HTMLElement) => selecteurDsd(h)?.closest('.zf')?.querySelector<HTMLElement>('small') ?? null;

async function poser(z: Record<string, unknown>): Promise<HTMLDivElement> {
  preferences.update((p) => ({ ...p, settingsLevel: 'intermediate' }));
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
  hote.querySelector<HTMLButtonElement>('button.ligne')?.click();
  await attendre();
  expect(selecteurDsd(hote), 'sélecteur DSD absent — témoin sans objet').not.toBeNull();
  return hote;
}

/** Une nouvelle réponse du serveur pour la zone (WebSocket ou relecture). */
async function pousser(z: Record<string, unknown>) {
  zonesServeur = [z];
  zones.set([z] as any);
  await attendre();
}

beforeEach(() => {
  appels = [];
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} } as any);
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    appels.push(`${init?.method ?? 'GET'} ${String(url)}`);
    if (init?.method === 'PATCH') {
      // `patch_zone` rend `get_zone` : diagnostic recalculé, motif effacé hors natif.
      const corps = JSON.parse(String(init.body ?? '{}'));
      const z: Record<string, unknown> = { ...zone(), ...corps };
      if (corps.dsd_mode && corps.dsd_mode !== 'native') {
        z.dsd_transport = corps.dsd_mode;
        z.dsd_transport_reason = null;
      }
      return new Response(JSON.stringify(z), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    const u = String(url);
    const corps = /\/zones(\?|$)/.test(u) ? zonesServeur
      : /\/(profiles|devices|playlists|shortcuts)(\?|$)/.test(u) ? [] : {};
    return new Response(JSON.stringify(corps), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }));
});

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  hote?.remove();
  hote = null;
  zones.set([]);
  vi.unstubAllGlobals();
});

describe('#2513 — diagnosticDsd lit le motif du serveur', () => {
  it('capacité non sondée : à déterminer, jamais un repli DoP', () => {
    expect(diagnosticDsd(zone())).toEqual({ cle: INCONNUE, genre: 'inconnue' });
  });
  it('causes connues du repli DoP', () => {
    expect(diagnosticDsd(zone({ dsd_transport: 'natif_servi_en_dop', dsd_transport_reason: 'sortie_non_asio' })))
      .toEqual({ cle: NON_ASIO, genre: 'dop' });
    expect(diagnosticDsd(zone({ dsd_transport: 'natif_servi_en_dop', dsd_transport_reason: 'pilote_sans_dsd' })))
      .toEqual({ cle: SANS_DSD, genre: 'dop' });
  });
  it('motif null : rien à dire (natif déclaré, DoP ou PCM explicites)', () => {
    expect(diagnosticDsd(zone({ dsd_transport: 'natif', dsd_transport_reason: null }))).toBeNull();
    expect(diagnosticDsd(zone({ dsd_mode: 'dop', dsd_transport: 'dop', dsd_transport_reason: null }))).toBeNull();
    expect(diagnosticDsd(zone({ dsd_mode: 'pcm', dsd_transport: 'pcm', dsd_transport_reason: null }))).toBeNull();
  });
  it('serveur antérieur à #7372 : la mention générique #1876, et rien sans champ', () => {
    expect(diagnosticDsd({ dsd_mode: 'native', dsd_transport: 'natif_servi_en_dop' })).toEqual({ cle: GENERIQUE, genre: 'dop' });
    expect(diagnosticDsd({ dsd_mode: 'native' })).toBeNull();
    expect(diagnosticDsd(null)).toBeNull();
  });
  it('un motif resté d’avant un changement de mode ne s’affiche pas sous « DoP »', () => {
    expect(diagnosticDsd(zone({ dsd_mode: 'dop' }))).toBeNull();
  });
});

describe('#2513 — la carte de zone dit la capacité et le motif', () => {
  it('inconnue → connue (natif servi en DoP, pilote sans DSD)', { timeout: 60_000 }, async () => {
    const h = await poser(zone());
    expect(mention(h)?.textContent?.trim()).toBe(fr[INCONNUE]);
    // Le message « inconnue » n'affirme ni un DoP ni un pilote occupé.
    expect(mention(h)?.textContent).not.toContain('DoP');
    await pousser(zone({ dsd_transport: 'natif_servi_en_dop', dsd_transport_reason: 'pilote_sans_dsd' }));
    expect(mention(h)?.textContent?.trim()).toBe(fr[SANS_DSD]);
    await pousser(zone({ dsd_transport: 'natif', dsd_transport_reason: null }));
    expect(mention(h), 'capacité native déclarée : message effacé').toBeNull();
  });

  it('changement de sortie : le motif suit la nouvelle sortie, null efface', { timeout: 60_000 }, async () => {
    const h = await poser(zone({ dsd_transport: 'natif_servi_en_dop', dsd_transport_reason: 'pilote_sans_dsd' }));
    expect(mention(h)?.textContent?.trim()).toBe(fr[SANS_DSD]);
    await pousser(zone({ output_device_id: 'local:hw:1,0', dsd_transport: 'natif_servi_en_dop', dsd_transport_reason: 'sortie_non_asio' }));
    expect(mention(h)?.textContent?.trim()).toBe(fr[NON_ASIO]);
    await pousser(zone({ output_type: 'dlna', output_device_id: 'uuid:x', dsd_transport: 'pcm', dsd_transport_reason: null }));
    expect(mention(h)).toBeNull();
  });

  it('changement de mode : DoP efface le message, Natif le ramène, sans aucun sondage', { timeout: 60_000 }, async () => {
    const h = await poser(zone());
    const sel = selecteurDsd(h)!;
    sel.value = 'dop';
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    await attendre();
    expect(mention(h), 'DoP explicite : rien à expliquer').toBeNull();
    selecteurDsd(h)!.value = 'native';
    selecteurDsd(h)!.dispatchEvent(new Event('change', { bubbles: true }));
    await attendre();
    expect(mention(h)?.textContent?.trim()).toBe(fr[INCONNUE]);
    // L'affichage ne fait que lire la zone : aucune route de sondage ASIO.
    expect(appels.filter((a) => /asio|sond|probe/i.test(a))).toEqual([]);
  });
});

describe('#2513 — les trois messages dans les quinze langues', () => {
  for (const l of ONZE_LANGUES) {
    it(l, () => {
      const d = dictionnaire(l);
      for (const cle of Object.values(CLE_MOTIF_DSD)) {
        expect(d[cle], `${l} : ${cle} absente`).toBeTruthy();
        expect(d[cle], `${l} : ${cle} doit nommer DSD`).toContain('DSD');
      }
      expect(d[NON_ASIO]).toContain('DoP');
      expect(d[SANS_DSD]).toContain('ASIO');
    });
  }
});
