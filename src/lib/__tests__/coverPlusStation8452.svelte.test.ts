// @vitest-environment jsdom
//
// tune-server-rust#8452 — Cover+ par station : la case de la fiche « Modifier »
// lit le réglage du serveur et l'écrit tout de suite ; un serveur sans Cover+
// ne montre pas de case. Contre-épreuve à chaque fois.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';

const mocks = vi.hoisted(() => ({
  getRadioCoverPlus: vi.fn(),
  setRadioCoverPlus: vi.fn(),
}));
vi.mock('../api', async (importOriginal) => ({ ...(await importOriginal<object>()), ...mocks }));

import RadioEditModale from '../../components/v2/RadioEditModale.svelte';
import { locale } from '../i18n';

const STATION = { id: 42, name: 'Distorsión FM', stream_url: 'https://flux.example/d.mp3', favorite: false };

const respirer = async () => { for (let i = 0; i < 12; i++) await new Promise((r) => setTimeout(r, 0)); flushSync(); };
let hote: HTMLDivElement;
let instance: Record<string, unknown> | null = null;
async function monter(radio: Record<string, unknown> = STATION) {
  hote = document.createElement('div');
  document.body.append(hote);
  instance = mount(RadioEditModale, { target: hote, props: { radio: radio as never, onClose: () => {} } });
  flushSync();
  await respirer();
}
const caseCoverPlus = () =>
  document.querySelector('[data-cover-plus-reglage] input[type=checkbox]') as HTMLInputElement | null;

beforeEach(() => {
  for (const fn of Object.values(mocks)) fn.mockReset();
  locale.set('fr');
});
afterEach(() => {
  if (instance) unmount(instance as any);
  instance = null;
  hote?.remove();
  document.body.innerHTML = '';
});

describe('tune-server-rust#8452 — Cover+ par station', () => {
  it('la case reflète le réglage du serveur, cochée par défaut', async () => {
    mocks.getRadioCoverPlus.mockResolvedValue({ id: 42, enabled: true });
    await monter();
    expect(mocks.getRadioCoverPlus).toHaveBeenCalledWith(42);
    expect(caseCoverPlus()?.checked).toBe(true);
    expect(document.querySelector('[data-cover-plus-reglage]')?.textContent).toContain('Cover+');
  });

  it('décocher coupe Cover+ pour CETTE station, tout de suite', async () => {
    mocks.getRadioCoverPlus.mockResolvedValue({ id: 42, enabled: true });
    mocks.setRadioCoverPlus.mockResolvedValue({ id: 42, enabled: false });
    await monter();
    const c = caseCoverPlus()!;
    c.checked = false;
    c.dispatchEvent(new Event('change', { bubbles: true }));
    await respirer();
    expect(mocks.setRadioCoverPlus).toHaveBeenCalledWith(42, false);
    expect(caseCoverPlus()?.checked).toBe(false);
  });

  it('serveur sans Cover+ (404) : pas de case', async () => {
    mocks.getRadioCoverPlus.mockRejectedValue(new Error('404'));
    await monter();
    expect(caseCoverPlus()).toBeNull();
  });

  it('création d’une station : pas de case, aucun appel', async () => {
    await monter({ name: '', stream_url: '' });
    expect(mocks.getRadioCoverPlus).not.toHaveBeenCalled();
    expect(caseCoverPlus()).toBeNull();
  });
});
