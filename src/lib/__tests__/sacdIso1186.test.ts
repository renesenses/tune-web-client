// @vitest-environment jsdom
// Real component, API client, translations and (one case) SettingsV2.
// Only HTTP and browser geometry are simulated. No extraction or audio.
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import SacdIsoStatus from '../../components/partages/SacdIsoStatus.svelte';
import SettingsV2 from '../../components/v2/SettingsV2.svelte';
import { locale } from '../i18n';
import fr from '../locales/fr';
import { preferences } from '../stores/preferences';
import { v2SettingsTarget } from '../stores/v2SettingsNav';

let host: HTMLDivElement;
let component: ReturnType<typeof mount> | undefined;
let reply: unknown;
let code: number;
let requests: string[];
const isoUrl = '/api/v1/sacd-rip/iso-status';
class Observer { observe() {} unobserve() {} disconnect() {} }
const settle = async () => { for (let i = 0; i < 8; i++) { await new Promise(r => setTimeout(r, 0)); flushSync(); } };
const text = () => host.textContent ?? '';
const checkButton = () => Array.from(host.querySelectorAll('button')).find(b => b.textContent?.trim() === fr['sacdIso.check'])!;

beforeEach(() => {
  reply = { available: false, tool: 'none' };
  code = 200;
  requests = [];
  locale.set('fr');
  vi.stubGlobal('ResizeObserver', Observer);
  vi.stubGlobal('IntersectionObserver', Observer);
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    requests.push(url);
    const data = url === isoUrl ? reply : /\/(zones|devices)(\?|$)/.test(url) ? [] : {};
    return new Response(JSON.stringify(data), { status: url === isoUrl ? code : 200, headers: { 'Content-Type': 'application/json' } });
  }));
  host = document.createElement('div');
  document.body.appendChild(host);
});
afterEach(async () => {
  if (component) await unmount(component);
  component = undefined;
  host.remove();
  vi.unstubAllGlobals();
});
async function show() {
  component = mount(SacdIsoStatus, { target: host });
  await settle();
}

it('shows missing tool and an action on the actual Library settings screen', async () => {
  preferences.update(p => ({ ...p, settingsLevel: 'beginner' }));
  v2SettingsTarget.set({ tab: 'library', section: 'library' });
  component = mount(SettingsV2, { target: host });
  await settle();
  expect(text()).toContain(fr['sacdIso.missing']);
  expect(requests.filter(x => x.includes('/sacd-rip/'))).toEqual([isoUrl]);
  expect(checkButton()).toBeTruthy();
});

it('reports detection without promising extraction or physical ripping', async () => {
  reply = { available: true, tool: 'sacd_extract' };
  await show();
  expect(text()).toContain(fr['sacdIso.available']);
  expect(text()).not.toContain(fr['sacdIso.missing']);
});

it.each([404, 503])('keeps HTTP %s unknown, then retry detects an installed tool', async status => {
  code = status;
  reply = { error: 'unavailable' };
  await show();
  expect(text()).toContain(fr['sacdIso.unknown']);
  expect(text()).not.toContain(fr['sacdIso.missing']);
  code = 200;
  reply = { available: true, tool: 'sacd_extract' };
  checkButton().click();
  await settle();
  expect(text()).toContain(fr['sacdIso.available']);
  expect(text()).not.toContain(fr['sacdIso.unknown']);
  expect(requests.filter(x => x === isoUrl)).toHaveLength(2);
});

it.each([{ tool: 'none' }, { available: false, tool: 'sacd_extract' }])('treats malformed status %j as unknown', async data => {
  reply = data;
  await show();
  expect(text()).toContain(fr['sacdIso.unknown']);
  expect(text()).not.toContain(fr['sacdIso.missing']);
});

it('shows unknown after network failure and does not reject outside the component', async () => {
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
  await show();
  expect(text()).toContain(fr['sacdIso.unknown']);
  expect(text()).not.toContain(fr['sacdIso.missing']);
});

it('disables duplicate checks while pending and ignores completion after unmount', async () => {
  let resolve!: (value: Response) => void;
  const fetcher = vi.fn(() => new Promise<Response>(r => { resolve = r; }));
  vi.stubGlobal('fetch', fetcher);
  component = mount(SacdIsoStatus, { target: host });
  await settle();
  expect(checkButton().disabled).toBe(true);
  checkButton().click();
  expect(fetcher).toHaveBeenCalledTimes(1);
  await unmount(component);
  component = undefined;
  resolve(new Response(JSON.stringify({ available: true, tool: 'sacd_extract' })));
  await settle();
  expect(host.textContent).toBe('');
  expect(fetcher).toHaveBeenCalledTimes(1);
});
