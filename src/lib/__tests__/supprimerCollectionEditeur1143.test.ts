// @vitest-environment jsdom
//
// « Menu collection : pas de suppression possible » — tune-web-client#1143.
//
// FabienM, fil 1778 (« v0.9.148 : v1 divers bugs »), point 5, mot pour mot :
//
//   « 5 - Menu collection: pas de suppression possible. Je ne vois pas de
//     boutons dédié »
//
// Sa capture jointe ne montre PAS la vignette : elle montre l'écran
// « Intelligente / Modifier la collection », règle « Artiste contient
// depeche », « 14 albums correspondent », et en pied `Annuler` / `Enregistrer`.
// Il a cherché la commande DANS L'ÉDITEUR — deux fois, sur deux versions —
// avant de regarder la vignette.
//
// La suppression par la vignette existe depuis `5109017d` (#983) et n'était
// gardée que par un témoin de TEXTE (`supprimerCollectionV2_983.test.ts`,
// `expect(corps).toContain('api.deleteSmartCollection(e.id)')`) : une telle
// garde reste verte si le bouton perd son gestionnaire, si l'entrée de menu
// disparaît, ou si la confirmation cesse d'être respectée. Ce témoin-ci MONTE
// l'écran et CLIQUE.
//
// ## Les deux espaces d'identifiants
//
// 🔴 Les ids des deux sortes se RECOUVRENT : l'id 1 est à la fois la
// collection manuelle « favorites » et l'intelligente « Audiophile » sur le
// serveur de Bertrand. Les deux collections de ce témoin portent donc TOUTES
// LES DEUX l'id 1, exprès : un correctif qui appellerait la mauvaise route
// supprimerait l'autre collection sans que rien ne le signale. On n'observe
// pas une fonction mockée, on observe l'URL réellement demandée —
// `DELETE /library/collections/1` et `DELETE /library/smart-collections/1`
// sont deux routes distinctes pour deux objets distincts.
//
// ## Le refus compte autant que l'acceptation
//
// Une suppression qui part quand on répond « Annuler » est pire que pas de
// bouton du tout : chaque geste est donc éprouvé dans les deux sens.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import { get } from 'svelte/store';
import CollectionsV2 from '../../components/v2/CollectionsV2.svelte';
import { BASE } from '../api';
import { dialogs } from '../stores/dialogs';
import lFr from '../locales/fr';

const fr = lFr as unknown as Record<string, string>;

/** Chaque requête sortie du client : méthode + chemin, dans l'ordre. */
let requetes: { methode: string; chemin: string }[] = [];

const MANUELLE = {
  id: 1,
  name: 'Favoris de Fabien',
  description: null,
  album_ids: [10, 11],
  covers: ['a.jpg'],
  created_at: '2026-09-01T10:00:00Z',
};
const SMART = {
  id: 1, // 🔴 le MÊME id que la manuelle : c'est tout l'enjeu.
  name: 'test',
  description: null,
  album_count: 14,
  covers: ['b.jpg'],
  created_at: '2026-09-02T10:00:00Z',
  match_mode: 'all',
  rules: [{ field: 'artist', operator: 'contains', value: 'depeche' }],
};

function corps(chemin: string, methode: string): unknown {
  if (methode === 'DELETE') return { ok: true };
  // 🔴 L'ordre compte : « /library/smart-collections » contient
  // « collections ». Le plus spécifique d'abord.
  if (chemin.includes('/smart-collections/preview')) return { total: 14, albums: [] };
  if (/\/smart-collections\/\d+\/albums$/.test(chemin)) return [];
  if (/\/smart-collections\/\d+$/.test(chemin)) return SMART;
  if (chemin.endsWith('/smart-collections')) return [SMART];
  if (/\/collections\/\d+\/albums$/.test(chemin)) return { albums: [] };
  if (chemin.endsWith('/collections')) return [MANUELLE];
  return [];
}

class ResizeObserverInerte {
  observe() {}
  unobserve() {}
  disconnect() {}
}

let hote: HTMLDivElement | null = null;
let monte: Record<string, any> | null = null;

beforeEach(() => {
  requetes = [];
  vi.stubGlobal('ResizeObserver', ResizeObserverInerte);
  vi.stubGlobal('IntersectionObserver', ResizeObserverInerte);
  vi.stubGlobal('WebSocket', class { close() {} addEventListener() {} removeEventListener() {} send() {} } as any);
  vi.stubGlobal('fetch', vi.fn(async (url: any, init?: any) => {
    const brut = String(typeof url === 'string' ? url : url?.url ?? '');
    const chemin = brut.replace(/^https?:\/\/[^/]+/, '').split('?')[0];
    const methode = String(init?.method ?? 'GET').toUpperCase();
    requetes.push({ methode, chemin });
    const c = corps(chemin, methode);
    return {
      ok: true, status: 200, statusText: 'OK',
      headers: new Map([['content-type', 'application/json']]),
      json: async () => c,
      text: async () => JSON.stringify(c),
    } as unknown as Response;
  }));
});

afterEach(() => {
  // Une confirmation laissée en file serait répondue par le cas suivant.
  for (const r of get(dialogs)) dialogs.settle(r.id, false);
  if (monte) unmount(monte);
  monte = null;
  if (hote) hote.remove();
  hote = null;
  // La modale de renommage se pose par PORTAIL, à la racine du document : elle
  // ne part pas avec l'hôte.
  for (const n of Array.from(document.querySelectorAll('.fond'))) n.remove();
  vi.unstubAllGlobals();
});

async function attendre(tours = 6) {
  for (let i = 0; i < tours; i++) {
    await new Promise((r) => setTimeout(r, 0));
    flushSync();
  }
}

/** Les éditeurs sont en IMPORT DYNAMIQUE : ils n'apparaissent pas au tour
 *  suivant le clic, mais une dizaine de tours plus tard. On attend la
 *  condition au lieu de parier sur un nombre de tours.
 *
 *  🔴 Le budget est LARGE — 6 s. Une première version à 400 ms passait à vide
 *  et rougissait sur une machine chargée : la suite complète, lancée pendant
 *  une compilation, a mis 291 s au lieu de 40 s, et l'import dynamique n'avait
 *  pas rendu la main. Un témoin qui dépend de la charge ne prouve rien. */
async function attendreQue(condition: () => boolean, tours = 600): Promise<boolean> {
  for (let i = 0; i < tours; i++) {
    if (condition()) return true;
    await new Promise((r) => setTimeout(r, 10));
    flushSync();
  }
  return condition();
}

async function poser(): Promise<HTMLDivElement> {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(CollectionsV2, { target: hote, props: {} as any });
  flushSync();
  await attendre();
  return hote;
}

/** Les suppressions réellement PARTIES, dans l'ordre. */
function suppressions(): string[] {
  return requetes.filter((r) => r.methode === 'DELETE').map((r) => r.chemin);
}

/** Répond à la confirmation en tête de file — la DERNIÈRE ouverte. */
function repondre(reponse: boolean) {
  const file = get(dialogs);
  expect(file.length, 'aucune confirmation n’a été demandée').toBeGreaterThan(0);
  dialogs.settle(file[file.length - 1].id, reponse);
}

function boutons(racine: ParentNode): HTMLButtonElement[] {
  return Array.from(racine.querySelectorAll('button'));
}

function parLibelle(racine: ParentNode, libelle: string): HTMLButtonElement | undefined {
  return boutons(racine).find((b) => (b.textContent ?? '').trim() === libelle);
}

function parAria(racine: ParentNode, aria: string): HTMLButtonElement | undefined {
  return boutons(racine).find((b) => b.getAttribute('aria-label') === aria);
}

/** Bascule l'écran sur l'onglet demandé — il ouvre sur « Intelligentes ». */
function ongletManuel(h: HTMLElement) {
  const ong = parLibelle(h, fr['v2.col.tabManual']);
  expect(ong, `onglet « ${fr['v2.col.tabManual']} » introuvable`).toBeDefined();
  ong!.click();
  flushSync();
}

/** La vignette de la collection nommée, quel que soit l'onglet. */
function carte(h: HTMLElement, nom: string): HTMLElement {
  const c = Array.from(h.querySelectorAll<HTMLElement>('.card'))
    .find((e) => (e.textContent ?? '').includes(nom));
  expect(c, `vignette « ${nom} » absente de l’écran`).toBeTruthy();
  return c!;
}

describe('#1143 — supprimer une collection, là où Fabien l’a cherché', () => {
  it('la vignette : le menu d’actions porte « Supprimer » et appelle la route SMART', async () => {
    const h = await poser();
    const c = carte(h, 'test');
    const menu = parAria(c, fr['v2.cover.more']);
    expect(menu, 'le bouton de menu est inerte : aucune action sur la vignette').toBeDefined();
    menu!.click();
    flushSync();
    const suppr = Array.from(c.querySelectorAll<HTMLButtonElement>('button[role="menuitem"]'))
      .find((b) => (b.textContent ?? '').trim() === fr['common.delete']);
    expect(suppr, 'pas d’entrée « Supprimer » dans le menu de la vignette').toBeDefined();
    suppr!.click();
    await attendre(2);
    repondre(true);
    await attendreQue(() => suppressions().length > 0);
    expect(suppressions()).toEqual([`${BASE}/library/smart-collections/1`]);
  });

  it('la vignette : ANNULER la confirmation ne supprime rien', async () => {
    const h = await poser();
    const c = carte(h, 'test');
    parAria(c, fr['v2.cover.more'])!.click();
    flushSync();
    Array.from(c.querySelectorAll<HTMLButtonElement>('button[role="menuitem"]'))
      .find((b) => (b.textContent ?? '').trim() === fr['common.delete'])!.click();
    await attendre(2);
    repondre(false);
    await attendre();
    expect(suppressions(), 'une suppression est partie malgré le refus').toEqual([]);
    expect(h.textContent).toContain('test');
  });

  it('🔴 l’ÉDITEUR d’une intelligente porte « Supprimer » — c’est là que Fabien a regardé', { timeout: 30000 }, async () => {
    const h = await poser();
    parAria(carte(h, 'test'), fr['v2.cover.edit'])!.click();
    await attendreQue(() => !!h.querySelector('.v2-smart .pied'));
    const pied = h.querySelector('.v2-smart .pied');
    expect(pied, 'l’éditeur de collection intelligente ne s’est pas ouvert').toBeTruthy();
    // La capture de FabienM montre ce pied avec DEUX boutons : Annuler,
    // Enregistrer. Il en faut un troisième.
    const suppr = parLibelle(pied!, fr['common.delete']);
    expect(
      suppr,
      `pied de l’éditeur sans « ${fr['common.delete']} » — boutons présents : ` +
        boutons(pied!).map((b) => (b.textContent ?? '').trim()).join(' | '),
    ).toBeDefined();
    suppr!.click();
    await attendre(2);
    repondre(true);
    await attendreQue(() => suppressions().length > 0);
    expect(suppressions()).toEqual([`${BASE}/library/smart-collections/1`]);
  });

  it('🔴 l’éditeur d’une intelligente : ANNULER ne supprime rien', { timeout: 30000 }, async () => {
    const h = await poser();
    parAria(carte(h, 'test'), fr['v2.cover.edit'])!.click();
    await attendreQue(() => !!h.querySelector('.v2-smart .pied'));
    const pied = h.querySelector('.v2-smart .pied');
    expect(pied, 'l’éditeur ne s’est pas ouvert').toBeTruthy();
    parLibelle(pied!, fr['common.delete'])!.click();
    await attendre(2);
    repondre(false);
    await attendre();
    expect(suppressions(), 'une suppression est partie malgré le refus').toEqual([]);
    expect(h.querySelector('.v2-smart'), 'l’éditeur s’est fermé sur un refus').toBeTruthy();
  });

  it('🔴 l’éditeur d’une MANUELLE porte « Supprimer » et appelle l’AUTRE route, au même id', { timeout: 30000 }, async () => {
    const h = await poser();
    ongletManuel(h);
    parAria(carte(h, 'Favoris de Fabien'), fr['v2.cover.edit'])!.click();
    await attendreQue(() => !!document.querySelector('.fond .panneau'));
    // `RenommerModale` se pose par portail : elle vit à la racine du document.
    const modale = document.querySelector('.fond .panneau');
    expect(modale, 'la modale de modification ne s’est pas ouverte').toBeTruthy();
    const suppr = parLibelle(modale!, fr['common.delete']);
    expect(
      suppr,
      `modale sans « ${fr['common.delete']} » — boutons présents : ` +
        boutons(modale!).map((b) => (b.textContent ?? '').trim()).join(' | '),
    ).toBeDefined();
    suppr!.click();
    await attendre(2);
    repondre(true);
    await attendre();
    // 🔴 L'id 1 vise ICI la collection MANUELLE. La route intelligente, au même
    // id, aurait effacé « test » sans rien dire.
    expect(suppressions()).toEqual([`${BASE}/library/collections/1`]);
  });

  it('🔴 l’éditeur d’une manuelle : ANNULER ne supprime rien', { timeout: 30000 }, async () => {
    const h = await poser();
    ongletManuel(h);
    parAria(carte(h, 'Favoris de Fabien'), fr['v2.cover.edit'])!.click();
    await attendreQue(() => !!document.querySelector('.fond .panneau'));
    const modale = document.querySelector('.fond .panneau');
    expect(modale, 'la modale ne s’est pas ouverte').toBeTruthy();
    parLibelle(modale!, fr['common.delete'])!.click();
    await attendre(2);
    repondre(false);
    await attendre();
    expect(suppressions(), 'une suppression est partie malgré le refus').toEqual([]);
    expect(document.querySelector('.fond .panneau'), 'la modale s’est fermée sur un refus').toBeTruthy();
  });
});
