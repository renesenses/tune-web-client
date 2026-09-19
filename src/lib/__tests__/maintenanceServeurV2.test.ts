// @vitest-environment jsdom
//
// Phase 5 (web#1257) — trois gestes de maintenance survivent au retrait de
// l'ancienne interface : le niveau des journaux (`SettingsView`), le nettoyage
// du serveur et « vider le cache » (`DiagnosticsView`).
//
// Tous trois partaient par chemins en dur (`fetch('/api/v1/system/log-level')`,
// `api.apiPost('/system/cleanup')`, `api.apiPost('/system/clear-cache')`),
// hors des fonctions d'`api.ts` : l'inventaire des capacités ne les voyait pas
// (`docs/capacites-sans-chemin-phase5.md`, « Angle mort »).
//
// Ce témoin MONTE les Réglages v2, ouvre Système, et agit comme un humain :
// il choisit un niveau, clique, répond aux confirmations. Il lit les requêtes
// réellement parties (`fetch` bouchonné).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import { get } from 'svelte/store';
import SettingsV2 from '../../components/v2/SettingsV2.svelte';
import { preferences } from '../stores/preferences';
import { dialogs } from '../stores/dialogs';
import lFr from '../locales/fr';

const fr = lFr as unknown as Record<string, string>;

class ResizeObserverInerte {
  observe() {}
  unobserve() {}
  disconnect() {}
}

function reponse(status: number, corps: unknown): Response {
  const texte = typeof corps === 'string' ? corps : JSON.stringify(corps);
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: String(status),
    headers: { get: () => null },
    json: async () => corps,
    text: async () => texte,
  } as unknown as Response;
}

let hote: HTMLDivElement | null = null;
let monte: Record<string, any> | null = null;
let appels: { url: string; method: string; body: string | null }[] = [];
let nettoyage: { status: number; corps: unknown };

async function attendre(tours = 6) {
  for (let i = 0; i < tours; i++) {
    await new Promise((r) => setTimeout(r, 0));
    flushSync();
  }
}

async function ouvrirSysteme(): Promise<HTMLDivElement> {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(SettingsV2, { target: hote, props: {} });
  flushSync();
  await attendre();
  const onglet = [...hote.querySelectorAll('button')].find(
    (b) => (b.textContent ?? '').trim() === fr['settings.tabSystem'],
  );
  expect(onglet, 'onglet Système introuvable').toBeDefined();
  (onglet as HTMLButtonElement).click();
  flushSync();
  await attendre();
  return hote;
}

function bouton(el: HTMLElement, libelle: string): HTMLButtonElement {
  const b = [...el.querySelectorAll('button')].find((x) => (x.textContent ?? '').trim() === libelle);
  expect(b, `bouton « ${libelle} » introuvable`).toBeDefined();
  return b as HTMLButtonElement;
}

/** Répond à la DERNIÈRE confirmation mise en file (la file survit d'un cas à l'autre). */
function repondre(oui: boolean) {
  const file = get(dialogs);
  expect(file.length, 'aucune confirmation demandée').toBeGreaterThan(0);
  dialogs.settle(file[file.length - 1].id, oui);
}

const posts = (motif: RegExp) => appels.filter((a) => a.method === 'POST' && motif.test(a.url));

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', ResizeObserverInerte);
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  appels = [];
  nettoyage = {
    status: 200,
    corps: {
      duplicate_albums_merged: 3,
      orphan_albums_deleted: 7,
      orphan_artists_deleted: 2,
      duplicate_tracks_removed: 11,
      orphan_artwork_deleted: 5,
      db_optimized: true,
    },
  };
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, options?: RequestInit) => {
      const u = String(url);
      const method = String(options?.method ?? 'GET').toUpperCase();
      const body = (options?.body as string) ?? null;
      appels.push({ url: u, method, body });
      if (/\/system\/log-level$/.test(u)) {
        if (method === 'POST') {
          const level = JSON.parse(body ?? '{}').level;
          return reponse(200, { status: 'ok', level, note: 'Log level saved. Full effect after server restart.' });
        }
        return reponse(200, { level: 'warn', available: ['error', 'warn', 'info', 'debug', 'trace'] });
      }
      if (/\/system\/cleanup$/.test(u)) return reponse(nettoyage.status, nettoyage.corps);
      if (/\/system\/clear-cache$/.test(u)) return reponse(200, { cleared: true });
      return reponse(200, {});
    }),
  );
  preferences.update((p) => ({ ...p, settingsLevel: 'expert' }));
});

afterEach(() => {
  for (const r of get(dialogs)) dialogs.settle(r.id, false);
  if (monte) unmount(monte);
  monte = null;
  if (hote) hote.remove();
  hote = null;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('Réglages v2 › Système › Santé — niveau des journaux', () => {
  it('lit le niveau du serveur et enregistre le choix par POST /system/log-level', async () => {
    const el = await ouvrirSysteme();
    const sel = el.querySelector(`select[aria-label="${fr['settings.logLevel']}"]`) as HTMLSelectElement | null;
    expect(sel, 'aucun sélecteur « Niveau de log » dans Réglages › Système').not.toBeNull();
    expect(sel!.value, 'le niveau affiché n’est pas celui du serveur').toBe('warn');

    sel!.value = 'debug';
    sel!.dispatchEvent(new Event('change', { bubbles: true }));
    await attendre();

    const post = posts(/\/system\/log-level$/);
    expect(post.length, 'aucun POST /system/log-level : le choix ne part pas').toBe(1);
    expect(JSON.parse(post[0].body!)).toEqual({ level: 'debug' });
    expect(el.textContent).toContain(fr['v2.maint.logLevelSaved'].replace('{level}', 'debug'));
  });

  it('n’est pas offert en dessous du niveau Expert, comme dans l’ancien écran', async () => {
    preferences.update((p) => ({ ...p, settingsLevel: 'intermediate' }));
    const el = await ouvrirSysteme();
    expect(el.querySelector(`select[aria-label="${fr['settings.logLevel']}"]`)).toBeNull();
  });
});

describe('Réglages v2 › Système › Santé — nettoyage du serveur', () => {
  it('demande confirmation AVANT d’appeler la route ; « non » n’envoie rien', async () => {
    const el = await ouvrirSysteme();
    bouton(el, fr['diagnostics.cleanupServer']).click();
    await attendre();
    expect(get(dialogs).at(-1)?.message).toBe(fr['v2.maint.cleanupConfirm']);
    expect(posts(/\/system\/cleanup$/).length, 'le nettoyage part avant la confirmation').toBe(0);
    repondre(false);
    await attendre();
    expect(posts(/\/system\/cleanup$/).length).toBe(0);
  });

  it('« oui » appelle POST /system/cleanup et affiche les champs que le serveur rend', async () => {
    const el = await ouvrirSysteme();
    bouton(el, fr['diagnostics.cleanupServer']).click();
    await attendre();
    repondre(true);
    await attendre();
    expect(posts(/\/system\/cleanup$/).length, 'aucun POST /system/cleanup').toBe(1);
    const texte = el.textContent ?? '';
    expect(texte).toContain(fr['v2.maint.mergedAlbums']);
    expect(texte).toContain(fr['v2.maint.dupTracks']);
    expect(texte).toContain(fr['v2.maint.orphanArtwork']);
    expect(texte).toContain(fr['v2.maint.dbOptimized']);
    expect(texte).toContain('11');
  });

  it('un refus (403 administrateur) est dit, avec le motif du serveur', async () => {
    nettoyage = { status: 403, corps: { error: 'admin required' } };
    const el = await ouvrirSysteme();
    bouton(el, fr['diagnostics.cleanupServer']).click();
    await attendre();
    repondre(true);
    await attendre();
    const err = el.querySelector('.errline');
    expect(err, 'aucune erreur affichée').not.toBeNull();
    expect(err!.textContent).toContain('admin required');
  });
});

describe('Réglages v2 › Système › Santé — rapport d’analyse (« vider le cache »)', () => {
  it('confirme, puis appelle POST /system/clear-cache et le dit', async () => {
    const el = await ouvrirSysteme();
    bouton(el, fr['v2.maint.clearScanReport']).click();
    await attendre();
    expect(posts(/\/system\/clear-cache$/).length, 'part avant la confirmation').toBe(0);
    repondre(true);
    await attendre();
    expect(posts(/\/system\/clear-cache$/).length, 'aucun POST /system/clear-cache').toBe(1);
    expect(el.textContent).toContain(fr['v2.maint.clearScanReportDone']);
  });
});
