// @vitest-environment jsdom
/**
 * tune-server-rust#7419 (alec_eiffel, fil 2530) — « J'ai installé Tune sur une
 * autre machine. Je me suis identifié dans Tune. Ma clé de licence n'est pas
 * renseignée automatiquement, je dois aller la chercher sur mon espace. »
 *
 * Son rapport montre `account_premium=true` : le serveur ÉTAIT Premium par le
 * compte, sans clé. Le panneau Licence affichait pourtant un champ de clé vide
 * et « Activer une licence ». Il dit désormais d'où vient le Premium, et, en
 * gratuit sans clé, comment le retrouver par le compte.
 *
 * Écran Réglages réellement monté, couche API réelle, HTTP simulé.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import { get } from 'svelte/store';

vi.setConfig({ testTimeout: 30_000 });
vi.hoisted(() => {
  class AudioMuet {
    volume = 1; muted = false; src = ''; currentTime = 0;
    addEventListener() {} removeEventListener() {} load() {} pause() {}
    play() { return Promise.resolve(); }
  }
  (globalThis as any).Audio = AudioMuet;
});
vi.mock('../websocket', () => ({ tuneWS: {
  connect() {}, setCurrentZoneId() {}, isPolling: false,
  onEvent() { return () => {}; },
} }));

import SettingsV2 from '../../components/v2/SettingsV2.svelte';
import { preferences } from '../stores/preferences';
import { v2SettingsTarget } from '../stores/v2SettingsNav';
import { licenseState, loadLicense, sourceDuPremium } from '../stores/license';
import { locale } from '../i18n';
import fr from '../locales/fr';

let hote: HTMLDivElement;
let composant: ReturnType<typeof mount> | undefined;
let licence: Record<string, unknown>;
const json = (corps: unknown, status = 200) => new Response(JSON.stringify(corps), {
  status, headers: { 'Content-Type': 'application/json' },
});
async function stabiliser() {
  for (let i = 0; i < 8; i++) { await vi.advanceTimersByTimeAsync(0); flushSync(); }
}
const panneau = () => hote.textContent?.replace(/\s+/g, ' ') ?? '';

async function monter(statut: Record<string, unknown>) {
  licence = { features: {}, zone_limit: null, hardware_fingerprint: null, session_conflict: null, offline_grace: null, expires_at: null, ...statut };
  // L'application charge la licence au démarrage (hors de cet écran) : même
  // chargement ici, par la vraie couche API, avant d'ouvrir l'onglet.
  await loadLicense();
  v2SettingsTarget.set({ tab: 'license', section: 'license' });
  composant = mount(SettingsV2, { target: hote }); flushSync(); await stabiliser();
}

beforeEach(() => {
  vi.useFakeTimers();
  locale.set('fr'); preferences.update((p) => ({ ...p, settingsLevel: 'expert' }));
  licenseState.update((s) => ({ ...s, loaded: false }));
  hote = document.createElement('div'); document.body.appendChild(hote);
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    const chemin = new URL(String(url), window.location.href).pathname;
    if (chemin === '/api/v1/cloud/license/status') return json(licence);
    const corps = /\/(devices|outputs|stereo-pairs|group-delays|profiles|playlists|shortcuts|groups|directories)$|\/devices\/all$/.test(chemin) ? []
      : chemin.endsWith('/system/diagnostics') ? { zones_doublons: [] }
      : chemin.endsWith('tune-tested.json') ? { version: 1, count: 0, devices: [] } : {};
    return json(corps);
  }));
});

afterEach(async () => {
  if (composant) await unmount(composant);
  composant = undefined; hote.remove(); v2SettingsTarget.set(null);
  vi.unstubAllGlobals(); vi.clearAllTimers(); vi.useRealTimers();
});

describe('#7419 — le Premium par le compte se dit, sans réclamer de clé', () => {
  it('nouvelle machine, Premium par le compte : pas d’invitation à recopier une clé', async () => {
    await monter({ tier: 'premium', license_key: null, premium_source: 'account' });
    expect(hote.querySelector('[data-premium-par-le-compte]')?.textContent?.trim())
      .toBe(fr['settings.licenseViaAccount']);
    expect(hote.querySelector('[data-source-premium="account"]')?.textContent).toContain('Compte Mozaiklabs');
    expect(panneau()).toContain(fr['settings.activateLicenseOptional']);
    expect(panneau()).not.toContain(fr['settings.activateLicense']);
    expect(hote.querySelector('[data-retrouver-par-le-compte]')).toBeNull();
  });

  it('serveur antérieur sans le champ : Premium sans clé se lit comme venant du compte', async () => {
    await monter({ tier: 'premium', license_key: null });
    expect(get(licenseState).premiumSource).toBe('account');
    expect(hote.querySelector('[data-premium-par-le-compte]')).not.toBeNull();
  });

  it('Premium par la clé : rien ne change, la clé reste affichée', async () => {
    await monter({ tier: 'premium', license_key: 'TUNE-FAUX-0000-7419', premium_source: 'key' });
    expect(hote.querySelector('[data-premium-par-le-compte]')).toBeNull();
    expect(hote.querySelector('[data-source-premium]')).toBeNull();
  });

  it('gratuit sans clé : le panneau dit comment retrouver la licence par le compte', async () => {
    await monter({ tier: 'free', license_key: null, premium_source: null });
    const ligne = hote.querySelector('[data-retrouver-par-le-compte]');
    expect(ligne?.textContent).toContain(fr['settings.licenseFindByAccount']);
    expect(panneau(), 'en gratuit, la saisie de clé reste la voie ordinaire').toContain(fr['settings.activateLicense']);
    const cibles: unknown[] = [];
    const arreter = v2SettingsTarget.subscribe((c) => cibles.push(c));
    ligne!.querySelector('button')!.click(); flushSync(); arreter();
    expect(cibles, 'le bouton doit mener à Système › Cloud, où l’on relie le compte')
      .toContainEqual({ tab: 'system', section: 'cloud' });
  });
});

describe('#7419 — la règle de repli suit celle du serveur', () => {
  it.each([
    [{ tier: 'premium', license_key: null, premium_source: 'account' }, 'account'],
    [{ tier: 'premium', license_key: 'K', premium_source: 'key' }, 'key'],
    [{ tier: 'premium', license_key: null }, 'account'],
    [{ tier: 'premium', license_key: 'K' }, 'key'],
    [{ tier: 'free', license_key: 'K' }, null],
    [{ tier: 'free', license_key: null, premium_source: null }, null],
  ] as const)('%o → %s', (statut, attendu) => {
    expect(sourceDuPremium(statut as any)).toBe(attendu);
  });

  it('les six textes existent dans les quinze langues', async () => {
    for (const code of ['de', 'el', 'en', 'es', 'fr', 'hu', 'it', 'ja', 'ko', 'nb', 'pl', 'ro', 'sv', 'vi', 'zh']) {
      const d = (await import(`../locales/${code}.ts`)).default as Record<string, string>;
      for (const k of ['settings.activateLicenseOptional', 'settings.licenseSource', 'settings.licenseSourceAccount',
        'settings.licenseViaAccount', 'settings.licenseFindByAccount', 'settings.licenseOpenAccount']) {
        expect(typeof d[k] === 'string' && d[k].length > 0, `${code} : ${k}`).toBe(true);
      }
    }
  });
});
