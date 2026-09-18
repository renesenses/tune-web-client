// @vitest-environment jsdom
//
// #1145 — « OÙ » ET « AFFICHER » N'OBÉISSENT PAS À LA MÊME RÈGLE.
//
// FabienM, fil 1774, point 7 (v0.9.147) :
//
//   « Menu Recherche, après recherche d'un phrase, le clic sur la ligne "où" et
//     "afficher" n'a pas le même comportement. Si on clique sur un critère de
//     "Afficher" ça sélectionne/déselectionne le critère. En revanche si on
//     clique sur un critère de "Où" ça sélectionne/déselectionne tous les autres
//     critères sauf celui sélectionné. »
//
// ## Ce n'est pas un défaut d'affichage : ce sont DEUX MODÈLES
//
// « OÙ » est un ENSEMBLE où vide vaut tout : vide au départ, les quatre
// pastilles s'allument (`sourcesActives.size === 0 || …`), et le premier clic en
// éteint trois d'un coup. « AFFICHER » est, depuis le point 8 d'Yves Corbat
// (17/09/2026), un CHOIX UNIQUE : une pastille à la fois, « Tout » au départ, un
// clic pour ne garder que les albums.
//
// Les deux ne peuvent pas se comporter pareil sans qu'on TRANCHE. La règle
// retenue — une pastille « Tout » explicite, puis un cumul, la même des deux
// côtés — vit dans `lib/perimetreRecherche.ts`, et ce témoin la mesure À
// L'ÉCRAN, sur les DEUX rangées, par la même boucle.
//
// ⚠️ Aucun délai calibré : attentes BORNÉES sur condition.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import SearchV2 from '../../components/v2/SearchV2.svelte';
import { setSearchCriteria } from '../stores/shortcuts';
import { preferences } from '../stores/preferences';
import {
  basculerPastille, dansLePerimetreDe, pastilleAllumee, sansRestriction,
} from '../perimetreRecherche';

vi.setConfig({ testTimeout: 30_000 });

const REQUETE = 'Wish You Were Here';
const vide = { artists: [], albums: [], tracks: [], playlists: [], labels: [] };

const LOCAL = {
  ...vide,
  artists: [{ id: 42, name: 'Pink Floyd', image_path: null }],
  albums: [{ id: 60, title: 'Wish You Were Here', artist_name: 'Pink Floyd', year: 1975 }],
  tracks: [{ id: 7, title: 'Wish You Were Here', artist_name: 'Pink Floyd', album_id: 60 }],
};
const SERVICES = {
  qobuz: {
    ...vide,
    artists: [{ id: null, source: 'qobuz', source_id: 'q-a', name: 'Pink Floyd Tribute', image_path: null }],
    albums: [{ id: null, source: 'qobuz', source_id: 'q-1', title: 'Wish You Were Here (Remaster)', artist_name: 'Pink Floyd', year: 2011 }],
    tracks: [{ id: null, source: 'qobuz', source_id: 'q-t', title: 'Wish You Were Here (Live)', artist_name: 'Pink Floyd' }],
  },
};

class ResizeObserverInerte {
  observe() {} unobserve() {} disconnect() {}
}

const reponse = (corps: unknown) => ({
  ok: true, status: 200, statusText: 'OK',
  headers: new Map([['content-type', 'application/json']]),
  json: async () => corps,
  text: async () => JSON.stringify(corps),
} as unknown as Response);

const respirer = () => new Promise((r) => setTimeout(r, 0));

async function jusqua(condition: () => boolean, borne = 5000): Promise<void> {
  const fin = Date.now() + borne;
  for (;;) {
    flushSync();
    if (condition()) return;
    if (Date.now() >= fin) return;
    await respirer();
  }
}

let hote: HTMLDivElement | null = null;
let monte: Record<string, unknown> | null = null;

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', ResizeObserverInerte);
  try { localStorage.clear(); } catch { /* jsdom sans stockage */ }
  vi.stubGlobal('fetch', vi.fn(async (url: any) => {
    const u = String(url);
    if (/\/library\/search/.test(u)) return reponse(LOCAL);
    if (/\/search\?/.test(u)) return reponse({ local: LOCAL, services: SERVICES, radios: [] });
    return reponse([]);
  }));
  vi.stubGlobal('WebSocket', class {
    close() {} addEventListener() {} removeEventListener() {} send() {}
  } as unknown as typeof WebSocket);
  preferences.update((p) => ({ ...p, settingsLevel: 'expert' }));
});

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  if (hote) hote.remove();
  hote = null;
  setSearchCriteria(null);
  vi.unstubAllGlobals();
});

async function chercher(): Promise<HTMLDivElement> {
  setSearchCriteria({ q: REQUETE });
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(SearchV2, { target: hote, props: {} as any });
  await jusqua(() => rangee(hote!, 'ou') !== null && rangee(hote!, 'afficher') !== null);
  return hote;
}

/** Une rangée de pastilles, désignée par son rôle et non par son rang. */
const rangee = (el: HTMLElement, quoi: 'ou' | 'afficher') =>
  el.querySelector<HTMLElement>(`.pills[data-rangee="${quoi}"]`);

/** Toutes les pastilles d'une rangée, « Tout » compris. */
const pastilles = (r: HTMLElement) => [...r.querySelectorAll<HTMLButtonElement>('button.pill')];
/** Celles qui sont ALLUMÉES. */
const allumees = (r: HTMLElement) => pastilles(r).filter((p) => p.classList.contains('on'));
/** La pastille « Tout » / « Toutes les sources » de la rangée. */
const pastilleTout = (r: HTMLElement) => r.querySelector<HTMLButtonElement>('button.pill[data-pastille="tout"]');
/** Les pastilles de critère, sans celle de « Tout ». */
const criteres = (r: HTMLElement) => pastilles(r).filter((p) => p.dataset.pastille !== 'tout');
/**
 * Le libellé peint sur une pastille, compteur exclu.
 *
 * Il tolère l'ABSENCE : sans cela, la rangée « OÙ » — qui n'a pas de pastille
 * « Toutes les sources » au repos — ferait rougir le témoin sur un `TypeError`
 * au lieu de dire ce qui manque.
 */
const libelle = (p: HTMLElement | null | undefined) =>
  p ? (p.childNodes[0]?.textContent ?? '').trim() : '(pastille « Tout » absente)';

const RANGEES: ('ou' | 'afficher')[] = ['ou', 'afficher'];

async function cliquer(p: HTMLButtonElement): Promise<void> {
  p.click();
  flushSync();
  await respirer();
  flushSync();
}

describe('#1145 — la règle des pastilles, hors de l’écran', () => {
  it('vide vaut TOUT pour le filtre, et AUCUNE pastille allumée pour l’œil', () => {
    const rien = new Set<string>();
    expect(sansRestriction(rien)).toBe(true);
    // Le FILTRE ne change pas : vide laisse tout passer.
    expect(dansLePerimetreDe(rien, 'qobuz')).toBe(true);
    // L'AFFICHAGE change : c'est là que vivait le défaut.
    expect(pastilleAllumee(rien, 'qobuz')).toBe(false);
  });

  it('un clic restreint, un second AJOUTE, un troisième retire', () => {
    let s = basculerPastille(new Set<string>(), 'qobuz');
    expect([...s]).toEqual(['qobuz']);
    expect(dansLePerimetreDe(s, 'local')).toBe(false);
    s = basculerPastille(s, 'local');
    expect([...s].sort()).toEqual(['local', 'qobuz']);
    expect(dansLePerimetreDe(s, 'local')).toBe(true);
    s = basculerPastille(s, 'qobuz');
    expect([...s]).toEqual(['local']);
    s = basculerPastille(s, 'local');
    expect(sansRestriction(s)).toBe(true);
  });

  it('elle rend un ensemble NEUF — muter celui qu’on lit ne redéclencherait rien', () => {
    const avant = new Set(['qobuz']);
    const apres = basculerPastille(avant, 'local');
    expect(apres).not.toBe(avant);
    expect([...avant]).toEqual(['qobuz']);
  });
});

describe('#1145 — LES DEUX RANGÉES, la même règle, mesurée à l’écran', () => {
  it('le décor : les deux rangées sont là, et chacune a sa pastille « Tout »', async () => {
    const el = await chercher();
    for (const quoi of RANGEES) {
      const r = rangee(el, quoi);
      expect(r, `la rangée « ${quoi} » est absente : le témoin ne mesure rien`).not.toBeNull();
      expect(pastilleTout(r!), `la rangée « ${quoi} » n’a pas de pastille « Tout »`).not.toBeNull();
      expect(criteres(r!).length, `la rangée « ${quoi} » n’a pas de critère à cliquer`).toBeGreaterThanOrEqual(2);
    }
  });

  it('🔴 AU DÉPART : une seule pastille allumée par rangée, et c’est « Tout »', async () => {
    const el = await chercher();
    for (const quoi of RANGEES) {
      const r = rangee(el, quoi)!;
      expect(
        allumees(r).map(libelle),
        `rangée « ${quoi} » : au départ, les pastilles de critère s’allument toutes — ` +
          'c’est ce qui fait croire, au premier clic, que les autres se sont éteintes',
      ).toEqual([libelle(pastilleTout(r)!)]);
    }
  });

  it('🔴 UN CLIC RESTREINT — et n’éteint rien d’autre que « Tout »', async () => {
    const el = await chercher();
    for (const quoi of RANGEES) {
      const r = rangee(el, quoi)!;
      const cible = criteres(r)[0];
      await cliquer(cible);

      expect(
        allumees(rangee(el, quoi)!).map(libelle),
        `rangée « ${quoi} » : un clic doit laisser la SEULE pastille cliquée allumée`,
      ).toEqual([libelle(cible)]);
      expect(
        pastilleTout(rangee(el, quoi)!)!.classList.contains('on'),
        `rangée « ${quoi} » : « Tout » reste allumé alors qu’on a restreint`,
      ).toBe(false);
    }
  });

  it('🔴 UN SECOND CLIC AJOUTE — le cumul vaut dans les DEUX rangées', async () => {
    const el = await chercher();
    for (const quoi of RANGEES) {
      const r = rangee(el, quoi)!;
      const [un, deux] = criteres(r);
      await cliquer(un);
      await cliquer(criteres(rangee(el, quoi)!)[1]);

      expect(
        allumees(rangee(el, quoi)!).map(libelle).sort(),
        `rangée « ${quoi} » : le second clic remplace au lieu d’ajouter`,
      ).toEqual([libelle(un), libelle(deux)].sort());
    }
  });

  it('🔴 RE-CLIQUER retire, et retirer la DERNIÈRE rallume « Tout »', async () => {
    const el = await chercher();
    for (const quoi of RANGEES) {
      const r = rangee(el, quoi)!;
      const cible = criteres(r)[0];
      await cliquer(cible);
      await cliquer(criteres(rangee(el, quoi)!)[0]);

      const apres = rangee(el, quoi)!;
      expect(
        allumees(apres).map(libelle),
        `rangée « ${quoi} » : décocher la dernière pastille laisse un périmètre vide sans le dire`,
      ).toEqual([libelle(pastilleTout(apres)!)]);
    }
  });

  it('🔴 « Tout » relâche la restriction, d’un seul clic', async () => {
    const el = await chercher();
    for (const quoi of RANGEES) {
      await cliquer(criteres(rangee(el, quoi)!)[0]);
      await cliquer(pastilleTout(rangee(el, quoi)!)!);

      const apres = rangee(el, quoi)!;
      expect(
        allumees(apres).map(libelle),
        `rangée « ${quoi} » : « Tout » ne relâche pas la restriction`,
      ).toEqual([libelle(pastilleTout(apres)!)]);
    }
  });
});

describe('#1145 — la règle AGIT sur les résultats, elle n’est pas qu’un décor', () => {
  /** La section des artistes des résultats. */
  const sectionArtistes = (el: HTMLElement) => el.querySelector('.basartistes');
  /** Les vignettes d’albums. */
  const cartes = (el: HTMLElement) => [...el.querySelectorAll('.grid .card')];

  it('🔴 « Albums » en UN clic ne garde que les albums — l’acquis du point 8 d’Yves', async () => {
    const el = await chercher();
    expect(sectionArtistes(el), 'le décor n’a pas d’artistes : le témoin ne mesure rien').not.toBeNull();

    const r = rangee(el, 'afficher')!;
    const albums = criteres(r).find((p) => /album/i.test(libelle(p)));
    expect(albums, 'aucune pastille « Albums »').toBeTruthy();
    await cliquer(albums!);

    expect(sectionArtistes(el), 'restreindre aux albums laisse la section Artistes').toBeNull();
    expect(cartes(el).length, 'restreindre aux albums a tout emporté').toBeGreaterThan(0);
  });

  it('🔴 Albums PUIS Artistes rend les deux — le cumul est réel, pas seulement peint', async () => {
    const el = await chercher();
    const r = rangee(el, 'afficher')!;
    await cliquer(criteres(r).find((p) => /album/i.test(libelle(p)))!);
    await cliquer(criteres(rangee(el, 'afficher')!).find((p) => /artiste/i.test(libelle(p)))!);

    expect(sectionArtistes(el), 'le cumul de types ne rend pas les artistes').not.toBeNull();
    expect(cartes(el).length, 'le cumul de types a perdu les albums').toBeGreaterThan(0);
  });

  it('🔴 une source en UN clic ne garde qu’elle, et deux sources rendent les deux', async () => {
    const el = await chercher();
    const toutes = cartes(el).length;
    expect(toutes, 'le décor ne mêle pas deux sources').toBeGreaterThanOrEqual(2);

    const r = rangee(el, 'ou')!;
    const qobuz = criteres(r).find((p) => /qobuz/i.test(libelle(p)));
    expect(qobuz, 'aucune pastille Qobuz').toBeTruthy();
    await cliquer(qobuz!);
    const avecQobuz = cartes(el).length;
    expect(avecQobuz, 'se restreindre à Qobuz ne retire rien').toBeLessThan(toutes);

    const local = criteres(rangee(el, 'ou')!).find((p) => !/qobuz/i.test(libelle(p)));
    await cliquer(local!);
    expect(
      cartes(el).length,
      'cocher une seconde source ne cumule pas : le filtre a remplacé au lieu d’ajouter',
    ).toBe(toutes);
  });
});
