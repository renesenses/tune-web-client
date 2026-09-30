// @vitest-environment jsdom
//
// #1798 — suite de tune-server-rust#5438 (Bertrand, 29/09/2026). Chez Yves
// Corbat, 58 359 pistes : chaque clic sur un raccourci vers une collection
// intelligente coupait la musique. En ouvrant l'écran, il demandait
// `/{id}/albums` pour CHAQUE collection, en parallèle, soit une requête lourde
// par collection, pour composer ses mosaïques.
//
// Le serveur rend désormais `covers` avec les deux listes. Ce témoin MONTE
// l'écran et compte les requêtes qui en sortent :
//
//  - `covers` présent, même VIDE : aucune requête d'albums. Une collection
//    vide a répondu, elle n'a pas de pochette ;
//  - `covers` ABSENT (serveur plus ancien, ou catalogue distant) : le repli
//    reste, une requête pour cette collection-là seulement.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import { get } from 'svelte/store';
import CollectionsV2 from '../../components/v2/CollectionsV2.svelte';
import { dialogs } from '../stores/dialogs';

let smart: unknown[] = [];
let manuelles: unknown[] = [];
let requetes: string[] = [];

function corps(chemin: string): unknown {
  if (/\/smart-collections\/\d+\/albums/.test(chemin)) {
    return [{ id: 1, title: 'Blue Train', artist_name: 'Coltrane', cover_path: '/p/bt.jpg' }];
  }
  if (chemin.endsWith('/library/smart-collections')) return smart;
  if (/\/collections\/\d+\/albums/.test(chemin)) {
    return [{ id: 2, title: 'Kind of Blue', artist_name: 'Davis', cover_path: '/p/kob.jpg' }];
  }
  if (chemin.endsWith('/library/collections')) return manuelles;
  return [];
}

class Inerte {
  observe() {}
  unobserve() {}
  disconnect() {}
}

let hote: HTMLDivElement | null = null;
let monte: Record<string, any> | null = null;

beforeEach(() => {
  requetes = [];
  localStorage.clear();
  vi.stubGlobal('ResizeObserver', Inerte);
  vi.stubGlobal('IntersectionObserver', Inerte);
  vi.stubGlobal('WebSocket', class { close() {} addEventListener() {} removeEventListener() {} send() {} } as any);
  vi.stubGlobal('fetch', vi.fn(async (url: any) => {
    const brut = String(typeof url === 'string' ? url : url?.url ?? '');
    const chemin = brut.replace(/^https?:\/\/[^/]+/, '').split('?')[0];
    requetes.push(chemin);
    const c = corps(chemin);
    return {
      ok: true, status: 200, statusText: 'OK',
      headers: new Map([['content-type', 'application/json']]),
      json: async () => c,
      text: async () => JSON.stringify(c),
    } as unknown as Response;
  }));
});

afterEach(() => {
  for (const r of get(dialogs)) dialogs.settle(r.id, false);
  if (monte) unmount(monte);
  monte = null;
  if (hote) hote.remove();
  hote = null;
  vi.unstubAllGlobals();
});

async function tourner(tours = 12) {
  for (let i = 0; i < tours; i++) {
    await new Promise((r) => setTimeout(r, 0));
    flushSync();
  }
}

/** Attente BORNÉE par une condition, jamais par un délai fixe. */
async function attendreQue(condition: () => boolean, tours = 400): Promise<boolean> {
  for (let i = 0; i < tours; i++) {
    if (condition()) return true;
    await new Promise((r) => setTimeout(r, 5));
    flushSync();
  }
  return condition();
}

async function ouvrirLEcran() {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(CollectionsV2, { target: hote, props: {} as any });
  flushSync();
  // Les deux listes sont parties : l'écran a lu sa matière.
  const pret = await attendreQue(
    () => requetes.includes('/api/v1/library/smart-collections') && requetes.includes('/api/v1/library/collections'),
  );
  expect(pret, `les deux listes doivent partir : ${requetes.join(', ')}`).toBe(true);
  await tourner();
}

const albumsDemandes = () =>
  requetes.filter((c) => /\/(smart-collections|collections)\/\d+\/albums$/.test(c));

const smartAvec = (id: number, nom: string, covers?: string[]) => ({
  id, name: nom, description: null, rules: [], match_mode: 'all', album_count: covers?.length ?? 0,
  ...(covers === undefined ? {} : { covers }),
});
const manuelleAvec = (id: number, nom: string, covers?: string[]) => ({
  id, name: nom, description: null, album_ids: covers?.length ? [2] : [], created_at: '2026-01-01T00:00:00Z',
  ...(covers === undefined ? {} : { covers }),
});

describe('#1798 — la liste porte ses pochettes : plus une requête par collection', () => {
  it('covers présent, même VIDE : aucune requête d’albums', async () => {
    smart = [
      smartAvec(1, 'Jazz', ['/p/a.jpg', '/p/b.jpg']),
      smartAvec(2, 'Récents', []),
      smartAvec(3, 'SACD / DSD', []),
    ];
    manuelles = [manuelleAvec(10, 'Soirée', ['/p/kob.jpg']), manuelleAvec(11, 'Vide', [])];
    await ouvrirLEcran();
    expect(
      albumsDemandes(),
      'la liste a rendu `covers` : redemander les albums d’une collection vide est une requête lourde pour rien',
    ).toEqual([]);
  });

  it('covers ABSENT (serveur plus ancien, catalogue) : le repli reste, pour celle-là seulement', async () => {
    smart = [smartAvec(1, 'Jazz', ['/p/a.jpg']), smartAvec(2, 'Catalogue Qobuz')];
    manuelles = [manuelleAvec(10, 'Soirée', ['/p/kob.jpg']), manuelleAvec(11, 'Ancienne')];
    await ouvrirLEcran();
    const ok = await attendreQue(() => albumsDemandes().length >= 2);
    expect(ok, `repli attendu : ${requetes.join(', ')}`).toBe(true);
    expect(albumsDemandes().sort()).toEqual([
      '/api/v1/library/collections/11/albums',
      '/api/v1/library/smart-collections/2/albums',
    ]);
  });
});
