// @vitest-environment jsdom
//
// Fil 1928 (Lulu, v0.9.164) : « Lorsqu'on ouvre un album depuis la
// Bibliothèque et que l'on active le nouveau bouton « Ajouter à une
// Collection », il manque des répertoires (7 pour moi). »
//
// La capture (fenêtre 1366 × 768) montre le panneau coupé par le HAUT de la
// fenêtre : les entrées manquantes étaient hors écran, pas hors liste —
// `GET /library/collections` rend toutes les collections manuelles, sans
// filtre ni pagination (tune-server `routes/library/collections.rs`,
// `list_collections`). Le placement est réparé par #1575 (web#1587).
//
// Reste ce que la 0.9.164 a changé autour : les RAYONS (tune-server-rust#4853).
// L'écran Collections et la barre latérale rangent les collections dans un
// arbre ; le menu, lui, les jetait à plat, sans dire où chacune vit. Ces
// témoins MONTENT la fiche, servent un arbre (rayons imbriqués, collections
// hors rayon, intelligentes rangées elles aussi) et lisent le menu :
//  - chaque collection manuelle y est, une fois, sous son rayon, indentée ;
//  - aucune intelligente (leur contenu vient de leurs règles, la route
//    d'ajout ne les connaît pas — et leurs ids sont d'un autre espace) ;
//  - une manuelle que l'arbre ignore n'est pas perdue ;
//  - un serveur sans arbre (404) garde la liste plate.
//
// Contre-épreuve (origin/main) : les deux témoins d'arborescence virent au
// rouge — aucun intitulé de rayon, aucun retrait.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';
import { mount, unmount, flushSync } from 'svelte';
import { t } from '../i18n';
import { activeView } from '../stores/navigation';
import type { Album } from '../types';
import AlbumDetailV2 from '../../components/v2/AlbumDetailV2.svelte';

class ResizeObserverInerte {
  observe() {} unobserve() {} disconnect() {}
}

const ALBUM_ID = 959;
const LOCAL = { id: ALBUM_ID, title: 'Akalé Wubé', artist_name: 'Akalé Wubé', year: 2010 } as Album;

/** `GET /library/collections` : les MANUELLES seules. « Orpheline » (n° 9)
 *  n'est pas dans l'arbre (arbre relu avant sa création, par exemple). */
const MANUELLES = [
  { id: 1, name: 'favorites', album_ids: [] },
  { id: 2, name: 'Jazz', album_ids: [] },
  { id: 3, name: 'Bach', album_ids: [] },
  { id: 4, name: 'Musique du Monde', album_ids: [ALBUM_ID] },
  { id: 5, name: 'Œuvres liturgiques', album_ids: [] },
  { id: 6, name: 'Pop / Rock', album_ids: [] },
  { id: 9, name: 'Orpheline', album_ids: [] },
];
/** `GET /library/smart-collections` : l'autre espace d'ids (1 et 2 recouvrent). */
const INTELLIGENTES = [
  { id: 1, name: 'Audiophile', rules: [] },
  { id: 2, name: 'Récents', rules: [] },
];
const rangee = (kind: 'collection' | 'smart', id: number, name: string, folder_id: number | null) =>
  ({ kind, id, name, description: null, icon: null, color: null, folder_id, position: null });
/** `GET /library/collection-folders` : Classique › Baroque › Bach, Classique ›
 *  Œuvres liturgiques ; Monde › Musique du Monde ; « Automatiques » ne porte
 *  QUE des intelligentes ; hors rayon : favorites, Jazz, Pop / Rock et une
 *  intelligente. */
const ARBRE = {
  max_depth: 3,
  folders: [
    {
      id: 10, name: 'Classique', parent_id: null, position: 0, depth: 1,
      folders: [
        { id: 11, name: 'Baroque', parent_id: 10, position: 0, depth: 2, folders: [],
          collections: [rangee('collection', 3, 'Bach', 11)] },
      ],
      collections: [rangee('collection', 5, 'Œuvres liturgiques', 10)],
    },
    { id: 12, name: 'Monde', parent_id: null, position: 1, depth: 1, folders: [],
      collections: [rangee('collection', 4, 'Musique du Monde', 12)] },
    { id: 13, name: 'Automatiques', parent_id: null, position: 2, depth: 1, folders: [],
      collections: [rangee('smart', 1, 'Audiophile', 13)] },
  ],
  collections: [
    rangee('collection', 1, 'favorites', null),
    rangee('collection', 2, 'Jazz', null),
    rangee('smart', 2, 'Récents', null),
    rangee('collection', 6, 'Pop / Rock', null),
  ],
};

const reponse = (corps: unknown, status = 200) => ({
  ok: status < 400, status, statusText: status < 400 ? 'OK' : 'Not Found',
  headers: new Map([['content-type', 'application/json']]),
  json: async () => corps,
  text: async () => JSON.stringify(corps),
} as unknown as Response);
const respirer = () => new Promise((r) => setTimeout(r, 0));
async function jusqua(condition: () => boolean, borne = 4000): Promise<void> {
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
let arbreServi = true;
let appels: { methode: string; url: string }[] = [];

beforeEach(() => {
  arbreServi = true;
  appels = [];
  vi.stubGlobal('ResizeObserver', ResizeObserverInerte);
  vi.stubGlobal('fetch', vi.fn(async (url: any, init?: RequestInit) => {
    const u = String(url);
    const methode = (init?.method ?? 'GET').toUpperCase();
    appels.push({ methode, url: u });
    if (/\/library\/collection-folders(\?|$)/.test(u)) {
      return arbreServi ? reponse(ARBRE) : reponse({ detail: 'Not Found' }, 404);
    }
    if (/\/library\/smart-collections/.test(u)) return reponse(INTELLIGENTES);
    if (/\/library\/collections\/\d+\/albums\/\d+/.test(u)) return reponse({ ok: true });
    if (/\/library\/collections(\?|$)/.test(u)) return reponse(MANUELLES);
    return reponse([]);
  }));
  vi.stubGlobal('WebSocket', class {
    close() {} addEventListener() {} removeEventListener() {} send() {}
  } as unknown as typeof WebSocket);
  activeView.set('library');
});

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  hote?.remove();
  hote = null;
  document.querySelectorAll('.coll-menu').forEach((n) => n.remove());
  vi.unstubAllGlobals();
});

function bouton(): HTMLButtonElement | null {
  const libelle = get(t)('v2.album.addToCollection');
  return hote?.querySelector<HTMLButtonElement>(`.actions button[title="${libelle}"]`) ?? null;
}
const panneau = () => document.body.querySelector<HTMLElement>('.coll-menu');
const entrees = () => Array.from(panneau()?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? []);

async function ouvrir(): Promise<HTMLElement> {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(AlbumDetailV2, { target: hote, props: { onClose: () => {}, album: LOCAL } as any });
  flushSync();
  await jusqua(() => !!bouton());
  expect(bouton(), 'pas de bouton « Ajouter à une collection »').not.toBeNull();
  bouton()!.click();
  await jusqua(() => entrees().length > 0);
  const p = panneau();
  expect(p, 'le menu ne s’est pas ouvert').not.toBeNull();
  return p!;
}

/** Le menu lu de haut en bas : « # nom » pour un intitulé de rayon, le nom de
 *  la collection sinon — préfixé d'un point par niveau de retrait. */
function lecture(p: HTMLElement): string[] {
  return Array.from(p.children).map((n) => {
    const el = n as HTMLElement;
    const retrait = Math.round((parseFloat(el.style.paddingLeft || '10') - 10) / 14);
    const texte = (el.textContent ?? '').trim();
    const nom = /«\s*(.*?)\s*»/.exec(texte)?.[1] ?? texte;
    return '.'.repeat(retrait) + (el.classList.contains('coll-rayon') ? `# ${texte}` : nom);
  });
}

describe('fil 1928 — le menu « Ajouter à une collection » suit les rayons', () => {
  it('toutes les collections manuelles, une fois chacune, et aucune intelligente', async () => {
    await ouvrir();
    const noms = entrees().map((b) => b.textContent ?? '');
    expect(noms).toHaveLength(MANUELLES.length);
    for (const c of MANUELLES) {
      expect(noms.filter((n) => n.includes(c.name)), `« ${c.name} »`).toHaveLength(1);
    }
    for (const s of INTELLIGENTES) {
      expect(noms.some((n) => n.includes(s.name)), `intelligente « ${s.name} » proposée`).toBe(false);
    }
  });

  it('🔴 rangées sous leurs rayons, sous-rayons indentés, hors rayon à la fin', async () => {
    const p = await ouvrir();
    const hors = get(t)('v2.rayons.unfiled');
    expect(lecture(p)).toEqual([
      '# Classique',
      '.# Baroque',
      '..Bach',
      '.Œuvres liturgiques',
      '# Monde',
      '.Musique du Monde',
      `# ${hors}`,
      '.favorites',
      '.Jazz',
      '.Pop / Rock',
      '.Orpheline',
    ]);
  });

  it('🔴 un rayon qui ne porte que des intelligentes n’a pas d’intitulé', async () => {
    const p = await ouvrir();
    const intitules = Array.from(p.querySelectorAll('.coll-rayon')).map((n) => n.textContent?.trim());
    expect(intitules, 'aucun intitulé de rayon').toContain('Classique');
    expect(intitules).not.toContain('Automatiques');
  });

  it('une collection rangée dans un sous-rayon part avec son id MANUEL', async () => {
    await ouvrir();
    const bach = entrees().find((b) => b.textContent?.includes('Bach'))!;
    bach.click();
    await jusqua(() => appels.some((a) => a.methode === 'POST'));
    const post = appels.find((a) => a.methode === 'POST');
    expect(post?.url).toMatch(new RegExp(`/library/collections/3/albums/${ALBUM_ID}$`));
  });

  it('serveur sans arbre (404) : la liste plate d’avant, sans intitulé', async () => {
    arbreServi = false;
    const p = await ouvrir();
    expect(p.querySelectorAll('.coll-rayon')).toHaveLength(0);
    expect(entrees()).toHaveLength(MANUELLES.length);
  });
});
