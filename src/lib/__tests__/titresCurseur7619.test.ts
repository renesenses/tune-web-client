// tune-server-rust#7619, volet L1 — l'onglet Titres pagine par CURSEUR.
//
// Le serveur lit désormais sa liste dans l'ordre d'un index (clé de tri
// pré-calculée) : une page demandée APRÈS un curseur ne relit pas ce qui
// précède, là où `offset=N` le relisait. La fenêtre de l'onglet suit donc les
// curseurs pour les pages CONTIGUËS (défilement) et garde `offset` pour un
// saut (ascenseur tiré loin) et face à un serveur qui ne rend pas de curseur.
//
// Les témoins lisent les requêtes émises (fetch ou chargeur simulé).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as api from '../api';
import { FenetrePistes, _remiseAZeroPourTests as remisePagination, type ChargeurDePage } from '../pistesPaginees';
import type { Track } from '../types';

const respirer = () => new Promise((r) => setTimeout(r, 0));
const piste = (i: number): Track => ({ id: i + 1, title: `P${i + 1}` } as unknown as Track);

beforeEach(() => remisePagination());
afterEach(() => vi.unstubAllGlobals());

describe('#7619 — api.getPagePistes et le curseur', () => {
  it('envoie `after` et lit `next_cursor`', async () => {
    const urls: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: any) => {
      urls.push(String(url));
      const corps = { items: [piste(0)], total: 10, limit: 1, offset: 0, sort: null, order: 'asc', next_cursor: 'CUR2' };
      return { ok: true, status: 200, statusText: 'OK', headers: new Map([['content-type', 'application/json']]),
        json: async () => corps, text: async () => JSON.stringify(corps) } as unknown as Response;
    }));
    const page = await api.getPagePistes({ limit: 1, offset: 1, after: 'CUR1' });
    const p = new URL(urls[0], 'http://x').searchParams;
    expect(p.get('after')).toBe('CUR1');
    expect(p.get('offset'), 'offset reste envoyé : le serveur s’y replie').toBe('1');
    expect(page?.curseurSuivant).toBe('CUR2');
  });

  it('sans curseur demandé, aucun `after` ; sans `next_cursor`, curseurSuivant nul', async () => {
    const urls: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: any) => {
      urls.push(String(url));
      const corps = { items: [], total: 0, limit: 5, offset: 0, sort: null, order: 'asc' };
      return { ok: true, status: 200, statusText: 'OK', headers: new Map([['content-type', 'application/json']]),
        json: async () => corps, text: async () => JSON.stringify(corps) } as unknown as Response;
    }));
    const page = await api.getPagePistes({ limit: 5, offset: 0 });
    expect(new URL(urls[0], 'http://x').searchParams.has('after')).toBe(false);
    expect(page?.curseurSuivant).toBeNull();
  });
});

describe('#7619 — FenetrePistes suit les curseurs', () => {
  /** Un serveur simulé qui rend un curseur `c<rang>` après chaque page. */
  function chargeur(total: number, avecCurseur = true) {
    const appels: { offset: number; after: string | null }[] = [];
    const dénouer: (() => void)[] = [];
    const f: ChargeurDePage = async ({ offset, limit, comptes, after }) => {
      appels.push({ offset, after: after ?? null });
      await new Promise<void>((r) => dénouer.push(r));
      // Le curseur désigne le rang de la ligne suivante : le serveur repart
      // de là, quel que soit l'offset envoyé.
      const debut = after ? Number(after.slice(1)) : offset;
      const items = Array.from({ length: Math.max(0, Math.min(limit, total - debut)) }, (_, k) => piste(debut + k));
      const fin = debut + items.length;
      return {
        items, total, comptes: comptes ? new Map() : null, totalToutesSources: null,
        curseurSuivant: avecCurseur && fin < total ? `c${fin}` : null,
      };
    };
    const toutDenouer = async () => { while (dénouer.length) { dénouer.shift()!(); await respirer(); } };
    return { f, appels, toutDenouer };
  }

  it('le défilement enchaîne les pages par curseur, sans doublon ni trou', async () => {
    const c = chargeur(1_000);
    const fen = new FenetrePistes(c.f, () => {}, 100);
    const d = fen.demarrer();
    await c.toutDenouer();
    await d;
    fen.assurer(0, 450);
    await c.toutDenouer();
    expect(c.appels.map((a) => a.after)).toEqual([null, 'c100', 'c200', 'c300', 'c400']);
    expect(fen.contigues(0, 500).map((t) => t.id)).toEqual(Array.from({ length: 500 }, (_, k) => k + 1));
  });

  it('un saut part par offset, puis la suite reprend par curseur', async () => {
    const c = chargeur(10_000);
    const fen = new FenetrePistes(c.f, () => {}, 100);
    const d = fen.demarrer();
    await c.toutDenouer();
    await d;
    fen.assurer(5_000, 5_250);
    await c.toutDenouer();
    expect(c.appels.slice(1)).toEqual([
      { offset: 5_000, after: null },
      { offset: 5_100, after: 'c5100' },
      { offset: 5_200, after: 'c5200' },
    ]);
    expect(fen.contigues(5_000, 5_300).map((t) => t.id)).toEqual(Array.from({ length: 300 }, (_, k) => 5_001 + k));
  });

  it('face à un serveur sans curseur, tout part par offset comme avant', async () => {
    const c = chargeur(1_000, false);
    const fen = new FenetrePistes(c.f, () => {}, 100);
    const d = fen.demarrer();
    await c.toutDenouer();
    await d;
    fen.assurer(0, 350);
    await c.toutDenouer();
    expect(c.appels.every((a) => a.after === null)).toBe(true);
    expect(c.appels.map((a) => a.offset)).toEqual([0, 100, 200, 300]);
    expect(fen.contigues(0, 400)).toHaveLength(400);
  });
});
