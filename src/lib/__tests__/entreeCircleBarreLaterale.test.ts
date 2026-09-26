// @vitest-environment jsdom
//
// Demande de Bertrand du 26/09/2026 : une entrée « Tune Circle » dans la
// barre latérale. Jusque-là, l'écran `circle` ne s'atteignait que par le
// bouton « Ouvrir » de sa ligne dans les Extensions.
//
// La condition est celle de ce bouton : le greffon TOURNE (`circleCharge`,
// installé ET actif). Un greffon arrêté n'a pas d'entrée : ses routes
// rendraient le 404 nu d'axum.
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import { get } from 'svelte/store';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import Sidebar from '../../components/v2/Sidebar.svelte';
import { activeView } from '../stores/navigation';
import { circlePlugin } from '../circle';
import { preparerLocale } from '../i18n';
import fr from '../locales/fr';

vi.setConfig({ testTimeout: 60_000 });

let greffons: Record<string, unknown>[] = [];

function reponse(corps: unknown) {
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    headers: new Map([['content-type', 'application/json']]),
    json: async () => corps,
    text: async () => JSON.stringify(corps),
  } as unknown as Response;
}

class ObservateurInerte { observe() {} unobserve() {} disconnect() {} }

let hote: HTMLDivElement | null = null;
let monte: Record<string, any> | null = null;

async function laisserTourner(n = 40) {
  for (let i = 0; i < n; i++) {
    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));
    flushSync();
  }
}

const LIBELLE = fr['v2.circle.title'];

function entreeCircle(): HTMLButtonElement | undefined {
  return Array.from(hote!.querySelectorAll('button.nav')).find(
    (b) => (b.textContent ?? '').replace(/\s+/g, ' ').trim() === LIBELLE,
  ) as HTMLButtonElement | undefined;
}

async function monterBarre() {
  monte = mount(Sidebar as any, { target: hote! });
  await laisserTourner(40);
}

beforeAll(async () => { await preparerLocale('fr'); });

beforeEach(() => {
  greffons = [];
  circlePlugin.set(null);
  vi.stubGlobal('ResizeObserver', ObservateurInerte as any);
  if (!('IntersectionObserver' in globalThis)) {
    vi.stubGlobal('IntersectionObserver', ObservateurInerte as any);
  }
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: any) => {
      const u = String(url);
      if (/\/plugins(\?|$)/.test(u)) return reponse(greffons);
      if (/\/config/.test(u)) return reponse({});
      return reponse([]);
    }),
  );
  hote = document.createElement('div');
  document.body.appendChild(hote);
  activeView.set('home');
});

afterEach(() => {
  if (monte) {
    try { unmount(monte); } catch { /* le démontage n'est pas le sujet */ }
    monte = null;
  }
  hote?.remove();
  hote = null;
  vi.unstubAllGlobals();
});

describe('barre latérale — entrée « Tune Circle »', () => {
  it('greffon installé et actif : l’entrée est là, et mène à l’écran Circle', async () => {
    greffons = [{ name: 'circle', installed: true, enabled: true }];
    await monterBarre();
    const b = entreeCircle();
    expect(b, 'entrée « Tune Circle » absente').toBeDefined();
    b!.click();
    flushSync();
    expect(get(activeView)).toBe('circle');
  });

  it('greffon installé mais arrêté : aucune entrée', async () => {
    greffons = [{ name: 'circle', installed: true, enabled: false }];
    await monterBarre();
    expect(entreeCircle()).toBeUndefined();
  });

  it('greffon absent du serveur : aucune entrée', async () => {
    greffons = [{ name: 'concerts', installed: true, enabled: true }];
    await monterBarre();
    expect(entreeCircle()).toBeUndefined();
  });

  it('activer le greffon après coup fait apparaître l’entrée sans recharger', async () => {
    greffons = [{ name: 'circle', installed: true, enabled: false }];
    await monterBarre();
    expect(entreeCircle()).toBeUndefined();
    circlePlugin.set({ name: 'circle', installed: true, enabled: true });
    await laisserTourner(5);
    expect(entreeCircle()).toBeDefined();
  });

  it('le libellé existe dans les onze langues', () => {
    const dossier = resolve(__dirname, '../locales');
    for (const l of ['fr', 'en', 'de', 'es', 'it', 'ja', 'ko', 'ro', 'sv', 'zh', 'hu']) {
      const src = readFileSync(resolve(dossier, `${l}.ts`), 'utf8');
      expect(src, `v2.circle.title manquant en ${l}`).toMatch(/["']v2\.circle\.title["']\s*:/);
    }
  });

  it('les Extensions republient l’état du greffon après chaque geste', () => {
    const src = readFileSync(resolve(__dirname, '../../components/v2/PluginsV2.svelte'), 'utf8');
    const i = src.indexOf('async function reload()');
    expect(i).toBeGreaterThan(-1);
    const corps = src.slice(i, src.indexOf('\n  }\n', i));
    expect(corps).toContain('refreshCirclePlugin()');
  });
});
