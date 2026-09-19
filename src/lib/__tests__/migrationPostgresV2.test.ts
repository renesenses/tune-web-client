// @vitest-environment jsdom
//
// Phase 5 (web#1257) — la bascule SQLite → PostgreSQL survit au retrait de
// l'ancienne interface.
//
// Elle n'existait que dans l'ancien `SettingsView`, par `fetch` direct vers
// `POST /system/database/test-connection` et `/system/database/migrate` —
// hors des fonctions d'`api.ts`, donc invisible pour l'inventaire des
// capacités (`docs/capacites-sans-chemin-phase5.md`, « Angle mort »).
//
// Ce témoin MONTE les Réglages v2, ouvre Système, saisit une adresse, teste,
// répond à la confirmation et migre. Il lit les requêtes réellement parties.
//
// Le sens PostgreSQL → SQLite n'est pas porté, et c'est voulu : le serveur ne
// l'implémente pas (voir `api.migrateDatabaseToPostgres`). Le dernier cas
// tient qu'aucun bouton ne le promet.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import { get } from 'svelte/store';
import SettingsV2 from '../../components/v2/SettingsV2.svelte';
import { preferences } from '../stores/preferences';
import { dialogs } from '../stores/dialogs';
import lFr from '../locales/fr';

const fr = lFr as unknown as Record<string, string>;
const ADRESSE = 'postgresql://tune:secret@db:5432/tune';

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
let moteur: string;
let essai: { status: number; corps: unknown };
let migration: { status: number; corps: unknown };

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

function bouton(el: HTMLElement, libelle: string): HTMLButtonElement | undefined {
  return [...el.querySelectorAll('button')].find((x) => (x.textContent ?? '').trim() === libelle) as
    | HTMLButtonElement
    | undefined;
}

function saisir(el: HTMLElement, valeur: string) {
  const champ = el.querySelector(`input[aria-label="${fr['settings.migrateToPostgres']}"]`) as HTMLInputElement | null;
  expect(champ, 'aucun champ d’adresse PostgreSQL dans Réglages › Système › Base de données').not.toBeNull();
  champ!.value = valeur;
  champ!.dispatchEvent(new Event('input', { bubbles: true }));
  flushSync();
}

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
  moteur = 'sqlite';
  essai = { status: 200, corps: { ok: true, status: 'ok', engine: 'postgres', version: '16.2', database_created: false } };
  migration = { status: 200, corps: { status: 'complete', restarting: false, env_path: null, total_rows: 48213, errors: [] } };
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, options?: RequestInit) => {
      const u = String(url);
      const method = String(options?.method ?? 'GET').toUpperCase();
      appels.push({ url: u, method, body: (options?.body as string) ?? null });
      if (/\/system\/config$/.test(u) && method === 'GET') return reponse(200, { db_engine: moteur, db_connected: true, music_dirs: [] });
      if (/\/system\/database\/test-connection/.test(u)) return reponse(essai.status, essai.corps);
      if (/\/system\/database\/migrate/.test(u)) return reponse(migration.status, migration.corps);
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

describe('Réglages v2 › Système › Base de données — SQLite → PostgreSQL', () => {
  it('« Migrer » reste fermé tant que l’adresse n’a pas été testée', async () => {
    const el = await ouvrirSysteme();
    saisir(el, ADRESSE);
    const migrer = bouton(el, fr['settings.migrate']);
    expect(migrer, 'aucun bouton « Migrer »').toBeDefined();
    expect(migrer!.disabled).toBe(true);
  });

  it('tester envoie l’adresse dans le CORPS (pas dans l’URL) et affiche la version', async () => {
    const el = await ouvrirSysteme();
    saisir(el, ADRESSE);
    bouton(el, fr['settings.testConnection'])!.click();
    await attendre();
    const post = posts(/\/system\/database\/test-connection/);
    expect(post.length, 'aucun POST /system/database/test-connection').toBe(1);
    expect(post[0].url, 'le mot de passe part dans l’URL').not.toContain('secret');
    expect(JSON.parse(post[0].body!)).toEqual({ engine: 'postgresql', url: ADRESSE });
    expect(el.textContent).toContain(`PostgreSQL 16.2 — ${fr['settings.connectionOk']}`);
    expect(bouton(el, fr['settings.migrate'])!.disabled).toBe(false);
  });

  it('un échec de connexion affiche le motif ET l’indice du serveur, sans ouvrir « Migrer »', async () => {
    essai = { status: 503, corps: { ok: false, status: 'error', error: 'password authentication failed', hint: 'check the user' } };
    const el = await ouvrirSysteme();
    saisir(el, ADRESSE);
    bouton(el, fr['settings.testConnection'])!.click();
    await attendre();
    const err = el.querySelector('.errline');
    expect(err, 'aucune erreur affichée').not.toBeNull();
    expect(err!.textContent).toContain('password authentication failed');
    expect(err!.textContent).toContain('check the user');
    expect(bouton(el, fr['settings.migrate'])!.disabled).toBe(true);
  });

  it('migrer demande confirmation ; « non » n’envoie rien', async () => {
    const el = await ouvrirSysteme();
    saisir(el, ADRESSE);
    bouton(el, fr['settings.testConnection'])!.click();
    await attendre();
    bouton(el, fr['settings.migrate'])!.click();
    await attendre();
    const dernier = get(dialogs).at(-1);
    expect(dernier?.message).toBe(fr['v2.db.migrateConfirm']);
    repondre(false);
    await attendre();
    expect(posts(/\/system\/database\/migrate/).length).toBe(0);
  });

  it('un refus de migration est dit, avec le motif', async () => {
    migration = { status: 500, corps: { status: 'error', error: 'relation already exists', hint: 'empty the target' } };
    const el = await ouvrirSysteme();
    saisir(el, ADRESSE);
    bouton(el, fr['settings.testConnection'])!.click();
    await attendre();
    bouton(el, fr['settings.migrate'])!.click();
    await attendre();
    repondre(true);
    await attendre();
    const err = [...el.querySelectorAll('.errline')].map((e) => e.textContent ?? '').join(' ');
    expect(err).toContain(fr['settings.migrationError']);
    expect(err).toContain('relation already exists');
  });

  it('sans redémarrage possible, l’écran dit que le serveur reste sur SQLite', async () => {
    const el = await ouvrirSysteme();
    saisir(el, ADRESSE);
    bouton(el, fr['settings.testConnection'])!.click();
    await attendre();
    bouton(el, fr['settings.migrate'])!.click();
    await attendre();
    repondre(true);
    await attendre();
    const post = posts(/\/system\/database\/migrate/);
    expect(post.length, 'aucun POST /system/database/migrate').toBe(1);
    expect(JSON.parse(post[0].body!)).toEqual({ url: ADRESSE });
    expect(el.textContent).toContain(fr['v2.db.migrateNoRestart'].replace('{rows}', '48213'));
  });

  it('sur PostgreSQL, rien n’est proposé : le serveur ne sait pas migrer vers SQLite', async () => {
    moteur = 'postgres';
    const el = await ouvrirSysteme();
    expect(el.querySelector(`input[aria-label="${fr['settings.migrateToPostgres']}"]`)).toBeNull();
    expect(bouton(el, fr['settings.migrateToSqliteBtn'])).toBeUndefined();
  });

  it('migration réussie : l’écran annonce le redémarrage sur PostgreSQL', async () => {
    migration = { status: 200, corps: { status: 'complete', restarting: true, env_path: '/srv/.env', total_rows: 48213, errors: [] } };
    const el = await ouvrirSysteme();
    saisir(el, ADRESSE);
    bouton(el, fr['settings.testConnection'])!.click();
    await attendre();
    bouton(el, fr['settings.migrate'])!.click();
    await attendre();
    repondre(true);
    await attendre();
    expect(el.textContent).toContain(fr['v2.db.migrateDone'].replace('{rows}', '48213'));
  });
});
