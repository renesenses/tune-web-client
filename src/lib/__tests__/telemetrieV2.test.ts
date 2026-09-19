// @vitest-environment jsdom
//
// 🔴 Le consentement à la télémétrie survit à la phase 5.
//
// Il n'était modifiable que dans l'ancien `SettingsView`, par
// `api.apiFetch('/cloud/telemetry/status')` et
// `api.apiPost('/cloud/telemetry/enable|disable')` — chemins en dur, hors des
// fonctions d'`api.ts`, donc invisibles pour l'inventaire des capacités sans
// chemin (`docs/capacites-sans-chemin-phase5.md`, « Angle mort »). La phase 5
// retire cet écran : sans ce portage, un utilisateur ne pouvait plus retirer
// (ni donner) son consentement.
//
// Ce témoin MONTE les Réglages v2, ouvre Système comme un humain et CLIQUE la
// bascule. Il lit les requêtes réellement parties (`fetch` bouchonné) : un
// test qui chercherait « telemetry » dans un fichier resterait vert si la case
// perdait son gestionnaire.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import SettingsV2 from '../../components/v2/SettingsV2.svelte';
import { preferences } from '../stores/preferences';
import lFr from '../locales/fr';

const fr = lFr as unknown as Record<string, string>;

class ResizeObserverInerte {
  observe() {}
  unobserve() {}
  disconnect() {}
}

function reponse(status: number, corps: unknown): Response {
  const texte = typeof corps === 'string' ? corps : JSON.stringify(corps);
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: String(status),
    headers: { get: () => null },
    json: async () => corps,
    text: async () => texte,
  } as unknown as Response;
}

let hote: HTMLDivElement | null = null;
let monte: Record<string, any> | null = null;
let appels: { url: string; method: string }[] = [];
let statut: Record<string, unknown>;
let bascule: { status: number; corps: unknown };

async function attendre(tours = 6) {
  for (let i = 0; i < tours; i++) {
    await new Promise((r) => setTimeout(r, 0));
    flushSync();
  }
}

async function ouvrirSysteme(): Promise<HTMLDivElement> {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(SettingsV2, { target: hote, props: {} });
  flushSync();
  await attendre();
  const onglet = [...hote.querySelectorAll('button')].find(
    (b) => (b.textContent ?? '').trim() === fr['settings.tabSystem'],
  );
  expect(onglet, 'onglet Système introuvable').toBeDefined();
  (onglet as HTMLButtonElement).click();
  flushSync();
  await attendre();
  return hote;
}

function laCase(el: HTMLElement): HTMLInputElement | null {
  return el.querySelector(`input[type="checkbox"][aria-label="${fr['settings.telemetry']}"]`);
}

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', ResizeObserverInerte);
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  appels = [];
  statut = { enabled: true, env_override: false, server_id: 'srv-42', rate_limits: [] };
  bascule = { status: 200, corps: { enabled: false, env_override: false } };
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, options?: RequestInit) => {
      const u = String(url);
      const method = String(options?.method ?? 'GET').toUpperCase();
      appels.push({ url: u, method });
      if (/\/cloud\/telemetry\/status$/.test(u)) return reponse(200, statut);
      if (/\/cloud\/telemetry\/(enable|disable)$/.test(u)) return reponse(bascule.status, bascule.corps);
      return reponse(200, {});
    }),
  );
  // Niveau par défaut de la section Cloud : Intermédiaire, comme dans
  // l'ancien écran (`system.telemetry`).
  preferences.update((p) => ({ ...p, settingsLevel: 'intermediate' }));
});

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  if (hote) hote.remove();
  hote = null;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('Réglages v2 › Système › Cloud — consentement à la télémétrie', () => {
  it('affiche l’état EFFECTIF lu sur le serveur, et l’identifiant d’instance', async () => {
    const el = await ouvrirSysteme();
    expect(
      appels.some((a) => a.method === 'GET' && /\/cloud\/telemetry\/status$/.test(a.url)),
      'l’écran ne lit jamais GET /cloud/telemetry/status',
    ).toBe(true);
    const c = laCase(el);
    expect(c, 'aucune bascule « Télémétrie » dans Réglages › Système').not.toBeNull();
    expect(c!.checked).toBe(true);
    expect(el.textContent).toContain('srv-42');
  });

  it('décocher DEMANDE le refus (POST /cloud/telemetry/disable) et affiche la réponse', async () => {
    const el = await ouvrirSysteme();
    const c = laCase(el)!;
    c.click();
    await attendre();
    const post = appels.find((a) => a.method === 'POST' && /\/cloud\/telemetry\/(enable|disable)$/.test(a.url));
    expect(post, 'aucun POST de bascule : le consentement n’est plus modifiable').toBeDefined();
    expect(post!.url).toMatch(/\/cloud\/telemetry\/disable$/);
    expect(laCase(el)!.checked).toBe(false);
  });

  it('verrou TUNE_TELEMETRY : la case est désactivée et l’écran le DIT', async () => {
    statut = { enabled: false, env_override: true };
    const el = await ouvrirSysteme();
    expect(laCase(el)!.disabled).toBe(true);
    expect(el.textContent).toContain(fr['settings.telemetryEnvLocked']);
  });

  it('activation refusée par le verrou : la case revient sur l’état CONFIRMÉ', async () => {
    statut = { enabled: false, env_override: false };
    bascule = { status: 200, corps: { enabled: false, env_override: true } };
    const el = await ouvrirSysteme();
    const c = laCase(el)!;
    c.click();
    await attendre();
    expect(appels.some((a) => /\/cloud\/telemetry\/enable$/.test(a.url))).toBe(true);
    expect(laCase(el)!.checked, 'la case ment : cochée alors que le serveur répond enabled:false').toBe(false);
    expect(el.textContent).toContain(fr['settings.telemetryEnvLocked']);
  });

  it('un refus du serveur est dit sous la case, avec son motif', async () => {
    bascule = { status: 403, corps: { error: 'admin only' } };
    const el = await ouvrirSysteme();
    laCase(el)!.click();
    await attendre();
    const err = el.querySelector('.errline');
    expect(err, 'aucune erreur affichée').not.toBeNull();
    expect(err!.textContent).toContain(fr['settings.telemetryError']);
    expect(err!.textContent).toContain('admin only');
    expect(laCase(el)!.checked, 'la case reste sur l’état précédent').toBe(true);
  });
});
