// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// #6700 (tune-server-rust) — décision de Bertrand du 21/10/2026 : la sourdine
// est sur la VRAIE lettre M. Lue par `e.code === 'KeyM'`, elle partait sur la
// virgule d'un clavier AZERTY, et la lettre M (`Semicolon`) ne faisait rien.

const espions = vi.hoisted(() => ({
  sourdine: vi.fn(() => Promise.resolve()),
  next: vi.fn(), previous: vi.fn(), stop: vi.fn(), resume: vi.fn(),
  pause: vi.fn(), seek: vi.fn(), setVolume: vi.fn(),
}));

vi.mock('../stores/zones', async () => {
  const { writable } = await import('svelte/store');
  return {
    currentZone: writable({ id: 'z1', volume: 0.4 }),
    nextAndSync: espions.next,
    previousAndSync: espions.previous,
    resumeAndSync: espions.resume,
    stopAndSync: espions.stop,
  };
});
vi.mock('../stores/nowPlaying', async () => {
  const { writable } = await import('svelte/store');
  return {
    playbackState: writable('paused'),
    seekPositionMs: writable(0),
    currentTrack: writable({ source: 'local' }),
  };
});
vi.mock('../stores/navigation', async () => {
  const { writable } = await import('svelte/store');
  return { activeView: writable('library'), mobileNowPlayingOpen: writable(false) };
});
vi.mock('../api', () => ({ pause: espions.pause, seek: espions.seek, setVolume: espions.setVolume }));
vi.mock('../sourdine', () => ({ basculerSourdineZone: espions.sourdine }));

import { setupKeyboardShortcuts, toucheDuRaccourci } from '../keyboard';
import { decisionFrappe } from '../frappeVersRecherche';

let detacher: () => void;
beforeEach(() => {
  vi.clearAllMocks();
  detacher = setupKeyboardShortcuts();
});
afterEach(() => detacher());

function frappe(key: string, code: string, extra: KeyboardEventInit = {}) {
  document.body.dispatchEvent(new KeyboardEvent('keydown', { key, code, bubbles: true, cancelable: true, ...extra }));
}

describe('raccourcis à une lettre : la lettre tapée, pas la position (#6700)', () => {
  it('AZERTY : la virgule (e.key=",", e.code="KeyM") ne coupe RIEN', () => {
    frappe(',', 'KeyM');
    frappe('?', 'KeyM', { shiftKey: true });
    expect(espions.sourdine).not.toHaveBeenCalled();
    expect(espions.setVolume).not.toHaveBeenCalled();
  });

  it('AZERTY : la vraie lettre M (e.key="m", e.code="Semicolon") coupe le son', () => {
    frappe('m', 'Semicolon');
    expect(espions.sourdine).toHaveBeenCalledTimes(1);
    expect(espions.sourdine).toHaveBeenCalledWith({ id: 'z1', volume: 0.4 });
  });

  it('QWERTY inchangé, majuscule comprise', () => {
    frappe('M', 'KeyM', { shiftKey: true });
    expect(espions.sourdine).toHaveBeenCalledTimes(1);
  });

  it('les autres lettres suivent la même règle ; espace et flèches gardent leur code', () => {
    frappe('n', 'Semicolon');
    expect(espions.next).toHaveBeenCalledWith('z1');
    frappe('ù', 'KeyN');
    expect(espions.next).toHaveBeenCalledTimes(1);
    frappe(' ', 'Space');
    expect(espions.resume).toHaveBeenCalledWith('z1');
    expect(toucheDuRaccourci({ key: 'ArrowUp', code: 'ArrowUp' })).toBe('ArrowUp');
  });

  it('dans la Bibliothèque, la virgule AZERTY s’écrit dans la recherche ; la lettre M reste réservée', () => {
    const t = (key: string, code: string) =>
      decisionFrappe({ key, code, target: document.body, defaultPrevented: false, isComposing: false,
        metaKey: false, ctrlKey: false, altKey: false }, document.body);
    expect(t(',', 'KeyM')).toBe('inserer');
    expect(t('m', 'Semicolon')).toBe(null);
  });
});
