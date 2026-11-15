// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
vi.mock('../api', () => ({ updateConfig: vi.fn() }));
vi.mock('../stores/notifications', () => ({ notifications: { error: vi.fn() } }));
import * as api from '../api';
import { notifications } from '../stores/notifications';
import ReplayGainServices from '../../components/v2/ReplayGainServices.svelte';

let component: ReturnType<typeof mount> | undefined;
function show(value: boolean | null) {
  const target = document.createElement('div');
  document.body.append(target);
  component = mount(ReplayGainServices, { target, props: { value } });
  flushSync();
  return target;
}
afterEach(async () => {
  if (component) await unmount(component);
  component = undefined;
  document.body.innerHTML = '';
  vi.resetAllMocks();
});
it('ne propose rien avec un ancien serveur', () => {
  expect(show(null).querySelector('input')).toBeNull();
  expect(api.updateConfig).not.toHaveBeenCalled();
});
it('reste éteint et ne fait aucune écriture sans geste', () => {
  const input = show(false).querySelector('input')!;
  expect(input.checked).toBe(false);
  expect(api.updateConfig).not.toHaveBeenCalled();
});
it('active puis désactive seulement sur demande', async () => {
  vi.mocked(api.updateConfig).mockResolvedValue({} as never);
  const input = show(false).querySelector('input')!;
  input.checked = true;
  input.dispatchEvent(new Event('change', { bubbles: true }));
  await vi.waitFor(() => expect(api.updateConfig).toHaveBeenCalledWith({ replaygain_services_enabled: true }));
  flushSync();
  expect(input.checked).toBe(true);
  input.checked = false;
  input.dispatchEvent(new Event('change', { bubbles: true }));
  await vi.waitFor(() => expect(api.updateConfig).toHaveBeenLastCalledWith({ replaygain_services_enabled: false }));
});
it('restaure la valeur lorsque le serveur refuse', async () => {
  vi.mocked(api.updateConfig).mockRejectedValue(new Error('refus synthétique'));
  const input = show(false).querySelector('input')!;
  input.checked = true;
  input.dispatchEvent(new Event('change', { bubbles: true }));
  await vi.waitFor(() => expect(notifications.error).toHaveBeenCalled());
  flushSync();
  expect(input.checked).toBe(false);
  expect(input.disabled).toBe(false);
});
