// @vitest-environment jsdom
//
// Réglages › Audio › Tune Bridge : le lien d'accès à distance se copie en un
// clic et s'affiche en QR code, pour l'ouvrir depuis un téléphone hors du
// réseau. Il vient de `GET /cloud/bridge/access-link` (administrateur seul) ;
// sans lui (409, 403, serveur antérieur), rien n'est montré.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';

import SettingsV2 from '../../components/v2/SettingsV2.svelte';
import { preferences } from '../stores/preferences';
import { v2SettingsTarget } from '../stores/v2SettingsNav';

const SID = '75f24b9e-0000-4000-8000-000000000001';
const LIEN = `https://bridge.mozaiklabs.fr/${SID}/#token=FAUX-jeton-1`;

let hote: HTMLDivElement | null = null;
let monte: Record<string, any> | null = null;
let reponseLien: () => Response;
const copies: string[] = [];

function json(corps: unknown, status = 200) {
  return new Response(JSON.stringify(corps), { status, headers: { 'Content-Type': 'application/json' } });
}

async function attendre(tours = 6) {
  for (let i = 0; i < tours; i++) {
    await new Promise((r) => setTimeout(r, 0));
    flushSync();
  }
}

async function ecranPont(): Promise<HTMLElement> {
  v2SettingsTarget.set({ tab: 'audio', section: 'bridge' } as any);
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(SettingsV2, { target: hote, props: {} });
  flushSync();
  await attendre();
  return hote;
}

beforeEach(() => {
  copies.length = 0;
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} } as any);
  vi.stubGlobal('isSecureContext', true);
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText: vi.fn(async (t: string) => { copies.push(t); }) },
  });
  reponseLien = () => json({ server_id: SID, access_url: `https://bridge.mozaiklabs.fr/${SID}/`, link: LIEN });
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    const u = String(url);
    if (u.endsWith('/cloud/bridge/status')) {
      return json({ enabled: true, connected: true, server_id: SID, has_token: true,
        access_url: `https://bridge.mozaiklabs.fr/${SID}/` });
    }
    if (u.endsWith('/cloud/bridge/access-link')) return reponseLien();
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
});

describe('Tune Bridge : lien d’accès à distance et QR code', () => {
  it('copie le lien complet en un clic', { timeout: 60_000 }, async () => {
    const el = await ecranPont();
    const bouton = el.querySelector<HTMLButtonElement>('[data-acces="copier"]');
    expect(bouton, 'aucun bouton de copie du lien d’accès').not.toBeNull();
    bouton!.click();
    await attendre();
    expect(copies).toEqual([LIEN]);
  });

  it('affiche le QR code du lien', { timeout: 60_000 }, async () => {
    const el = await ecranPont();
    const qr = el.querySelector('[data-acces="qr"]');
    expect(qr, 'aucun QR code').not.toBeNull();
    expect(qr!.querySelector('svg'), 'le QR code n’est pas un SVG').not.toBeNull();
  });

  it('ne montre rien quand le serveur refuse le lien', { timeout: 60_000 }, async () => {
    reponseLien = () => json({ error: 'no_bridge_token' }, 409);
    const el = await ecranPont();
    expect(el.querySelector('[data-acces="copier"]')).toBeNull();
    expect(el.querySelector('[data-acces="qr"]')).toBeNull();
  });
});
