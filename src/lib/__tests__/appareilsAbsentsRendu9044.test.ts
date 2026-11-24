// @vitest-environment jsdom
//
// tune-server-rust#9044 (relecture du 24/11) — un serveur rc13 répond
// `409 zone_liee` à « Oublier cet appareil » sans `with_zone` : il ne sait
// pas garder la zone. L'appareil reste parmi les ABSENTS (rc13 ne renvoie pas
// `forgotten`) : la confirmation de suppression de la zone doit donc
// s'afficher DANS SA LIGNE, avec l'explication — et rien n'est supprimé avant
// le second clic.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';

import SettingsV2 from '../../components/v2/SettingsV2.svelte';
import { preferences } from '../stores/preferences';
import { v2SettingsTarget } from '../stores/v2SettingsNav';

const APPAREIL = 'uuid:9044-rc13';

let hote: HTMLDivElement | null = null;
let monte: Record<string, any> | null = null;
const suppressions: string[] = [];

function json(corps: unknown, status = 200) {
  return new Response(JSON.stringify(corps), { status, headers: { 'Content-Type': 'application/json' } });
}

async function attendre(tours = 8) {
  for (let i = 0; i < tours; i++) {
    await new Promise((r) => setTimeout(r, 0));
    flushSync();
  }
}

beforeEach(() => {
  suppressions.length = 0;
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} } as any);
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const u = String(url);
    if (u.endsWith('/devices/absent')) {
      // Corps rc13 : ni `absent_since` ni `forgotten`.
      return json({ total: 1, items: [{ device_id: APPAREIL, name: 'Ampli du salon', type: 'dlna', zone_id: 7,
        zones: [{ zone_id: 7, zone_name: 'Ampli du salon', zone_hidden: false }] }] });
    }
    if (u.endsWith('/devices/forget-policy')) return json({ error: 'not found' }, 404);
    if (init?.method === 'DELETE' && u.includes('/devices/')) {
      suppressions.push(u);
      if (u.includes('with_zone=true')) {
        return json({ device_id: APPAREIL, forgotten: true, zones_deleted: [{ zone_id: 7, zone_name: 'Ampli du salon' }] });
      }
      return json({ error: 'zone_liee', code: 'zone_liee', device_id: APPAREIL, zone_id: 7, zone_name: 'Ampli du salon',
        message: 'Cet appareil a encore la zone « Ampli du salon ».' }, 409);
    }
    return json(/\/(zones|profiles|devices|playlists|shortcuts)(\?|$)/.test(u) ? [] : {});
  }));
  preferences.update((p) => ({ ...p, settingsLevel: 'expert' }));
});

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  hote?.remove();
  hote = null;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('Appareils absents : serveur rc13 (409 zone_liee)', () => {
  it('la confirmation de suppression apparaît DANS la ligne de l’absent, et ne supprime qu’au second clic', { timeout: 60_000 }, async () => {
    v2SettingsTarget.set({ tab: 'devices', section: 'absentDevices' } as any);
    hote = document.createElement('div');
    document.body.appendChild(hote);
    monte = mount(SettingsV2, { target: hote, props: {} });
    flushSync();
    await attendre();

    const liste = () => hote!.querySelector<HTMLElement>('[data-reglage="appareils-absents"]');
    expect(liste(), 'section des appareils absents non rendue').not.toBeNull();
    const ouvrir = liste()!.querySelector<HTMLButtonElement>('[data-oubli-ouvrir="7"]');
    expect(ouvrir, 'pas de bouton « Oublier » sur la ligne').not.toBeNull();
    ouvrir!.click();
    await attendre();

    const oublier = liste()!.querySelector<HTMLButtonElement>('.oubli-conf button.danger');
    expect(oublier, 'pas de confirmation d’oubli').not.toBeNull();
    oublier!.click();
    await attendre();

    // Le 409 : un seul appel, SANS with_zone ; aucune suppression encore.
    expect(suppressions).toHaveLength(1);
    expect(suppressions[0]).not.toContain('with_zone');

    const confirmer = liste()!.querySelector<HTMLButtonElement>('[data-suppression-confirmer="7"]');
    expect(confirmer, 'impasse : aucune confirmation de suppression dans la ligne de l’absent').not.toBeNull();
    expect(liste()!.textContent).toMatch(/Mettez Tune à jour|Update Tune/);
    expect(suppressions.filter((s) => s.includes('with_zone=true'))).toHaveLength(0);

    confirmer!.click();
    await attendre();
    expect(suppressions.filter((s) => s.includes('with_zone=true'))).toHaveLength(1);
  });
});
