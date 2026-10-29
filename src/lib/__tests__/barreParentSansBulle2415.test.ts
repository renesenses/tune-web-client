// @vitest-environment jsdom
//
// #2415 — Streaming › Qobuz allumait « Streaming » ET « Qobuz » : deux bulles
// de sélection (testeur Alex, rc8). Seul le service ouvert garde la bulle ; le
// parent garde sa couleur d'accent (classe `parent-actif`, sans fond).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import { activeView } from '../stores/navigation';
import { activeStreamingService, streamingServices } from '../stores/streaming';
import Sidebar from '../../components/v2/Sidebar.svelte';

vi.setConfig({ testTimeout: 60_000 });

class ObservateurInerte { observe() {} unobserve() {} disconnect() {} }

let hote: HTMLDivElement | null = null;
let monte: Record<string, any> | null = null;

const SERVICES = {
  qobuz: { enabled: true, authenticated: true, username: 'Alex' },
  tidal: { enabled: true, authenticated: true, username: null },
} as any;

async function monterBarre() {
  monte = mount(Sidebar as any, { target: hote! });
  for (let i = 0; i < 20; i++) { await new Promise((r) => setTimeout(r, 0)); flushSync(); }
}

const parent = () => hote!.querySelector<HTMLElement>('button.nav[data-vue="streaming"]')!;
const service = (s: string) => hote!.querySelector<HTMLElement>(`button.nav.svc[data-service="${s}"]`)!;

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', ObservateurInerte as any);
  if (!('IntersectionObserver' in globalThis)) vi.stubGlobal('IntersectionObserver', ObservateurInerte as any);
  vi.stubGlobal('fetch', vi.fn(async () => ({
    ok: true, status: 200, statusText: 'OK',
    headers: new Headers({ 'content-type': 'application/json' }),
    json: async () => SERVICES, text: async () => JSON.stringify(SERVICES),
  } as unknown as Response)));
  hote = document.createElement('div');
  document.body.appendChild(hote);
  streamingServices.set(SERVICES);
});

afterEach(() => {
  if (monte) { try { unmount(monte); } catch { /* sans objet */ } monte = null; }
  hote?.remove();
  hote = null;
  activeView.set('home' as any);
  activeStreamingService.set(null);
  streamingServices.set({});
  vi.unstubAllGlobals();
});

describe('#2415 — une seule bulle par groupe parent/enfant', () => {
  it('🔴 Streaming › Qobuz : Qobuz porte la bulle, Streaming non — mais garde son accent', async () => {
    activeView.set('streaming' as any);
    activeStreamingService.set('qobuz');
    await monterBarre();
    expect(service('qobuz').classList.contains('active'), 'Qobuz doit porter la bulle').toBe(true);
    expect(
      parent().classList.contains('active'),
      'le parent « Streaming » porte aussi la bulle : double sélection',
    ).toBe(false);
    expect(parent().classList.contains('parent-actif'), 'le parent perd son accent').toBe(true);
    expect(service('tidal').classList.contains('active')).toBe(false);
  });

  it('écran Streaming sans service ouvert : le parent est l’entrée sélectionnée', async () => {
    activeView.set('streaming' as any);
    activeStreamingService.set(null);
    await monterBarre();
    expect(parent().classList.contains('active')).toBe(true);
    expect(parent().classList.contains('parent-actif')).toBe(false);
  });

  it('hors Streaming, ni le parent ni les services ne sont allumés', async () => {
    activeView.set('home' as any);
    activeStreamingService.set('qobuz');
    await monterBarre();
    expect(parent().classList.contains('active')).toBe(false);
    expect(parent().classList.contains('parent-actif')).toBe(false);
    expect(service('qobuz').classList.contains('active')).toBe(false);
  });
});
