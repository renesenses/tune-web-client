// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import { get } from 'svelte/store';
import FeuilleMini from '../../components/v2/mini/FeuilleMini.svelte';
import { feuilleMini } from '../vueMini';
import { zones, currentZoneId } from '../stores/zones';
import { queueTracks, queuePosition } from '../stores/queue';
const piste = { id: 1, track_id: 1, source: 'local', title: 'Titre local', duration_ms: 120000 };
let h: HTMLDivElement; let composant: ReturnType<typeof mount>;
function source(s: string) { zones.set([{ id: 1, name: 'Zone', state: 'playing', current_track: { ...piste, source: s } }] as any); flushSync(); }
beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async (url) => new Response(JSON.stringify(/\/queue/.test(String(url)) ? { tracks: [piste], position: 0, length: 1 } : []), { headers: { 'content-type': 'application/json' } })));
  currentZoneId.set(1); source('local'); queueTracks.set([piste] as any); queuePosition.set(0); feuilleMini.set('file');
  h = document.createElement('div'); document.body.append(h); composant = mount(FeuilleMini, { target: h }); flushSync();
});
afterEach(() => { unmount(composant); h.remove(); feuilleMini.set(null); zones.set([]); vi.unstubAllGlobals(); });
it('la feuille mini ouverte se ferme en passant à une radio, puis reste fermée au retour local', async () => {
  expect(h.querySelector('[data-feuille-mini="file"]')).not.toBeNull();
  source('radio');
  await vi.waitFor(() => { flushSync(); expect(get(feuilleMini)).toBeNull(); });
  expect(h.querySelector('[role="dialog"]')).toBeNull();
  source('local'); expect(get(feuilleMini)).toBeNull();
  feuilleMini.set('file'); flushSync(); expect(h.querySelector('[data-feuille-mini="file"]')).not.toBeNull();
});
it('la radio ne referme pas le panneau des zones', async () => {
  feuilleMini.set('zones'); flushSync(); source('radio');
  await Promise.resolve(); flushSync();
  expect(get(feuilleMini)).toBe('zones');
  expect(h.querySelector('[data-feuille-mini="zones"]')).not.toBeNull();
});
