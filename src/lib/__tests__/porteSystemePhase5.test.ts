// @vitest-environment jsdom
//
// Phase 5 (web#1257) — « aucune perte d'accès ». Domaine Système de
// `docs/capacites-sans-chemin-phase5.md` : chaque fonction d'`api.ts` qui
// n'avait de chemin que par l'ancienne interface doit en avoir un en v2.
//
// 🔴 CES TÉMOINS MONTENT LES VRAIS ÉCRANS. `../api` est bouchonné ; on clique,
// on répond à la confirmation comme `DialogContainer` le ferait, et on regarde
// quelle fonction d'`api.ts` l'écran a appelée, avec quoi.
//
// Contre-épreuve (faite à la main, consignée dans la PR) : retirer l'appel de
// l'écran — ou le branchement dans SettingsV2 / TuneHealthV2 — rend le témoin
// correspondant rouge.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import { get } from 'svelte/store';

const m = vi.hoisted(() => ({
  getBackups: vi.fn(),
  createBackup: vi.fn(),
  restoreBackup: vi.fn(),
  exportDatabaseUrl: vi.fn(() => '/api/v1/system/database/export'),
  importDatabase: vi.fn(),
  rebuildFts: vi.fn(),
  importRoon: vi.fn(),
  importPlex: vi.fn(),
  importPlaylists: vi.fn(),
  getHealthMonitor: vi.fn(),
  getBackgroundTasks: vi.fn(),
  rearmAsioWarmScan: vi.fn(),
  getYoutubeStatus: vi.fn(),
  enableYoutubePlayback: vi.fn(),
  triggerEnrich: vi.fn(),
  getConfig: vi.fn(),
}));

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return {
    ...actual,
    ...m,
    apiFetch: vi.fn(async () => ({})),
    getStats: vi.fn(async () => ({})),
    getHealth: vi.fn(async () => ({ status: 'ok' })),
    getScanSchedule: vi.fn(async () => ({ enabled: false, time: '03:00' })),
    getScanStatus: vi.fn(async () => ({ scanning: false })),
    getScanReport: vi.fn(async () => null),
    listServiceTokens: vi.fn(async () => []),
    getBatchEnrichStatus: vi.fn(async () => ({ status: 'idle' })),
    enrichArtistImagesStatus: vi.fn(async () => ({ artists_without_image: 0 })),
  };
});

import MaintenanceBaseV2 from '../../components/v2/MaintenanceBaseV2.svelte';
import ImportLecteurV2 from '../../components/v2/ImportLecteurV2.svelte';
import SurveillanceServeurV2 from '../../components/v2/SurveillanceServeurV2.svelte';
import LectureYoutubeV2 from '../../components/v2/LectureYoutubeV2.svelte';
import SettingsV2 from '../../components/v2/SettingsV2.svelte';
import TuneHealthV2 from '../../components/v2/TuneHealthV2.svelte';
import { dialogs } from '../stores/dialogs';
import { preferences } from '../stores/preferences';
import { v2SettingsTarget } from '../stores/v2SettingsNav';
import lFr from '../locales/fr';
const fr = lFr as unknown as Record<string, string>;

class ResizeObserverInerte { observe() {} unobserve() {} disconnect() {} }

const respirer = () => new Promise((r) => setTimeout(r, 0));
async function laisser() { for (let i = 0; i < 6; i++) await respirer(); flushSync(); }

let hote: HTMLDivElement | null = null;
let monte: Record<string, unknown> | null = null;

async function poser(C: any, props: Record<string, unknown> = {}): Promise<HTMLDivElement> {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(C, { target: hote, props });
  flushSync();
  await laisser();
  return hote;
}

const texte = (el: HTMLElement) => (el.textContent ?? '').replace(/\s+/g, ' ');
const bouton = (el: HTMLElement, libelle: string) =>
  [...el.querySelectorAll('button')].find((b) => (b.textContent ?? '').trim() === libelle) as HTMLButtonElement | undefined;

/** Pose un fichier dans un `<input type=file>` et déclenche `change`, comme un choix humain. */
function choisirFichier(input: HTMLInputElement, f: File) {
  Object.defineProperty(input, 'files', { configurable: true, value: [f] });
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

async function repondre(ok: boolean) {
  const d = get(dialogs)[0];
  expect(d, 'aucune confirmation en attente').toBeDefined();
  dialogs.settle(d.id, ok);
  await laisser();
}

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', ResizeObserverInerte);
  for (const f of Object.values(m)) f.mockReset();
  m.exportDatabaseUrl.mockReturnValue('/api/v1/system/database/export');
  m.getBackups.mockResolvedValue([{ filename: 'tune-20260919.db', size: 2048, created_at: '2026-09-19T10:00:00Z' }]);
  m.createBackup.mockResolvedValue({ filename: 'tune-new.db', size: 1, created_at: '2026-09-19T11:00:00Z' });
  m.restoreBackup.mockResolvedValue({ restored: true });
  m.importDatabase.mockResolvedValue({ imported: true, engine: 'sqlite', size: 1048576, restart_required: true });
  m.rebuildFts.mockResolvedValue({ status: 'ok', rows_indexed: 1234, message: '' });
  const rapport = { source: 'roon', total_rows: 3, matched: 2, unmatched: 1, play_counts_updated: 0, ratings_updated: 0, history_entries_added: 0, playlists_created: 0, details: [] };
  m.importRoon.mockResolvedValue(rapport);
  m.importPlex.mockResolvedValue(rapport);
  m.importPlaylists.mockResolvedValue(rapport);
  m.getHealthMonitor.mockResolvedValue({ status: 'warning', uptime_seconds: 10, checks: { disk: { status: 'warning' } }, alerts: [{ timestamp: 'x', level: 'warning', category: 'disk', message: 'Disque presque plein' }] });
  m.getBackgroundTasks.mockResolvedValue({ tasks: [{ id: 'artist_artwork', label: 'Portraits d’artistes', kind: 'enrich', progress: { processed: 5, total: 10, detail: 'Images' } }] });
  m.rearmAsioWarmScan.mockResolvedValue({ status: 'rearmed', retry: 'next_restart', message: '', asio_warm_scan: {} });
  m.getYoutubeStatus.mockResolvedValue({ installed: false, version: null, status: 'absent' });
  m.enableYoutubePlayback.mockResolvedValue({ status: 'downloading', installed: false });
  m.triggerEnrich.mockResolvedValue({ status: 'enrichment_started' });
  m.getConfig.mockResolvedValue({ music_dirs: [], db_engine: 'sqlite', db_connected: true });
  for (const d of get(dialogs)) dialogs.settle(d.id, false);
});

afterEach(() => {
  if (monte) unmount(monte as any);
  monte = null;
  hote?.remove();
  hote = null;
  v2SettingsTarget.set(null);
  vi.unstubAllGlobals();
});

describe('Sauvegardes, export/import de base, index de recherche — MaintenanceBaseV2', () => {
  it('liste les sauvegardes (getBackups) et en crée une (createBackup)', async () => {
    const el = await poser(MaintenanceBaseV2, { moteur: 'sqlite' });
    expect(m.getBackups).toHaveBeenCalled();
    expect(texte(el)).toContain('tune-20260919.db');
    bouton(el, fr['maintenance.createBackup'])!.click();
    await laisser();
    expect(m.createBackup).toHaveBeenCalledTimes(1);
    expect(texte(el)).toContain(fr['maintenance.backupCreated']);
  });

  it('restaure une sauvegarde APRÈS confirmation danger (restoreBackup), rien sur refus', async () => {
    const el = await poser(MaintenanceBaseV2, { moteur: 'sqlite' });
    bouton(el, fr['maintenance.restore'])!.click();
    await laisser();
    expect(get(dialogs)[0]?.danger).toBe(true);
    await repondre(false);
    expect(m.restoreBackup).not.toHaveBeenCalled();

    bouton(el, fr['maintenance.restore'])!.click();
    await laisser();
    await repondre(true);
    expect(m.restoreBackup).toHaveBeenCalledWith('tune-20260919.db');
    expect(texte(el)).toContain(fr['maintenance.restoreSuccess']);
  });

  it('PostgreSQL : aucune sauvegarde demandée, l’écran le dit', async () => {
    const el = await poser(MaintenanceBaseV2, { moteur: 'postgres' });
    expect(m.getBackups).not.toHaveBeenCalled();
    expect(texte(el)).toContain(fr['v2.maint.backupsSqliteOnly']);
  });

  it('exporte la base par le lien d’exportDatabaseUrl', async () => {
    const el = await poser(MaintenanceBaseV2, { moteur: 'sqlite' });
    expect(m.exportDatabaseUrl).toHaveBeenCalled();
    const a = el.querySelector('a.exporter') as HTMLAnchorElement;
    expect(a.getAttribute('href')).toBe('/api/v1/system/database/export');
  });

  it('importe une base APRÈS confirmation danger (importDatabase)', async () => {
    const el = await poser(MaintenanceBaseV2, { moteur: 'sqlite' });
    const f = new File(['x'], 'tune.db');
    choisirFichier(el.querySelector('input.importer') as HTMLInputElement, f);
    await laisser();
    expect(get(dialogs)[0]?.danger).toBe(true);
    expect(get(dialogs)[0]?.message).toContain('tune.db');
    await repondre(true);
    expect(m.importDatabase).toHaveBeenCalledWith(f);
    expect(texte(el)).toContain(fr['settings.importDbSuccess']);
  });

  it('reconstruit l’index de recherche (rebuildFts)', async () => {
    const el = await poser(MaintenanceBaseV2, { moteur: 'sqlite' });
    bouton(el, fr['settings.rebuildIndex'])!.click();
    await laisser();
    expect(m.rebuildFts).toHaveBeenCalledTimes(1);
    expect(texte(el)).toContain('1234');
  });
});

describe('Import depuis un autre lecteur — ImportLecteurV2', () => {
  for (const [source, fn] of [['roon', 'importRoon'], ['plex', 'importPlex'], ['playlists', 'importPlaylists']] as const) {
    it(`${source} : aperçu (${fn}(f, true)) puis import confirmé (${fn}(f, false))`, async () => {
      const el = await poser(ImportLecteurV2);
      const f = new File(['a,b'], `export-${source}.txt`);
      choisirFichier(el.querySelector(`input.choix-${source}`) as HTMLInputElement, f);
      await laisser();
      expect(m[fn]).toHaveBeenCalledWith(f, true);
      expect(texte(el)).toContain(fr['import.preview']);
      bouton(el, fr['import.confirm'])!.click();
      await laisser();
      expect(m[fn]).toHaveBeenLastCalledWith(f, false);
      expect(texte(el)).toContain(fr['import.done']);
    });
  }

  it('aperçu vide : pas de confirmation possible', async () => {
    m.importRoon.mockResolvedValue({ total_rows: 0, matched: 0, unmatched: 0, details: [] });
    const el = await poser(ImportLecteurV2);
    choisirFichier(el.querySelector('input.choix-roon') as HTMLInputElement, new File(['x'], 'vide.csv'));
    await laisser();
    expect(texte(el)).toContain(fr['import.noData']);
    expect(bouton(el, fr['import.confirm'])).toBeUndefined();
  });
});

describe('Surveillance du serveur — SurveillanceServeurV2', () => {
  it('lit la surveillance (getHealthMonitor) et les tâches de fond (getBackgroundTasks)', async () => {
    const el = await poser(SurveillanceServeurV2, { asio: null });
    expect(m.getHealthMonitor).toHaveBeenCalled();
    expect(m.getBackgroundTasks).toHaveBeenCalled();
    expect(texte(el)).toContain(fr['v2.sys.monitorWarning']);
    expect(texte(el)).toContain('Disque presque plein');
    expect(texte(el)).toContain('Portraits d’artistes');
    expect(texte(el)).toContain('5 / 10');
  });

  it('balayage ASIO bloqué : réarmer APRÈS confirmation (rearmAsioWarmScan)', async () => {
    const el = await poser(SurveillanceServeurV2, { asio: { blocked_after_crash: true } });
    bouton(el, fr['diagnostics.asioWarmRearm'])!.click();
    await laisser();
    await repondre(true);
    expect(m.rearmAsioWarmScan).toHaveBeenCalledTimes(1);
    expect(texte(el)).toContain(fr['diagnostics.asioWarmRearmed']);
  });

  it('balayage ASIO non bloqué : aucun bouton de réarmement', async () => {
    const el = await poser(SurveillanceServeurV2, { asio: { blocked_after_crash: false } });
    expect(bouton(el, fr['diagnostics.asioWarmRearm'])).toBeUndefined();
  });
});

describe('Lecture YouTube — LectureYoutubeV2', () => {
  it('lit l’état (getYoutubeStatus) et active (enableYoutubePlayback)', async () => {
    const el = await poser(LectureYoutubeV2);
    expect(m.getYoutubeStatus).toHaveBeenCalled();
    bouton(el, fr['settings.youtubePlaybackEnable'])!.click();
    await laisser();
    expect(m.enableYoutubePlayback).toHaveBeenCalledTimes(1);
  });
});

describe('Le CHEMIN : chaque bloc est monté dans les Réglages v2', () => {
  async function ouvrir(tab: string, section: string) {
    preferences.update((p) => ({ ...p, settingsLevel: 'expert' }));
    v2SettingsTarget.set({ tab: tab as any, section });
    return poser(SettingsV2);
  }

  it('Système › Base de données : bouton « Créer une sauvegarde »', async () => {
    const el = await ouvrir('system', 'database');
    expect(bouton(el, fr['maintenance.createBackup'])).toBeDefined();
    expect(el.querySelector('a.exporter')).not.toBeNull();
    expect(bouton(el, fr['settings.rebuildIndex'])).toBeDefined();
  });

  it('Système › Import : les trois sources', async () => {
    const el = await ouvrir('system', 'import');
    for (const s of ['roon', 'plex', 'playlists']) expect(el.querySelector(`input.choix-${s}`)).not.toBeNull();
  });

  it('Tune Health : la surveillance et les tâches de fond y sont montées', async () => {
    const el = await poser(TuneHealthV2);
    await laisser();
    expect(m.getHealthMonitor).toHaveBeenCalled();
    expect(m.getBackgroundTasks).toHaveBeenCalled();
    expect(texte(el)).toContain(fr['v2.sys.monitorTitle']);
  });

  it('Accès › Lecture YouTube', async () => {
    const el = await ouvrir('access', 'youtubePlayback');
    expect(bouton(el, fr['settings.youtubePlaybackEnable'])).toBeDefined();
  });

  it('Bibliothèque › Enrichissement : « Pochettes & images » appelle triggerEnrich', async () => {
    const el = await ouvrir('library', 'enrichment');
    bouton(el, fr['settings.enrichNow'])!.click();
    await laisser();
    expect(m.triggerEnrich).toHaveBeenCalledTimes(1);
    expect(texte(el)).toContain(fr['settings.enrichStarted']);
  });
});
