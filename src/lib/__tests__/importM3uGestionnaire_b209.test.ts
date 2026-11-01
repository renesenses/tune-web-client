// @vitest-environment jsdom
//
// Import d'un fichier de playlist (.m3u, .m3u8, .dpl) INTROUVABLE en rc9
// (Régis, r5yk5) : le bouton « Importer » vivait dans `PlaylistsV2`, écran
// qu'aucune entrée ne montre ; la barre latérale « Playlists » ouvre le
// Gestionnaire, qui n'importait que des playlists de service. On monte le vrai
// Gestionnaire : le bouton y est, l'import part avec le profil, le bilan
// (web#2541) s'affiche, la liste est relue.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import { get } from 'svelte/store';
import PlaylistManagerView from '../../components/v2-heritage/PlaylistManagerView.svelte';
import { locale } from '../i18n';
import { notifications } from '../stores/notifications';
import { pendingPlaylistId } from '../stores/playlists';

vi.setConfig({ testTimeout: 60_000 });

interface Appel { method: string; url: string; headers: Record<string, string> }
let appels: Appel[] = [];
let statutImport = 201;
let corpsImport: unknown = {};

const respirer = () => new Promise((r) => setTimeout(r, 0));
async function souffler(n = 8) {
  for (let i = 0; i < n; i++) { await respirer(); flushSync(); }
}

let hote: HTMLDivElement | null = null;
let monte: Record<string, unknown> | null = null;

beforeEach(() => {
  appels = [];
  statutImport = 201;
  corpsImport = { id: 9, name: 'client', total_entries: 60, matched: 12, not_found: 48, lookup_errors: 0 };
  for (const n of get(notifications)) notifications.dismiss(n.id);
  try { localStorage.clear(); localStorage.setItem('tune-profile-id', '5'); } catch { /* sans stockage */ }
  locale.set('fr');
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal('WebSocket', class {
    close() {} addEventListener() {} removeEventListener() {} send() {}
  } as unknown as typeof WebSocket);
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const method = (init?.method ?? 'GET').toUpperCase();
    appels.push({ method, url: String(url), headers: { ...(init?.headers as Record<string, string>) } });
    const importe = method === 'POST' && /\/playlists\/import\/m3u$/.test(String(url));
    const status = importe ? statutImport : 200;
    const corps = importe ? corpsImport : (/\/playlists(\?|$)/.test(String(url)) ? [] : {});
    return {
      ok: status < 300, status, statusText: status < 300 ? 'OK' : 'Error',
      headers: new Map([['content-type', 'application/json']]),
      json: async () => corps, text: async () => JSON.stringify(corps),
    } as unknown as Response;
  }));
});

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  hote?.remove();
  hote = null;
  pendingPlaylistId.set(null);
  vi.unstubAllGlobals();
});

async function monterLeGestionnaire(): Promise<HTMLDivElement> {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(PlaylistManagerView, { target: hote, props: { onAddToPlaylist: () => {} } });
  flushSync();
  await souffler(10);
  return hote;
}

function selecteur(el: HTMLElement): HTMLInputElement {
  const input = el.querySelector<HTMLInputElement>('input[type="file"][accept*=".m3u"]');
  expect(input, 'pas de bouton Importer dans le Gestionnaire de playlists').not.toBeNull();
  return input!;
}

async function choisir(input: HTMLInputElement, f: File) {
  Object.defineProperty(input, 'files', { value: [f], configurable: true });
  input.dispatchEvent(new Event('change', { bubbles: true }));
  await souffler(10);
}

describe('Gestionnaire de playlists : import d’un fichier de playlist', () => {
  it('🔴 le bouton « Importer » est dans le Gestionnaire, à côté de « Nouvelle playlist »', async () => {
    const el = await monterLeGestionnaire();
    const input = selecteur(el);
    expect(input.accept).toBe('.m3u,.m3u8,.dpl');
    expect(el.querySelector('.create-btn')).not.toBeNull();
    expect(input.closest('label')!.parentElement).toBe(el.querySelector('.create-btn')!.parentElement);
    expect(input.closest('label')!.textContent).toContain('Importer');
  });

  it('un .m3u part vers /playlists/import/m3u avec le profil, et le bilan s’affiche', async () => {
    const el = await monterLeGestionnaire();
    const avant = appels.filter((a) => /\/playlists(\?|$)/.test(a.url) && a.method === 'GET').length;
    await choisir(selecteur(el), new File(['#EXTM3U\n/a.flac\n'], 'client.m3u'));
    const post = appels.find((a) => a.method === 'POST' && /\/playlists\/import\/m3u$/.test(a.url));
    expect(post, 'le fichier n’est pas parti vers /playlists/import/m3u').toBeDefined();
    expect(post!.headers['X-Profile-Id']).toBe('5');
    const succes = get(notifications).filter((n) => n.level === 'success').map((n) => n.message);
    expect(succes.some((m) => m.includes('12/60')), JSON.stringify(succes)).toBe(true);
    expect(succes.some((m) => m.includes('12/12'))).toBe(false);
    const apres = appels.filter((a) => /\/playlists(\?|$)/.test(a.url) && a.method === 'GET').length;
    expect(apres, 'la liste n’est pas relue après l’import').toBeGreaterThan(avant);
  });

  it('un refus du serveur se lit en clair, pas en JSON brut', async () => {
    statutImport = 400;
    corpsImport = { error: 'no file provided' };
    const el = await monterLeGestionnaire();
    await choisir(selecteur(el), new File([''], 'vide.m3u'));
    const erreurs = get(notifications).filter((n) => n.level === 'error').map((n) => n.message);
    expect(erreurs.length).toBeGreaterThan(0);
    expect(erreurs.some((m) => m.includes('{"error"'))).toBe(false);
  });
});
