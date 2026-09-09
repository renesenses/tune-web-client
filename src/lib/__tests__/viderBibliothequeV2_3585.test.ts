// @vitest-environment jsdom
//
// « Repartir à zéro » — renesenses/tune-server-rust#3585, volet 1.
//
// Louis Bertin, fil forum 1707 (07/09/2026), premier message, clé USB de
// 15 albums qui ressortent mélangés :
//
//   « on ne peut même pas tout effacer et recommencer à zéro !!! […] D'abord
//     comment tout réinitialiser et tout effacer cette bibliothèque et partir
//     sur une base saine ? »
//
// La fonction EXISTE — `POST /system/library/clear`, handler
// `scan::library_clear` — et le nouveau client ne l'exposait NULLE PART :
// `git grep "library/clear\|clearLibrary" src/components/v2/` ne rendait rien.
//
// 🔴 Ce témoin MONTE l'écran Réglages et CLIQUE. Il ne cherche pas
// « clearLibrary » dans un fichier : un tel test resterait vert si le bouton
// perdait son gestionnaire, ou si la section repassait sous un niveau qui la
// masque.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import { get } from 'svelte/store';

const clearLibrary = vi.fn<() => Promise<{ ok: boolean; deleted?: number; error?: string }>>();

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return {
    ...actual,
    clearLibrary: () => clearLibrary(),
    // Tout ce que l'écran interroge au montage : on rend des réponses inertes
    // pour que rien ne parte sur le réseau et qu'aucune promesse ne pende.
    getConfig: vi.fn(async () => ({ music_dirs: [], quality_split: true })),
    getScanSchedule: vi.fn(async () => ({ enabled: false, time: '03:00' })),
    getScanStatus: vi.fn(async () => ({ scanning: false })),
    getScanReport: vi.fn(async () => null),
    getStats: vi.fn(async () => ({})),
  };
});

import SettingsV2 from '../../components/v2/SettingsV2.svelte';
import { V2_SETTINGS } from '../v2Settings';
import { preferences } from '../stores/preferences';
import { dialogs } from '../stores/dialogs';
import lFr from '../locales/fr';

const fr = lFr as unknown as Record<string, string>;

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

/** L'écran ne rend que l'onglet actif : il faut l'ouvrir comme un humain. */
function ouvrirBibliotheque(el: HTMLElement) {
  const onglet = [...el.querySelectorAll('button')].find(
    (b) => (b.textContent ?? '').trim() === fr['settings.tabLibrary'],
  );
  expect(onglet, 'onglet Bibliothèque introuvable à l’écran').toBeDefined();
  (onglet as HTMLButtonElement).click();
  flushSync();
}

/** Le bouton d'action, reconnu par son libellé — celui de l'écran actuel. */
function boutonVider(el: HTMLElement): HTMLButtonElement | null {
  return (
    [...el.querySelectorAll('button.danger')].find(
      (b) => (b.textContent ?? '').trim() === fr['settings.clearLibrary'],
    ) as HTMLButtonElement | undefined
  ) ?? null;
}

/** Répond à la boîte de confirmation que `dialogs` met en file.
 *
 *  🔴 La DERNIÈRE, pas la première : le magasin `dialogs` est global au
 *  module et sa file survit d'un cas à l'autre. Un cas qui ouvre une
 *  confirmation sans y répondre (celui qui vérifie qu'on demande AVANT
 *  d'appeler la route) laisse la sienne en tête, et répondre à `[0]`
 *  reviendrait à répondre au cas précédent — le cas courant resterait alors
 *  bloqué, ce qui se lit comme « le bouton ne fait rien ». */
function repondreAuDialogue(reponse: boolean) {
  const file = get(dialogs);
  expect(file.length, 'aucune confirmation demandée').toBeGreaterThan(0);
  dialogs.settle(file[file.length - 1].id, reponse);
}

async function attendre(tours = 4) {
  for (let i = 0; i < tours; i++) {
    await new Promise((r) => setTimeout(r, 0));
    flushSync();
  }
}

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', ResizeObserverInerte);
  clearLibrary.mockReset();
  clearLibrary.mockResolvedValue({ ok: true, deleted: 42 });
  // Niveau DÉBUTANT : c'est tout l'enjeu du ticket. Au niveau expert, le
  // témoin ne prouverait rien de ce que Louis Bertin a vécu.
  preferences.update((p) => ({ ...p, settingsLevel: 'beginner' }));
});

afterEach(() => {
  // Vide la file de confirmations : un cas qui n'a pas répondu à la sienne
  // ne doit pas la léguer au suivant.
  for (const r of get(dialogs)) dialogs.settle(r.id, false);
  if (monte) unmount(monte);
  monte = null;
  if (hote) hote.remove();
  hote = null;
  vi.unstubAllGlobals();
});

describe('la carte des réglages expose « Vider la bibliothèque »', () => {
  /** La carte est la SOURCE UNIQUE : l'écran et la recherche du menu avatar
   *  la lisent tous les deux. Une section absente d'ici est introuvable des
   *  deux côtés. */
  it('la section vit dans l’onglet Bibliothèque, au niveau débutant', () => {
    const onglet = V2_SETTINGS.find((t) => t.id === 'library');
    expect(onglet, 'onglet Bibliothèque introuvable').toBeDefined();
    const section = onglet!.sections.find((s) => s.id === 'clearLibrary');
    expect(section, 'section clearLibrary absente de la carte').toBeDefined();
    expect(section!.min, 'la section reste masquée au niveau par défaut').toBe('beginner');
  });
});

describe('l’écran Réglages du nouveau client — l’action existe et agit', () => {
  it('affiche le bouton au niveau DÉBUTANT', async () => {
    const el = poser();
    await attendre();
    ouvrirBibliotheque(el);
    await attendre();
    expect(boutonVider(el), 'aucun bouton « Vider la bibliothèque »').not.toBeNull();
  });

  it('demande confirmation AVANT d’appeler la route', async () => {
    const el = poser();
    await attendre();
    ouvrirBibliotheque(el);
    await attendre();
    boutonVider(el)!.click();
    await attendre();
    // Le dialogue est ouvert, et rien n'est encore parti.
    expect(get(dialogs).length, 'aucune confirmation demandée').toBeGreaterThan(0);
    expect(clearLibrary).not.toHaveBeenCalled();
  });

  it('n’efface RIEN quand la confirmation est refusée', async () => {
    const el = poser();
    await attendre();
    ouvrirBibliotheque(el);
    await attendre();
    boutonVider(el)!.click();
    await attendre();
    repondreAuDialogue(false);
    await attendre();
    expect(clearLibrary).not.toHaveBeenCalled();
  });

  it('appelle la route et annonce le succès quand elle est acceptée', async () => {
    const el = poser();
    await attendre();
    ouvrirBibliotheque(el);
    await attendre();
    boutonVider(el)!.click();
    await attendre();
    repondreAuDialogue(true);
    await attendre(8);
    expect(clearLibrary).toHaveBeenCalledTimes(1);
    expect(el.textContent).toContain(fr['settings.libraryCleared']);
  });

  /**
   * 🔴 #1715 : le serveur répond HTTP **200** même quand le vidage échoue,
   * avec `{ ok: false, error }`. Tester la vérité de l'objet ne suffit pas —
   * `{ ok: false }` est truthy — et l'écran annonçait « vidée » sur un échec.
   * L'écran actuel tient ce piège ; celui-ci doit le tenir aussi.
   */
  it('n’annonce PAS « vidée » sur un { ok: false } servi en 200', async () => {
    clearLibrary.mockResolvedValue({ ok: false, error: 'database is locked' });
    const el = poser();
    await attendre();
    ouvrirBibliotheque(el);
    await attendre();
    boutonVider(el)!.click();
    await attendre();
    repondreAuDialogue(true);
    await attendre(8);
    expect(clearLibrary).toHaveBeenCalledTimes(1);
    expect(el.textContent).not.toContain(fr['settings.libraryCleared']);
    expect(el.textContent).toContain(fr['settings.deletionError']);
    expect(el.textContent).toContain('database is locked');
  });

  it('dit ce qui est effacé et ce qui ne l’est pas', async () => {
    // La phrase compte autant que le bouton : « aucun fichier n'est supprimé »
    // est ce qui permet de cliquer sans peur, et une analyse complète
    // reconstruit tout.
    const el = poser();
    await attendre();
    ouvrirBibliotheque(el);
    await attendre();
    expect(el.textContent).toContain(fr['settings.clearLibraryV2Hint']);
  });
});
