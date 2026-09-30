// @vitest-environment jsdom
//
// web#1784 — la case du réglage dans SettingsV2 (Général › Interface) :
// décochée par défaut, et c'est bien ELLE qui écrit `lienLectureVersSource`.
// Le comportement de la barre, réglage coché ou non, est éprouvé dans
// `lienLectureEnCours1784.test.ts`.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import { get } from 'svelte/store';

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
import { preferences } from '../stores/preferences';
import lFr from '../locales/fr';

const fr = lFr as unknown as Record<string, string>;

let hote: HTMLDivElement | null = null;
let monte: Record<string, any> | null = null;

async function attendre(tours = 4) {
  for (let i = 0; i < tours; i++) {
    await new Promise((r) => setTimeout(r, 0));
    flushSync();
  }
}

async function caseDuReglage(): Promise<HTMLInputElement> {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(SettingsV2, { target: hote, props: {} });
  flushSync();
  await attendre();
  const c = hote.querySelector<HTMLInputElement>('input[data-reglage="lienLectureVersSource"]');
  expect(c, 'la case du réglage n’est pas peinte dans Général › Interface').not.toBeNull();
  const ligne = c!.closest('.row')!;
  expect(ligne.textContent).toContain(fr['settings.nowPlayingLinkToSource']);
  expect(ligne.textContent).toContain(fr['settings.nowPlayingLinkToSourceHint']);
  return c!;
}

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} } as any);
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    const u = String(url);
    const corps = /\/(zones|profiles|devices|playlists|shortcuts)(\?|$)/.test(u) ? [] : {};
    return new Response(JSON.stringify(corps), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }));
  preferences.update((p) => ({ ...p, settingsLevel: 'beginner', lienLectureVersSource: false }));
});

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  hote?.remove();
  hote = null;
  preferences.update((p) => ({ ...p, lienLectureVersSource: false }));
  vi.unstubAllGlobals();
});

describe('web#1784 — la case « Lecture en cours ouvre l’album ou la playlist »', () => {
  it('visible dès le niveau débutant, DÉCOCHÉE par défaut', { timeout: 60_000 }, async () => {
    const c = await caseDuReglage();
    expect(c.checked).toBe(false);
  });

  it('la cocher écrit le réglage, la décocher le retire', { timeout: 60_000 }, async () => {
    const c = await caseDuReglage();
    c.click();
    flushSync();
    expect(get(preferences).lienLectureVersSource).toBe(true);
    c.click();
    flushSync();
    expect(get(preferences).lienLectureVersSource).toBe(false);
  });
});
