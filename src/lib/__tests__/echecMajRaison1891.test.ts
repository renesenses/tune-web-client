// @vitest-environment jsdom
//
// `renesenses/tune-web-client#1891` — une installation en échec n'était JAMAIS
// reconnue.
//
// Le serveur publie `phase: "failed: <raison>"` (jamais `"failed"` nu, voir
// `tune-server/src/routes/system/update.rs`). `SettingsV2` testait
// `st?.phase === 'failed'` : l'échec passait inaperçu, la boucle sondait 180 s
// puis affichait « Impossible de savoir si la mise à jour s'est installée », et
// la raison donnée par le serveur n'arrivait jamais à l'écran (Stéphane
// VILLERIO, fil 2113, journal : `failed: Install failed: rename current to
// .old: No such file or directory (os error 2)`).
//
// Le témoin MONTE `SettingsV2`, clique « Mettre à jour » et lit l'écran avec la
// forme EXACTE de la phase que publie le serveur.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';

const installUpdate = vi.fn();
const getUpdateStatus = vi.fn();
const getHealth = vi.fn();

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return {
    ...actual,
    apiFetch: vi.fn(async (chemin: string) =>
      chemin === '/system/update/check'
        ? { current: '0.9.166', latest: '1.0.0-rc1', update_available: true }
        : ({} as any),
    ),
    installUpdate: (...a: unknown[]) => installUpdate(...a),
    getUpdateStatus: () => getUpdateStatus(),
    getHealth: () => getHealth(),
    getStats: vi.fn(async () => ({})),
    getConfig: vi.fn(async () => ({ music_dirs: [] })),
    getScanSchedule: vi.fn(async () => ({ enabled: false, time: '03:00' })),
    getScanStatus: vi.fn(async () => ({ scanning: false })),
    getScanReport: vi.fn(async () => null),
    listServiceTokens: vi.fn(async () => []),
  };
});

import SettingsV2 from '../../components/v2/SettingsV2.svelte';
import { raisonEchecPhase } from '../phaseEchecMaj';
import { preferences } from '../stores/preferences';
import { dialogs } from '../stores/dialogs';
import { get } from 'svelte/store';
import lFr from '../locales/fr';

const fr = lFr as unknown as Record<string, string>;
const texte = (el: HTMLElement) => (el.textContent ?? '').replace(/\s+/g, ' ');

class ResizeObserverInerte {
  observe() {}
  unobserve() {}
  disconnect() {}
}

let hote: HTMLDivElement | null = null;
let monte: Record<string, any> | null = null;

async function tourner(ms: number) {
  await vi.advanceTimersByTimeAsync(ms);
  flushSync();
}

async function monterEtLancer(): Promise<HTMLDivElement> {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(SettingsV2, { target: hote, props: {} });
  flushSync();
  await tourner(0);
  await tourner(0);
  const onglet = [...hote.querySelectorAll('button')].find(
    (b) => (b.textContent ?? '').trim() === fr['settings.tabSystem'],
  );
  expect(onglet, 'onglet Système introuvable').toBeDefined();
  (onglet as HTMLButtonElement).click();
  flushSync();
  const bouton = [...hote.querySelectorAll('button')].find(
    (x) => (x.textContent ?? '').trim() === fr['settings.updateButton'],
  );
  expect(bouton, 'bouton « Mettre à jour » absent : le témoin ne prouverait rien').toBeDefined();
  (bouton as HTMLButtonElement).click();
  await tourner(0);
  return hote;
}

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', ResizeObserverInerte);
  vi.useFakeTimers();
  installUpdate.mockReset();
  installUpdate.mockResolvedValue({ ok: true });
  getUpdateStatus.mockReset();
  getHealth.mockReset();
  getHealth.mockRejectedValue(new Error('hors sujet'));
  preferences.update((p) => ({ ...p, settingsLevel: 'beginner' }));
});

afterEach(() => {
  for (const r of get(dialogs)) dialogs.settle(r.id, false);
  if (monte) unmount(monte);
  monte = null;
  if (hote) hote.remove();
  hote = null;
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const RAISON = 'Install failed: rename current to .old: No such file or directory (os error 2)';

describe('#1891 — raisonEchecPhase', () => {
  it('reconnaît la forme suffixée publiée par la mise à jour', () => {
    expect(raisonEchecPhase(`failed: ${RAISON}`)).toBe(RAISON);
    expect(raisonEchecPhase('failed: Cannot determine current exe')).toBe('Cannot determine current exe');
  });
  it('reconnaît `failed` nu (flux appliance) comme un échec sans raison', () => {
    expect(raisonEchecPhase('failed')).toBe('');
  });
  it('ne confond pas les autres phases avec un échec', () => {
    for (const p of [null, undefined, '', 'downloading', 'verifying', 'extracting', 'installing',
      'installing_bundle', 'restart_pending_playback', 'restarting', 'dmg_ready', 'done', 42]) {
      expect(raisonEchecPhase(p), String(p)).toBeNull();
    }
  });
});

describe('#1891 — l’écran de mise à jour montre l’échec et sa raison', () => {
  it('🔴 `failed: <raison>` : l’échec est dit au premier tour, raison comprise', async () => {
    getUpdateStatus.mockResolvedValue({
      current_version: '0.9.166',
      phase: `failed: ${RAISON}`,
      update_in_progress: false,
    });
    const el = await monterEtLancer();
    await tourner(3000); // un seul tour de sonde

    expect(
      texte(el),
      'l’échec publié par le serveur n’est pas reconnu : la boucle continue de sonder',
    ).toContain(fr['settings.updateInstallFailed'].replace('{reason}', RAISON));
    expect(getUpdateStatus).toHaveBeenCalledTimes(1);

    await tourner(185_000);
    expect(
      texte(el),
      'la boucle est allée au bout du budget et a fini sur « Impossible de savoir »',
    ).not.toContain(fr['settings.updateStatusUnknown']);
    expect(getUpdateStatus).toHaveBeenCalledTimes(1);
  });

  it('`failed` nu : l’échec est dit (sans raison inventée)', async () => {
    getUpdateStatus.mockResolvedValue({
      current_version: '0.9.166',
      phase: 'failed',
      update_in_progress: false,
    });
    const el = await monterEtLancer();
    await tourner(3000);
    expect(texte(el)).toContain(fr['settings.updateBlockedUnknown']);
  });
});
