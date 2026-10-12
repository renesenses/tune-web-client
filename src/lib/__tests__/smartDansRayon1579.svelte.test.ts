// @vitest-environment jsdom
/**
 * web#1579 — créer une collection intelligente DIRECTEMENT dans un rayon
 * (Didier / Gros Bidon, fil 1907, réponse 6773) : « Ne serait-il pas possible
 * de créer l'équivalent d'une Smart Collection directement dans la zone Rayon ?
 * Cela éviterait d'encombrer la page Smart Collection. » Go de Bertrand, 12/10.
 *
 * Trois maillons, tous exercés pour de vrai :
 *  1. le menu « ⋯ » d'un rayon porte « Nouvelle collection intelligente ici »,
 *     et le geste désigne CE rayon ;
 *  2. l'éditeur rend à l'appelant la collection CRÉÉE (son id) — sans quoi rien
 *     ne peut la ranger ;
 *  3. la collection créée est rangée dans le rayon par la route existante
 *     `POST /library/collection-folders/items/smart/{id}` ;
 * plus le filtre « Hors rayon seulement » de l'onglet Smart (ne pas encombrer).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mount, unmount, flushSync, tick } from 'svelte';

vi.mock('../api', async (orig) => {
  const vrai = await orig<typeof import('../api')>();
  return {
    ...vrai,
    placeCollectionInFolder: vi.fn(async () => ({})),
    moveCollectionFolder: vi.fn(async () => ({})),
    createSmartCollection: vi.fn(async () => ({ id: 42, name: 'Pink Floyd' })),
    previewSmartCollection: vi.fn(async () => ({ total: 3 })),
    getTags: vi.fn(async () => []),
    getCollections: vi.fn(async () => []),
    listSmartCollections: vi.fn(async () => []),
    getPlaylists: vi.fn(async () => []),
    getSmartPlaylists: vi.fn(async () => []),
  };
});

import * as api from '../api';
import type { ArbreCollections } from '../api';
import ArbreRayons from '../../components/v2/ArbreRayons.svelte';
import CollectionSmartEditeurV2 from '../../components/v2/CollectionSmartEditeurV2.svelte';
import { clesRangees, rangerLaNouvelle } from '../rayonsCollections';
import { locale } from '../i18n';

const arbre: ArbreCollections = {
  max_depth: 3,
  folders: [
    {
      id: 1, name: 'Rock', parent_id: null, position: 0, depth: 1,
      folders: [{
        id: 2, name: 'Progressive', parent_id: 1, position: 0, depth: 2, folders: [],
        collections: [{ kind: 'smart', id: 7, name: 'Pink Floyd', description: null, icon: null, color: null, folder_id: 2, position: 0 }],
      }],
      collections: [{ kind: 'collection', id: 7, name: 'Mes vinyles', description: null, icon: null, color: null, folder_id: 1, position: 0 }],
    },
    { id: 3, name: 'Jazz', parent_id: null, position: 1, depth: 1, folders: [], collections: [] },
  ],
  collections: [{ kind: 'smart', id: 9, name: 'Récents', description: null, icon: null, color: null, folder_id: null, position: null }],
};

let hote: HTMLElement;
let composant: Record<string, any> | null = null;

beforeEach(() => {
  locale.set('fr');
  try { localStorage.clear(); } catch { /* */ }
  hote = document.createElement('div');
  document.body.appendChild(hote);
  vi.mocked(api.placeCollectionInFolder).mockClear();
  vi.mocked(api.createSmartCollection).mockClear();
});
afterEach(() => {
  if (composant) unmount(composant);
  composant = null;
  hote.remove();
});

function ouvrirMenuDuRayon(id: number) {
  const geste = hote.querySelector(`[data-rayon="${id}"] > .tete .geste`) as HTMLButtonElement;
  expect(geste, `pas de menu sur le rayon ${id}`).not.toBeNull();
  geste.click();
  flushSync();
  return hote.querySelector(`[data-rayon="${id}"] > .menu`) as HTMLElement;
}

describe('1 — le menu d’un rayon propose de créer une intelligente ICI', () => {
  it('l’entrée existe et désigne le rayon cliqué (Jazz, pas Rock)', () => {
    const demandes: number[] = [];
    composant = mount(ArbreRayons, {
      target: hote,
      props: { arbre, onOuvrir: () => {}, onChange: () => {}, onNouvelleSmart: (f: { id: number }) => demandes.push(f.id) },
    });
    flushSync();
    const menu = ouvrirMenuDuRayon(3);
    const entree = [...menu.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Nouvelle collection intelligente ici');
    expect(entree, 'aucune entrée « Nouvelle collection intelligente ici »').toBeTruthy();
    entree!.click();
    flushSync();
    expect(demandes).toEqual([3]);
    // Le menu se referme : l'éditeur prend la main.
    expect(hote.querySelector('[data-rayon="3"] > .menu')).toBeNull();
  });

  it('elle vaut aussi pour un SOUS-rayon (Progressive, dans Rock)', () => {
    const demandes: number[] = [];
    composant = mount(ArbreRayons, {
      target: hote,
      props: { arbre, onOuvrir: () => {}, onNouvelleSmart: (f: { id: number }) => demandes.push(f.id) },
    });
    flushSync();
    const menu = ouvrirMenuDuRayon(2);
    [...menu.querySelectorAll('button')].find((b) => b.classList.contains('creer-smart'))!.click();
    expect(demandes).toEqual([2]);
  });

  it('en anglais, le libellé est traduit', () => {
    locale.set('en');
    composant = mount(ArbreRayons, {
      target: hote,
      props: { arbre, onOuvrir: () => {}, onNouvelleSmart: () => {} },
    });
    flushSync();
    const menu = ouvrirMenuDuRayon(3);
    expect(menu.textContent).toContain('New smart collection here');
  });

  it('sans rappel (barre latérale, en lecture), l’entrée n’est pas proposée', () => {
    composant = mount(ArbreRayons, { target: hote, props: { arbre, onOuvrir: () => {} } });
    flushSync();
    const menu = ouvrirMenuDuRayon(3);
    expect(menu.querySelector('.creer-smart')).toBeNull();
  });
});

describe('2 — l’éditeur rend la collection CRÉÉE à l’appelant', () => {
  it('onSaved reçoit l’id renvoyé par le serveur', async () => {
    const recus: unknown[] = [];
    composant = mount(CollectionSmartEditeurV2, {
      target: hote,
      props: { id: null, onClose: () => {}, onSaved: (c?: unknown) => recus.push(c) },
    });
    flushSync();
    await tick();
    const nom = hote.querySelector('.champ input.txt') as HTMLInputElement;
    const valeur = hote.querySelector('.regle input.txt') as HTMLInputElement;
    expect(nom && valeur, 'champ du nom ou de la règle introuvable').toBeTruthy();
    nom.value = 'Pink Floyd';
    nom.dispatchEvent(new Event('input', { bubbles: true }));
    valeur.value = 'Pink Floyd';
    valeur.dispatchEvent(new Event('input', { bubbles: true }));
    flushSync();
    const enregistrer = hote.querySelector('button.play') as HTMLButtonElement;
    expect(enregistrer.disabled).toBe(false);
    enregistrer.click();
    for (let i = 0; i < 5; i++) await tick();
    expect(api.createSmartCollection).toHaveBeenCalledTimes(1);
    expect(recus).toHaveLength(1);
    expect((recus[0] as { id?: number })?.id).toBe(42);
  });
});

describe('3 — la collection créée est rangée dans le rayon', () => {
  it('depuis un rayon : POST smart/42 vers le rayon 3', async () => {
    const placer = vi.fn(async () => ({}));
    expect(await rangerLaNouvelle(3, { id: 42 }, placer)).toBe(true);
    expect(placer).toHaveBeenCalledWith('smart', 42, 3);
  });

  it('depuis l’onglet Smart (pas de rayon) : rien ne part', async () => {
    const placer = vi.fn(async () => ({}));
    expect(await rangerLaNouvelle(null, { id: 42 }, placer)).toBe(false);
    expect(placer).not.toHaveBeenCalled();
  });

  it('sans id rendu par le serveur : rien ne part, aucune supposition', async () => {
    const placer = vi.fn(async () => ({}));
    expect(await rangerLaNouvelle(3, null, placer)).toBe(false);
    expect(await rangerLaNouvelle(3, { id: '42' }, placer)).toBe(false);
    expect(placer).not.toHaveBeenCalled();
  });
});

describe('4 — « Hors rayon seulement » : ne pas encombrer l’onglet Smart', () => {
  it('les rangées sont repérées à toute profondeur, par la PAIRE (sorte, id)', () => {
    const s = clesRangees(arbre);
    expect(s.has('smart:7')).toBe(true);        // Rock › Progressive › Pink Floyd
    expect(s.has('collection:7')).toBe(true);   // même id, autre sorte
    expect(s.has('smart:9')).toBe(false);       // hors rayon
  });
});
