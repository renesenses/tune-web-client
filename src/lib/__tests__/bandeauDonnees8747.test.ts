// @vitest-environment jsdom
//
// tune-server-rust#8747 (fil 2798) — `/data` sans volume persistant : une
// mise à jour de l'image recréait le conteneur sur une base neuve, sans rien
// dire. Le serveur publie `data_persistence` dans `GET /system/env` ; les
// Réglages montrent un bandeau quand `persistent` est faux.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import BandeauDonneesNonPersistantes from '../../components/partages/BandeauDonneesNonPersistantes.svelte';
import { donneesNonPersistantes } from '../persistanceDonnees';

let env: unknown = {};
let hote: HTMLDivElement | null = null;
let monte: Record<string, unknown> | null = null;

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async () => ({
    ok: true,
    status: 200,
    statusText: 'OK',
    headers: new Headers({ 'content-type': 'application/json' }),
    json: async () => env,
    text: async () => JSON.stringify(env),
  }) as unknown as Response));
});

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  hote?.remove();
  hote = null;
  vi.unstubAllGlobals();
});

async function rendre(): Promise<HTMLDivElement> {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(BandeauDonneesNonPersistantes, { target: hote, props: {} });
  for (let i = 0; i < 4; i++) await new Promise((r) => setTimeout(r, 0));
  flushSync();
  return hote;
}

describe('#8747 — bandeau des données non persistantes', () => {
  it('volume anonyme : le bandeau nomme le dossier', async () => {
    env = { container: 'docker', data_persistence: { dir: '/data', kind: 'anonymous_volume', persistent: false } };
    const el = await rendre();
    const b = el.querySelector('[data-donnees-non-persistantes]');
    expect(b, 'aucun bandeau').not.toBeNull();
    expect(b!.getAttribute('data-donnees-non-persistantes')).toBe('anonymous_volume');
    expect(b!.textContent).toContain('/data');
    expect(b!.textContent).not.toContain('{dir}');
  });

  it('contre-épreuve : volume nommé, hors conteneur ou serveur ancien — rien', async () => {
    for (const e of [
      { container: 'docker', data_persistence: { dir: '/data', kind: 'named_volume', persistent: true } },
      { container: null, data_persistence: null },
      { container: 'docker' },
    ]) {
      env = e;
      const el = await rendre();
      expect(el.querySelector('[data-donnees-non-persistantes]'), JSON.stringify(e)).toBeNull();
      if (monte) unmount(monte);
      monte = null;
      hote?.remove();
    }
  });

  it('donneesNonPersistantes ne signale que persistent === false avec un dossier', () => {
    expect(donneesNonPersistantes(null)).toBeNull();
    expect(donneesNonPersistantes({})).toBeNull();
    expect(donneesNonPersistantes({ data_persistence: { dir: '/data', kind: 'host_dir', persistent: true } })).toBeNull();
    expect(donneesNonPersistantes({ data_persistence: { dir: '', kind: 'not_mounted', persistent: false } })).toBeNull();
    expect(donneesNonPersistantes({ data_persistence: { dir: '/data', kind: 'not_mounted', persistent: false } })?.kind)
      .toBe('not_mounted');
  });
});
