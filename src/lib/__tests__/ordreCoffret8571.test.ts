// @vitest-environment jsdom
//
// RÉORDONNER LES ALBUMS D'UN COFFRET — tune-server-rust#8571 (fil 2763, go
// de Bertrand du 12/11/2026).
//
// > « Si on coche et décoche des albums on risque d'être perdu […] cela me
// > semble moins naturel à gérer que de pouvoir déplacer les albums dans
// > l'ordre souhaité. »
//
// Deux écrans :
//   1. la COMPOSITION (Métadonnées › Coffrets) : les albums cochés forment une
//      liste ordonnée, réordonnable sans décocher, et c'est cet ordre-là qui
//      part au serveur ;
//   2. la FICHE d'un coffret déjà composé : « Réordonner les albums », sur un
//      serveur qui l'annonce (`ordre_coffret`), sinon rien.
//
// 🔴 CES TÉMOINS MONTENT L'ÉCRAN ET CLIQUENT : « écrit mais pas branché ».
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import { readFileSync } from 'node:fs';
import MetadataV2 from '../../components/v2/MetadataV2.svelte';
import OrdreCoffretListeV2 from '../../components/v2/OrdreCoffretListeV2.svelte';
import { deplacerDans, plagesDeDisques, ordreChange, ordreCoffretAnnonce, estOrdreCoffret } from '../ordreCoffret';
import { locale } from '../i18n';
import lFr from '../locales/fr';

const FR = lFr as Record<string, string>;
const DELAI_MONTAGE = 60_000;
const attendre = (ms = 60) => new Promise((r) => setTimeout(r, ms));

describe('les règles pures', () => {
  it('déplacer rend une NOUVELLE liste, bornée', () => {
    const l = [1, 2, 3, 4];
    expect(deplacerDans(l, 0, 2)).toEqual([2, 3, 1, 4]);
    expect(deplacerDans(l, 3, 0)).toEqual([4, 1, 2, 3]);
    expect(deplacerDans(l, 1, 99)).toEqual([1, 3, 4, 2]);
    expect(deplacerDans(l, 9, 0)).toEqual([1, 2, 3, 4]);
    expect(l, 'la liste d’origine n’est pas touchée').toEqual([1, 2, 3, 4]);
  });

  it('#8463 — chaque album garde ses disques, le suivant prend la suite', () => {
    // L'exemple de Didier : 4 CD, 3 CD, 1, 1.
    expect(plagesDeDisques([4, 3, 1, 1])).toEqual([{ a: 1, b: 4 }, { a: 5, b: 7 }, { a: 8, b: 8 }, { a: 9, b: 9 }]);
    expect(plagesDeDisques([1, 3])).toEqual([{ a: 1, b: 1 }, { a: 2, b: 4 }]);
    expect(plagesDeDisques([0])).toEqual([{ a: 1, b: 1 }]);
  });

  it('la sonde et la forme du serveur', () => {
    expect(ordreCoffretAnnonce({ ordre_coffret: true })).toBe(true);
    expect(ordreCoffretAnnonce({ defaire_coffret_manuel: true })).toBe(false);
    expect(ordreCoffretAnnonce(null)).toBe(false);
    expect(estOrdreCoffret({ coffret: 7, membres: [{ membre: 0, titre: 'A', disques: [1], pistes: 2 }] })).toBe(true);
    expect(estOrdreCoffret({ error: 'ordre_indisponible' })).toBe(false);
    expect(ordreChange([0, 1, 2], [0, 1, 2])).toBe(false);
    expect(ordreChange([0, 1, 2], [2, 0, 1])).toBe(true);
  });
});

describe('la liste ordonnée — clavier, glisser-déposer, annonce', () => {
  let hote: HTMLDivElement | null = null;
  let monte: Record<string, any> | null = null;
  afterEach(() => {
    if (monte) unmount(monte);
    monte = null; hote?.remove(); hote = null;
  });

  function monter(deplacements: [number, number][]) {
    locale.set('fr');
    hote = document.createElement('div');
    document.body.appendChild(hote);
    monte = mount(OrdreCoffretListeV2, {
      target: hote,
      props: {
        elements: [
          { cle: 21, titre: 'Immersion Box Set', disques: 3 },
          { cle: 22, titre: 'Immersion Stereo', disques: 1 },
        ],
        ondeplacer: (de: number, vers: number) => deplacements.push([de, vers]),
        etiquette: 'Ordre',
      },
    });
    flushSync();
    return hote;
  }

  it('🔴 chaque album a Monter / Descendre, nommés, et ses disques visibles', () => {
    const el = monter([]);
    const lignes = el.querySelectorAll('li[data-cle]');
    expect(lignes.length).toBe(2);
    expect(lignes[0].querySelector('.cfordre-disques')?.textContent).toBe('Disques 1 à 3');
    expect(lignes[1].querySelector('.cfordre-disques')?.textContent).toBe('Disque 4');
    const haut = lignes[1].querySelector<HTMLButtonElement>('[data-sens="haut"]')!;
    expect(haut.getAttribute('aria-label')).toBe('Monter « Immersion Stereo »');
    expect(lignes[0].querySelector<HTMLButtonElement>('[data-sens="haut"]')!.disabled, 'le premier ne monte pas').toBe(true);
    expect(lignes[1].querySelector<HTMLButtonElement>('[data-sens="bas"]')!.disabled, 'le dernier ne descend pas').toBe(true);
    expect(el.querySelector('[role="status"][aria-live="polite"]'), 'pas de région d’annonce').not.toBeNull();
  });

  it('🔴 Monter demande le déplacement et ANNONCE la nouvelle place et ses disques', () => {
    const d: [number, number][] = [];
    const el = monter(d);
    el.querySelectorAll('li[data-cle]')[1].querySelector<HTMLButtonElement>('[data-sens="haut"]')!.click();
    flushSync();
    expect(d).toEqual([[1, 0]]);
    expect(el.querySelector('[role="status"]')?.textContent).toBe('« Immersion Stereo » : position 1 sur 2, Disque 1.');
  });

  it('🔴 glisser-déposer : la ligne déposée prend la place de la cible', () => {
    const d: [number, number][] = [];
    const el = monter(d);
    const [a, b] = [...el.querySelectorAll('li[data-cle]')];
    a.dispatchEvent(new Event('dragstart', { bubbles: true }));
    b.dispatchEvent(new Event('dragover', { bubbles: true, cancelable: true }));
    b.dispatchEvent(new Event('drop', { bubbles: true, cancelable: true }));
    flushSync();
    expect(d).toEqual([[0, 1]]);
  });
});

/* ------------------------------------------------------------------ */
/* 1. La composition                                                    */
/* ------------------------------------------------------------------ */

const ALBUMS = [
  { album_id: 21, title: 'Immersion Box Set', album_artist: 'Pink Floyd', track_count: 36, disc_count: 3, cover_path: null, is_compilation: false },
  { album_id: 22, title: 'Immersion Stereo', album_artist: 'Pink Floyd', track_count: 10, disc_count: 1, cover_path: null, is_compilation: false },
  { album_id: 23, title: 'Immersion Quadraphonic', album_artist: 'Pink Floyd', track_count: 10, disc_count: 1, cover_path: null, is_compilation: false },
];
let envois: { url: string; corps: any }[] = [];
function reponse(url: string, init?: RequestInit): Response {
  const u = String(url);
  if (init?.method === 'POST' || init?.method === 'PUT') {
    envois.push({ url: u, corps: init.body ? JSON.parse(String(init.body)) : null });
  }
  const corps = u.includes('/library/albums/coffret/apercu')
    ? { titre: 'Immersion' }
    : u.includes('/library/albums/coffret') && init?.method === 'POST'
    ? { cible: 22, absorbes: 2, disques: 5, titre: 'Immersion' }
    : u.includes('/library/albums')
      ? { items: ALBUMS, total: ALBUMS.length }
      : {};
  return {
    ok: true, status: 200, statusText: 'OK',
    headers: new Map([['content-type', 'application/json']]),
    json: async () => corps,
    text: async () => JSON.stringify(corps),
  } as unknown as Response;
}

describe('Métadonnées › Coffrets — réordonner SANS décocher', () => {
  let hote: HTMLDivElement | null = null;
  let monte: Record<string, any> | null = null;
  beforeEach(() => {
    locale.set('fr');
    envois = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => reponse(url, init)));
    vi.stubGlobal('WebSocket', class { close() {} addEventListener() {} removeEventListener() {} send() {} } as unknown as typeof WebSocket);
  });
  afterEach(() => {
    if (monte) unmount(monte);
    monte = null; hote?.remove(); hote = null;
    vi.unstubAllGlobals();
  });

  async function ouvrir(): Promise<HTMLDivElement> {
    hote = document.createElement('div');
    document.body.appendChild(hote);
    monte = mount(MetadataV2 as any, { target: hote, props: {} as any });
    flushSync(); await attendre();
    const onglet = [...hote.querySelectorAll('nav.tabs button')].find((b) => /coffret/i.test(b.textContent ?? '')) as HTMLButtonElement;
    onglet.click(); flushSync(); await attendre();
    const champ = hote.querySelector<HTMLInputElement>('input.cpq')!;
    champ.value = 'Immersion';
    champ.dispatchEvent(new Event('input', { bubbles: true }));
    flushSync(); await attendre();
    return hote;
  }
  const caseDe = (el: HTMLElement, titre: string) => [...el.querySelectorAll('label.cprow')]
    .find((l) => l.querySelector('.pt')?.textContent?.trim() === titre)!
    .querySelector('input[type=checkbox]') as HTMLInputElement;
  const ordreAffiche = (el: HTMLElement) => [...el.querySelectorAll('[data-ordre-coffret] li .cfordre-titre')].map((x) => x.textContent);

  it('🟢 CONTRE-ÉPREUVE : un seul album coché, pas de liste à ordonner', { timeout: DELAI_MONTAGE }, async () => {
    const el = await ouvrir();
    caseDe(el, 'Immersion Box Set').click(); flushSync();
    expect(el.querySelector('[data-ordre-coffret]')).toBeNull();
  });

  it('🔴 la liste suit l’ordre coché, se réordonne au clavier, et le rang des cases suit', { timeout: DELAI_MONTAGE }, async () => {
    const el = await ouvrir();
    caseDe(el, 'Immersion Box Set').click(); flushSync();
    caseDe(el, 'Immersion Stereo').click(); flushSync();
    caseDe(el, 'Immersion Quadraphonic').click(); flushSync();
    expect(ordreAffiche(el)).toEqual(['Immersion Box Set', 'Immersion Stereo', 'Immersion Quadraphonic']);
    // Stereo monte en tête : sans décocher.
    const stereo = el.querySelector('[data-ordre-coffret] li[data-cle="22"]')!;
    stereo.querySelector<HTMLButtonElement>('[data-sens="haut"]')!.click(); flushSync();
    expect(ordreAffiche(el)).toEqual(['Immersion Stereo', 'Immersion Box Set', 'Immersion Quadraphonic']);
    // Les disques suivent : Stereo 1, le coffret de 3 CD 2 à 4, Quadra 5.
    const disques = [...el.querySelectorAll('[data-ordre-coffret] .cfordre-disques')].map((x) => x.textContent);
    expect(disques).toEqual(['Disque 1', 'Disques 2 à 4', 'Disque 5']);
    // Le rang affiché sur la case cochée suit aussi.
    const rangBox = [...el.querySelectorAll('label.cprow')]
      .find((l) => l.querySelector('.pt')?.textContent?.trim() === 'Immersion Box Set')!
      .querySelector('.cfrang')?.textContent;
    expect(rangBox).toBe('Disques 2 à 4');
    // Le focus reste sur le bouton de l'album déplacé.
    await attendre(0); flushSync();
    expect((document.activeElement as HTMLElement | null)?.closest('li')?.getAttribute('data-cle')).toBe('22');
  });

  it('🔴 c’est l’ordre RÉORDONNÉ qui part au serveur', { timeout: DELAI_MONTAGE }, async () => {
    const el = await ouvrir();
    caseDe(el, 'Immersion Box Set').click(); flushSync();
    caseDe(el, 'Immersion Stereo').click(); flushSync();
    caseDe(el, 'Immersion Quadraphonic').click(); flushSync();
    // Le coffret de 3 CD descend en dernier.
    const box = () => el.querySelector('[data-ordre-coffret] li[data-cle="21"]')!;
    box().querySelector<HTMLButtonElement>('[data-sens="bas"]')!.click(); flushSync();
    box().querySelector<HTMLButtonElement>('[data-sens="bas"]')!.click(); flushSync();
    const bouton = [...el.querySelectorAll('button')]
      .find((b) => /coffret/i.test(b.textContent ?? '') && !b.closest('nav')) as HTMLButtonElement;
    bouton.click(); flushSync();
    bouton.click(); flushSync();
    await attendre();
    const envoi = envois.find((e) => /\/albums\/coffret$/.test(e.url));
    expect(envoi, 'aucun appel à la composition').toBeDefined();
    expect(envoi!.corps.album_ids).toEqual([22, 23, 21]);
  });
});

describe('le contrat et les quinze langues', () => {
  const api = readFileSync('src/lib/api.ts', 'utf8');
  it('les deux routes', () => {
    expect(api).toContain('export function getOrdreCoffret(id: number)');
    expect(api).toContain('export function reordonnerCoffret(id: number, membres: number[])');
    expect(api).toContain('`${BASE}/library/coffrets/${id}/ordre`');
    expect(api).toContain("method: 'PUT'");
  });
  it('les clés existent dans les QUINZE langues', () => {
    const cles = ['v2.box.orderList', 'v2.box.orderHint', 'v2.box.moveUp', 'v2.box.moveDown', 'v2.box.drag',
      'v2.box.moved', 'v2.album.boxReorder', 'v2.album.boxReorderTip', 'v2.album.boxReorderSave',
      'v2.album.boxReorderDone', 'v2.album.boxReorderError', 'v2.album.boxReorderUnavailable'];
    for (const l of ['fr', 'en', 'de', 'es', 'it', 'ja', 'ko', 'zh', 'ro', 'sv', 'hu', 'vi', 'el', 'nb', 'pl']) {
      const s = readFileSync(`src/lib/locales/${l}.ts`, 'utf8');
      for (const c of cles) expect(s, `${l} : ${c}`).toContain(`"${c}"`);
    }
    for (const c of ['v2.box.moveUp', 'v2.box.moveDown', 'v2.box.moved', 'v2.box.drag']) expect(FR[c]).toContain('{x}');
  });
});
