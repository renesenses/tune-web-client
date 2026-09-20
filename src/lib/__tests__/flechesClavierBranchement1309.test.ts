// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// #1309 — Mac Brehilt, 19/09/2026 : dans la bibliothèque, les flèches
// n'étaient pas des flèches. Elles avançaient la piste de 10 s ou bougeaient
// le volume, et un renderer absent renvoyait « output … is not registered ».

const appels: string[] = [];
vi.mock('../api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../api')>()),
  seek: vi.fn((_z: number, p: number) => { appels.push(`seek:${p}`); return Promise.resolve(); }),
  setVolume: vi.fn((_z: number, v: number) => { appels.push(`volume:${v}`); return Promise.resolve(); }),
  pause: vi.fn(() => Promise.resolve()),
}));
vi.mock('../stores/zones', async (importOriginal) => {
  const { writable } = await import('svelte/store');
  return {
    ...(await importOriginal<typeof import('../stores/zones')>()),
    currentZone: writable({ id: 7, volume: 0.5 }),
    nextAndSync: vi.fn(() => { appels.push('suivante'); }),
    previousAndSync: vi.fn(() => { appels.push('precedente'); }),
    resumeAndSync: vi.fn(),
    stopAndSync: vi.fn(),
  };
});

import { setupKeyboardShortcuts } from '../keyboard';
import { activeView, mobileNowPlayingOpen } from '../stores/navigation';

describe('le raccourci global branché sur la règle (#1309)', () => {
  let retirer: () => void;
  beforeEach(() => { appels.length = 0; retirer = setupKeyboardShortcuts(); });
  afterEach(() => { retirer(); activeView.set('home'); mobileNowPlayingOpen.set(false); });

  const presser = (code: string, shiftKey = false) => {
    const e = new KeyboardEvent('keydown', { code, shiftKey, cancelable: true });
    window.dispatchEvent(e);
    return e;
  };

  it('dans la bibliothèque, ← → ↑ ↓ ne partent plus au serveur et laissent défiler', () => {
    activeView.set('library');
    for (const code of ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown']) {
      expect(presser(code).defaultPrevented, code).toBe(false);
    }
    expect(appels).toEqual([]);
  });
  it("contre-épreuve : sur l'écran de lecture, → avance et ↑ monte le volume", () => {
    activeView.set('nowplaying');
    presser('ArrowRight');
    presser('ArrowUp');
    expect(appels).toEqual(['seek:10000', 'volume:0.51']);
  });
  it("le lecteur mobile ouvert compte comme l'écran de lecture", () => {
    activeView.set('library');
    mobileNowPlayingOpen.set(true);
    presser('ArrowDown');
    expect(appels).toEqual(['volume:0.49']);
  });
  it('Maj+→ passe à la piste suivante depuis la bibliothèque', () => {
    activeView.set('library');
    presser('ArrowRight', true);
    expect(appels).toEqual(['suivante']);
  });
});