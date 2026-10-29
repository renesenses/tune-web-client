// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import { get } from 'svelte/store';
import SettingsV2 from '../../components/v2/SettingsV2.svelte';
import { preferences } from '../stores/preferences';
import { notifications } from '../stores/notifications';
import { dialogs } from '../stores/dialogs';
import { locale } from '../i18n';
import fr from '../locales/fr';

vi.setConfig({ testTimeout: 60_000 });
let moteur: string | null;
let refuser: boolean;
let sauvegardes: unknown[];
let appels: { url: string; method: string }[];
let hote: HTMLDivElement | null = null;
let instance: Record<string, unknown> | null = null;
const MOTIF = 'file backups are SQLite-only; this server runs on PostgreSQL — use pg_dump against TUNE_DATABASE_URL';
const sauvegarde = { filename: 'preuve-simulee.db', size: 1024, created_at: '2026-10-28T12:00:00Z' };
const respirer = async () => { for (let i = 0; i < 8; i++) { await new Promise(r => setTimeout(r, 0)); flushSync(); } };
const reponse = (status: number, data: unknown) => ({
  ok: status >= 200 && status < 300, status, statusText: String(status),
  headers: { get: () => 'application/json' },
  text: async () => JSON.stringify(data), json: async () => data,
}) as unknown as Response;

beforeEach(() => {
  moteur = 'sqlite'; refuser = false; sauvegardes = []; appels = [];
  locale.set('fr');
  for (const notification of get(notifications)) notifications.dismiss(notification.id);
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.stubGlobal('fetch', vi.fn(async (input: unknown, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    appels.push({ url, method });
    if (/\/system\/config$/.test(url) && method === 'GET') return reponse(200, { db_engine: moteur, db_connected: true, music_dirs: [] });
    if (/\/system\/backups$/.test(url)) {
      if (method === 'POST') {
        if (refuser) return reponse(400, { error: MOTIF });
        sauvegardes = [sauvegarde];
        return reponse(200, sauvegarde);
      }
      return reponse(200, sauvegardes);
    }
    return reponse(200, {});
  }));
  preferences.update(p => ({ ...p, settingsLevel: 'expert' }));
});

afterEach(() => {
  for (const dialog of get(dialogs)) dialogs.settle(dialog.id, false);
  if (instance) unmount(instance);
  instance = null; hote?.remove(); hote = null;
  vi.unstubAllGlobals(); vi.restoreAllMocks();
});

async function ouvrirBase() {
  hote = document.createElement('div'); document.body.append(hote);
  instance = mount(SettingsV2, { target: hote });
  flushSync(); await respirer();
  const onglet = [...hote.querySelectorAll<HTMLButtonElement>('button')].find(b => b.textContent?.trim() === fr['settings.tabSystem']);
  expect(onglet, 'onglet Système absent').toBeDefined();
  onglet!.click(); await respirer();
  const bouton = [...hote.querySelectorAll<HTMLButtonElement>('button')].find(b => b.textContent?.trim() === fr['maintenance.createBackup']);
  expect(bouton, 'bouton de création absent, le témoin ne mesure rien').toBeDefined();
  return bouton!;
}
const creations = () => appels.filter(a => a.method === 'POST' && /\/system\/backups$/.test(a.url));

describe('web#2474 — disponibilité et refus de sauvegarde de base', () => {
  for (const engine of ['postgres', 'postgresql']) {
    it(`${engine} explique la limite et ne propose aucune création fictive`, async () => {
      moteur = engine;
      const bouton = await ouvrirBase();
      expect(bouton.disabled, 'création toujours proposée sur PostgreSQL').toBe(true);
      expect(hote!.textContent).toContain(fr['maintenance.backupPostgresHint']);
      bouton.click(); await respirer();
      expect(creations()).toHaveLength(0);
    });
  }
  it('un refus 400 réel reste lisible quand le moteur était inconnu', async () => {
    moteur = null; refuser = true;
    const bouton = await ouvrirBase();
    bouton.click(); await respirer();
    expect(creations()).toHaveLength(1);
    expect(hote!.querySelector('[role="alert"] p')?.textContent, 'motif du refus serveur avalé').toBe(fr['maintenance.backupPostgresHint']);
    expect(hote!.querySelector('[role="alert"] details')?.textContent).toContain(MOTIF);
    expect(get(notifications).some(n => n.message === fr['maintenance.backupCreated'])).toBe(false);
  });
  it('SQLite conserve la création simulée et le rechargement de la liste', async () => {
    const bouton = await ouvrirBase();
    expect(bouton.disabled).toBe(false);
    const lectures = appels.filter(a => /\/system\/backups$/.test(a.url) && a.method === 'GET').length;
    bouton.click(); await respirer();
    expect(creations()).toHaveLength(1);
    expect(appels.filter(a => /\/system\/backups$/.test(a.url) && a.method === 'GET').length).toBeGreaterThan(lectures);
    expect(hote!.textContent).toContain(sauvegarde.filename);
    expect(get(notifications).some(n => n.message === fr['maintenance.backupCreated'])).toBe(true);
  });
});
