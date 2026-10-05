// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import TransportBar from '../../components/partages/TransportBar.svelte';
import { zones, currentZoneId } from '../stores/zones';

let host: HTMLDivElement;
let component: ReturnType<typeof mount> | undefined;
function snapshot(global: boolean, step: boolean | undefined) {
  return [{ id: 1, name: 'Salon', state: 'playing', online: true, volume: 0.4,
    signal_path: { bit_perfect: global, lossless: true, steps: [
      { name: 'Source', description: 'FLAC source', ...(step === undefined ? {} : { bit_perfect: step }) },
      { name: 'Resampler', description: '48 kHz → 192 kHz', bit_perfect: false },
      { name: 'Output', description: 'WASAPI', bit_perfect: true },
    ] },
  }];
}
function pose(global: boolean, step: boolean | undefined) {
  zones.set(snapshot(global, step) as never);
  currentZoneId.set(1);
}
function open() {
  component = mount(TransportBar, { target: host });
  flushSync();
  const button = host.querySelector<HTMLButtonElement>('.signal-led');
  expect(button).not.toBeNull();
  button!.click();
  flushSync();
  expect(host.querySelector('.sp-card')).not.toBeNull();
}
function rowColors(index: number, expected: boolean) {
  const row = host.querySelectorAll('.sp-row')[index];
  expect(row, 'the signal step must be rendered').toBeDefined();
  for (const selector of ['.sp-icon', '.sp-ndot']) {
    const element = row.querySelector(selector);
    expect(element, selector).not.toBeNull();
    expect(element!.classList.contains('bp'), `${selector} on step ${index}`).toBe(expected);
  }
}
/** Fil 1825 — le trait entre l'étape `index` et la suivante : intact
 *  seulement si ses DEUX extrémités le sont, comme dans Lecture en cours. */
function lineColor(index: number, expected: boolean) {
  const line = host.querySelectorAll('.sp-row')[index]?.querySelector('.sp-line');
  expect(line, `line after step ${index}`).not.toBeNull();
  expect(line!.classList.contains('bp'), `.sp-line after step ${index}`).toBe(expected);
}
beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { headers: { 'content-type': 'application/json' } })));
  host = document.createElement('div');
  document.body.append(host);
});
afterEach(async () => {
  if (component) await unmount(component);
  component = undefined;
  host.remove();
  zones.set([]);
  currentZoneId.set(null);
  vi.unstubAllGlobals();
});

describe('#1097 — the transport signal panel paints each step', () => {
  it.each([
    { global: false, step: true, expected: true },
    { global: true, step: false, expected: false },
    { global: false, step: undefined, expected: false },
    { global: true, step: undefined, expected: true },
  ])('global=$global, step=$step gives $expected (including old-server fallback)', ({ global, step, expected }) => {
    pose(global, step);
    open();
    rowColors(0, expected);
    rowColors(1, false);
    rowColors(2, true);
    // Both lines touch the altered resampler: neither may stay green.
    lineColor(0, false);
    lineColor(1, false);
    // The bar keeps its GLOBAL verdict; lossless remains independent in the header.
    expect(host.querySelector('.signal-led')!.classList.contains('bit-perfect')).toBe(global);
    expect(host.querySelector('.sp-header .sp-good')).not.toBeNull();
  });

  it.each([false, true])('keeps a wholly old-server response at its global verdict %s', (global) => {
    const legacy = snapshot(global, undefined);
    for (const step of legacy[0].signal_path.steps) delete step.bit_perfect;
    zones.set(legacy as never);
    currentZoneId.set(1);
    open();
    for (let index = 0; index < 3; index++) rowColors(index, global);
    lineColor(0, global);
    lineColor(1, global);
  });

  it('updates all three indicators while the panel stays open', () => {
    pose(false, false);
    open();
    rowColors(0, false);
    pose(false, true);
    flushSync();
    rowColors(0, true);
    rowColors(1, false);
    expect(host.querySelector('.signal-led')!.classList.contains('bit-perfect')).toBe(false);
  });
});

describe('fil 1825 — the transport panel and Now Playing draw the same lines', () => {
  it('a line descending into an altered step is not green (it used to follow the upstream step only)', () => {
    zones.set([{ id: 1, name: 'Salon', state: 'playing', online: true, volume: 0.4,
      signal_path: { bit_perfect: false, lossless: true, steps: [
        { name: 'Source', description: 'FLAC 44kHz/16bit', bit_perfect: true },
        { name: 'Decoder', description: 'FLAC', bit_perfect: true },
        { name: 'Resampler', description: '44kHz → 192kHz (mesuré)', bit_perfect: false },
        { name: 'Transport', description: 'WASAPI', bit_perfect: true },
        { name: 'Output', description: 'local:Haut-parleurs', bit_perfect: true },
      ] },
    }] as never);
    currentZoneId.set(1);
    open();
    lineColor(0, true);
    lineColor(1, false);
    lineColor(2, false);
    lineColor(3, true);
  });
});
