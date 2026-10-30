// @vitest-environment jsdom
//
// web#2526 — « Dans une playlist, il est proposé "importer" "transférer"
// "comparer", rien ne fonctionne » (régis, forum-hifi, 30/10/2026).
//
// Deux défauts, deux écrans :
//
// 1. Fiche d'une playlist (`PlaylistManagerView`) : les `catch` de
//    « Transférer » et « Comparer » n'écrivaient qu'en console. Un greffon de
//    conversion absent (503 `greffon_requis`), un serveur sans greffons (501)
//    ou une erreur de base laissaient la boîte ouverte, bouton revenu, sans un
//    mot. On MONTE l'écran, on clique, le faux serveur refuse, et la raison
//    doit se lire dans la boîte.
//
// 2. Import d'un fichier `.m3u` (écran Playlists) : le compte annoncé lisait
//    `missing`, que le serveur n'envoie pas. Un fichier de 60 lignes dont 48
//    introuvables s'annonçait « 12/12 ». On importe pour de vrai (sélecteur de
//    fichier, `change`) et on lit la notification.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import { get } from 'svelte/store';
import PlaylistManagerView from '../../components/v2-heritage/PlaylistManagerView.svelte';
import PlaylistsV2 from '../../components/v2/PlaylistsV2.svelte';
import { locale } from '../i18n';
import { notifications } from '../stores/notifications';
import { pendingPlaylistId } from '../stores/playlists';
import { currentZoneId, zones } from '../stores/zones';
import { bilanImportM3u } from '../bilanImportM3u';

vi.setConfig({ testTimeout: 60_000 });

const LOCALE = { id: 42, name: 'Nocturnes', track_count: 3 };
const AUTRE = { id: 43, name: 'Matin', track_count: 2 };
const GREFFON_ABSENT =
  'Le transfert de playlists passe par le greffon « Playlists converter », qui n’est pas chargé sur ce serveur.';

interface Reponse { status: number; corps: unknown }
let appels: { method: string; url: string }[] = [];
/** Réponse imposée par cas pour une route ; le reste prend `corpsPour`. */
let imposees: { motif: RegExp; reponse: Reponse }[] = [];

function corpsPour(url: string): unknown {
  if (url.includes('/playlist-manager/services')) return {};
  if (url.includes('/streaming/services')) return {};
  if (/\/playlists\/42\/tracks/.test(url)) return [];
  if (/\/playlists(\?|$)/.test(url)) return [LOCALE, AUTRE];
  return [];
}

const respirer = () => new Promise((r) => setTimeout(r, 0));
async function souffler(n = 6) {
  for (let i = 0; i < n; i++) {
    await respirer();
    flushSync();
  }
}

let hote: HTMLDivElement | null = null;
let monte: Record<string, unknown> | null = null;

beforeEach(() => {
  appels = [];
  imposees = [];
  for (const n of get(notifications)) notifications.dismiss(n.id);
  try { localStorage.clear(); } catch { /* jsdom sans stockage */ }
  locale.set('fr');
  zones.set([{ id: 7, name: 'Salon', state: 'stopped' } as unknown as import('../types').Zone]);
  currentZoneId.set(7);
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal('WebSocket', class {
    close() {} addEventListener() {} removeEventListener() {} send() {}
  } as unknown as typeof WebSocket);
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const method = (init?.method ?? 'GET').toUpperCase();
      appels.push({ method, url: String(url) });
      const imposee = imposees.find((i) => i.motif.test(String(url)));
      const status = imposee?.reponse.status ?? 200;
      const corps = imposee ? imposee.reponse.corps : corpsPour(String(url));
      return {
        ok: status >= 200 && status < 300,
        status,
        statusText: status < 300 ? 'OK' : 'Error',
        headers: new Map([['content-type', 'application/json']]),
        json: async () => corps,
        text: async () => JSON.stringify(corps),
      } as unknown as Response;
    }),
  );
});

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  hote?.remove();
  hote = null;
  pendingPlaylistId.set(null);
  vi.unstubAllGlobals();
});

/** Monte la fiche de la playlist locale 42 (ouverte via `pendingPlaylistId`). */
async function monterLaFiche(): Promise<HTMLDivElement> {
  pendingPlaylistId.set(42);
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(PlaylistManagerView, { target: hote, props: { onAddToPlaylist: () => {} } });
  flushSync();
  await souffler(10);
  expect(hote.querySelector('.transfer-btn'), 'la fiche de la playlist n’est pas ouverte').not.toBeNull();
  return hote;
}

function boutonConfirmer(el: HTMLElement): HTMLButtonElement {
  const b = el.querySelector<HTMLButtonElement>('.modal-overlay .form-actions .confirm-btn');
  expect(b, 'pas de bouton de confirmation dans la boîte').not.toBeNull();
  return b!;
}

describe('#2526 — Transférer et Comparer disent pourquoi ils échouent', () => {
  it('🔴 Transférer : le refus du serveur (greffon absent) se lit dans la boîte', async () => {
    imposees.push({
      motif: /\/playlist-manager\/transfer$/,
      reponse: {
        status: 503,
        corps: { error: 'greffon_requis', code: 'greffon_requis', message: GREFFON_ABSENT,
          message_key: 'api.playlists.transferPluginNotLoaded', detail: GREFFON_ABSENT },
      },
    });
    const el = await monterLaFiche();
    el.querySelector<HTMLButtonElement>('.transfer-btn')!.click();
    await souffler();
    // Cible par défaut (la bibliothèque) : l'important est le refus.
    boutonConfirmer(el).click();
    await souffler(10);
    expect(appels.some((a) => a.method === 'POST' && /\/playlist-manager\/transfer$/.test(a.url)),
      'aucune demande de transfert envoyée').toBe(true);
    const alerte = el.querySelector('.modal-overlay [data-echec-action]');
    expect(alerte, 'la boîte reste muette après le refus').not.toBeNull();
    expect(alerte!.textContent).toContain('Playlists converter');
  });

  it('Transférer réussi : aucune alerte', async () => {
    imposees.push({
      motif: /\/playlist-manager\/transfer$/,
      reponse: { status: 200, corps: { total_tracks: 3, matched: 3, approximate: 0, not_found: 0, tracks: [] } },
    });
    const el = await monterLaFiche();
    el.querySelector<HTMLButtonElement>('.transfer-btn')!.click();
    await souffler();
    boutonConfirmer(el).click();
    await souffler(10);
    expect(el.querySelector('.modal-overlay .transfer-report'), 'pas de rapport de transfert').not.toBeNull();
    expect(el.querySelector('.modal-overlay [data-echec-action]')).toBeNull();
  });

  it('🔴 Comparer : une comparaison refusée se lit dans la boîte', async () => {
    imposees.push({
      motif: /\/playlists\/diff$/,
      reponse: { status: 500, corps: 'database is locked' },
    });
    const el = await monterLaFiche();
    el.querySelector<HTMLButtonElement>('.compare-btn')!.click();
    await souffler();
    const selects = () => [...el.querySelectorAll<HTMLSelectElement>('.modal-overlay select')];
    selects()[0].value = 'local';
    selects()[0].dispatchEvent(new Event('change', { bubbles: true }));
    await souffler();
    expect(selects().length, 'la liste des playlists à comparer n’apparaît pas').toBe(2);
    selects()[1].value = '43';
    selects()[1].dispatchEvent(new Event('change', { bubbles: true }));
    await souffler();
    boutonConfirmer(el).click();
    await souffler(10);
    expect(appels.some((a) => a.method === 'POST' && /\/playlists\/diff$/.test(a.url)),
      'aucune comparaison envoyée').toBe(true);
    const alerte = el.querySelector('.modal-overlay [data-echec-action]');
    expect(alerte, 'la boîte reste muette après le refus').not.toBeNull();
    expect(alerte!.textContent!.trim().length).toBeGreaterThan(0);
  });
});

describe('#2526 — import .m3u : le compte annoncé est celui du serveur', () => {
  it('bilanImportM3u lit total_entries / not_found (forme réelle du serveur)', () => {
    expect(bilanImportM3u({ matched: 12, total_entries: 60, not_found: 48, lookup_errors: 0 }))
      .toEqual({ rapprochees: 12, total: 60, absentes: 48 });
    // Sans `total_entries` (serveur plus ancien), on recompose.
    expect(bilanImportM3u({ matched: 12, not_found: 40, lookup_errors: 8 }))
      .toEqual({ rapprochees: 12, total: 60, absentes: 48 });
    expect(bilanImportM3u(null)).toEqual({ rapprochees: 0, total: 0, absentes: 0 });
  });

  async function importer(fichier: File) {
    hote = document.createElement('div');
    document.body.appendChild(hote);
    monte = mount(PlaylistsV2, { target: hote });
    flushSync();
    await souffler(10);
    const input = hote.querySelector<HTMLInputElement>('input[type="file"][accept*=".m3u"]');
    expect(input, 'pas de sélecteur de fichier .m3u sur l’écran Playlists').not.toBeNull();
    Object.defineProperty(input!, 'files', { value: [fichier], configurable: true });
    input!.dispatchEvent(new Event('change', { bubbles: true }));
    await souffler(10);
  }

  it('🔴 60 lignes dont 48 introuvables s’annoncent 12/60, pas 12/12', async () => {
    imposees.push({
      motif: /\/playlists\/import\/m3u$/,
      reponse: {
        status: 201,
        corps: { id: 9, name: 'client', total_entries: 60, matched: 12, imported: 12, not_found: 48,
          lookup_errors: 0, not_found_paths: [], track_count: 12 },
      },
    });
    await importer(new File(['#EXTM3U\n/a.flac\n'], 'client.m3u', { type: 'audio/x-mpegurl' }));
    expect(appels.some((a) => a.method === 'POST' && /\/playlists\/import\/m3u$/.test(a.url)),
      'le fichier n’est pas parti vers /playlists/import/m3u').toBe(true);
    const succes = get(notifications).filter((n) => n.level === 'success').map((n) => n.message);
    expect(succes.some((m) => m.includes('12/60')), `notifications : ${JSON.stringify(succes)}`).toBe(true);
    expect(succes.some((m) => m.includes('12/12'))).toBe(false);
  });

  it('un refus du serveur ne s’affiche pas en JSON brut', async () => {
    imposees.push({
      motif: /\/playlists\/import\/m3u$/,
      reponse: { status: 400, corps: { error: 'no file provided' } },
    });
    await importer(new File([''], 'vide.m3u'));
    const erreurs = get(notifications).filter((n) => n.level === 'error').map((n) => n.message);
    expect(erreurs.length, 'aucune erreur annoncée').toBeGreaterThan(0);
    expect(erreurs.some((m) => m.includes('{"error"'))).toBe(false);
  });
});
