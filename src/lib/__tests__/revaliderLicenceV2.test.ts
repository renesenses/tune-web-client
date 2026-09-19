// @vitest-environment jsdom
//
// « Revalider la licence » — PORTÉ en v2 avant que la phase 5 (web#1257) ne
// retire l'ancienne interface, seul chemin qui menait à
// `POST /cloud/license/validate` (`docs/capacites-sans-chemin-phase5.md`,
// domaine « Licence et cloud »).
//
// 🔴 CE TÉMOIN MONTE LE VRAI `SettingsV2`, ouvre l'onglet Licence comme un
// humain, clique sur « Valider », et lit ce que l'écran DIT. La route répond
// 200 dans tous ses échecs (#570) : le cas `cached` doit donc afficher un
// refus, jamais « Licence validée » — c'est `verdictValidationLicence` qui
// tranche, relu APRÈS `loadLicense`.
//
// Contre-épreuve (consignée dans la PR) : retirer l'appel à
// `api.validateLicense()` de `validateLic` rend les trois premiers cas ROUGES.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import { get } from 'svelte/store';

const validateLicense = vi.fn();
const getLicenseStatus = vi.fn();

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return {
    ...actual,
    apiFetch: vi.fn(async () => ({} as any)),
    getConfig: vi.fn(async () => ({})),
    getHealth: vi.fn(async () => ({ status: 'ok' })),
    getStats: vi.fn(async () => ({})),
    getScanSchedule: vi.fn(async () => ({ enabled: false, time: '03:00' })),
    getScanStatus: vi.fn(async () => ({ scanning: false })),
    getScanReport: vi.fn(async () => null),
    listServiceTokens: vi.fn(async () => []),
    validateLicense: (...a: unknown[]) => validateLicense(...a),
    getLicenseStatus: (...a: unknown[]) => getLicenseStatus(...a),
  };
});

import SettingsV2 from '../../components/v2/SettingsV2.svelte';
import { preferences } from '../stores/preferences';
import { notifications } from '../stores/notifications';
import { loadLicense } from '../stores/license';
import lFr from '../locales/fr';
const fr = lFr as unknown as Record<string, string>;

class ResizeObserverInerte { observe() {} unobserve() {} disconnect() {} }
const respirer = () => new Promise((r) => setTimeout(r, 0));
async function laisserFiler() { for (let i = 0; i < 8; i++) await respirer(); flushSync(); }
const texte = (el: HTMLElement) => (el.textContent ?? '').replace(/\s+/g, ' ');

let hote: HTMLDivElement | null = null;
let monte: Record<string, any> | null = null;

async function ouvrirLicence(): Promise<HTMLDivElement> {
  preferences.update((p) => ({ ...p, settingsLevel: 'beginner' }));
  await loadLicense();
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(SettingsV2, { target: hote, props: {} });
  flushSync();
  await laisserFiler();
  const onglet = [...hote.querySelectorAll('button')].find(
    (b) => (b.textContent ?? '').trim() === fr['settings.tunePremiumLicense'],
  ) as HTMLButtonElement | undefined;
  expect(onglet, 'onglet Licence introuvable').toBeDefined();
  onglet!.click();
  flushSync();
  await laisserFiler();
  return hote;
}

function boutonValider(el: HTMLElement): HTMLButtonElement | undefined {
  return [...el.querySelectorAll('button')].find(
    (b) => (b.textContent ?? '').trim() === fr['settings.validate'],
  ) as HTMLButtonElement | undefined;
}

const statut = (tier: string, key: string | null = 'ABCD-EFGH-IJKL-MNOP') => ({
  tier, license_key: key, expires_at: null, features: {}, zone_limit: null,
});

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', ResizeObserverInerte);
  validateLicense.mockReset();
  getLicenseStatus.mockReset();
});

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  hote?.remove();
  hote = null;
  vi.unstubAllGlobals();
});

describe('Réglages v2 › Licence — « Revalider la licence »', () => {
  it('validated + premium relu ⇒ « Licence validée »', async () => {
    getLicenseStatus.mockResolvedValue(statut('premium'));
    validateLicense.mockResolvedValue({ status: 'validated', tier: 'premium' });
    const el = await ouvrirLicence();
    const b = boutonValider(el);
    expect(b, '« Valider » absent de l’onglet Licence').toBeDefined();
    b!.click();
    await laisserFiler();
    expect(validateLicense).toHaveBeenCalledTimes(1);
    const msgs = get(notifications).map((n: any) => n.message);
    expect(msgs).toContain(fr['settings.licenseValidated']);
  });

  it('🔴 200 + `cached` ⇒ un REFUS nommé, jamais « Licence validée » (#570)', async () => {
    getLicenseStatus.mockResolvedValue(statut('free'));
    validateLicense.mockResolvedValue({ status: 'cached', message: 'Server endpoint not found' });
    const el = await ouvrirLicence();
    const avant = get(notifications).length;
    boutonValider(el)!.click();
    await laisserFiler();
    expect(validateLicense).toHaveBeenCalledTimes(1);
    expect(texte(el)).toContain(fr['settings.licenseNotConfirmed']);
    // Seules les notifications nées de CE clic comptent (le magasin est partagé).
    const msgs = get(notifications).slice(avant).map((n: any) => n.message);
    expect(msgs).not.toContain(fr['settings.licenseValidated']);
  });

  it('plafond distant (429) ⇒ message dit, et bouton au repos', async () => {
    getLicenseStatus.mockResolvedValue(statut('free'));
    validateLicense.mockResolvedValue({ status: 'error', message: 'Server returned 429 Too Many Requests' });
    const el = await ouvrirLicence();
    boutonValider(el)!.click();
    await laisserFiler();
    expect(texte(el)).toContain(fr['settings.licenseRateLimited']);
    expect(boutonValider(el)!.disabled).toBe(true);
  });

  it('sans clé enregistrée, le bouton n’est pas proposé', async () => {
    getLicenseStatus.mockResolvedValue(statut('free', null));
    const el = await ouvrirLicence();
    expect(boutonValider(el)).toBeUndefined();
  });
});
