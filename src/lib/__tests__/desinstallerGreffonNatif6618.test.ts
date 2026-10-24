// @vitest-environment jsdom
//
// tune-server-rust#6618 (issue #6256), partie web : un bouton « Désinstaller »
// sur chaque greffon audio natif TIERS de l'écran Extensions.
//
// La route est `POST /api/v1/audio-plugins/{id}/uninstall` avec
// `{"purge": true, "keep_settings": <bool>}` (corps de la PR serveur #6618).
// La confirmation dit ce qui sera supprimé — le greffon et ses binaires — et
// propose, DÉCOCHÉE par défaut, d'effacer aussi ses réglages. Après succès, la
// liste est relue et le greffon n'y figure plus.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import { get } from 'svelte/store';
import { dialogs } from '../stores/dialogs';
import { t } from '../i18n';
import PluginsV2 from '../../components/v2/PluginsV2.svelte';

vi.setConfig({ testTimeout: 20_000 });

const TIERS = { error: null, id: 'exemple-tiers', native_loaded: true, third_party: true };
const INTEGRE = { error: null, id: 'equalizer', native_loaded: false, third_party: false };

function reponse(status: number, corps: unknown): Response {
  return {
    ok: status >= 200 && status < 300, status, statusText: String(status),
    headers: new Map([['content-type', 'application/json']]),
    json: async () => corps,
    text: async () => JSON.stringify(corps),
  } as unknown as Response;
}

let installes: unknown[];
let refus: { status: number; corps: unknown } | null;
let envois: { url: string; corps: unknown }[];
let cible: HTMLDivElement | null = null;
let monte: Record<string, unknown> | null = null;

beforeEach(() => {
  installes = [INTEGRE, TIERS];
  refus = null;
  envois = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const u = String(url);
    if (u.endsWith('/audio-plugins/exemple-tiers/uninstall')) {
      envois.push({ url: u, corps: JSON.parse(String(init?.body ?? 'null')) });
      if (refus) return reponse(refus.status, refus.corps);
      installes = installes.filter((p: any) => p.id !== 'exemple-tiers');
      return reponse(200, { unloaded: true, files_removed: true, configuration_preserved: true,
        settings_removed: [], zones_refreshed_live: 0, restart_required: false });
    }
    if (/\/audio-plugins$/.test(u)) return reponse(200, { abi: 1, plugins: installes, target: 'x86_64-unknown-linux-gnu' });
    if (/\/plugins$/.test(u)) return reponse(200, []);
    if (u.includes('/marketplace/')) return reponse(404, { error: 'not found' });
    return reponse(200, {});
  }));
  cible = document.createElement('div');
  document.body.appendChild(cible);
});

afterEach(() => {
  for (const d of get(dialogs)) dialogs.settle(d.id, null);
  if (monte) unmount(monte);
  monte = null;
  cible?.remove();
  cible = null;
  vi.unstubAllGlobals();
});

async function jusqua(condition: () => boolean, borne = 8000): Promise<void> {
  const fin = Date.now() + borne;
  for (;;) {
    flushSync();
    if (condition()) return;
    if (Date.now() >= fin) return;
    await new Promise((r) => setTimeout(r, 0));
  }
}

const q = (sel: string) => cible!.querySelector(sel) as HTMLElement | null;
const texte = (cle: string) => get(t)(cle as any);

async function ouvrirLaConfirmation() {
  monte = mount(PluginsV2, { target: cible! });
  await jusqua(() => !!q('[data-natif="exemple-tiers"] .desinstaller-natif'));
  const bouton = q('[data-natif="exemple-tiers"] .desinstaller-natif') as HTMLButtonElement | null;
  expect(bouton, 'pas de bouton « Désinstaller » sur le greffon natif tiers').not.toBeNull();
  expect(bouton!.textContent).toContain(texte('v2.plug.nativeUninstall'));
  bouton!.click();
  await jusqua(() => get(dialogs).length > 0);
  const [d] = get(dialogs);
  expect(d, 'aucune confirmation avant de supprimer').toBeTruthy();
  return d;
}

describe('Extensions — désinstaller un greffon natif tiers (#6618)', () => {
  it('🔴 la confirmation dit ce qui part ; réglages gardés par défaut ; la liste se met à jour', async () => {
    const d = await ouvrirLaConfirmation();
    expect(d.danger).toBe(true);
    expect(d.message).toBe(texte('v2.plug.nativeUninstallConfirm').replace('{name}', 'exemple-tiers'));
    expect(texte('v2.plug.nativeUninstallConfirm')).toContain('binaires');
    expect(d.case, 'la case « effacer aussi ses réglages » manque').toEqual({
      label: texte('v2.plug.nativeUninstallPurgeSettings'), coche: false,
    });

    dialogs.settle(d.id, { coche: false });
    await jusqua(() => !q('[data-natif="exemple-tiers"]'));

    expect(envois).toEqual([{ url: expect.stringContaining('/api/v1/audio-plugins/exemple-tiers/uninstall'),
      corps: { purge: true, keep_settings: true } }]);
    expect(q('[data-natif="exemple-tiers"]'), 'le greffon désinstallé est toujours listé').toBeNull();
  });

  it('case cochée : les réglages sont effacés aussi (keep_settings: false)', async () => {
    const d = await ouvrirLaConfirmation();
    dialogs.settle(d.id, { coche: true });
    await jusqua(() => envois.length > 0 && !q('[data-natif="exemple-tiers"]'));
    expect(envois.map((e) => e.corps)).toEqual([{ purge: true, keep_settings: false }]);
  });

  it('annuler ne supprime rien', async () => {
    const d = await ouvrirLaConfirmation();
    dialogs.settle(d.id, null);
    await jusqua(() => false, 150);
    expect(envois).toEqual([]);
    expect(q('[data-natif="exemple-tiers"]')).not.toBeNull();
  });

  it('un refus du serveur montre son detail et invite à redémarrer puis réessayer', async () => {
    refus = { status: 500, corps: { detail: 'le fichier du greffon est encore utilisé' } };
    const d = await ouvrirLaConfirmation();
    dialogs.settle(d.id, { coche: false });
    await jusqua(() => !!q('[data-natif="exemple-tiers"] [data-refus-desinstallation]'));
    const motif = q('[data-natif="exemple-tiers"] [data-refus-desinstallation]');
    expect(motif, 'l’échec de désinstallation reste muet').not.toBeNull();
    expect(motif!.textContent).toContain('le fichier du greffon est encore utilisé');
    expect(motif!.textContent).toContain(texte('v2.plug.nativeUninstallFailed'));
  });
});
