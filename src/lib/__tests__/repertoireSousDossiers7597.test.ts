// @vitest-environment jsdom
//
// tune-server-rust#7597 — Bertrand, 01/11/2026 sur le .18 (v5) : « le filtre
// Répertoire de la Bibliothèque ne marche pas » et « impossible de
// sélectionner un sous-dossier, aussi bien en Albums qu'en Pistes ».
//
// Cause : descendre d'un niveau dans le panneau « Répertoire » remplace la
// liste des dossiers. Dans un vrai navigateur, Svelte vide ses effets entre
// l'écouteur délégué (racine de l'application) et celui de `window` : quand le
// clic arrive à `ddDehors`, le bouton cliqué n'est plus dans le document,
// `closest('.drop')` rend `null`, le panneau se ferme. On ne pouvait donc ni
// descendre, ni appliquer — le bouton « Filtrer sur ce dossier » est inerte
// tant qu'on est aux racines. Aucun filtre n'était jamais posé.
//
// 🔴 Les témoins jsdom passaient : `element.click()` n'a pas ce point de
// vidage. On le RECRÉE ici par un écouteur sur `document.body` (entre la
// racine de l'application et `window`) qui appelle `flushSync()` — ce que fait
// la file des micro-tâches d'un navigateur après chaque écouteur.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import { get } from 'svelte/store';
import LibraryV2 from '../../components/v2/LibraryV2.svelte';
import { notifications } from '../stores/notifications';
import { locale } from '../i18n';
import { zones, currentZoneId } from '../stores/zones';
import { activeView } from '../stores/navigation';
import { albums as albumsStore, libraryFolderScope } from '../stores/library';
import { preferences } from '../stores/preferences';
import { clicDansUnMenu } from '../clicDansUnMenu';

vi.setConfig({ testTimeout: 30_000 });

const ZONE = { id: 4, name: 'Salon', state: 'stopped', volume: 0.5 } as any;
const RACINE = '/data/music';
const NIVEAU1 = '/data/music/NEW_FLAC';
const NIVEAU2 = '/data/music/NEW_FLAC/ELECTRO';

/** L'arborescence que rend `/library/folder-facet?path=…`. */
const ARBRE: Record<string, { crumbs: { name: string; path: string }[]; children: any[] }> = {
  '': { crumbs: [], children: [{ name: 'music', path: RACINE, count: 30, has_children: true }] },
  [RACINE]: {
    crumbs: [{ name: 'music', path: RACINE }],
    children: [
      { name: 'NEW_FLAC', path: NIVEAU1, count: 20, has_children: true },
      { name: 'AA_FLAC', path: '/data/music/AA_FLAC', count: 10, has_children: false },
    ],
  },
  [NIVEAU1]: {
    crumbs: [{ name: 'music', path: RACINE }, { name: 'NEW_FLAC', path: NIVEAU1 }],
    children: [{ name: 'ELECTRO', path: NIVEAU2, count: 6, has_children: false }],
  },
  [NIVEAU2]: {
    crumbs: [{ name: 'music', path: RACINE }, { name: 'NEW_FLAC', path: NIVEAU1 }, { name: 'ELECTRO', path: NIVEAU2 }],
    children: [],
  },
};

let urls: URL[] = [];

function reponse(status: number, corps: unknown): Response {
  return {
    ok: status < 400, status, statusText: 'OK',
    headers: new Headers({ 'content-type': 'application/json' }),
    json: async () => corps,
    text: async () => JSON.stringify(corps),
    clone() { return this; },
  } as unknown as Response;
}

function repondre(url: string): Response {
  const u = new URL(url, 'http://localhost');
  urls.push(u);
  const p = u.pathname.replace(/^\/api\/v1/, '');
  if (p === '/library/folder-facet') {
    const chemin = u.searchParams.get('path') ?? '';
    const n = ARBRE[chemin] ?? { crumbs: [], children: [] };
    return reponse(200, { path: chemin || null, ...n });
  }
  if (/\/library\/albums-detailed/.test(p)) return reponse(200, { items: [], total: 0 });
  if (/\/library\/tracks/.test(p)) return reponse(200, { items: [], total: 0, limit: 100, offset: 0 });
  if (/\/zones/.test(p)) return reponse(200, [ZONE]);
  if (/\/library\/artists|\/playlists/.test(p)) return reponse(200, []);
  return reponse(200, {});
}

let hote: HTMLDivElement | null = null;
let monte: Record<string, any> | null = null;
/** Le point de vidage d'un vrai navigateur, entre la racine et `window`. */
const vidageNavigateur = () => flushSync();

async function attendreQue(cond: () => boolean, quoi: string, ms = 5_000): Promise<void> {
  const fin = Date.now() + ms;
  while (!cond()) {
    if (Date.now() > fin) throw new Error(`jamais atteint : ${quoi}`);
    await new Promise((r) => setTimeout(r, 10));
    flushSync();
  }
}

class ResizeObserverInerte { observe() {} unobserve() {} disconnect() {} }

beforeEach(() => {
  urls = [];
  try { localStorage.clear(); } catch { /* jsdom sans stockage */ }
  for (const n of get(notifications)) notifications.dismiss(n.id);
  locale.set('fr');
  zones.set([ZONE]);
  currentZoneId.set(ZONE.id);
  libraryFolderScope.set(null);
  preferences.update((p) => ({ ...p, bibliothequeDossier: null }));
  vi.stubGlobal('fetch', vi.fn(async (url: string) => repondre(String(url))));
  vi.stubGlobal('ResizeObserver', ResizeObserverInerte);
  vi.stubGlobal('WebSocket', class { close() {} addEventListener() {} removeEventListener() {} send() {} } as any);
  vi.spyOn(console, 'error').mockImplementation(() => {});
  hote = document.createElement('div');
  document.body.appendChild(hote);
  document.body.addEventListener('click', vidageNavigateur);
});

afterEach(() => {
  document.body.removeEventListener('click', vidageNavigateur);
  if (monte) unmount(monte);
  monte = null;
  hote?.remove();
  hote = null;
  albumsStore.set([]);
  libraryFolderScope.set(null);
  activeView.set('home');
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function ouvrirBibliotheque() {
  activeView.set('library');
  monte = mount(LibraryV2, { target: hote!, props: {} as any });
  for (let i = 0; i < 10; i++) await new Promise((r) => setTimeout(r, 0));
  flushSync();
}

const panneau = () => hote!.querySelector<HTMLElement>('.choix-repertoire');
const dossier = (nom: string) =>
  [...hote!.querySelectorAll<HTMLButtonElement>('.choix-repertoire .val')].find((b) => b.querySelector('.vl')?.textContent === nom);
const miette = (nom: string) =>
  [...hote!.querySelectorAll<HTMLButtonElement>('.choix-repertoire .crumb')].find((b) => b.textContent === nom);
const appliquer = () => hote!.querySelector<HTMLButtonElement>('.choix-repertoire .appliquer');

async function ouvrirLePanneau() {
  const choix = () => hote!.querySelector<HTMLButtonElement>('[data-choix-repertoire]');
  await attendreQue(() => !!choix(), 'le bouton « Répertoire »');
  choix()!.click();
  flushSync();
  await attendreQue(() => !!dossier('music'), 'les racines dans le panneau');
}

async function descendre(nom: string, enfantAttendu: string | null) {
  dossier(nom)!.click();
  flushSync();
  // 🔴 Le panneau doit RESTER ouvert après le clic qui a remplacé la liste.
  expect(panneau(), `le panneau s'est refermé en descendant dans ${nom}`).not.toBeNull();
  if (enfantAttendu) await attendreQue(() => !!dossier(enfantAttendu), `le sous-dossier ${enfantAttendu}`);
  else await attendreQue(() => !!miette(nom) && !!appliquer() && !appliquer()!.disabled, `le dossier ${nom} ouvert`);
}

describe('#7597 — le panneau « Répertoire » descend dans les sous-dossiers', () => {
  it('🔴 déplier jusqu’au 2e niveau, remonter par le fil d’Ariane, choisir un sous-dossier : la portée est posée', async () => {
    await ouvrirBibliotheque();
    await ouvrirLePanneau();
    await descendre('music', 'NEW_FLAC');
    await descendre('NEW_FLAC', 'ELECTRO');
    await descendre('ELECTRO', null);
    // Remonter d'un niveau par le fil d'Ariane, puis redescendre.
    miette('NEW_FLAC')!.click();
    flushSync();
    expect(panneau(), 'le panneau s’est refermé en remontant').not.toBeNull();
    await attendreQue(() => !!dossier('ELECTRO'), 'le retour au parent');
    await descendre('ELECTRO', null);
    appliquer()!.click();
    flushSync();
    expect(get(libraryFolderScope)).toBe(NIVEAU2);
    expect(panneau(), 'appliquer referme le panneau').toBeNull();
    await attendreQue(() => (hote!.querySelector('.portee')?.textContent ?? '').includes('ELECTRO'), 'la pastille du sous-dossier');
  });

  it('🔴 le sous-dossier choisi filtre les Albums ET les Pistes', async () => {
    await ouvrirBibliotheque();
    await ouvrirLePanneau();
    await descendre('music', 'NEW_FLAC');
    await descendre('NEW_FLAC', 'ELECTRO');
    appliquer()!.click();
    flushSync();
    expect(get(libraryFolderScope)).toBe(NIVEAU1);
    // Albums : la portée est demandée au serveur avec le dossier.
    await attendreQue(
      () => urls.some((u) => /albums-detailed/.test(u.pathname) && u.searchParams.get('folder') === NIVEAU1),
      'les albums du sous-dossier',
    );
    // Pistes : l'onglet Titres demande ses pages avec le même dossier.
    hote!.querySelector<HTMLButtonElement>('.tab[data-onglet="tracks"]')!.click();
    flushSync();
    await attendreQue(
      () => urls.some((u) => /\/library\/tracks$/.test(u.pathname) && u.searchParams.get('folder') === NIVEAU1),
      'les pistes du sous-dossier',
    );
  });

  it('contre-épreuve : un clic VRAIMENT dehors referme toujours le panneau, et rien n’est posé', async () => {
    await ouvrirBibliotheque();
    await ouvrirLePanneau();
    await descendre('music', 'NEW_FLAC');
    document.body.click();
    flushSync();
    expect(panneau()).toBeNull();
    expect(get(libraryFolderScope)).toBeNull();
  });
});

describe('#7597 — clicDansUnMenu lit le chemin figé du clic', () => {
  it('une cible retirée du document pendant le clic compte encore comme DEDANS', () => {
    const drop = document.createElement('div');
    drop.className = 'drop';
    const bouton = document.createElement('button');
    drop.appendChild(bouton);
    document.body.appendChild(drop);
    let vu: boolean | null = null;
    let ancien: boolean | null = null;
    bouton.addEventListener('click', () => bouton.remove());
    const ecoute = (e: Event) => {
      vu = clicDansUnMenu(e);
      ancien = !!(e.target as Element).closest('.drop');
    };
    window.addEventListener('click', ecoute);
    bouton.click();
    window.removeEventListener('click', ecoute);
    drop.remove();
    expect(vu).toBe(true);
    // Contre-épreuve : l'ancien test (`closest`) le prenait pour un clic dehors.
    expect(ancien).toBe(false);
  });

  it('un clic hors de tout menu est DEHORS', () => {
    const autre = document.createElement('p');
    document.body.appendChild(autre);
    let vu: boolean | null = null;
    const ecoute = (e: Event) => { vu = clicDansUnMenu(e); };
    window.addEventListener('click', ecoute);
    autre.click();
    window.removeEventListener('click', ecoute);
    autre.remove();
    expect(vu).toBe(false);
  });
});
