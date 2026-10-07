// @vitest-environment jsdom
/**
 * Fil 2145 (web#1935) — un partage SMB monté, aucun dossier déclaré : la
 * bibliothèque reste vide, et la vue Bibliothèque disait seulement « Votre
 * bibliothèque est vide. ». Le testeur a conclu à une perte de sa musique.
 *
 * L'écran vide nomme désormais la cause quand elle se lit (partage monté non
 * déclaré, ou aucun dossier déclaré) et mène à la carte des dossiers. La carte
 * des Réglages relie son « Aucun dossier déclaré » au partage monté listé
 * plus bas.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { get } from 'svelte/store';
import LibraryV2 from '../../components/v2/LibraryV2.svelte';
import { albums, libraryFolderScope, libraryLoading } from '../stores/library';
import { activeView } from '../stores/navigation';
import { v2SettingsTarget } from '../stores/v2SettingsNav';
import { _remiseAZeroPourTests } from '../stores/albumsPagines';
import { t } from '../i18n';
import { causeBibliothequeVide } from '../smbMountState';
import type { SmbMount } from '../api';

function partage(p: Partial<SmbMount> = {}): SmbMount {
  return {
    id: 1,
    server: 'nas.local',
    share: 'Musique',
    mount_path: '/mnt/nas.local_Musique',
    username: null,
    active: true,
    mounted: true,
    mount_state: 'mounted',
    last_mount_error: null,
    smb_version: 'negocie',
    ...p,
  } as SmbMount;
}

describe('causeBibliothequeVide', () => {
  it('partage monté, aucun dossier déclaré → le partage est nommé', () => {
    expect(causeBibliothequeVide([], [partage()])).toEqual({
      cause: 'partageNonDeclare',
      partages: ['\\\\nas.local\\Musique'],
    });
  });

  it('un dossier déclaré ailleurs ne couvre pas le partage monté', () => {
    expect(causeBibliothequeVide(['/home/musique'], [partage()])?.cause).toBe('partageNonDeclare');
  });

  it('aucun dossier, aucun partage (ou partage non monté) → aucunDossier', () => {
    expect(causeBibliothequeVide([], [])).toEqual({ cause: 'aucunDossier' });
    expect(causeBibliothequeVide([], [partage({ mounted: false })])).toEqual({ cause: 'aucunDossier' });
  });

  it('le partage est déclaré → rien de plus précis à dire', () => {
    expect(causeBibliothequeVide(['/mnt/nas.local_Musique'], [partage()])).toBeNull();
    expect(causeBibliothequeVide(['/home/musique'], [])).toBeNull();
  });
});

// ── La Bibliothèque montée, vide ────────────────────────────────────────────

let config: Record<string, unknown> = {};
let partages: SmbMount[] = [];
function reponse(corps: unknown): Response {
  const texte = JSON.stringify(corps);
  return {
    ok: true, status: 200, statusText: 'OK',
    headers: new Map([['content-type', 'application/json']]),
    json: async () => corps, text: async () => texte,
  } as unknown as Response;
}
function servir(url: string): Response {
  const u = new URL(url, 'http://tune.test');
  if (u.pathname.endsWith('/library/albums')) {
    const limit = Number(u.searchParams.get('limit') ?? 50);
    return reponse({ items: [], total: 0, limit, offset: 0 });
  }
  if (u.pathname.endsWith('/system/config')) return reponse(config);
  if (u.pathname.endsWith('/network/smb/mounts')) return reponse(partages);
  return reponse([]);
}

let hote: HTMLDivElement | null = null;
let monte: Record<string, any> | null = null;
const attendre = (ms = 40) => new Promise((r) => setTimeout(r, ms));
async function poser() {
  for (let i = 0; i < 4; i++) { flushSync(); await attendre(); }
  flushSync();
}
async function ecranMonte(): Promise<HTMLDivElement> {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(LibraryV2, { target: hote, props: {} });
  await poser();
  return hote;
}

beforeEach(() => {
  try { localStorage.clear(); } catch { /* stockage indisponible */ }
  config = {};
  partages = [];
  _remiseAZeroPourTests();
  vi.stubGlobal('fetch', vi.fn(async (entree: any) => {
    const url = typeof entree === 'string' ? entree : entree?.url ?? String(entree);
    return servir(url);
  }));
  vi.stubGlobal('IntersectionObserver', class {
    observe() {} unobserve() {} disconnect() {}
  } as unknown as typeof IntersectionObserver);
  vi.stubGlobal('requestAnimationFrame', (f: FrameRequestCallback) => { setTimeout(() => f(0), 0); return 1; });
  vi.stubGlobal('cancelAnimationFrame', () => {});
  vi.stubGlobal('WebSocket', class {
    close() {} addEventListener() {} removeEventListener() {} send() {}
  } as unknown as typeof WebSocket);
  vi.stubGlobal('ResizeObserver', class {
    observe() {} unobserve() {} disconnect() {}
  } as unknown as typeof ResizeObserver);
  activeView.set('library');
  v2SettingsTarget.set(null as any);
  libraryFolderScope.set(null as any);
  libraryLoading.set(false);
  albums.set([]);
});
afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  if (hote) hote.remove();
  hote = null;
  albums.set([]);
  _remiseAZeroPourTests();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('fil 2145 — la Bibliothèque vide dit pourquoi', () => {
  it('partage monté, aucun dossier : le partage est nommé, et le bouton mène aux dossiers', { timeout: 60_000 }, async () => {
    config = { music_dirs: [] };
    partages = [partage()];
    const el = await ecranMonte();
    const cause = el.querySelector('.state .cause-vide');
    expect(cause, 'la cause de la bibliothèque vide n’est pas dite').not.toBeNull();
    expect(cause!.textContent).toContain('\\\\nas.local\\Musique');
    expect(cause!.textContent).toBe(
      get(t)('v2.lib.emptyShareNotDeclared' as any).replace('{partages}', '\\\\nas.local\\Musique'),
    );
    const bouton = el.querySelector('.state button.chip') as HTMLButtonElement | null;
    expect(bouton?.textContent).toBe(get(t)('v2.lib.emptyOpenFolders' as any));
    bouton!.click();
    flushSync();
    expect(get(activeView)).toBe('settings');
    expect(get(v2SettingsTarget)).toMatchObject({ tab: 'library', section: 'musicDirs' });
  });

  it('aucun dossier, aucun partage : « aucun dossier déclaré »', { timeout: 60_000 }, async () => {
    config = { music_dirs: [] };
    const el = await ecranMonte();
    expect(el.querySelector('.state .cause-vide')?.textContent).toBe(get(t)('v2.lib.emptyNoFolder' as any));
  });

  it('dossier déclaré, partage lu : rien de plus que « bibliothèque vide »', { timeout: 60_000 }, async () => {
    config = { music_dirs: ['/mnt/nas.local_Musique'] };
    partages = [partage()];
    const el = await ecranMonte();
    expect(el.querySelector('.state')?.textContent).toContain(get(t)('v2.lib.emptyLibrary' as any));
    expect(el.querySelector('.state .cause-vide')).toBeNull();
  });
});

describe('fil 2145 — Réglages : « aucun dossier » relié au partage monté', () => {
  it('SettingsV2 affiche l’indication quand un partage monté est à ajouter', () => {
    const src = readFileSync(resolve(process.cwd(), 'src/components/v2/SettingsV2.svelte'), 'utf-8');
    const i = src.indexOf("$t('settings.noFolderDeclared' as any)");
    expect(i).toBeGreaterThan(-1);
    const suite = src.slice(i, i + 600);
    expect(suite).toContain('smbMounts.some((m) => proposerAjout(m, musicDirs))');
    expect(suite).toContain("$t('settings.noFolderShareMounted' as any)");
  });
});
