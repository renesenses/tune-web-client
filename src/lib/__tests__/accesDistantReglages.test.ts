// @vitest-environment jsdom
//
// Réglages › Audio › Tune Bridge : le lien d'accès à distance se copie en un
// clic et s'affiche en QR code, pour l'ouvrir depuis un téléphone hors du
// réseau. Il vient de `GET /cloud/bridge/access-link` (administrateur seul) ;
// sans lui (409, 403, serveur antérieur), rien n'est montré.
//
// Le lien se renouvelle (`POST /cloud/bridge/rotate-token`) après une
// confirmation qui dit que les liens, QR et apps déjà appairées cesseront de
// marcher ; le nouveau lien et son QR remplacent alors l'ancien.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';

import SettingsV2 from '../../components/v2/SettingsV2.svelte';
import { preferences } from '../stores/preferences';
import { v2SettingsTarget } from '../stores/v2SettingsNav';
import { dialogs } from '../stores/dialogs';

const SID = '75f24b9e-0000-4000-8000-000000000001';
const LIEN = `https://bridge.mozaiklabs.fr/${SID}/#token=FAUX-jeton-1`;
const NOUVEAU = `https://bridge.mozaiklabs.fr/${SID}/#token=FAUX-jeton-2`;

let hote: HTMLDivElement | null = null;
let monte: Record<string, any> | null = null;
let reponseLien: () => Response;
const copies: string[] = [];
const renouvellements: string[] = [];

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
  renouvellements.length = 0;
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} } as any);
  vi.stubGlobal('isSecureContext', true);
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText: vi.fn(async (t: string) => { copies.push(t); }) },
  });
  reponseLien = () => json({ server_id: SID, access_url: `https://bridge.mozaiklabs.fr/${SID}/`, link: LIEN });
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const u = String(url);
    if (u.endsWith('/cloud/bridge/rotate-token')) {
      renouvellements.push(init?.method ?? 'GET');
      return json({ server_id: SID, access_url: `https://bridge.mozaiklabs.fr/${SID}/`, link: NOUVEAU });
    }
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
  vi.restoreAllMocks();
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

  it('renouvelle le lien après confirmation, puis montre le nouveau', { timeout: 60_000 }, async () => {
    const confirmer = vi.spyOn(dialogs, 'confirm').mockResolvedValue(true);
    const el = await ecranPont();
    const qrAvant = el.querySelector('[data-acces="qr"]')!.innerHTML;
    const bouton = el.querySelector<HTMLButtonElement>('[data-acces="renouveler"]');
    expect(bouton, 'aucun bouton de renouvellement du lien').not.toBeNull();
    bouton!.click();
    await attendre();

    expect(confirmer).toHaveBeenCalledTimes(1);
    expect(confirmer.mock.calls[0][1]).toEqual({ danger: true });
    expect(renouvellements).toEqual(['POST']);
    expect(el.querySelector('[data-acces="qr"]')!.innerHTML, 'le QR code n’a pas changé').not.toBe(qrAvant);
    el.querySelector<HTMLButtonElement>('[data-acces="copier"]')!.click();
    await attendre();
    expect(copies).toEqual([NOUVEAU]);
  });

  it('ne renouvelle rien si la confirmation est refusée', { timeout: 60_000 }, async () => {
    vi.spyOn(dialogs, 'confirm').mockResolvedValue(false);
    const el = await ecranPont();
    const qrAvant = el.querySelector('[data-acces="qr"]')!.innerHTML;
    el.querySelector<HTMLButtonElement>('[data-acces="renouveler"]')!.click();
    await attendre();
    expect(renouvellements).toEqual([]);
    expect(el.querySelector('[data-acces="qr"]')!.innerHTML).toBe(qrAvant);
  });
});
