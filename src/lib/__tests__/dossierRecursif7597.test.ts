// @vitest-environment jsdom
//
// tune-server-rust#7597 — fil forum 2577, « Adding folder structure
// recursively to queue? » : lire, ou ajouter à la file, un dossier AVEC tous
// ses sous-dossiers, dans l'ordre.
//
// Avant : Répertoires n'offrait que « Tout lire » / « Tout ajouter » sur les
// pistes du dossier ouvert (`browseResult.tracks`), Oxygène que la lecture
// aléatoire du sous-arbre, et la Bibliothèque ne savait poser une portée de
// dossier qu'en venant de Répertoires.
//
// 🔴 Les témoins montent les VRAIS écrans (Répertoires, Bibliothèque), cliquent
// et lisent la REQUÊTE émise — le corps `{ folder }` que le serveur résout.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import { get } from 'svelte/store';
import BrowseView from '../../components/v2-heritage/BrowseView.svelte';
import LibraryV2 from '../../components/v2/LibraryV2.svelte';
import { notifications } from '../stores/notifications';
import { locale } from '../i18n';
import { zones, currentZoneId } from '../stores/zones';
import { activeView } from '../stores/navigation';
import { albums as albumsStore, libraryFolderScope } from '../stores/library';
import { preferences } from '../stores/preferences';
import { porteeAuMontage, choisirDossierBibliotheque, retirerDossierBibliotheque } from '../dossierBibliotheque';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

vi.setConfig({ testTimeout: 30_000 });

const ZONE = { id: 4, name: 'Salon', state: 'stopped', volume: 0.5 } as any;
const DOSSIER = '/music/Coffret';

type Envoi = { methode: string; chemin: string; corps: any };
let envois: Envoi[] = [];
let refusLecture: { status: number; corps: unknown } | null = null;

function reponse(status: number, corps: unknown): Response {
  return {
    ok: status < 400, status, statusText: status < 400 ? 'OK' : 'Bad Request',
    headers: new Headers({ 'content-type': 'application/json' }),
    json: async () => corps,
    text: async () => JSON.stringify(corps),
    clone() { return this; },
  } as unknown as Response;
}

function repondre(url: string, init?: RequestInit): Response {
  const u = new URL(url, 'http://localhost');
  const p = u.pathname.replace(/^\/api\/v1/, '');
  const methode = init?.method ?? 'GET';
  if (methode !== 'GET') {
    envois.push({ methode, chemin: p, corps: init?.body ? JSON.parse(String(init.body)) : null });
  }
  if (p === '/library/browse') return reponse(200, { roots: [{ name: 'Musique', path: '/music', track_count: 7, exists: true }] });
  if (p === '/library/browse/dir') {
    return reponse(200, {
      path: '/music', parent: null, music_root: '/music', accessible: true, tracks: [],
      directories: [{ name: 'Coffret', path: DOSSIER, track_count: 7 }],
    });
  }
  if (p === `/zones/${ZONE.id}/play` && refusLecture) return reponse(refusLecture.status, refusLecture.corps);
  if (p === `/zones/${ZONE.id}/play`) return reponse(200, { ...ZONE, state: 'playing' });
  if (p === `/zones/${ZONE.id}/queue/add`) return reponse(200, { queue_length: 7 });
  if (p === '/library/folder-facet') {
    const chemin = u.searchParams.get('path');
    return reponse(200, chemin
      ? { path: chemin, crumbs: [{ name: 'music', path: '/music' }, { name: 'Coffret', path: DOSSIER }], children: [] }
      : { path: null, crumbs: [], children: [{ name: 'Coffret', path: DOSSIER, count: 7, has_children: false }] });
  }
  if (/\/library\/albums-detailed/.test(p)) return reponse(200, { items: [], total: 0 });
  if (/\/library\/tracks/.test(p)) return reponse(200, { items: [], total: 0 });
  if (/\/zones/.test(p)) return reponse(200, [ZONE]);
  if (/\/library\/artists|\/playlists/.test(p)) return reponse(200, []);
  return reponse(200, {});
}

let hote: HTMLDivElement | null = null;
let monte: Record<string, any> | null = null;

async function attendreQue(cond: () => boolean, quoi: string, ms = 5_000): Promise<void> {
  const fin = Date.now() + ms;
  while (!cond()) {
    if (Date.now() > fin) throw new Error(`jamais atteint : ${quoi}`);
    await new Promise((r) => setTimeout(r, 10));
    flushSync();
  }
}
const erreurs = () => get(notifications).filter((n) => n.level === 'error').map((n) => n.message);

class ResizeObserverInerte { observe() {} unobserve() {} disconnect() {} }

beforeEach(() => {
  envois = [];
  refusLecture = null;
  try { localStorage.clear(); } catch { /* jsdom sans stockage */ }
  for (const n of get(notifications)) notifications.dismiss(n.id);
  locale.set('fr');
  zones.set([ZONE]);
  currentZoneId.set(ZONE.id);
  libraryFolderScope.set(null);
  preferences.update((p) => ({ ...p, bibliothequeDossier: null }));
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => repondre(String(url), init)));
  vi.stubGlobal('ResizeObserver', ResizeObserverInerte);
  vi.stubGlobal('WebSocket', class { close() {} addEventListener() {} removeEventListener() {} send() {} } as any);
  vi.spyOn(console, 'error').mockImplementation(() => {});
  hote = document.createElement('div');
  document.body.appendChild(hote);
});

afterEach(() => {
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

async function ouvrirRepertoires() {
  monte = mount(BrowseView, { target: hote!, props: {} });
  flushSync();
  const bouton = () => hote!.querySelector<HTMLButtonElement>('[data-dossier-lire]');
  await attendreQue(() => !!hote!.querySelector('.root-item') || !!bouton(), 'l’écran Répertoires');
  if (!bouton()) {
    hote!.querySelector<HTMLButtonElement>('.root-item')!.click();
    flushSync();
  }
  await attendreQue(() => !!bouton(), 'le bouton « Tout lire (sous-dossiers compris) »');
}

describe('#7597 — Répertoires : le dossier entier, sous-dossiers compris', () => {
  it('🔴 « Tout lire (sous-dossiers compris) » envoie le DOSSIER au serveur, pas une liste de pistes', async () => {
    await ouvrirRepertoires();
    const b = hote!.querySelector<HTMLButtonElement>('[data-dossier-lire]')!;
    expect(b.textContent).toContain('Tout lire (sous-dossiers compris)');
    b.click();
    await attendreQue(() => envois.some((e) => e.chemin.endsWith('/play')), 'la requête de lecture');
    expect(envois.find((e) => e.chemin.endsWith('/play'))).toEqual({
      methode: 'POST', chemin: `/zones/${ZONE.id}/play`, corps: { folder: '/music' },
    });
  });

  it('🔴 « Ajouter à la file (sous-dossiers compris) » enfile le dossier à la fin', async () => {
    await ouvrirRepertoires();
    const b = hote!.querySelector<HTMLButtonElement>('[data-dossier-ajouter]')!;
    expect(b.textContent).toContain('Ajouter à la file (sous-dossiers compris)');
    b.click();
    await attendreQue(() => envois.some((e) => e.chemin.endsWith('/queue/add')), 'la requête d’ajout');
    expect(envois.find((e) => e.chemin.endsWith('/queue/add'))!.corps).toEqual({ folder: '/music' });
  });

  it('le refus du serveur (dossier trop grand) se DIT, avec sa phrase', async () => {
    refusLecture = {
      status: 400,
      corps: {
        error: 'folder_too_large', code: 'folder_too_large',
        message: 'Ce dossier contient 6200 pistes, sous-dossiers compris : au-delà de 5000, il ne peut pas être lu d’un seul geste.',
        message_key: 'api.playback.folderTooLarge', params: { count: '6200', max: '5000' },
      },
    };
    await ouvrirRepertoires();
    hote!.querySelector<HTMLButtonElement>('[data-dossier-lire]')!.click();
    await attendreQue(() => erreurs().length > 0, 'un message');
    expect(erreurs().join(' | ')).toContain('6200 pistes');
  });
});

describe('#7597 — Bibliothèque : le bouton « Répertoire » et la mémoire par profil', () => {
  it('l’arrivée depuis Répertoires prime sur le dossier retenu', () => {
    expect(porteeAuMontage('/a', '/b')).toBe('/a');
    expect(porteeAuMontage(null, '/b')).toBe('/b');
    expect(porteeAuMontage(null, null)).toBe(null);
    expect(porteeAuMontage(null, '' as any)).toBe(null);
  });

  it('choisir retient le dossier pour le profil ; retirer l’oublie', () => {
    choisirDossierBibliotheque(DOSSIER);
    expect(get(libraryFolderScope)).toBe(DOSSIER);
    expect(get(preferences).bibliothequeDossier).toBe(DOSSIER);
    retirerDossierBibliotheque();
    expect(get(libraryFolderScope)).toBe(null);
    expect(get(preferences).bibliothequeDossier).toBe(null);
  });

  async function ouvrirBibliotheque() {
    activeView.set('library');
    monte = mount(LibraryV2, { target: hote!, props: {} as any });
    for (let i = 0; i < 10; i++) await new Promise((r) => setTimeout(r, 0));
    flushSync();
  }

  it('🔴 le bouton « Répertoire » pose la portée, la pastille l’affiche, et la lecture du dossier part', async () => {
    await ouvrirBibliotheque();
    const choix = () => hote!.querySelector<HTMLButtonElement>('[data-choix-repertoire]');
    await attendreQue(() => !!choix(), 'le bouton « Répertoire »');
    expect(choix()!.textContent).toContain('Répertoire');
    choix()!.click();
    flushSync();
    // On descend dans « Coffret » par le sélecteur partagé, puis on filtre.
    await attendreQue(() => [...hote!.querySelectorAll('button')].some((b) => b.textContent?.trim().startsWith('Coffret')), 'le dossier Coffret');
    [...hote!.querySelectorAll<HTMLButtonElement>('.choix-repertoire button')].find((b) => b.textContent?.trim().startsWith('Coffret'))!.click();
    const appliquer = () => hote!.querySelector<HTMLButtonElement>('.choix-repertoire .appliquer');
    await attendreQue(() => !!appliquer() && !appliquer()!.disabled, 'le bouton « Filtrer sur ce dossier »');
    appliquer()!.click();
    flushSync();
    expect(get(libraryFolderScope)).toBe(DOSSIER);
    expect(get(preferences).bibliothequeDossier).toBe(DOSSIER);
    await attendreQue(() => !!hote!.querySelector('.portee [data-dossier-lire]'), 'la lecture du dossier sous la pastille');
    expect(hote!.querySelector('.portee')!.textContent).toContain('Coffret');

    hote!.querySelector<HTMLButtonElement>('.portee [data-dossier-lire]')!.click();
    await attendreQue(() => envois.some((e) => e.chemin.endsWith('/play')), 'la requête de lecture');
    expect(envois.find((e) => e.chemin.endsWith('/play'))!.corps).toEqual({ folder: DOSSIER });
    hote!.querySelector<HTMLButtonElement>('.portee [data-dossier-ajouter]')!.click();
    await attendreQue(() => envois.some((e) => e.chemin.endsWith('/queue/add')), 'la requête d’ajout');
    expect(envois.find((e) => e.chemin.endsWith('/queue/add'))!.corps).toEqual({ folder: DOSSIER });
  });

  it('🔴 au retour dans la Bibliothèque, le dernier dossier choisi revient', async () => {
    preferences.update((p) => ({ ...p, bibliothequeDossier: DOSSIER }));
    libraryFolderScope.set(null); // un clic sur « Bibliothèque » remet la portée à zéro
    await ouvrirBibliotheque();
    expect(get(libraryFolderScope)).toBe(DOSSIER);
    await attendreQue(() => (hote!.querySelector('.portee')?.textContent ?? '').includes('Coffret'), 'la pastille du dossier retenu');
  });

  it('l’arrivée depuis Répertoires n’est pas écrasée par le dossier retenu', async () => {
    preferences.update((p) => ({ ...p, bibliothequeDossier: DOSSIER }));
    libraryFolderScope.set('/music/Autre');
    await ouvrirBibliotheque();
    expect(get(libraryFolderScope)).toBe('/music/Autre');
  });
});

describe('#7597 — Oxygène : « Tout lire » à côté de la lecture aléatoire du dossier', () => {
  const src = readFileSync(resolve(process.cwd(), 'src/components/v2-heritage/OxygenView.svelte'), 'utf-8');
  it('le bouton existe quand un dossier est ouvert et appelle la lecture du dossier', () => {
    const bloc = src.slice(src.indexOf('{#if dossierOuvert}'), src.indexOf('tirerDansLeDossier}', src.indexOf('{#if dossierOuvert}')));
    expect(bloc).toContain('lireDossier(zone?.id, dossierOuvert)');
  });
  it('le commentaire ne dit plus que « tout lire » n’existe pas', () => {
    expect(src).not.toContain('Pas de « tout lire » symetrique');
  });
});
