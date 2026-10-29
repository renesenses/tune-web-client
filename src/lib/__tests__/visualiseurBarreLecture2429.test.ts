// @vitest-environment jsdom
//
// #2429 — Alex (rc8) : dans la barre de lecture, à droite, le petit visualiseur
// à barres (spectre) à côté du cœur. « Comme pour les crêtes, une option dans
// les réglages de l'interface pour le retirer. » Affiché par défaut.
//
// Ces témoins MONTENT la vraie barre de lecture et le vrai écran de réglages.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import { get } from 'svelte/store';
import TransportBar from '../../components/partages/TransportBar.svelte';
import SettingsV2 from '../../components/v2/SettingsV2.svelte';
import { zones, currentZoneId } from '../stores/zones';
import { preferences } from '../stores/preferences';
import { locale } from '../i18n';
import { v2SettingsTarget } from '../stores/v2SettingsNav';
import type { V2SettingsTabId } from '../v2Settings';
import * as LANGUES from './lesOnzeLangues';
const LOCALES_COMPLETES = Object.entries(LANGUES) as [string, Record<string, string>][];

vi.setConfig({ testTimeout: 60_000 });

class Inerte { observe() {} unobserve() {} disconnect() {} }
let hote: HTMLDivElement | null = null;
let monte: Record<string, unknown> | null = null;
const souffler = async (n = 10) => {
  for (let i = 0; i < n; i++) { await new Promise((r) => setTimeout(r, 0)); flushSync(); }
};

beforeEach(() => {
  locale.set('en');
  vi.stubGlobal('ResizeObserver', Inerte);
  vi.stubGlobal('IntersectionObserver', Inerte);
  vi.stubGlobal('WebSocket', class { close() {} addEventListener() {} removeEventListener() {} send() {} } as unknown as typeof WebSocket);
  vi.stubGlobal('fetch', vi.fn(async () => ({
    ok: true, status: 200, statusText: 'OK',
    headers: new Headers({ 'content-type': 'application/json' }),
    json: async () => ({}), text: async () => '{}',
  } as unknown as Response)));
  zones.set([{
    id: 1, name: 'Salon', state: 'playing', online: true, volume: 0.4,
    current_track: { id: 1, title: 'Titre', artist_name: 'Artiste', album_title: 'Album', duration_ms: 200000, sample_rate: 44100, bit_depth: 16, format: 'flac' },
  }] as never);
  currentZoneId.set(1);
  preferences.update((p) => ({ ...p, visualiseurBarre: true, barreVuMetres: false, settingsLevel: 'expert' }));
  hote = document.createElement('div');
  document.body.appendChild(hote);
});

afterEach(() => {
  if (monte) { try { unmount(monte); } catch { /* sans objet */ } }
  monte = null;
  hote?.remove();
  hote = null;
  v2SettingsTarget.set(null);
  vi.unstubAllGlobals();
});

describe('#2429 — le visualiseur de la barre de lecture', () => {
  it('🔴 est affiché par défaut', async () => {
    expect(get(preferences).visualiseurBarre, 'le défaut doit être « affiché »').toBe(true);
    monte = mount(TransportBar, { target: hote! });
    await souffler();
    expect(hote!.querySelector('.tb-mini-viz'), 'le visualiseur doit être dans la barre').not.toBeNull();
  });

  it('🔴 décoché, il n’est plus dans la barre — et revient quand on recoche', async () => {
    monte = mount(TransportBar, { target: hote! });
    await souffler();
    expect(hote!.querySelector('.tb-mini-viz')).not.toBeNull();
    preferences.update((p) => ({ ...p, visualiseurBarre: false }));
    await souffler();
    expect(hote!.querySelector('.tb-mini-viz'), 'le visualiseur est resté malgré l’option').toBeNull();
    preferences.update((p) => ({ ...p, visualiseurBarre: true }));
    await souffler();
    expect(hote!.querySelector('.tb-mini-viz')).not.toBeNull();
  });

  it('🔴 le réglage de l’interface porte l’option, cochée par défaut, et agit sur la préférence', async () => {
    v2SettingsTarget.set({ tab: 'general' as V2SettingsTabId, section: 'interface' });
    monte = mount(SettingsV2, { target: hote!, props: {} });
    await souffler(14);
    const ligne = hote!.querySelector('[data-visualiseur-barre]');
    expect(ligne, 'l’option est absente de Réglages ▸ Interface').not.toBeNull();
    expect(ligne!.textContent).toContain('Visualiser in the playback bar');
    const case_ = ligne!.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
    expect(case_.checked, 'cochée par défaut').toBe(true);
    case_.click();
    flushSync();
    expect(get(preferences).visualiseurBarre).toBe(false);
  });

  it('est traduite dans les 15 langues', () => {
    expect(LOCALES_COMPLETES.length).toBe(15);
    for (const [langue, d] of LOCALES_COMPLETES) {
      expect(d['v2.set.barViz'], `${langue} : libellé`).toBeTruthy();
      expect(d['v2.set.barVizHint'], `${langue} : aide`).toBeTruthy();
    }
    const titres = new Set(LOCALES_COMPLETES.map(([, d]) => d['v2.set.barViz']));
    expect(titres.size, 'le libellé est le même partout : non traduit').toBeGreaterThan(10);
  });
});
