// @vitest-environment jsdom
// tune-server-rust#7836 (fil 2642) — Réglages › Zones : « Zones supprimées (n) »
// liste les zones supprimées (masquées), chacune avec un bouton Restaurer. Le
// lien est grisé quand il n'y a rien ; un serveur sans la route n'affiche rien.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import ZonesSupprimees from '../../components/v2/ZonesSupprimees.svelte';
import { locale } from '../i18n';

vi.setConfig({ testTimeout: 30_000 });

const response = (body: unknown, status = 200) => ({
  ok: status < 400, status, statusText: status === 404 ? 'Not Found' : 'OK',
  headers: new Headers({ 'Content-Type': 'application/json' }),
  text: async () => JSON.stringify(body),
  json: async () => body,
} as unknown as Response);
const wait = () => new Promise((resolve) => setTimeout(resolve, 0));
async function until(predicate: () => boolean, quoi = '', limit = 5000) {
  const end = Date.now() + limit;
  while (!predicate() && Date.now() < end) { await wait(); flushSync(); }
  expect(predicate(), `${quoi} ; appels : ${JSON.stringify(appels)} ; écran : ${host.innerHTML}`).toBe(true);
}

const MAC = {
  id: 5, name: "Rémi's MacBook", output_device_id: 'airplay-92:61:3B', output_type: 'airplay2',
  motif: 'suppression_utilisateur', masquee_le: '2026-10-30T07:10:11Z', appareil_detecte: true,
};
let supprimees: unknown[];
let ancienServeur: boolean;
let appels: { url: string; method: string }[];
let host: HTMLDivElement;
let composant: Record<string, unknown> | null;
let restauree: ReturnType<typeof vi.fn<() => void>>;

beforeEach(() => {
  locale.set('fr');
  supprimees = [MAC];
  ancienServeur = false;
  appels = [];
  restauree = vi.fn<() => void>();
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input).split('?')[0];
    const method = (init?.method ?? 'GET').toUpperCase();
    appels.push({ url, method });
    if (url.endsWith('/zones/supprimees')) {
      return ancienServeur ? response({ error: 'missing' }, 404) : response({ count: supprimees.length, items: supprimees });
    }
    if (url.endsWith('/zones/5/restaurer') && method === 'POST') {
      supprimees = [];
      return response({ id: 5, name: MAC.name });
    }
    return response({});
  }));
  host = document.createElement('div');
  document.body.appendChild(host);
  composant = null;
});

afterEach(() => {
  if (composant) unmount(composant);
  host.remove();
  vi.unstubAllGlobals();
});

const lien = () => host.querySelector<HTMLButtonElement>('.supprimees .lien');
const ligne = () => host.querySelector<HTMLElement>('[data-zone-supprimee="5"]');

describe('tune-server-rust#7836 — Zones supprimées', () => {
  it('liste la zone supprimée et la restaure', async () => {
    composant = mount(ZonesSupprimees, { target: host, props: { onRestauree: restauree } });
    await until(() => lien() !== null);
    expect(lien()!.textContent).toContain('Zones supprimées (1)');
    expect(lien()!.disabled).toBe(false);
    lien()!.click();
    flushSync();
    expect(ligne()?.textContent).toContain("Rémi's MacBook");
    ligne()!.querySelector<HTMLButtonElement>('button')!.click();
    await until(() => appels.some((a) => a.method === 'POST' && a.url.endsWith('/zones/5/restaurer')), 'POST');
    await until(() => restauree.mock.calls.length === 1, 'rappel');
    await until(() => lien()?.textContent?.includes('Zones supprimées (0)') === true, 'zéro');
    expect(lien()!.disabled, 'grisé quand il ne reste rien').toBe(true);
    expect(ligne()).toBeNull();
  });

  it('grisé sans zone supprimée', async () => {
    supprimees = [];
    composant = mount(ZonesSupprimees, { target: host, props: {} });
    await until(() => lien() !== null);
    expect(lien()!.disabled).toBe(true);
  });

  it("un serveur sans la route n'affiche rien", async () => {
    ancienServeur = true;
    composant = mount(ZonesSupprimees, { target: host, props: {} });
    await until(() => appels.length > 0);
    await wait(); flushSync();
    expect(host.querySelector('.supprimees')).toBeNull();
  });
});
