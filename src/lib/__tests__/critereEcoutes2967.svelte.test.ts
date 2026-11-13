// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
vi.mock('../api', async (orig) => ({
  ...await orig<typeof import('../api')>(),
  getTags: vi.fn(async () => []),
  getCollections: vi.fn(async () => []),
  listSmartCollections: vi.fn(async () => []),
  getPlaylists: vi.fn(async () => []),
  getSmartPlaylists: vi.fn(async () => []),
  getStreamingServices: vi.fn(async () => ({})),
  previewSmartCollection: vi.fn(async () => ({ total: 3 })),
  createSmartCollection: vi.fn(async () => ({ id: 42 })),
}));
import * as api from '../api';
import Editeur from '../../components/v2/CollectionSmartEditeurV2.svelte';
import { locale } from '../i18n';

let hote: HTMLElement;
let composant: ReturnType<typeof mount>;
beforeEach(() => {
  locale.set('fr');
  vi.clearAllMocks();
  hote = document.createElement('div');
  document.body.appendChild(hote);
});
afterEach(() => { if (composant) unmount(composant); hote.remove(); });

it('web#2967 — propose Nombre d’écoutes et enregistre le critère choisi dans le vrai éditeur', async () => {
  composant = mount(Editeur, { target: hote, props: { onClose: () => {}, onSaved: () => {} } });
  flushSync();
  const champ = hote.querySelector<HTMLSelectElement>('.regle select')!;
  const choix = [...champ.options].find((o) => o.textContent === 'Nombre d’écoutes');
  expect(choix, 'Nombre d’écoutes doit être trouvable dans les critères').toBeDefined();
  expect(choix!.value).toBe('play_count');
  expect([...champ.options].find((o) => o.value === 'last_played_at')?.textContent).toBe('Dernière écoute');
  champ.value = choix!.value;
  champ.dispatchEvent(new Event('change', { bubbles: true }));
  flushSync();
  const op = hote.querySelector<HTMLSelectElement>('.regle select.op')!;
  op.value = '>=';
  op.dispatchEvent(new Event('change', { bubbles: true }));
  flushSync();
  const nombre = hote.querySelector<HTMLInputElement>('.regle input[type="number"]')!;
  nombre.value = '5';
  nombre.dispatchEvent(new Event('input', { bubbles: true }));
  const nom = hote.querySelector<HTMLInputElement>('label.champ input')!;
  nom.value = 'Souvent écoutés';
  nom.dispatchEvent(new Event('input', { bubbles: true }));
  flushSync();
  const enregistrer = [...hote.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Enregistrer')!;
  expect(enregistrer.disabled).toBe(false);
  enregistrer.click();
  await vi.waitFor(() => expect(api.createSmartCollection).toHaveBeenCalled());
  expect(vi.mocked(api.createSmartCollection).mock.calls[0][0]).toMatchObject({
    name: 'Souvent écoutés', rules: [{ field: 'play_count', op: '>=', value: 5 }],
  });
});
