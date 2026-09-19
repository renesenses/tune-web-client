// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import { get } from 'svelte/store';
import ConverterV2 from '../../components/v2/ConverterV2.svelte';
import ConverterView from '../../components/ConverterView.svelte';
import BrowseView from '../../components/v2-heritage/BrowseView.svelte';
import * as api from '../api';
import { albums } from '../stores/library';
import { activeView, vueDeRetour } from '../stores/navigation';
import { repertoireCible } from '../stores/repertoireCible';
import { licenseState } from '../stores/license';

vi.mock('../api', async (original) => ({
  ...await original<typeof import('../api')>(),
  getAllAlbums: vi.fn(), getAlbumTracks: vi.fn(), getConverterCapabilities: vi.fn(),
  getConverterPresets: vi.fn(), downloadConversion: vi.fn(async () => 'blob:ready-archive'), startConversion: vi.fn(), getConversionStatus: vi.fn(),
  getBrowseRoots: vi.fn(async () => ({ roots: [] })),
  browseDirectory: vi.fn(async (path) => ({ path, music_root: '/music', parent: '/music',
    directories: [], tracks: [], total_tracks: 0 })),
}));
vi.setConfig({ testTimeout: 10000 });
const album = { id: 12, title: 'Source Album', artist_name: 'Artist', source: 'local', track_count: 2 };
const presets = [
  { id: 'flac', label: 'FLAC', format: 'flac', sample_rate: 44100, bit_depth: 16 },
  { id: 'wav', label: 'WAV', format: 'wav', sample_rate: 96000, bit_depth: 24 },
];
let target: HTMLDivElement;
let instance: ReturnType<typeof mount> | undefined;
const wait = async (assertion: () => void) => vi.waitFor(() => { flushSync(); assertion(); }, { timeout: 3000 });
async function poser(component: any) {
  instance = mount(component, { target });
  flushSync();
}
async function retirer() {
  if (instance) await unmount(instance);
  instance = undefined;
  target.replaceChildren();
}
function click(selector: string) {
  const button = target.querySelector<HTMLButtonElement>(selector);
  expect(button, selector).not.toBeNull();
  expect(button!.disabled).toBe(false);
  button!.click(); flushSync();
}
beforeEach(() => {
  vi.clearAllMocks();
  activeView.set('home'); activeView.set('converter');
  vueDeRetour.set(null); repertoireCible.set(null);
  albums.set([album as any]);
  licenseState.update(s => ({ ...s, tier: 'premium' }));
  vi.mocked(api.getAllAlbums).mockResolvedValue([album as any]);
  vi.mocked(api.getAlbumTracks).mockResolvedValue([
    { file_path: '/music/Source Album/CD1/one.flac', source: 'local' },
    { file_path: '/music/Source Album/CD2/two.flac', source: 'local' },
  ] as any);
  vi.mocked(api.getConverterCapabilities).mockResolvedValue({ formats: { flac: true, wav: true }, tools: {} } as any);
  vi.mocked(api.getConverterPresets).mockResolvedValue(presets as any);
  vi.mocked(api.startConversion).mockResolvedValue({ job_id: 'existing-job', total_tracks: 2 } as any);
  vi.mocked(api.getConversionStatus).mockResolvedValue({ state: 'converting', progress: 40, converted: 1, total: 2 } as any);
  target = document.createElement('div'); document.body.appendChild(target);
});
afterEach(async () => {
  await retirer(); target.remove(); activeView.set('home');
  vi.restoreAllMocks();
});
const variants = [
  { name: 'v2', component: ConverterV2, card: '.card', selected: '.card.sel', preset: '.chips button', chosen: '.chips button.on', start: '.go', filter: '.v2-rech input' },
  { name: 'legacy', component: ConverterView, card: '.album-card', selected: '.album-card.selected', preset: '.preset-card', chosen: '.preset-card.active', start: '.convert-btn', filter: '.album-search' },
];

describe.each(variants)('#897 $name real converter/directory navigation', (v) => {
  async function initial() {
    await poser(v.component);
    await wait(() => expect(target.querySelector(v.card)).not.toBeNull());
    click(v.card);
    const filter = target.querySelector<HTMLInputElement>(v.filter)!;
    filter.value = 'Source'; filter.dispatchEvent(new Event('input', { bubbles: true })); flushSync();
  }
  async function aller() {
    click('.source-folder');
    await wait(() => expect(get(activeView)).toBe('browse'));
    expect(get(repertoireCible)).toBe('/music/Source Album');
    await retirer();
    await poser(BrowseView);
    await wait(() => expect(target.querySelector('.back-btn')).not.toBeNull());
    expect(api.browseDirectory).toHaveBeenCalledWith('/music/Source Album');
  }
  async function retour() {
    click('.back-btn');
    expect(get(activeView)).toBe('converter');
    await retirer(); await poser(v.component);
    await wait(() => expect(target.querySelector(v.card)).not.toBeNull());
  }
  it('retains selection, chosen format and running job, resuming the same status request', async () => {
    await initial();
    const choices = target.querySelectorAll<HTMLButtonElement>(v.preset);
    choices[1].click(); flushSync();
    const chosen = target.querySelector(v.chosen)!.textContent;
    click(v.start);
    await wait(() => expect(api.startConversion).toHaveBeenCalledTimes(1));
    await wait(() => expect(api.getConversionStatus).toHaveBeenCalledWith('existing-job'));
    await aller();
    const polls = vi.mocked(api.getConversionStatus).mock.calls.length;
    await retour();
    expect(target.querySelector(v.selected)).not.toBeNull();
    expect(target.querySelector<HTMLInputElement>(v.filter)?.value).toBe('Source');
    expect(target.querySelector(v.chosen)!.textContent).toBe(chosen);
    await wait(() => expect(vi.mocked(api.getConversionStatus).mock.calls.length).toBeGreaterThan(polls));
    expect(api.getConversionStatus).toHaveBeenLastCalledWith('existing-job');
    expect(api.startConversion).toHaveBeenCalledTimes(1);
  });
  it.each(['http', 'missing'])('keeps choices and page on %s source-folder failure', async (failure) => {
    await initial();
    if (failure === 'http') vi.mocked(api.getAlbumTracks).mockRejectedValueOnce(new Error('offline'));
    else vi.mocked(api.getAlbumTracks).mockResolvedValueOnce([]);
    click('.source-folder');
    await wait(() => expect(target.textContent).toContain('Impossible de déterminer le dossier source'));
    expect(get(activeView)).toBe('converter');
    expect(target.querySelector(v.selected)).not.toBeNull();
    expect(api.startConversion).not.toHaveBeenCalled();
  });
  it('does not navigate when the source reply arrives after unmount', async () => {
    await initial();
    let resolve!: (value: any) => void;
    vi.mocked(api.getAlbumTracks).mockImplementationOnce(() => new Promise(r => { resolve = r; }));
    click('.source-folder');
    await retirer(); activeView.set('home');
    resolve([{ file_path: '/music/Source Album/one.flac', source: 'local' }]);
    await new Promise(r => setTimeout(r, 0)); flushSync();
    expect(get(activeView)).toBe('home');
    expect(get(repertoireCible)).toBeNull();
  });
  it('discards temporary choices after a third destination', async () => {
    await initial(); await aller();
    await retirer(); activeView.set('home'); activeView.set('converter');
    await poser(v.component);
    await wait(() => expect(target.querySelector(v.card)).not.toBeNull());
    expect(target.querySelector(v.selected)).toBeNull();
  });
  it('returns with selection and job when the source directory cannot be opened', async () => {
    await initial();
    click(v.start);
    await wait(() => expect(api.getConversionStatus).toHaveBeenCalledWith('existing-job'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(api.browseDirectory).mockRejectedValueOnce(new Error('NAS offline'));
    await aller();
    await new Promise(r => setTimeout(r, 0)); flushSync();
    expect(target.querySelector('.breadcrumbs')).toBeNull();
    const polls = vi.mocked(api.getConversionStatus).mock.calls.length;
    await retour();
    expect(target.querySelector(v.selected)).not.toBeNull();
    await wait(() => expect(vi.mocked(api.getConversionStatus).mock.calls.length).toBeGreaterThan(polls));
    expect(api.startConversion).toHaveBeenCalledTimes(1);
  });

  it('stays in the converter if a conversion starts during the folder request', async () => {
    await initial();
    let sourceReady!: (value: any) => void;
    let jobReady!: (value: any) => void;
    vi.mocked(api.getAlbumTracks).mockImplementationOnce(() => new Promise(r => { sourceReady = r; }));
    vi.mocked(api.startConversion).mockImplementationOnce(() => new Promise(r => { jobReady = r; }));
    click('.source-folder'); click(v.start);
    sourceReady([{ file_path: '/music/Source Album/one.flac', source: 'local' }]);
    await new Promise(r => setTimeout(r, 0)); flushSync();
    expect(get(activeView)).toBe('converter');
    expect(get(repertoireCible)).toBeNull();
    jobReady({ job_id: 'existing-job', total_tracks: 2 });
    await wait(() => expect(api.getConversionStatus).toHaveBeenCalledWith('existing-job'));
  });

  it('ignores the old status response after returning to the resumed job', async () => {
    await initial();
    let resolveOld!: (value: any) => void;
    vi.mocked(api.getConversionStatus)
      .mockImplementationOnce(() => new Promise(r => { resolveOld = r; }))
      .mockResolvedValue({ state: 'done', progress: 100, converted: 2, total: 2 } as any);
    click(v.start);
    await wait(() => expect(api.getConversionStatus).toHaveBeenCalledTimes(1));
    await aller(); await retour();
    const done = v.name === 'v2' ? '.done' : '.download-btn';
    await wait(() => expect(target.querySelector(done)).not.toBeNull());
    resolveOld({ state: 'error', error: 'obsolete response', progress: 0 });
    await new Promise(r => setTimeout(r, 0)); flushSync();
    expect(target.querySelector(done)).not.toBeNull();
    expect(target.textContent).not.toContain('obsolete response');
    expect(api.startConversion).toHaveBeenCalledTimes(1);
  });

});


describe('#897 V2 capabilities refreshed after locating', () => {
  it('retains a prepared download URL after locating and returning', async () => {
    vi.mocked(api.getConversionStatus).mockResolvedValue({ state: 'done', progress: 100 } as any);
    await poser(ConverterV2);
    await wait(() => expect(target.querySelector('.card')).not.toBeNull());
    click('.card'); click('.go');
    await wait(() => expect(target.querySelector('.done button')).not.toBeNull());
    click('.done button');
    await wait(() => expect(target.querySelector('a[download]')?.getAttribute('href')).toBe('blob:ready-archive'));
    click('.source-folder');
    await wait(() => expect(get(activeView)).toBe('browse'));
    await retirer(); await poser(BrowseView);
    await wait(() => expect(target.querySelector('.back-btn')).not.toBeNull());
    click('.back-btn'); await retirer(); await poser(ConverterV2);
    await wait(() => expect(target.querySelector('a[download]')?.getAttribute('href')).toBe('blob:ready-archive'));
    expect(api.downloadConversion).toHaveBeenCalledTimes(1);
    expect(api.startConversion).toHaveBeenCalledTimes(1);
  });

  it.each(['removed', 'unsupported'])('does not revive an invalid format: %s', async (change) => {
    await poser(ConverterV2);
    await wait(() => expect(target.querySelector('.card')).not.toBeNull());
    click('.card');
    target.querySelectorAll<HTMLButtonElement>('.chips button')[1].click(); flushSync();
    click('.source-folder');
    await wait(() => expect(get(activeView)).toBe('browse'));
    await retirer(); await poser(BrowseView);
    await wait(() => expect(target.querySelector('.back-btn')).not.toBeNull());
    if (change === 'removed') vi.mocked(api.getConverterPresets).mockResolvedValue([presets[0]] as any);
    else vi.mocked(api.getConverterCapabilities).mockResolvedValue({ formats: { flac: true, wav: false } } as any);
    click('.back-btn'); await retirer(); await poser(ConverterV2);
    await wait(() => expect(target.querySelector('.card.sel')).not.toBeNull());
    if (change === 'removed') expect(target.querySelector('.chips button.on')?.textContent?.trim()).toBe('FLAC');
    else expect(target.querySelector<HTMLButtonElement>('.go')?.disabled).toBe(true);
    expect(api.startConversion).not.toHaveBeenCalled();
  });
});
