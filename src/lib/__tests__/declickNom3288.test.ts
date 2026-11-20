// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import DeclickV2 from '../../components/v2/DeclickV2.svelte';
import { locale } from '../i18n';
import { albums } from '../stores/library';
import { ONZE_LANGUES, dictionnaire } from './onzeDictionnaires';

let instance: ReturnType<typeof mount> | undefined;
let host: HTMLDivElement | undefined;
afterEach(() => {
  if (instance) unmount(instance);
  instance = undefined;
  host?.remove();
  host = undefined;
  albums.set([]);
  locale.set('fr');
  vi.unstubAllGlobals();
});

it.each(ONZE_LANGUES)('le titre, le menu et le droit affichent Declick en %s', (langue) => {
  const d = dictionnaire(langue);
  for (const cle of ['v2.declick.title', 'v2.nav.declick', 'licenseFeature.declick']) {
    expect(d[cle], cle).toBe('Declick');
  }
});

it('rend le titre Declick sans démarrer de tâche audio', () => {
  const fetch = vi.fn(async (_input: RequestInfo | URL, _options?: RequestInit) => new Response('[]', { headers: { 'Content-Type': 'application/json' } }));
  vi.stubGlobal('fetch', fetch);
  locale.set('fr');
  albums.set([{ id: 1, title: 'Album témoin', artist_name: 'Interprète', source: 'local' }] as never);
  host = document.createElement('div');
  document.body.appendChild(host);
  instance = mount(DeclickV2, { target: host });
  flushSync();
  expect(fetch.mock.calls.some(([, options]) => (options as RequestInit | undefined)?.method === 'POST')).toBe(false);
  expect(host.querySelector('h1')?.textContent).toBe('Declick');
});
