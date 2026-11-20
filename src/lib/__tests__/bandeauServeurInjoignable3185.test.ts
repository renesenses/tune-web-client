// @vitest-environment jsdom
/**
 * #3185 — « The server is not responding… » affiché alors que le serveur répond.
 *
 * - une requête abandonnée par son appelant ne pose pas le bandeau, y compris
 *   par `api/_client.ts` (qui ne regardait pas le signal) ;
 * - le bandeau (persistant) se retire dès qu'une réponse du serveur arrive.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';
import lFr from '../locales/fr';

async function banc(reponse: () => Promise<Response>) {
  localStorage.clear();
  vi.stubGlobal('fetch', vi.fn(reponse));
  vi.resetModules();
  const i18n = await import('../i18n');
  i18n.enregistrerDictionnaire('fr', lFr as any);
  i18n.locale.set('fr');
  const client = await import('../api/_client');
  const api = await import('../api');
  const { notifications } = await import('../stores/notifications');
  const bandeaux = () =>
    get(notifications).filter((n) => n.message === (lFr as Record<string, string>)['common.serverUnreachable']);
  return { client, api, notifications, bandeaux };
}

const panne = async (): Promise<Response> => {
  throw new TypeError('Failed to fetch');
};
const ok = async (): Promise<Response> =>
  new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } });

describe('#3185 — bandeau « le serveur ne répond pas »', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('🔴 api/_client : une requête abandonnée par son appelant ne pose pas le bandeau', async () => {
    const { client, bandeaux } = await banc(async () => {
      throw new DOMException('The operation was aborted.', 'AbortError');
    });
    const ctrl = new AbortController();
    ctrl.abort();
    await client.fetchJSON('/api/v1/zones', { signal: ctrl.signal }).catch(() => undefined);
    expect(bandeaux()).toEqual([]);
  });

  it('une vraie panne (signal non abandonné) pose toujours le bandeau', async () => {
    const { client, bandeaux } = await banc(panne);
    await client.fetchJSON('/api/v1/zones').catch(() => undefined);
    expect(bandeaux().length).toBe(1);
    expect(bandeaux()[0].duration).toBe(0);
  });

  it('🔴 api/_client : le bandeau se retire dès que le serveur répond à nouveau', async () => {
    let enPanne = true;
    const { client, bandeaux } = await banc(() => (enPanne ? panne() : ok()));
    await client.fetchJSON('/api/v1/zones').catch(() => undefined);
    expect(bandeaux().length).toBe(1);
    enPanne = false;
    await client.fetchJSON('/api/v1/zones');
    expect(bandeaux()).toEqual([]);
  });

  it('🔴 api.ts : posé par une requête, retiré par la réponse suivante (même d’un autre module)', async () => {
    let enPanne = true;
    const { client, api, bandeaux } = await banc(() => (enPanne ? panne() : ok()));
    await api.fetchJSON('/api/v1/zones').catch(() => undefined);
    expect(bandeaux().length).toBe(1);
    enPanne = false;
    await client.fetchJSON('/api/v1/system/health');
    expect(bandeaux()).toEqual([]);
  });

  it('une réponse en erreur HTTP compte aussi : le serveur a répondu', async () => {
    let enPanne = true;
    const { api, bandeaux } = await banc(() =>
      enPanne ? panne() : Promise.resolve(new Response('{}', { status: 404 })),
    );
    await api.fetchJSON('/api/v1/zones').catch(() => undefined);
    expect(bandeaux().length).toBe(1);
    enPanne = false;
    await api.fetchJSON('/api/v1/zones').catch(() => undefined);
    expect(bandeaux()).toEqual([]);
  });

  it('après le retour du serveur, une nouvelle panne s’annonce sans attendre la fenêtre anti-rafale', async () => {
    let etat: 'panne' | 'ok' = 'panne';
    const { api, bandeaux } = await banc(() => (etat === 'panne' ? panne() : ok()));
    await api.fetchJSON('/api/v1/zones').catch(() => undefined);
    etat = 'ok';
    await api.fetchJSON('/api/v1/zones');
    expect(bandeaux()).toEqual([]);
    etat = 'panne';
    await api.fetchJSON('/api/v1/zones').catch(() => undefined);
    expect(bandeaux().length).toBe(1);
  });
});
