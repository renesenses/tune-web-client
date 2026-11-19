// @vitest-environment jsdom
// tune-server-rust#3245 : mode exclusif réglé zone par zone, PATCH réel simulé.
// Le serveur le règle par zone depuis la rc12 (`exclusive_mode`, `null` =
// suivre la machine) ; aucun écran ne l'exposait. Zone locale seulement, et
// seulement quand le serveur publie le champ.
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
/** Ce que le serveur dit avoir appliqué après un PATCH (`exclusive_mode_applique`) :
 *  par défaut, la demande est appliquée tout de suite (rien ne joue). */
let appliqueAuPatch: (corps: any) => Record<string, unknown> = (corps) =>
  'exclusive_mode' in corps ? { exclusive_mode_applique: corps.exclusive_mode ?? false } : {};

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
        zonesServeur[0] = { ...(zonesServeur[0] as Record<string, unknown>), ...corps, ...appliqueAuPatch(corps) };
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

const SEL = '[data-reglage="zone-mode-exclusif"]';

describe('#3245 — mode exclusif par zone', () => {
  it('masque le réglage sur un serveur qui ne publie pas le champ', async () => {
    const h = await poser(zone());
    expect(h.querySelector(SEL)).toBeNull();
  });

  it.each(['dlna', 'airplay', 'chromecast'])('masque le réglage pour une zone %s', async (output_type) => {
    const h = await poser(zone({ exclusive_mode: null, output_type }));
    expect(h.querySelector(SEL)).toBeNull();
  });

  it('zone locale : « comme la machine », puis exclusif, partagé et retour à la machine', { timeout: 60_000 }, async () => {
    const h = await poser(zone({ exclusive_mode: null }));
    const choix = h.querySelector<HTMLSelectElement>(`${SEL} select`);
    expect(choix, 'le réglage de mode exclusif doit apparaître sur une zone locale').not.toBeNull();
    expect(choix!.labels?.[0]?.textContent?.trim()).toBe(fr['settings.zoneExclusiveMode']);
    expect(h.querySelector(`#${choix!.getAttribute('aria-describedby')}`)?.textContent).toBe(fr['settings.zoneExclusiveHint']);
    expect(choix!.value).toBe('');
    expect([...choix!.options].map((o) => o.textContent?.trim())).toEqual([
      fr['settings.zoneExclusiveFollow'], fr['settings.zoneExclusiveOn'], fr['settings.zoneExclusiveOff'],
    ]);
    for (const [v, attendu] of [['true', true], ['false', false], ['', null]] as const) {
      choix!.value = v;
      choix!.dispatchEvent(new Event('change', { bubbles: true }));
      await vi.waitFor(() => expect(patchesZone.at(-1)?.corps).toEqual({ exclusive_mode: attendu }));
    }
    expect(patchesZone.map((p) => p.corps)).toEqual([
      { exclusive_mode: true }, { exclusive_mode: false }, { exclusive_mode: null },
    ]);
    // Appliqué tout de suite : aucune mention d'attente.
    expect(h.querySelector(`${SEL} [data-exclusif-en-attente]`)).toBeNull();
  });

  it('affiche la valeur posée sur la zone', async () => {
    const h = await poser(zone({ exclusive_mode: false }));
    expect(h.querySelector<HTMLSelectElement>(`${SEL} select`)!.value).toBe('false');
  });

  it('dit quand la sortie garde son mode (lecture en cours, ou pilote qui impose le sien)', { timeout: 60_000 }, async () => {
    appliqueAuPatch = () => ({ exclusive_mode_applique: true });
    try {
      const h = await poser(zone({ exclusive_mode: null }));
      const choix = h.querySelector<HTMLSelectElement>(`${SEL} select`)!;
      choix.value = 'false';
      choix.dispatchEvent(new Event('change', { bubbles: true }));
      await vi.waitFor(() => expect(patchesZone.at(-1)?.corps).toEqual({ exclusive_mode: false }));
      await vi.waitFor(() =>
        expect(h.querySelector(`${SEL} [data-exclusif-en-attente]`)?.textContent).toBe(fr['settings.zoneExclusivePending']),
      );
    } finally {
      appliqueAuPatch = (corps) => ('exclusive_mode' in corps ? { exclusive_mode_applique: corps.exclusive_mode ?? false } : {});
    }
  });
});
