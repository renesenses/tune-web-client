// @vitest-environment jsdom
//
// web#2635 (laguespa, fil 2510, go de Bertrand du 03/11/2026) — Réglages ›
// Bibliothèque : la case « Importer les playlists .m3u/.pls trouvées au scan »
// (`scan_import_playlists`, servie par /system/config mais affichée nulle
// part), et le retrait groupé des playlists importées au scan.
//
// Ce banc monte le vrai SettingsV2 avec un serveur simulé et tient :
// 1. la case existe, cochée par défaut, lit la valeur du serveur, et la
//    décocher envoie `PATCH { scan_import_playlists: false }` ;
// 2. le retrait liste les playlists du profil 1 (propriétaire de celles du
//    scan), demande confirmation AVEC le nombre, et ne supprime que celles qui
//    portent la description « Importée au scan » ;
// 3. annuler la confirmation ne supprime rien ;
// 4. les libellés existent dans toutes les langues.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import { get } from 'svelte/store';

import SettingsV2 from '../../components/v2/SettingsV2.svelte';
import { preferences } from '../stores/preferences';
import { dialogs } from '../stores/dialogs';
import {
  CLE_IMPORT_PLAYLISTS_SCAN,
  DESCRIPTION_IMPORT_SCAN,
  estImporteeAuScan,
  importPlaylistsScanDepuisConfig,
  retirerPlaylists,
} from '../playlistsDuScan';
import { dictionnaire, ONZE_LANGUES } from './onzeDictionnaires';
import * as fs from 'node:fs';
import * as path from 'node:path';

const fr = dictionnaire('fr');

let hote: HTMLDivElement | null = null;
let monte: Record<string, any> | null = null;
let valeurServeur: unknown = undefined;
const patchs: Record<string, unknown>[] = [];
const suppressions: { id: string; profil: string | null }[] = [];
const listes: (string | null)[] = [];

const PLAYLISTS = [
  { id: 1, name: 'Album A', description: DESCRIPTION_IMPORT_SCAN },
  { id: 2, name: 'Ma sélection', description: 'Pour le dimanche' },
  { id: 3, name: 'Album B', description: DESCRIPTION_IMPORT_SCAN },
  { id: 4, name: 'Sans description', description: null },
];

function entete(init: RequestInit | undefined, nom: string): string | null {
  const h = init?.headers;
  if (!h) return null;
  if (h instanceof Headers) return h.get(nom);
  const trouve = Object.entries(h as Record<string, string>).find(([k]) => k.toLowerCase() === nom.toLowerCase());
  return trouve ? trouve[1] : null;
}

async function attendre(tours = 4) {
  for (let i = 0; i < tours; i++) {
    await new Promise((r) => setTimeout(r, 0));
    flushSync();
  }
}

async function poser(): Promise<HTMLDivElement> {
  preferences.update((p) => ({ ...p, settingsLevel: 'intermediate' }));
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(SettingsV2, { target: hote, props: {} });
  flushSync();
  const onglet = [...hote.querySelectorAll('button')].find(
    (b) => (b.textContent ?? '').trim() === fr['settings.tabLibrary'],
  );
  expect(onglet, 'onglet Bibliothèque introuvable').toBeDefined();
  (onglet as HTMLButtonElement).click();
  await attendre();
  return hote;
}

const caseImport = (h: HTMLElement) =>
  h.querySelector<HTMLInputElement>(`input[type="checkbox"][data-cle="${CLE_IMPORT_PLAYLISTS_SCAN}"]`);
const boutonRetrait = (h: HTMLElement) =>
  h.querySelector<HTMLButtonElement>('button[data-action="retirer-playlists-scan"]');

/** Répond à la confirmation ouverte ; rend son message. */
async function repondre(oui: boolean): Promise<string> {
  for (let i = 0; i < 20 && get(dialogs).length === 0; i++) await attendre(1);
  const [d] = get(dialogs);
  expect(d, 'aucune confirmation demandée').toBeDefined();
  dialogs.settle(d.id, oui);
  await attendre(6);
  return d.message;
}

beforeEach(() => {
  valeurServeur = undefined;
  patchs.length = 0;
  suppressions.length = 0;
  listes.length = 0;
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} } as any);
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const u = String(url);
    const json = (corps: unknown, status = 200) =>
      new Response(JSON.stringify(corps), { status, headers: { 'Content-Type': 'application/json' } });
    if (init?.method === 'PATCH' && /\/system\/config(\?|$)/.test(u)) {
      const corps = JSON.parse(String(init.body ?? '{}'));
      patchs.push(corps);
      return json(corps);
    }
    if (init?.method === 'DELETE') {
      const m = u.match(/\/playlists\/(\d+)(\?|$)/);
      if (m) suppressions.push({ id: m[1], profil: entete(init, 'X-Profile-Id') });
      return new Response(null, { status: 204 });
    }
    if (/\/playlists\/all(\?|$)/.test(u)) {
      listes.push(entete(init, 'X-Profile-Id'));
      return json(PLAYLISTS);
    }
    const corps = /\/system\/config(\?|$)/.test(u)
      ? { music_dirs: [], quality_split: true, ...(valeurServeur === undefined ? {} : { [CLE_IMPORT_PLAYLISTS_SCAN]: valeurServeur }) }
      : /\/(zones|profiles|devices|playlists|shortcuts)(\?|$)/.test(u) ? [] : {};
    return json(corps);
  }));
});

afterEach(() => {
  for (const d of get(dialogs)) dialogs.settle(d.id, false);
  if (monte) unmount(monte);
  monte = null;
  hote?.remove();
  hote = null;
  vi.unstubAllGlobals();
});

describe('web#2635 — règles', () => {
  it('clé absente ou illisible : ACTIF ; seul un non explicite coupe', () => {
    for (const v of [undefined, null, '', 'true', true, 1]) expect(importPlaylistsScanDepuisConfig(v)).toBe(true);
    for (const v of [false, 0, 'false', '"false"', ' OFF ', '0']) expect(importPlaylistsScanDepuisConfig(v)).toBe(false);
  });

  it('seule la description du scan désigne une playlist importée', () => {
    expect(estImporteeAuScan({ description: 'Importée au scan' })).toBe(true);
    expect(estImporteeAuScan({ description: ' Importée au scan ' })).toBe(true);
    expect(estImporteeAuScan({ description: 'Importée au scan, puis retouchée' })).toBe(false);
    expect(estImporteeAuScan({ description: null })).toBe(false);
  });

  it('la description est celle que le serveur écrit', () => {
    expect(DESCRIPTION_IMPORT_SCAN).toBe('Importée au scan');
    expect(CLE_IMPORT_PLAYLISTS_SCAN).toBe('scan_import_playlists');
  });

  it('un échec n’arrête pas les suivantes, et une playlist de Tune n’est jamais supprimée', async () => {
    const vues: number[] = [];
    const bilan = await retirerPlaylists(PLAYLISTS as any, async (id) => {
      vues.push(id);
      if (id === 1) throw new Error('boom');
    });
    expect(vues).toEqual([1, 3]);
    expect(bilan).toEqual({ retirees: [3], echecs: 1 });
  });

  it('les libellés existent dans toutes les langues', () => {
    for (const code of ONZE_LANGUES) {
      const d = dictionnaire(code);
      for (const cle of [
        'settings.scanImportPlaylists', 'settings.scanImportPlaylistsHint',
        'settings.removeScanPlaylists', 'settings.removeScanPlaylistsHint',
        'settings.removeScanPlaylistsConfirm', 'settings.removeScanPlaylistsNone',
        'settings.removeScanPlaylistsDone', 'settings.removeScanPlaylistsFailed',
      ]) {
        expect(d[cle], `${code} : ${cle}`).toBeTruthy();
      }
      expect(d['settings.removeScanPlaylistsConfirm'], `${code} : nombre`).toContain('{n}');
    }
    const fichiers = fs.readdirSync(path.resolve(__dirname, '../locales')).filter((f) => /^[a-z]{2}\.ts$/.test(f));
    expect(fichiers.length).toBe(15);
    for (const f of fichiers) {
      const s = fs.readFileSync(path.resolve(__dirname, '../locales', f), 'utf8');
      expect(s, f).toContain('"settings.removeScanPlaylistsConfirm"');
    }
  });
});

describe('web#2635 — Réglages › Bibliothèque', () => {
  it('la case est rendue, cochée par défaut, et la décocher envoie PATCH { scan_import_playlists: false }', { timeout: 60_000 }, async () => {
    const h = await poser();
    const c = caseImport(h);
    expect(c, 'aucune case « Importer les playlists .m3u/.pls »').not.toBeNull();
    expect(c!.checked).toBe(true);
    const ligne = c!.closest('.row')!;
    expect(ligne.textContent).toContain(fr['settings.scanImportPlaylists']);
    expect(ligne.textContent).toContain(fr['settings.scanImportPlaylistsHint']);
    c!.click();
    await attendre();
    expect(patchs).toContainEqual({ [CLE_IMPORT_PLAYLISTS_SCAN]: false });
  });

  it('la valeur du serveur est lue', { timeout: 60_000 }, async () => {
    valeurServeur = 'false';
    const h = await poser();
    expect(caseImport(h)!.checked).toBe(false);
  });

  it('le retrait confirme avec le nombre et ne supprime que les playlists du scan, au profil 1', { timeout: 60_000 }, async () => {
    const h = await poser();
    const b = boutonRetrait(h);
    expect(b, 'aucun bouton « Retirer les playlists importées au scan »').not.toBeNull();
    b!.click();
    const message = await repondre(true);
    expect(message).toBe(fr['settings.removeScanPlaylistsConfirm'].replace('{n}', '2'));
    expect(listes).toEqual(['1']);
    expect(suppressions).toEqual([{ id: '1', profil: '1' }, { id: '3', profil: '1' }]);
    expect(h.textContent).toContain(fr['settings.removeScanPlaylistsDone'].replace('{n}', '2'));
  });

  it('annuler la confirmation ne supprime rien', { timeout: 60_000 }, async () => {
    const h = await poser();
    boutonRetrait(h)!.click();
    await repondre(false);
    expect(suppressions).toEqual([]);
  });
});
