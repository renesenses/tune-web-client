// @vitest-environment jsdom
//
// web#3267 (fil 2912, suite de #3247) — « Créer une playlist » depuis l'écran
// d'une étiquette : nom proposé = nom de l'étiquette, modifiable ; tous les
// titres, dans l'ordre de « Tout lire » ; nombre de titres ENREGISTRÉS dit.
//
// Ces témoins MONTENT `EtiquettesV2` et cliquent comme l'utilisateur ; le
// `fetch` bouchonné tient le rôle du serveur.
//
// Contre-épreuve : avec le `EtiquettesV2.svelte` de `main` (sans le bouton),
// les témoins 🔴 échouent (voir la PR).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import { get } from 'svelte/store';
import EtiquettesV2 from '../../components/v2/EtiquettesV2.svelte';
import AddToPlaylistModal from '../../components/partages/AddToPlaylistModal.svelte';
import { locale } from '../i18n';
import { currentZoneId } from '../stores/zones';
import { repeatMode } from '../stores/repeatStore';
import { demandeAjoutPlaylist } from '../demandeAjoutPlaylist';
import { dialogs } from '../stores/dialogs';
import { notifications } from '../stores/notifications';

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

let compteServeur = 3;
let echecService = false;
let tagSansRangeable = false;
let appels: { url: string; method: string; body: any }[] = [];
let hote: HTMLDivElement;
let montes: Record<string, unknown>[] = [];

function repondre(url: string, method: string): unknown {
  if (/\/zones\/1\/repeat/.test(url)) return { repeat: 'all' };
  if (/\/zones\/1\/play(\?|$)/.test(url)) return { id: 1, state: 'playing' };
  if (/\/zones\/1\/queue/.test(url) && method === 'POST') return { ok: true };
  if (url.includes('/tags/4/albums')) return tagSansRangeable ? { albums: [], count: 0 } : { albums: [ALBUM], count: 1 };
  if (url.includes('/tags/4/tracks')) return tagSansRangeable
    ? { tracks: [{ id: null, title: 'Sans id', source: 'qobuz', duration_ms: 1 }], count: 1 }
    : { tracks: PISTE_ETIQUETEE, count: 2 };
  if (url.includes('/tags/4/')) return {};
  if (/\/library\/albums\/12\/tracks/.test(url)) return PISTES_ALBUM;
  if (/\/streaming\/[^/]+\/playlists/.test(url)) return [{ source_id: 'p1', name: 'Mes Qobuz', track_count: 3, owned: true }];
  if (/\/playlists\/55\/tracks/.test(url) && method === 'POST') return { id: 55, name: 'x', track_count: compteServeur };
  if (/\/playlists\/7\/tracks/.test(url) && method === 'POST') return { id: 7, name: 'Soirée', track_count: 9 };
  if (/\/playlists$/.test(url) && method === 'POST') return { id: 55, name: 'x', track_count: 0 };
  if (/\/playlists(\?|$)/.test(url)) return [{ id: 7, name: 'Soirée', track_count: 2 }];
  if (url.includes('/tags')) return [TAG];
  return {};
}

beforeEach(() => {
  appels = [];
  compteServeur = 3;
  echecService = false;
  tagSansRangeable = false;
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
    if (echecService && method === 'POST' && /\/playlists\/7\/tracks/.test(url) && body?.streaming_tracks?.length) {
      return {
        ok: false, status: 500, statusText: 'Internal Server Error',
        headers: new Headers({ 'Content-Type': 'application/json' }),
        text: async () => '{"error":"boom"}', json: async () => ({ error: 'boom' }),
      } as unknown as Response;
    }
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


/** La question en tête de file, puis sa réponse. */
async function repondreALaQuestion(reponse: string | null): Promise<string> {
  await souffler();
  const file = get(dialogs) as any[];
  expect(file.length, 'aucune question posée').toBeGreaterThan(0);
  const q = file[0];
  dialogs.settle(q.id, reponse);
  await souffler();
  return q.initial;
}

const creations = () => appels.filter((a) => a.method === 'POST' && /\/playlists$/.test(a.url));
const versements = () => appels.filter((a) => a.method === 'POST' && /\/playlists\/55\/tracks/.test(a.url));

describe('web#3267 — « Créer une playlist » dans l’écran d’une étiquette', () => {
  it('🔴 propose le nom de l’étiquette, crée la playlist et y verse tous les titres sans doublon', async () => {
    const succes = vi.spyOn(notifications, 'success');
    await ouvrirEtiquette();
    const b = hote.querySelector<HTMLButtonElement>('[data-creer-playlist-etiquette]');
    expect(b, 'pas de bouton « Créer une playlist »').not.toBeNull();
    expect(b!.textContent).toContain('Créer une playlist');
    b!.click();
    const propose = await repondreALaQuestion('  Mon jazz  ');
    expect(propose).toBe(TAG.name);
    expect(creations()).toHaveLength(1);
    expect(creations()[0].body.name).toBe('Mon jazz');
    expect(versements()).toHaveLength(1);
    expect(versements()[0].body.track_ids).toEqual([101, 102, 200]);
    expect(succes).toHaveBeenCalledWith('Playlist « Mon jazz » créée : 3 titres.');
  });

  it('🔴 annuler la question ne crée rien', async () => {
    await ouvrirEtiquette();
    hote.querySelector<HTMLButtonElement>('[data-creer-playlist-etiquette]')!.click();
    await repondreALaQuestion(null);
    expect(creations()).toHaveLength(0);
    expect(versements()).toHaveLength(0);
  });

  it('un nom vidé ne crée rien', async () => {
    await ouvrirEtiquette();
    hote.querySelector<HTMLButtonElement>('[data-creer-playlist-etiquette]')!.click();
    await repondreALaQuestion('   ');
    expect(creations()).toHaveLength(0);
  });

  it('🔴 un titre refusé se DIT : « N sur M »', async () => {
    compteServeur = 2;
    const succes = vi.spyOn(notifications, 'success');
    await ouvrirEtiquette();
    hote.querySelector<HTMLButtonElement>('[data-creer-playlist-etiquette]')!.click();
    await repondreALaQuestion('Mon jazz');
    expect(succes).toHaveBeenCalledWith('Playlist « Mon jazz » créée : 2 titres sur 3, les autres n’ont pas pu être ajoutés.');
  });

  it('un seul titre : le singulier', async () => {
    compteServeur = 1;
    const succes = vi.spyOn(notifications, 'success');
    await ouvrirEtiquette();
    hote.querySelector<HTMLButtonElement>('[data-creer-playlist-etiquette]')!.click();
    await repondreALaQuestion('Mon jazz');
    expect(succes.mock.calls.at(-1)?.[0]).toContain('1 titre sur 3');
  });

  it('🔴 aucun titre rangeable : état vide, AUCUNE playlist créée', async () => {
    tagSansRangeable = true;
    const erreur = vi.spyOn(notifications, 'error');
    await ouvrirEtiquette();
    hote.querySelector<HTMLButtonElement>('[data-creer-playlist-etiquette]')!.click();
    await repondreALaQuestion('X');
    expect(creations()).toHaveLength(0);
    expect(erreur).toHaveBeenCalledWith('Aucun titre à lire sous cette étiquette.');
  });
});

describe('web#3267 — « Ajouter tout à une playlist » garde l’ordre d’un lot mêlé', () => {
  it('🔴 bibliothèque, service, bibliothèque : trois envois, dans l’ordre', async () => {
    const lot = [
      { id: 1, title: 'L1', source: 'local', duration_ms: 1 },
      { id: null, title: 'Q', source: 'qobuz', source_id: 'q1', duration_ms: 1 },
      { id: 2, title: 'L2', source: 'local', duration_ms: 1 },
    ] as any[];
    montes.push(mount(AddToPlaylistModal, { target: hote, props: { track: lot[0], tracks: lot, onClose: () => {} } }));
    await souffler();
    [...hote.querySelectorAll<HTMLElement>('button')].find((x) => x.textContent?.includes('Soirée'))!.click();
    await souffler();
    const envois = appels.filter((a) => a.method === 'POST' && /\/playlists\/7\/tracks/.test(a.url))
      .map((a) => [a.body.track_ids, (a.body.streaming_tracks ?? []).map((x: any) => x.source_id)]);
    expect(envois).toEqual([[[1], []], [[], ['q1']], [[2], []]]);
    expect(hote.querySelector('[data-ajout-confirme]')).not.toBeNull();
  });

  it('🔴 un envoi refusé parmi d’autres : « k sur n », pas « Ajoutée » seul', async () => {
    echecService = true;
    const lot = [
      { id: 1, title: 'L1', source: 'local', duration_ms: 1 },
      { id: null, title: 'Q', source: 'qobuz', source_id: 'q1', duration_ms: 1 },
      { id: 2, title: 'L2', source: 'local', duration_ms: 1 },
    ] as any[];
    montes.push(mount(AddToPlaylistModal, { target: hote, props: { track: lot[0], tracks: lot, onClose: () => {} } }));
    await souffler();
    [...hote.querySelectorAll<HTMLElement>('button')].find((x) => x.textContent?.includes('Soirée'))!.click();
    await souffler();
    expect(hote.querySelector('[data-ajout-confirme]')).not.toBeNull();
    expect(hote.querySelector('[data-ajout-partiel]')?.textContent)
      .toBe('2 titres sur 3 : les autres n’ont pas pu être ajoutés.');
  });

  it('tout passe : aucun avertissement', async () => {
    const lot = [{ id: 1, title: 'L1', source: 'local', duration_ms: 1 }] as any[];
    montes.push(mount(AddToPlaylistModal, { target: hote, props: { track: lot[0], tracks: lot, onClose: () => {} } }));
    await souffler();
    [...hote.querySelectorAll<HTMLElement>('button')].find((x) => x.textContent?.includes('Soirée'))!.click();
    await souffler();
    expect(hote.querySelector('[data-ajout-confirme]')).not.toBeNull();
    expect(hote.querySelector('[data-ajout-partiel]')).toBeNull();
  });
});
