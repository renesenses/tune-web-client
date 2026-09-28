// @vitest-environment jsdom
//
// #1659 — « Quand je supprime un objet de l'étiquette, la page ne se
// rafraîchit pas […] je suis obligé de rafraîchir moi même la page web »
// (FabienM, fil 1990 point 1, puis fil 2013 point 5 sur un album).
//
// L'écran d'une étiquette chargeait son contenu une seule fois, dans
// `ouvrir()`. Le panneau Étiquettes, ouvert par-dessus, retirait côté serveur
// sans prévenir personne : l'objet retiré restait affiché.
//
// 🔴 CES TÉMOINS MONTENT LES DEUX ÉCRANS et cliquent la croix du panneau, comme
// l'utilisateur. Le `fetch` bouchonné répond selon l'état « serveur ».
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import EtiquettesPanneau from '../../components/v2/EtiquettesPanneau.svelte';
import EtiquettesV2 from '../../components/v2/EtiquettesV2.svelte';
import { locale } from '../i18n';
import lFr from '../locales/fr';

vi.setConfig({ testTimeout: 30_000 });

const fr = lFr as unknown as Record<string, string>;

class ObservateurInerte { observe() {} unobserve() {} disconnect() {} }

const respirer = () => new Promise((r) => setTimeout(r, 0));
async function souffler(n = 10) {
  for (let i = 0; i < n; i++) { await respirer(); flushSync(); }
}

const TAG = { id: 4, name: 'Ecouter plus tard', color: '#808080' };
const ALBUM = { id: 12, title: 'Brixton night', artist_name: 'Bruce Springsteen' };
const PISTE = { id: 7, title: 'How I Fear', artist_name: 'Clem Beatz', duration_ms: 200000 };

/** L'état « serveur » : ce que porte l'étiquette 4. */
let serveur: { albums: any[]; pistes: any[] };

let hoteEcran: HTMLDivElement;
let hotePanneau: HTMLDivElement;
let montes: Record<string, unknown>[] = [];

function repondre(url: string, method: string): unknown {
  if (method === 'DELETE') {
    const m = url.match(/\/tags\/4\/items\/(album|track)\/(\d+)$/);
    if (m) {
      const id = Number(m[2]);
      if (m[1] === 'album') serveur.albums = serveur.albums.filter((a) => a.id !== id);
      else serveur.pistes = serveur.pistes.filter((p) => p.id !== id);
    }
    return {};
  }
  if (url.includes('/tags/4/albums')) return { albums: serveur.albums, count: serveur.albums.length };
  if (url.includes('/tags/4/tracks')) return { tracks: serveur.pistes, count: serveur.pistes.length };
  if (url.includes('/tags/4/artists')) return { artists: [], count: 0 };
  if (url.includes('/tags/4/playlists')) return { playlists: [], count: 0 };
  if (url.match(/\/tags\/for\/album\/12$/)) return serveur.albums.length ? [TAG] : [];
  if (url.match(/\/tags\/for\/track\/7$/)) return serveur.pistes.length ? [TAG] : [];
  if (url.includes('/tags/4/')) return {};
  if (url.includes('/tags/')) return [TAG];
  return {};
}

beforeEach(() => {
  serveur = { albums: [ALBUM], pistes: [PISTE] };
  locale.set('fr');
  vi.stubGlobal('ResizeObserver', ObservateurInerte);
  vi.stubGlobal('IntersectionObserver', ObservateurInerte);
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    const charge = repondre(url, (init?.method ?? 'GET').toUpperCase());
    return {
      ok: true, status: 200,
      headers: new Headers({ 'Content-Type': 'application/json' }),
      text: async () => JSON.stringify(charge),
      json: async () => charge,
    } as unknown as Response;
  }));
  hoteEcran = document.createElement('div');
  hotePanneau = document.createElement('div');
  document.body.append(hoteEcran, hotePanneau);
});

afterEach(() => {
  for (const m of montes) unmount(m);
  montes = [];
  hoteEcran.remove();
  hotePanneau.remove();
  document.querySelectorAll('.fond').forEach((e) => e.remove());
  vi.unstubAllGlobals();
});

const onglet = (cle: string) =>
  [...hoteEcran.querySelectorAll('.onglets button')].find((b) => b.textContent?.startsWith(fr[cle])) as HTMLButtonElement;

async function ouvrirEtiquette() {
  montes.push(mount(EtiquettesV2, { target: hoteEcran, props: {} }));
  await souffler();
  const b = [...hoteEcran.querySelectorAll('button.tag')].find((x) => x.textContent?.includes(TAG.name)) as HTMLButtonElement;
  expect(b, "l'étiquette n'est pas listée").toBeTruthy();
  b.click();
  await souffler();
}

async function retirerDepuisLePanneau(itemType: string, itemId: number) {
  montes.push(mount(EtiquettesPanneau, {
    target: hotePanneau, props: { itemType, itemId, nom: 'x', onClose: () => {} },
  }));
  await souffler();
  const croix = document.querySelector('.fond button.x') as HTMLButtonElement;
  expect(croix, "le panneau ne montre pas l'étiquette posée").toBeTruthy();
  croix.click();
  await souffler();
}

describe("#1659 — retirer depuis le panneau met à jour l'étiquette ouverte", () => {
  it('🔴 une piste retirée disparaît de l’onglet Pistes, qui reste affiché', async () => {
    await ouvrirEtiquette();
    onglet('favorites.tracks').click();
    flushSync();
    expect(hoteEcran.textContent).toContain('How I Fear');

    await retirerDepuisLePanneau('track', 7);

    expect(hoteEcran.textContent, 'la piste retirée est toujours à l’écran').not.toContain('How I Fear');
    expect(onglet('favorites.tracks').querySelector('span')?.textContent).toBe('0');
    expect(hoteEcran.querySelector('.v2-sous')?.textContent).toMatch(/^1 /);
    // L'onglet regardé ne saute pas vers « Albums », la première famille non vide.
    expect(onglet('favorites.tracks').classList.contains('on')).toBe(true);
  });

  it('🔴 un album retiré disparaît de l’onglet Albums (fil 2013)', async () => {
    await ouvrirEtiquette();
    expect(hoteEcran.textContent).toContain('Brixton night');

    await retirerDepuisLePanneau('album', 12);

    expect(hoteEcran.textContent, 'l’album retiré est toujours à l’écran').not.toContain('Brixton night');
    expect(onglet('favorites.albums').querySelector('span')?.textContent).toBe('0');
  });
});
