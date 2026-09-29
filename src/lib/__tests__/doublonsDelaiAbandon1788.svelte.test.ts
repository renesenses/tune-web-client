// @vitest-environment jsdom
//
// #1788 (tune-server-rust#5455, Fuccaro, Windows 11, 29/09/2026) — Métadonnées,
// onglet « Doublons » : « la fonction doublons tourne et cherche… et ne s'arrête
// jamais, ne donnant aucun résultat ».
//
// L'écran attendait trois requêtes par un `Promise.all` sans délai d'abandon :
// une seule route muette laissait « Chargement » à l'écran pour toujours, et
// cachait les deux listes qui avaient répondu. Une route en ERREUR devenait une
// liste vide, et l'écran annonçait « rien à regrouper ».
//
// 🔴 CES TÉMOINS MONTENT L'ÉCRAN et remplacent `fetch`, pas `api.ts` : ce qui
// est gardé, c'est ce que l'utilisateur voit quand le serveur se tait.
// `/library/duplicates` ne répond jamais (il n'honore que l'abandon, comme un
// vrai `fetch`) ; les deux autres répondent. Le délai est ramené à 80 ms.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import { get } from 'svelte/store';
import { t } from '../i18n';

vi.mock('../doublonsChargement', async (importOriginal) => {
  const vrai = await importOriginal<typeof import('../doublonsChargement')>();
  return { ...vrai, chargerLesDoublons: () => vrai.chargerLesDoublons(80) };
});

import MetadataV2 from '../../components/v2/MetadataV2.svelte';

class ResizeObserverInerte {
  observe() {} unobserve() {} disconnect() {}
}

/** Forme réelle de `GET /library/artists/doublons` (BIB-C1). */
const ARTISTES = {
  count: 1,
  artistes_concernes: 2,
  groups: [{
    cle: 'eric bibb', mbid_distincts: false, albums: 5,
    artistes: [
      { id: 11, name: 'Eric Bibb', musicbrainz_id: null, albums: 4 },
      { id: 12, name: 'ERIC BIBB', musicbrainz_id: null, albums: 1 },
    ],
  }],
};

const reponse = (corps: unknown, status = 200) => ({
  ok: status < 400, status, statusText: status < 400 ? 'OK' : 'Internal Server Error',
  headers: new Map([['content-type', 'application/json']]),
  json: async () => corps,
  text: async () => JSON.stringify(corps),
} as unknown as Response);
const respirer = () => new Promise((r) => setTimeout(r, 5));
async function jusqua(condition: () => boolean, borne = 3000): Promise<boolean> {
  const fin = Date.now() + borne;
  for (;;) {
    flushSync();
    if (condition()) return true;
    if (Date.now() >= fin) return false;
    await respirer();
  }
}

let hote: HTMLDivElement | null = null;
let monte: Record<string, unknown> | null = null;
/** Comment répond `/library/duplicates` : jamais, en 500, ou normalement. */
let paires: 'muet' | 'erreur' | 'ok' = 'muet';
let appelsPaires = 0;

beforeEach(() => {
  paires = 'muet';
  appelsPaires = 0;
  vi.stubGlobal('ResizeObserver', ResizeObserverInerte);
  vi.stubGlobal('fetch', vi.fn((url: any, init?: RequestInit) => {
    const u = String(url);
    if (/\/library\/duplicates(\?|$)/.test(u)) {
      appelsPaires += 1;
      if (paires === 'erreur') return Promise.resolve(reponse({ error: 'boom' }, 500));
      if (paires === 'ok') return Promise.resolve(reponse({ paires: [] }));
      // Muet : comme une route qui calcule sans fin. Seul l'abandon la libère.
      return new Promise((_, rejeter) => {
        init?.signal?.addEventListener('abort', () => rejeter(new DOMException('abandon', 'AbortError')));
      });
    }
    if (/\/library\/artists\/doublons/.test(u)) return Promise.resolve(reponse(ARTISTES));
    if (/\/library\/albums\/eclates/.test(u)) return Promise.resolve(reponse({ count: 0, groups: [] }));
    if (/\/metadata\/proposals/.test(u)) return Promise.resolve(reponse({ proposals: [], pending: 0, auto_apply: false }));
    return Promise.resolve(reponse([]));
  }));
  vi.stubGlobal('WebSocket', class {
    close() {} addEventListener() {} removeEventListener() {} send() {}
  } as unknown as typeof WebSocket);
});

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  hote?.remove();
  hote = null;
  vi.unstubAllGlobals();
});

async function ouvrirLOngletDoublons(): Promise<HTMLElement> {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(MetadataV2, { target: hote, props: {} }) as Record<string, unknown>;
  flushSync();
  const libelle = get(t)('v2.meta.tabDoublons' as any);
  const onglet = [...hote.querySelectorAll('button')].find((b) => b.textContent?.includes(libelle));
  expect(onglet, "l'onglet Doublons").toBeTruthy();
  onglet!.click();
  flushSync();
  return hote;
}

describe('#1788 — onglet Doublons : une route muette ne retient plus l\'écran', () => {
  it('à l\'échéance, « Chargement » cède la place au message et au bouton Réessayer ; les listes arrivées restent', async () => {
    const ecran = await ouvrirLOngletDoublons();
    const chargement = get(t)('v2.tool.loading' as any);
    const message = get(t)('v2.meta.dupTimeout' as any).replace('{s}', '60');
    const reessayer = get(t)('v2.meta.dupRetry' as any);

    const arrive = await jusqua(() => !!ecran.querySelector('[role="alert"]'));
    expect(arrive, "après le délai d'abandon, l'écran doit dire que le serveur n'a pas répondu (#1788)").toBe(true);
    const alerte = ecran.querySelector('[role="alert"]')!;
    expect(alerte.textContent).toContain(message);
    expect(ecran.textContent).not.toContain(chargement);
    // Les artistes, eux, ont répondu : ils ne sont plus cachés par la route muette.
    expect(ecran.textContent).toContain('ERIC BIBB');
    // Et l'écran ne prétend pas qu'il n'y a rien à regrouper.
    expect(ecran.textContent).not.toContain(get(t)('v2.meta.noDup' as any));

    // Réessayer relance le chargement ; cette fois le serveur répond.
    paires = 'ok';
    const bouton = [...alerte.querySelectorAll('button')].find((b) => b.textContent?.includes(reessayer));
    expect(bouton, 'le bouton Réessayer').toBeTruthy();
    bouton!.click();
    const repris = await jusqua(() => appelsPaires === 2 && !ecran.querySelector('[role="alert"]') && !ecran.textContent?.includes(chargement));
    expect(repris, 'Réessayer relance les trois requêtes et efface le message').toBe(true);
    expect(ecran.textContent).toContain('ERIC BIBB');
  });

  it('une route en erreur se dit, au lieu de passer pour « rien à regrouper »', async () => {
    paires = 'erreur';
    const ecran = await ouvrirLOngletDoublons();
    const arrive = await jusqua(() => !!ecran.querySelector('[role="alert"]'));
    expect(arrive, "une erreur du serveur doit être dite à l'écran (#1788)").toBe(true);
    expect(ecran.querySelector('[role="alert"]')!.textContent).toContain(get(t)('v2.meta.dupFailed' as any));
  });

  it('les trois clés existent dans les onze langues, et le délai y figure', async () => {
    const { readFileSync } = await import('node:fs');
    for (const l of ['fr', 'en', 'de', 'es', 'hu', 'it', 'ja', 'ko', 'ro', 'sv', 'zh']) {
      const src = readFileSync(`src/lib/locales/${l}.ts`, 'utf8');
      for (const k of ['v2.meta.dupTimeout', 'v2.meta.dupFailed', 'v2.meta.dupRetry']) {
        expect(src, `${k} manque en ${l}`).toContain(`"${k}"`);
      }
      const ligne = src.split('\n').find((x) => x.includes('"v2.meta.dupTimeout"')) ?? '';
      expect(ligne, `${l} : le délai`).toContain('{s}');
    }
  });
});
