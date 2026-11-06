// @vitest-environment jsdom
//
// tune-server-rust#7619 (L1) — l'onglet Titres suit `next_cursor` par `after`
// (serveur avec curseur) et garde l'offset face à un serveur qui n'en rend pas.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as api from '../api';
import { FenetrePistes, chargeurServeur, type ChargeurDePage } from '../pistesPaginees';
import type { Track } from '../types';

const T = 10;
const piste = (i: number) => ({ id: i + 1, title: `P${i}` } as unknown as Track);
const attendre = async (cond: () => boolean) => {
  for (let i = 0; i < 200 && !cond(); i++) await new Promise((r) => setTimeout(r, 0));
};

/** Serveur simulé. `curseur` : rend `next_cursor` (« c<offset suivant> »), `null` en fin de liste. */
function serveur(total: number, curseur: boolean) {
  const appels: { offset: number; after: string | null }[] = [];
  const f: ChargeurDePage = async ({ offset, limit, after }) => {
    appels.push({ offset, after: after ?? null });
    const debut = after ? Number(after.slice(1)) : offset;
    const fin = Math.min(debut + limit, total);
    const items = Array.from({ length: Math.max(0, fin - debut) }, (_, k) => piste(debut + k));
    const page: any = { items, total, comptes: null, totalToutesSources: null };
    if (curseur) page.curseurSuivant = fin < total ? `c${fin}` : null;
    return page;
  };
  return { f, appels };
}

describe('#7619 — FenetrePistes et curseur', () => {
  it('serveur avec curseur : les pages suivantes demandent after, pas offset, dans l\'ordre', async () => {
    const s = serveur(35, true);
    const fen = new FenetrePistes(s.f, () => {}, T);
    expect(await fen.demarrer()).toBe('serveur');
    fen.assurer(0, 35);
    await attendre(() => fen.pageChargee(3));
    expect(s.appels[0]).toEqual({ offset: 0, after: null });
    expect(s.appels.slice(1).map((a) => a.after)).toEqual(['c10', 'c20', 'c30']);
    expect(fen.contigues(0, 35).map((p) => p.id)).toEqual(Array.from({ length: 35 }, (_, i) => i + 1));
    expect(fen.total).toBe(35);
  });

  it('serveur ancien sans next_cursor : offset comme avant, jamais after', async () => {
    const s = serveur(35, false);
    const fen = new FenetrePistes(s.f, () => {}, T);
    await fen.demarrer();
    fen.assurer(0, 35);
    await attendre(() => fen.pageChargee(3));
    expect(s.appels.every((a) => a.after === null)).toBe(true);
    expect(s.appels.map((a) => a.offset).sort((a, b) => a - b)).toEqual([0, 10, 20, 30]);
    expect(fen.contigues(0, 35)).toHaveLength(35);
  });

  it('fin de liste : next_cursor null, aucune page de plus demandée', async () => {
    const s = serveur(20, true);
    const fen = new FenetrePistes(s.f, () => {}, T);
    await fen.demarrer();
    fen.assurer(0, 500);
    await attendre(() => fen.pageChargee(1));
    await new Promise((r) => setTimeout(r, 5));
    expect(s.appels).toHaveLength(2);
    expect(fen.contigues(0, 20)).toHaveLength(20);
    expect(fen.erreur).toBeNull();
  });

  it('un curseur refusé (400) retombe sur l\'offset sans perdre la page', async () => {
    const appels: { offset: number; after: string | null }[] = [];
    const f: ChargeurDePage = async ({ offset, limit, after }) => {
      appels.push({ offset, after: after ?? null });
      if (after) throw Object.assign(new Error('400'), { status: 400 });
      return { items: Array.from({ length: limit }, (_, k) => piste(offset + k)), total: 30, comptes: null, totalToutesSources: null, curseurSuivant: 'cx' };
    };
    const fen = new FenetrePistes(f, () => {}, T);
    await fen.demarrer();
    fen.assurer(10, 20);
    await attendre(() => fen.pageChargee(1));
    expect(fen.pageChargee(1)).toBe(true);
    expect(appels.at(-1)).toEqual({ offset: 10, after: null });
  });
});

describe('#7619 — api.getPagePistes', () => {
  const urls: string[] = [];
  beforeEach(() => {
    urls.length = 0;
    vi.stubGlobal('fetch', vi.fn(async (u: string) => {
      urls.push(String(u));
      const corps = { items: [], total: 0, limit: 5, offset: 0, order: 'asc', next_cursor: urls.length === 1 ? 'abc' : undefined };
      return { ok: true, status: 200, statusText: 'OK', headers: new Map([['content-type', 'application/json']]),
        json: async () => corps, text: async () => JSON.stringify(corps) } as unknown as Response;
    }));
  });
  afterEach(() => vi.unstubAllGlobals());

  it('lit next_cursor ; sans lui curseurSuivant est null', async () => {
    expect((await api.getPagePistes({ limit: 5, offset: 0 }))?.curseurSuivant).toBe('abc');
    expect((await api.getPagePistes({ limit: 5, offset: 0 }))?.curseurSuivant).toBeNull();
  });

  it('after remplace offset ; l\'ordre explicite part toujours', async () => {
    await api.getPagePistes({ limit: 5, offset: 40, after: 'abc', sort: 'title' });
    await api.getPagePistes({ limit: 5, offset: 40 });
    const p1 = new URL(urls[0], 'http://x').searchParams, p2 = new URL(urls[1], 'http://x').searchParams;
    expect(p1.get('after')).toBe('abc'); expect(p1.has('offset')).toBe(false); expect(p1.get('order')).toBe('asc');
    expect(p2.has('after')).toBe(false); expect(p2.get('offset')).toBe('40');
  });

  it('chargeurServeur : pas de curseur dans la portée Répertoires', async () => {
    const spy = vi.fn(async () => null) as any;
    const base = { recherche: '', provenance: null, tri: null };
    await chargeurServeur({ ...base, dossier: null }, spy)({ offset: 10, limit: 10, comptes: false, signal: new AbortController().signal, after: 'abc' });
    await chargeurServeur({ ...base, dossier: '/x' }, spy)({ offset: 10, limit: 10, comptes: false, signal: new AbortController().signal, after: 'abc' });
    expect(spy.mock.calls[0][0].after).toBe('abc');
    expect(spy.mock.calls[1][0].after).toBeUndefined();
  });
});
