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
  for (const selector of ['.sp-icon', '.sp-ndot', ...(index < 2 ? ['.sp-line'] : [])]) {
    const element = row.querySelector(selector);
    expect(element, selector).not.toBeNull();
    expect(element!.classList.contains('bp'), `${selector} on step ${index}`).toBe(expected);
  }
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
