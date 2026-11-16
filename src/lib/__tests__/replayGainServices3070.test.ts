// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import SettingsV2 from '../../components/v2/SettingsV2.svelte';
import { preferences } from '../stores/preferences';
import { v2SettingsTarget } from '../stores/v2SettingsNav';
vi.mock('../stores/notifications', () => ({ notifications: { error: vi.fn(), success: vi.fn(), info: vi.fn() } }));
import { notifications } from '../stores/notifications';
let component: ReturnType<typeof mount> | undefined;
let target: HTMLDivElement;
let config: Record<string, unknown>;
let refuse = false;
let writes: unknown[];
const settle = async () => { for (let i=0; i<8; i++) { await new Promise(r => setTimeout(r, 0)); flushSync(); } };
const input = () => target.querySelector<HTMLInputElement>('[data-reglage="replaygain-services"] input');
beforeEach(() => {
  config = { replaygain_mode: 'track', replaygain_services_enabled: false };
  writes = []; refuse = false;
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal('fetch', vi.fn(async (url, init) => {
    const path = String(url);
    const response = (value: unknown, status=200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type':'application/json' } });
    if (path.includes('/system/config')) {
      if (init?.method === 'PATCH') {
        const fields = JSON.parse(init.body);
        if (!("replaygain_services_enabled" in fields)) return response({});
        writes.push(fields);
        if (refuse) return response({ error:'refus synthétique' }, 400);
        return response({});
      }
      return response(config);
    }
    return response(/\/(zones|profiles|devices|playlists|shortcuts|plugins)(\?|$)/.test(path) ? [] : {});
  }));
  preferences.update(p => ({ ...p, settingsLevel:'intermediate' }));
  v2SettingsTarget.set({ tab:'audio', section:'localAudio' } as any);
});
async function show() {
  target = document.createElement('div'); document.body.append(target);
  component = mount(SettingsV2, { target }); await settle();
}
afterEach(async () => {
  if(component) await unmount(component);
  component=undefined; document.body.innerHTML=''; v2SettingsTarget.set(null);
  vi.unstubAllGlobals(); vi.clearAllMocks();
});
it('ne propose rien avec un ancien serveur', async () => {
  delete config.replaygain_services_enabled; await show(); expect(input()).toBeNull(); expect(writes).toEqual([]);
});
it('reste éteint sans écriture spontanée', async () => {
  await show(); expect(input()?.checked).toBe(false); expect(writes).toEqual([]);
});
it('conserve la valeur après changement de niveau et remontage', async () => {
  await show(); input()!.click(); await settle();
  expect(writes).toEqual([{ replaygain_services_enabled:true }]);
  preferences.update(p => ({ ...p, settingsLevel:'beginner' })); await settle();
  expect(input()).toBeNull();
  preferences.update(p => ({ ...p, settingsLevel:'intermediate' })); await settle();
  expect(input()?.checked).toBe(true);
  input()!.click(); await settle(); expect(writes.at(-1)).toEqual({ replaygain_services_enabled:false });
});
it('restaure la valeur et signale une seule erreur lorsque le serveur refuse', async () => {
  refuse=true; await show(); vi.mocked(notifications.error).mockClear(); input()!.click(); await settle();
  expect(input()?.checked).toBe(false); expect(input()?.disabled).toBe(false);
  expect(notifications.error).toHaveBeenCalledTimes(1);
});
it('désactive la commande lorsque ReplayGain est éteint', async () => {
  config.replaygain_mode='off'; await show(); expect(input()?.disabled).toBe(true);
  input()!.click(); expect(writes).toEqual([]);
});
