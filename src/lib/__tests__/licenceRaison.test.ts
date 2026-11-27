// @vitest-environment jsdom
//
// rc14 — quand mozaiklabs.fr refuse ou rétrograde une licence, Réglages ›
// Licence doit dire POURQUOI le palier est gratuit, avec le geste à faire,
// au lieu d'un FREE muet. Le serveur expose la raison dans
// `GET /cloud/license/status` (`reason_detail`) ; ce banc vérifie la phrase
// choisie, les vingt dictionnaires, et l'écran monté.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';

vi.setConfig({ testTimeout: 30_000 });

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
import { licenseState } from '../stores/license';
import { phraseRaisonLicence, URL_COMPTE_MOZAIKLABS } from '../licenceRaison';
import { ONZE_LANGUES, dictionnaire, fr as lFr } from './onzeDictionnaires';

const fr = lFr as unknown as Record<string, string>;

const CLES = [
  'settings.licenseReasonSessionConflict',
  'settings.licenseReasonSessionConflictLater',
  'settings.licenseReasonKeyExpired',
  'settings.licenseReasonKeyExpiredNoDate',
  'settings.licenseReasonKeyInvalid',
  'settings.licenseReasonServerUnreachable',
  'settings.licenseReasonRateLimited',
  'settings.licenseReasonGracePeriod',
  'settings.licenseReasonAccountLink',
] as const;

describe('phraseRaisonLicence — la phrase et le geste', () => {
  it('session tenue ailleurs : les minutes restantes, sinon « plus tard »', () => {
    const p = phraseRaisonLicence({ reason: 'session_conflict', minutes_remaining: 42 })!;
    expect(p.cle).toBe('settings.licenseReasonSessionConflict');
    expect(p.minutes).toBe(42);
    expect(p.ton).toBe('warn');
    expect(phraseRaisonLicence({ reason: 'session_conflict', minutes_remaining: null })!.cle).toBe(
      'settings.licenseReasonSessionConflictLater',
    );
  });

  it('abonnement échu : la date et le lien vers le compte', () => {
    const p = phraseRaisonLicence({ reason: 'key_expired', expires_at: '2026-10-01T00:00:00+02:00' })!;
    expect(p.cle).toBe('settings.licenseReasonKeyExpired');
    expect(p.date).toBe('2026-10-01T00:00:00+02:00');
    expect(p.lien).toBe(URL_COMPTE_MOZAIKLABS);
    expect(phraseRaisonLicence({ reason: 'key_expired' })!.cle).toBe('settings.licenseReasonKeyExpiredNoDate');
  });

  it('clé invalide, site injoignable, plafond de requêtes', () => {
    expect(phraseRaisonLicence({ reason: 'key_invalid' })!.lien).toBe(URL_COMPTE_MOZAIKLABS);
    expect(phraseRaisonLicence({ reason: 'server_unreachable' })!.cle).toBe(
      'settings.licenseReasonServerUnreachable',
    );
    expect(phraseRaisonLicence({ reason: 'rate_limited' })!.cle).toBe('settings.licenseReasonRateLimited');
  });

  it('grâce hors ligne : ton rassurant, et rien sans date de fin', () => {
    const p = phraseRaisonLicence({ reason: 'grace_period', grace_until: '2026-12-10T10:00:00Z' })!;
    expect(p.ton).toBe('info');
    expect(p.date).toBe('2026-12-10T10:00:00Z');
    expect(phraseRaisonLicence({ reason: 'grace_period' })).toBeNull();
  });

  it('rien à dire : pas de détail, ou raison inconnue', () => {
    expect(phraseRaisonLicence(null)).toBeNull();
    expect(phraseRaisonLicence(undefined)).toBeNull();
    expect(phraseRaisonLicence({ reason: 'raison_de_demain' })).toBeNull();
  });
});

describe('les vingt dictionnaires portent les phrases', () => {
  for (const langue of ONZE_LANGUES) {
    it(langue, () => {
      const d = dictionnaire(langue);
      for (const cle of CLES) {
        expect(d[cle], `${langue} : ${cle} manque`).toBeTruthy();
      }
      expect(d['settings.licenseReasonSessionConflict']).toContain('{n}');
      expect(d['settings.licenseReasonKeyExpired']).toContain('{date}');
      expect(d['settings.licenseReasonGracePeriod']).toContain('{date}');
    });
  }
});

class ResizeObserverInerte {
  observe() {}
  unobserve() {}
  disconnect() {}
}

const fetchSimule = vi.fn(
  async () => new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } }),
);

let hote: HTMLDivElement | null = null;
let monte: Record<string, unknown> | null = null;

async function attendre(tours = 4) {
  for (let i = 0; i < tours; i++) {
    await new Promise((r) => setTimeout(r, 0));
    flushSync();
  }
}

async function ongletLicence(): Promise<HTMLElement> {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(SettingsV2, { target: hote, props: {} }) as Record<string, unknown>;
  flushSync();
  await attendre();
  const onglet = [...hote.querySelectorAll('button')].find(
    (b) => (b.textContent ?? '').trim() === fr['settings.tunePremiumLicense'],
  );
  expect(onglet, 'onglet Licence introuvable à l’écran').toBeDefined();
  (onglet as HTMLButtonElement).click();
  await attendre();
  return hote;
}

function poser(detail: unknown) {
  licenseState.update((s) => ({
    ...s,
    loaded: true,
    tier: 'free',
    licenseKey: 'ABCD-EFGH-IJKL',
    reasonDetail: detail as never,
  }));
  flushSync();
}

describe('Réglages › Licence — ce que l’écran AFFICHE', () => {
  beforeEach(() => {
    vi.stubGlobal('ResizeObserver', ResizeObserverInerte);
    vi.stubGlobal('fetch', fetchSimule);
  });

  afterEach(() => {
    if (monte) unmount(monte);
    monte = null;
    if (hote) hote.remove();
    hote = null;
    vi.unstubAllGlobals();
  });

  it('session tenue ailleurs : la phrase avec les minutes', async () => {
    const el = await ongletLicence();
    poser({ reason: 'session_conflict', minutes_remaining: 37 });
    const b = el.querySelector<HTMLElement>('[data-raison-licence]');
    expect(b, 'aucune raison affichée').not.toBeNull();
    expect(b!.dataset.raisonLicence).toBe('session_conflict');
    expect(b!.textContent).toContain(fr['settings.licenseReasonSessionConflict'].replace('{n}', '37'));
    expect(b!.textContent).not.toContain('{n}');
  });

  it('abonnement échu : la date lisible et le lien vers le compte', async () => {
    const el = await ongletLicence();
    poser({ reason: 'key_expired', expires_at: '2026-10-01T10:00:00Z' });
    const b = el.querySelector<HTMLElement>('[data-raison-licence="key_expired"]');
    expect(b).not.toBeNull();
    expect(b!.textContent).not.toContain('{date}');
    expect(b!.textContent).not.toContain('2026-10-01T');
    const lien = b!.querySelector<HTMLAnchorElement>('a');
    expect(lien?.getAttribute('href')).toBe(URL_COMPTE_MOZAIKLABS);
    expect(lien?.textContent).toContain(fr['settings.licenseReasonAccountLink']);
  });

  it('site injoignable : « Validation impossible pour l’instant »', async () => {
    const el = await ongletLicence();
    poser({ reason: 'server_unreachable', upstream_status: null });
    const b = el.querySelector<HTMLElement>('[data-raison-licence="server_unreachable"]');
    expect(b?.textContent).toContain('Validation impossible pour l');
  });

  it('serveur antérieur, sans raison : l’écran se tait', async () => {
    const el = await ongletLicence();
    poser(null);
    expect(el.querySelector('[data-raison-licence]')).toBeNull();
  });
});
