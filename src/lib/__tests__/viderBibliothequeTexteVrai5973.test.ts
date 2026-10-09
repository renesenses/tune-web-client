// @vitest-environment jsdom
//
// « Vider la bibliothèque » doit dire la VÉRITÉ — renesenses/tune-server-rust#5973.
//
// Jean-Pierre Borderies, fil 2171 (08/10/2026), Windows rc2 :
//
//   « J'ai déjà essayé de résoudre mon problème en utilisant : "vider la
//     bibliothèque" (!) mal m'en a pris, car j'ai perdu toutes mes 'Playlists' »
//
// La confirmation promettait « Les zones, playlists et radios seront
// conservées », et l'aide « une analyse complète reconstruit tout ». Les deux
// étaient faux : le vidage efface les pistes, et par cascade le contenu des
// playlists, les notes, les signets ; les favoris deviennent orphelins. Aucun
// scan ne les rend. Le serveur fait désormais une sauvegarde de la base juste
// avant, et en rend le chemin.
//
// 🔴 Ces épreuves MONTENT l'écran et lisent la boîte de confirmation réellement
// ouverte : elles rougissent si le bouton repasse sur l'ancienne clé, ou si le
// chemin de la sauvegarde cesse d'être affiché.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import { get } from 'svelte/store';

type Reponse = { ok: boolean; deleted?: number; error?: string; backup_path?: string | null };
const clearLibrary = vi.fn<() => Promise<Reponse>>();

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return {
    ...actual,
    clearLibrary: () => clearLibrary(),
    getConfig: vi.fn(async () => ({ music_dirs: [], quality_split: true })),
    getScanSchedule: vi.fn(async () => ({ enabled: false, time: '03:00' })),
    getScanStatus: vi.fn(async () => ({ scanning: false })),
    getScanReport: vi.fn(async () => null),
    getStats: vi.fn(async () => ({})),
  };
});

import SettingsV2 from '../../components/v2/SettingsV2.svelte';
import { preferences } from '../stores/preferences';
import { dialogs } from '../stores/dialogs';
import de from '../locales/de';
import en from '../locales/en';
import es from '../locales/es';
import fr from '../locales/fr';
import hu from '../locales/hu';
import it_ from '../locales/it';
import ja from '../locales/ja';
import ko from '../locales/ko';
import ro from '../locales/ro';
import sv from '../locales/sv';
import zh from '../locales/zh';

const LANGUES: Record<string, Record<string, string>> = {
  de, en, es, fr, hu, it: it_, ja, ko, ro, sv, zh,
} as unknown as Record<string, Record<string, string>>;
const FR = fr as unknown as Record<string, string>;
const EN = en as unknown as Record<string, string>;

class ResizeObserverInerte {
  observe() {}
  unobserve() {}
  disconnect() {}
}

let hote: HTMLDivElement | null = null;
let monte: Record<string, any> | null = null;

function poser(): HTMLDivElement {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(SettingsV2, { target: hote, props: {} });
  flushSync();
  return hote;
}

function ouvrirBibliotheque(el: HTMLElement) {
  const onglet = [...el.querySelectorAll('button')].find(
    (b) => (b.textContent ?? '').trim() === FR['settings.tabLibrary'],
  );
  expect(onglet, 'onglet Bibliothèque introuvable à l’écran').toBeDefined();
  (onglet as HTMLButtonElement).click();
  flushSync();
}

function boutonVider(el: HTMLElement): HTMLButtonElement {
  const b = [...el.querySelectorAll('button.danger')].find(
    (x) => (x.textContent ?? '').trim() === FR['settings.clearLibrary'],
  ) as HTMLButtonElement | undefined;
  expect(b, 'aucun bouton « Vider la bibliothèque »').toBeDefined();
  return b!;
}

async function attendre(tours = 4) {
  for (let i = 0; i < tours; i++) {
    await new Promise((r) => setTimeout(r, 0));
    flushSync();
  }
}

/** Ouvre l'écran, clique « Vider », et rend la confirmation affichée. */
async function demanderLeVidage(): Promise<{ el: HTMLElement; message: string; id: number | string }> {
  const el = poser();
  await attendre();
  ouvrirBibliotheque(el);
  await attendre();
  boutonVider(el).click();
  await attendre();
  const file = get(dialogs);
  expect(file.length, 'aucune confirmation demandée').toBeGreaterThan(0);
  const derniere = file[file.length - 1];
  return { el, message: derniere.message, id: derniere.id };
}

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', ResizeObserverInerte);
  clearLibrary.mockReset();
  preferences.update((p) => ({ ...p, settingsLevel: 'beginner' }));
});

afterEach(() => {
  for (const r of get(dialogs)) dialogs.settle(r.id, false);
  if (monte) unmount(monte);
  monte = null;
  if (hote) hote.remove();
  hote = null;
  vi.unstubAllGlobals();
});

describe('#5973 — la confirmation dit ce qui sera perdu', () => {
  it('annonce la perte du contenu des playlists, des notes, des signets et des favoris, et la sauvegarde', async () => {
    const { message } = await demanderLeVidage();
    expect(message).toBe(FR['settings.clearLibraryConfirm']);
    for (const mot of ['playlists', 'notes', 'signets', 'favoris', 'PERDUS', 'sauvegarde']) {
      expect(message, `la confirmation doit citer « ${mot} »`).toContain(mot);
    }
    // L'ancienne promesse, fausse, ne doit plus revenir.
    expect(message).not.toMatch(/playlists et radios seront conservées/);
  });

  it('l’aide ne prétend plus qu’une analyse complète reconstruit tout', async () => {
    const el = poser();
    await attendre();
    ouvrirBibliotheque(el);
    await attendre();
    expect(el.textContent).toContain(FR['settings.clearLibraryV2Hint']);
    expect(FR['settings.clearLibraryV2Hint']).not.toMatch(/reconstruit tout/);
    expect(EN['settings.clearLibraryV2Hint']).not.toMatch(/rebuilds everything/);
    expect(EN['settings.clearLibraryConfirm']).not.toMatch(/playlists and radios will be kept/);
  });
});

describe('#5973 — le chemin de la sauvegarde est montré après le vidage', () => {
  it('affiche le chemin rendu par le serveur', async () => {
    const chemin = 'C:\\Users\\jp\\AppData\\Local\\TuneServer\\backups\\tune_20261008_133000_avant_vidage.db';
    clearLibrary.mockResolvedValue({ ok: true, deleted: 6072, backup_path: chemin });
    const { el, id } = await demanderLeVidage();
    dialogs.settle(id as any, true);
    await attendre(8);
    expect(clearLibrary).toHaveBeenCalledTimes(1);
    expect(el.textContent).toContain(FR['settings.libraryCleared']);
    expect(el.textContent).toContain(chemin);
  });

  it('sans sauvegarde (PostgreSQL), annonce le vidage sans chemin inventé', async () => {
    clearLibrary.mockResolvedValue({ ok: true, deleted: 3, backup_path: null });
    const { el, id } = await demanderLeVidage();
    dialogs.settle(id as any, true);
    await attendre(8);
    expect(el.textContent).toContain(FR['settings.libraryCleared']);
    expect(el.textContent).not.toContain('{path}');
    expect(el.textContent).not.toContain('null');
  });
});

describe('#5973 — les onze langues portent les nouveaux textes', () => {
  const CLES = ['settings.clearLibraryConfirm', 'settings.clearLibraryV2Hint', 'settings.libraryClearedBackup'];
  for (const [langue, dict] of Object.entries(LANGUES)) {
    it(`${langue} : clés présentes, sauvegarde citée par {path}`, () => {
      for (const cle of CLES) {
        expect(dict[cle], `${langue} : ${cle} manquante`).toBeTruthy();
      }
      expect(dict['settings.libraryClearedBackup']).toContain('{path}');
      // Chaque langue mentionne PostgreSQL dans la confirmation : la
      // sauvegarde automatique ne vaut que pour SQLite.
      expect(dict['settings.clearLibraryConfirm']).toContain('PostgreSQL');
      if (langue !== 'en') {
        for (const cle of CLES) {
          expect(dict[cle], `${langue} : ${cle} laissée en anglais`).not.toBe(EN[cle]);
        }
      }
    });
  }
});
