// @vitest-environment jsdom
//
// web#3247 (Patatorz, fil 2912, validé par Bertrand le 19/11/2026) — l'écran
// d'une étiquette lit TOUS ses titres (bouton Lecture des autres listes, avec
// aléatoire, boucle, ensuite, à la file) et les ajoute d'un coup à une
// playlist, existante ou nouvelle.
//
// Ces témoins MONTENT `EtiquettesV2` et cliquent comme l'utilisateur ; le
// `fetch` bouchonné tient le rôle du serveur.
//
// Contre-épreuve : avec le `EtiquettesV2.svelte` de `main`, aucun de ces
// boutons n'existe : 7 témoins sur 9 échouent (mesuré sur Shrek le 19/11).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import { get } from 'svelte/store';
import EtiquettesV2 from '../../components/v2/EtiquettesV2.svelte';
import AddToPlaylistModal from '../../components/partages/AddToPlaylistModal.svelte';
import { locale } from '../i18n';
import { currentZoneId } from '../stores/zones';
import { repeatMode } from '../stores/repeatStore';
import { demandeAjoutPlaylist } from '../demandeAjoutPlaylist';

vi.setConfig({ testTimeout: 30_000 });

class Inerte { observe() {} unobserve() {} disconnect() {} }
const respirer = () => new Promise((r) => setTimeout(r, 0));
async function souffler(n = 12) { for (let i = 0; i < n; i++) { await respirer(); flushSync(); } }

const TAG = { id: 4, name: 'Jazz du soir', color: '#808080' };
const ALBUM = { id: 12, title: 'Kind of Blue', artist_name: 'Miles Davis', source: 'local' };
const PISTES_ALBUM = [
  { id: 101, title: 'So What', album_id: 12, source: 'local', duration_ms: 1000 },
  { id: 102, title: 'Freddie Freeloader', album_id: 12, source: 'local', duration_ms: 1000 },
];
// Étiquetée ET dans l'album : une seule fois dans la lecture.
const PISTE_ETIQUETEE = [{ id: 102, title: 'Freddie Freeloader', album_id: 12, source: 'local', duration_ms: 1000 },
  { id: 200, title: 'Naima', source: 'local', duration_ms: 1000 }];

let appels: { url: string; method: string; body: any }[] = [];
let hote: HTMLDivElement;
let montes: Record<string, unknown>[] = [];

function repondre(url: string, method: string): unknown {
  if (/\/zones\/1\/repeat/.test(url)) return { repeat: 'all' };
  if (/\/zones\/1\/play(\?|$)/.test(url)) return { id: 1, state: 'playing' };
  if (/\/zones\/1\/queue/.test(url) && method === 'POST') return { ok: true };
  if (url.includes('/tags/4/albums')) return { albums: [ALBUM], count: 1 };
  if (url.includes('/tags/4/tracks')) return { tracks: PISTE_ETIQUETEE, count: 2 };
  if (url.includes('/tags/4/')) return {};
  if (/\/library\/albums\/12\/tracks/.test(url)) return PISTES_ALBUM;
  if (/\/streaming\/[^/]+\/playlists/.test(url)) return [{ source_id: 'p1', name: 'Mes Qobuz', track_count: 3, owned: true }];
  if (/\/playlists(\?|$)/.test(url)) return [{ id: 7, name: 'Soirée', track_count: 2 }];
  if (url.includes('/tags')) return [TAG];
  return {};
}

beforeEach(() => {
  appels = [];
  locale.set('fr');
  currentZoneId.set(1);
  repeatMode.set('off');
  demandeAjoutPlaylist.set(null);
  vi.stubGlobal('ResizeObserver', Inerte);
  vi.stubGlobal('IntersectionObserver', Inerte);
  vi.stubGlobal('WebSocket', class { close() {} addEventListener() {} removeEventListener() {} send() {} } as any);
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    const method = (init?.method ?? 'GET').toUpperCase();
    let body: any = null;
    try { body = init?.body ? JSON.parse(String(init.body)) : null; } catch { body = init?.body; }
    appels.push({ url, method, body });
    const charge = repondre(url, method);
    return {
      ok: true, status: 200, statusText: 'OK',
      headers: new Headers({ 'Content-Type': 'application/json' }),
      text: async () => JSON.stringify(charge), json: async () => charge,
    } as unknown as Response;
  }));
  hote = document.createElement('div');
  document.body.append(hote);
});

afterEach(() => {
  for (const m of montes) unmount(m);
  montes = [];
  hote.remove();
  document.querySelectorAll('[role="menu"]').forEach((e) => e.remove());
  demandeAjoutPlaylist.set(null);
  vi.unstubAllGlobals();
});

async function ouvrirEtiquette() {
  montes.push(mount(EtiquettesV2, { target: hote, props: {} }));
  await souffler();
  const b = [...hote.querySelectorAll<HTMLButtonElement>('button.tag')].find((x) => x.textContent?.includes(TAG.name));
  expect(b, "l'étiquette n'est pas listée").toBeTruthy();
  b!.click();
  await souffler();
}

const lectures = () => appels.filter((a) => a.method === 'POST' && /\/zones\/1\/play(\?|$)/.test(a.url));
async function entreeDuMenu(attr: string): Promise<HTMLElement> {
  const fleche = hote.querySelector<HTMLButtonElement>('[data-lecture-etiquette] [data-lecture-options]');
  expect(fleche, 'pas de flèche d’options sous « Tout lire »').not.toBeNull();
  fleche!.click();
  await souffler(3);
  const e = document.querySelector<HTMLElement>(`[${attr}]`);
  expect(e, `pas d’entrée ${attr} dans le menu`).not.toBeNull();
  return e!;
}

describe('web#3247 — « Tout lire » dans l’écran d’une étiquette', () => {
  it('🔴 « Tout lire » lance les titres de l’album ET les titres étiquetés, sans doublon', async () => {
    await ouvrirEtiquette();
    const lire = hote.querySelector<HTMLButtonElement>('[data-lire-etiquette]');
    expect(lire, 'pas de bouton « Tout lire »').not.toBeNull();
    lire!.click();
    await souffler();
    expect(lectures()).toHaveLength(1);
    expect(lectures()[0].body.track_ids).toEqual([101, 102, 200]);
  });

  it('🔴 « Lecture aléatoire » lit les mêmes titres, mélangés', async () => {
    await ouvrirEtiquette();
    (await entreeDuMenu('data-aleatoire-etiquette')).click();
    await souffler();
    const corps = lectures()[0]?.body;
    expect(corps, 'rien n’a été lancé').toBeTruthy();
    const ids = corps.track_ids ?? [corps.track_id];
    // Toute la liste part (en lot ou tête + file) : on vérifie l'ensemble.
    const file = appels.filter((a) => a.method === 'POST' && /\/zones\/1\/queue/.test(a.url)).flatMap((a) => a.body?.track_ids ?? []);
    expect([...ids, ...file].sort()).toEqual([101, 102, 200]);
  });

  it('🔴 « Lire en boucle » lance la lecture PUIS met la répétition sur toute la file', async () => {
    await ouvrirEtiquette();
    (await entreeDuMenu('data-lecture-boucle')).click();
    await souffler();
    const iLecture = appels.findIndex((a) => a.method === 'POST' && /\/zones\/1\/play(\?|$)/.test(a.url));
    const iBoucle = appels.findIndex((a) => a.method === 'POST' && /\/zones\/1\/repeat\?mode=all/.test(a.url));
    expect(iLecture, 'pas de lecture').toBeGreaterThan(-1);
    expect(iBoucle, 'pas de répétition').toBeGreaterThan(iLecture);
    expect(get(repeatMode)).toBe('all');
  });

  it('« Tout lire » seul ne touche pas à la répétition', async () => {
    await ouvrirEtiquette();
    hote.querySelector<HTMLButtonElement>('[data-lire-etiquette]')!.click();
    await souffler();
    expect(appels.some((a) => /\/repeat/.test(a.url))).toBe(false);
  });

  it('« Ajouter à la file » enfile tous les titres en UNE requête', async () => {
    await ouvrirEtiquette();
    (await entreeDuMenu('data-ajouter-file')).click();
    await souffler();
    const file = appels.filter((a) => a.method === 'POST' && /\/zones\/1\/queue/.test(a.url));
    expect(file).toHaveLength(1);
    expect(file[0].body.track_ids).toEqual([101, 102, 200]);
  });
});

describe('web#3247 — « Ajouter tout à une playlist »', () => {
  it('🔴 le bouton ouvre la fenêtre partagée avec TOUS les titres de l’étiquette', async () => {
    await ouvrirEtiquette();
    const b = hote.querySelector<HTMLButtonElement>('[data-ajouter-etiquette-playlist]');
    expect(b, 'pas de bouton « Ajouter tout à une playlist »').not.toBeNull();
    b!.click();
    await souffler();
    const d = get(demandeAjoutPlaylist);
    expect(d?.nom).toBe(TAG.name);
    expect((await d!.pistes!()).map((x) => x.id)).toEqual([101, 102, 200]);
  });

  it('la fenêtre écrit tout le lot dans la playlist Tune choisie', async () => {
    const lot = [...PISTES_ALBUM, PISTE_ETIQUETEE[1]] as any[];
    montes.push(mount(AddToPlaylistModal, { target: hote, props: { track: lot[0], tracks: lot, onClose: () => {} } }));
    await souffler();
    const cible = [...hote.querySelectorAll<HTMLElement>('button')].find((x) => x.textContent?.includes('Soirée'));
    expect(cible, 'la playlist Tune n’est pas proposée').toBeTruthy();
    cible!.click();
    await souffler();
    const ecrit = appels.find((a) => a.method === 'POST' && /\/playlists\/7\/tracks/.test(a.url));
    expect(ecrit?.body.track_ids).toEqual([101, 102, 200]);
  });

  it('🔴 un lot MÊLÉ de services ne propose pas les playlists du service de la première piste', async () => {
    const lot = [
      { id: null, title: 'Q', source: 'qobuz', source_id: 'q1', duration_ms: 1 },
      { id: null, title: 'T', source: 'tidal', source_id: 't1', duration_ms: 1 },
    ] as any[];
    montes.push(mount(AddToPlaylistModal, { target: hote, props: { track: lot[0], tracks: lot, onClose: () => {} } }));
    await souffler();
    expect(appels.some((a) => /\/streaming\/qobuz\/playlists/.test(a.url)), 'les playlists Qobuz sont demandées').toBe(false);
    expect(hote.textContent).toContain('Soirée');
  });

  it('un lot d’un SEUL service garde ses playlists de service', async () => {
    const lot = [
      { id: null, title: 'Q', source: 'qobuz', source_id: 'q1', duration_ms: 1 },
      { id: null, title: 'Q2', source: 'qobuz', source_id: 'q2', duration_ms: 1 },
    ] as any[];
    montes.push(mount(AddToPlaylistModal, { target: hote, props: { track: lot[0], tracks: lot, onClose: () => {} } }));
    await souffler();
    expect(appels.some((a) => /\/streaming\/qobuz\/playlists/.test(a.url))).toBe(true);
  });
});
