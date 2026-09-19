// @vitest-environment jsdom
//
// Écoute hors ligne — portée en v2 avant la phase 5 (web#1257), qui retire
// `OfflineView.svelte`, seul écran à appeler ces cinq fonctions d'`api.ts`.
//
// 🔴 CES TÉMOINS MONTENT LE VRAI COMPOSANT. `../api` est moqué avec la charge
// utile du CONTRAT SERVEUR (`tune-server/src/routes/offline.rs` :
// `track_title`, `file_size`, `status: 'completed'`), pas avec les noms que
// l'ancien écran croyait lire. La confirmation de « Tout supprimer » est
// observée dans le bus `dialogs` — le témoin ne fait que RÉPONDRE, comme le
// ferait `DialogContainer` sous le doigt d'un humain.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const mocks = vi.hoisted(() => ({
  getOfflineStatus: vi.fn(),
  getOfflineDownloads: vi.fn(),
  syncOffline: vi.fn(),
  removeOfflineDownload: vi.fn(),
  clearOffline: vi.fn(),
}));
vi.mock('../api', () => mocks);

import HorsLigneV2 from '../../components/v2/HorsLigneV2.svelte';
import { dialogs } from '../stores/dialogs';
import { get } from 'svelte/store';
import { V2_SETTINGS } from '../v2Settings';
import { lireTelechargement, lireEtat } from '../horsLigne';

const respirer = () => new Promise((r) => setTimeout(r, 0));
async function laisserCharger() { for (let i = 0; i < 5; i++) await respirer(); flushSync(); }

let hote: HTMLDivElement | null = null;
let monte: Record<string, unknown> | null = null;

async function poser(): Promise<HTMLDivElement> {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(HorsLigneV2, { target: hote });
  flushSync();
  await laisserCharger();
  return hote;
}

/** Deux entrées telles que `GET /offline/downloads` les rend. */
const LIGNES = [
  { id: 7, source: 'qobuz', source_id: '123', track_title: 'So What', artist_name: 'Miles Davis',
    album_title: 'Kind of Blue', file_size: 31_457_280, quality: 'lossless', status: 'completed', error: null, downloaded_at: '2026-09-18' },
  { id: 8, source: 'qobuz', source_id: '124', track_title: 'Blue in Green', artist_name: 'Miles Davis',
    album_title: 'Kind of Blue', file_size: null, quality: 'lossless', status: 'error', error: 'HTTP 403', downloaded_at: '2026-09-18' },
];
const ETAT = { total: 2, size_bytes: 31_457_280, total_tracks: 2, completed: 1, pending: 0 };

const texte = (el: HTMLElement) => (el.textContent ?? '').replace(/\s+/g, ' ');
const bouton = (el: HTMLElement, sel: string) => el.querySelector(sel) as HTMLButtonElement;

/** Répond à la confirmation en tête de file, comme `DialogContainer`. */
function repondre(valeur: boolean) {
  const [tete] = get(dialogs);
  expect(tete, 'aucune confirmation demandée').toBeTruthy();
  expect(tete.danger).toBe(true);
  dialogs.settle(tete.id, valeur);
}

beforeEach(() => {
  for (const m of Object.values(mocks)) m.mockReset();
  mocks.getOfflineStatus.mockResolvedValue(ETAT);
  mocks.getOfflineDownloads.mockResolvedValue(LIGNES);
  mocks.syncOffline.mockResolvedValue({ synced: true, missing_cleaned: 0, errors_retried: 1 });
  mocks.removeOfflineDownload.mockResolvedValue(undefined);
  mocks.clearOffline.mockResolvedValue({ cleared: true, files_removed: 1 });
});

afterEach(() => {
  if (monte) unmount(monte as any);
  monte = null;
  hote?.remove();
  hote = null;
  for (const d of get(dialogs)) dialogs.settle(d.id, false);
});

describe('Hors ligne v2 — le chemin existe', () => {
  it('la section est dans l’onglet Bibliothèque, et SettingsV2 monte le composant', () => {
    const lib = V2_SETTINGS.find((x) => x.id === 'library')!;
    expect(lib.sections.map((s) => s.id)).toContain('offline');
    const src = readFileSync(join(__dirname, '../../components/v2/SettingsV2.svelte'), 'utf8');
    expect(src).toMatch(/s\.id === 'offline'\}\s*<HorsLigneV2 \/>/);
  });
});

describe('Hors ligne v2 — les cinq gestes', () => {
  it('1. getOfflineStatus + getOfflineDownloads : le contrat du serveur se lit (titre, statut « completed », taille)', async () => {
    const el = await poser();
    expect(mocks.getOfflineStatus).toHaveBeenCalled();
    expect(mocks.getOfflineDownloads).toHaveBeenCalled();
    const t = texte(el);
    expect(t).toContain('So What');
    expect(t).toContain('Miles Davis — Kind of Blue');
    expect(t).toContain('Téléchargée');
    expect(t).toContain('30.0 MB');
    expect(t).toContain('Erreur');
    expect(el.querySelectorAll('li.piste').length).toBe(2);
  });

  it('2. syncOffline : le clic synchronise puis relit la liste', async () => {
    const el = await poser();
    const avant = mocks.getOfflineDownloads.mock.calls.length;
    bouton(el, 'button.synchro').click();
    await laisserCharger();
    expect(mocks.syncOffline).toHaveBeenCalledTimes(1);
    expect(mocks.getOfflineDownloads.mock.calls.length).toBeGreaterThan(avant);
  });

  it('3. removeOfflineDownload : retire LA piste visée, la ligne disparaît', async () => {
    const el = await poser();
    (el.querySelectorAll('button.retirer')[0] as HTMLButtonElement).click();
    await laisserCharger();
    expect(mocks.removeOfflineDownload).toHaveBeenCalledWith('7');
    expect(el.querySelectorAll('li.piste').length).toBe(1);
    expect(texte(el)).not.toContain('So What');
  });

  it('4. clearOffline : refusé à la confirmation ⇒ rien ; accepté ⇒ tout effacé', async () => {
    const el = await poser();
    bouton(el, 'button.effacer').click();
    await respirer();
    repondre(false);
    await laisserCharger();
    expect(mocks.clearOffline).not.toHaveBeenCalled();

    mocks.getOfflineDownloads.mockResolvedValue([]);
    bouton(el, 'button.effacer').click();
    await respirer();
    repondre(true);
    await laisserCharger();
    expect(mocks.clearOffline).toHaveBeenCalledTimes(1);
    expect(el.querySelectorAll('li.piste').length).toBe(0);
    expect(texte(el)).toContain('Aucun téléchargement');
  });
});

describe('lib/horsLigne — lecture du contrat', () => {
  it('noms du serveur ET anciens noms', () => {
    expect(lireTelechargement({ id: 1, track_title: 'A', status: 'completed', file_size: 10 }))
      .toMatchObject({ id: '1', titre: 'A', statut: 'complete', taille: 10 });
    expect(lireTelechargement({ id: 'x', title: 'B', status: 'complete', size_bytes: 5 }))
      .toMatchObject({ titre: 'B', statut: 'complete', taille: 5 });
    expect(lireTelechargement({ track_title: 'sans id' })).toBeNull();
    expect(lireEtat({ total_tracks: 3, total_size_bytes: 9, pending: 1 })).toEqual({ total: 3, taille: 9, enAttente: 1 });
  });
});
