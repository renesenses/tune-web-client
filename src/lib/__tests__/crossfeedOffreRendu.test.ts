// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import CrossfeedV2 from '../../components/v2/CrossfeedV2.svelte';
import { currentZoneId } from '../stores/zones';
import { locale } from '../i18n';

let host: HTMLDivElement;
let component: ReturnType<typeof mount>;
let premium = false;
const writes: unknown[] = [];
async function settle() {
  for (let i = 0; i < 5; i++) { await new Promise(r => setTimeout(r, 0)); flushSync(); }
}
beforeEach(() => {
  premium = false;
  writes.length = 0;
  locale.set('fr');
  currentZoneId.set(1);
  vi.stubGlobal('fetch', vi.fn(async (_input: unknown, init?: RequestInit) => {
    if (init?.method === 'PUT') writes.push(JSON.parse(String(init.body)));
    return new Response(JSON.stringify({
      crossfeed: { enabled: true, amount: 0.37, delay_ms: 0.65 },
      crossfeed_status: { requested: true, effective: premium, unavailable: !premium, reason: premium ? null : 'premium_required' },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }));
  host = document.createElement('div');
  document.body.append(host);
});
afterEach(async () => { if (component) await unmount(component); host.remove(); vi.unstubAllGlobals(); });
it('explique la coupure FREE et la conservation, sans réglage qui semble encore actif', async () => {
  component = mount(CrossfeedV2, { target: host });
  await settle();
  expect(host.textContent).toContain('Tune Premium');
  expect(host.textContent).toContain('Vos réglages sont conservés');
  expect(host.querySelector('input')).toBeNull();
  expect(writes).toEqual([]);
});
it('permet toujours de modifier le crossfeed Premium', async () => {
  premium = true;
  component = mount(CrossfeedV2, { target: host });
  await settle();
  const toggle = host.querySelector<HTMLInputElement>('input[type=checkbox]');
  expect(toggle?.disabled).toBe(false);
  toggle!.click();
  await settle();
  expect(writes).toEqual([{ crossfeed: { enabled: false, amount: 0.37, delay_ms: 0.65 } }]);
});
