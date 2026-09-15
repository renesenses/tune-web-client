// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { mount, unmount, tick } from 'svelte';
import { writable } from 'svelte/store';
const mocks = vi.hoisted(() => ({ read: vi.fn(), add: vi.fn(), act: vi.fn() }));
vi.mock('../api', () => ({ getUpnpLibrarySources: mocks.read, addUpnpLibrarySource: mocks.add, actUpnpLibrarySource: mocks.act }));
vi.mock('../i18n', () => ({ t: writable((key: string) => key) }));
import Panel from '../../components/v2/UpnpLibrarySourcesV2.svelte';
let instance: ReturnType<typeof mount> | undefined;
const flush = async () => { await new Promise(resolve => setTimeout(resolve, 0)); await tick(); };
beforeEach(() => { vi.clearAllMocks(); mocks.read.mockResolvedValue({ items: [] }); mocks.add.mockResolvedValue({}); mocks.act.mockResolvedValue({}); });
afterEach(async () => { if (instance) await unmount(instance); instance = undefined; document.body.innerHTML = ''; });

it('permet aussi d’intégrer un serveur Tune depuis la racine', async () => {
  instance = mount(Panel, { target: document.body, props: { server: { id: 'uuid:tune', name: 'Tune Server' }, container: '0' } });
  await flush();
  const button = [...document.querySelectorAll('button')].find(b => b.textContent?.includes('upnp.sync.add'))!;
  expect(button.disabled).toBe(false);
  button.click();
  await flush();
  expect(mocks.add).toHaveBeenCalledWith('uuid:tune', '0', undefined);
});

it('relit le bilan durable et confirme précisément la génération affichée', async () => {
  const source = { key: 'a', udn: 'u', name: 'Asset', container: '0', enabled: true, status: 'confirmation',
    pending_count: 4, generation: 'run-7', last_success: 1, report: {} };
  mocks.read.mockResolvedValue({ items: [source] });
  instance = mount(Panel, { target: document.body, props: { server: null, container: '0' } });
  await flush();
  expect(document.body.textContent).toContain('Asset');
  const confirm = [...document.querySelectorAll('button')].find(b => b.textContent?.includes('settings.confirm'))!;
  confirm.click();
  await flush();
  expect(mocks.act).toHaveBeenCalledWith(expect.objectContaining({ generation: 'run-7', pending_count: 4 }), 'confirm');
});
