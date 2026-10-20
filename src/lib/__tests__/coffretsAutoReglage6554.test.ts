// @vitest-environment jsdom
//
// tune-server-rust#6554 (fil 2294, Marco Polo et Gros Bidon) — le réglage
// « Coffrets automatiques », go de Bertrand du 19/10/2026.
//
// Gros Bidon, 19/10 : « tous mes albums avec plusieurs disques sont rangés
// dans un dossier racine et des dossiers par disque […] CD 1 CD 2 […] Ils
// vont donc tous apparaitre comme des coffrets alors que ce n'est pas le
// cas. » Marco Polo : « Peut-être que Tune pourrait en faire une option dans
// les réglages de la bibliothèque ? »
//
// Le serveur lit la clé `library_auto_box_sets` ; ABSENTE, elle vaut
// « actif » (le comportement d'avant). Ce banc tient le côté client :
//
// 1. la case existe dans Réglages › Bibliothèque › Options d'analyse,
//    COCHÉE quand le serveur ne publie rien ;
// 2. la décocher envoie `PATCH { library_auto_box_sets: false }` ;
// 3. un refus du serveur remet la case en place ;
// 4. les libellés existent dans toutes les langues du client.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';

import SettingsV2 from '../../components/v2/SettingsV2.svelte';
import { preferences } from '../stores/preferences';
import { CLE_COFFRETS_AUTO, coffretsAutoDepuisConfig } from '../coffretsAuto';
import { SETTING_LEVELS } from '../settingLevels';
import { dictionnaire, ONZE_LANGUES } from './onzeDictionnaires';

const fr = dictionnaire('fr');

let hote: HTMLDivElement | null = null;
let monte: Record<string, any> | null = null;
let valeurServeur: unknown = undefined;
let refuserLePatch = false;
const patchs: Record<string, unknown>[] = [];

async function attendre(tours = 4) {
  for (let i = 0; i < tours; i++) {
    await new Promise((r) => setTimeout(r, 0));
    flushSync();
  }
}

async function poser(): Promise<HTMLDivElement> {
  // La carte « Options d'analyse » est au niveau intermédiaire.
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

const caseCoffrets = (h: HTMLElement) =>
  h.querySelector<HTMLInputElement>(`input[type="checkbox"][data-cle="${CLE_COFFRETS_AUTO}"]`);

beforeEach(() => {
  valeurServeur = undefined;
  refuserLePatch = false;
  patchs.length = 0;
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} } as any);
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const u = String(url);
    if (init?.method === 'PATCH' && /\/system\/config(\?|$)/.test(u)) {
      const corps = JSON.parse(String(init.body ?? '{}'));
      patchs.push(corps);
      if (refuserLePatch && CLE_COFFRETS_AUTO in corps) {
        return new Response('{"error":"boom"}', { status: 500, headers: { 'Content-Type': 'application/json' } });
      }
      return new Response(JSON.stringify(corps), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    const corps = /\/system\/config(\?|$)/.test(u)
      ? { music_dirs: [], quality_split: true, ...(valeurServeur === undefined ? {} : { [CLE_COFFRETS_AUTO]: valeurServeur }) }
      : /\/(zones|profiles|devices|playlists|shortcuts)(\?|$)/.test(u) ? [] : {};
    return new Response(JSON.stringify(corps), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }));
});

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  hote?.remove();
  hote = null;
  vi.unstubAllGlobals();
});

describe('« Coffrets automatiques » — actif par défaut (#6554)', () => {
  it('clé absente ou illisible : ACTIF ; seul un non explicite coupe', () => {
    for (const v of [undefined, null, '', 'true', true, 1, 'n’importe quoi']) {
      expect(coffretsAutoDepuisConfig(v), JSON.stringify(v)).toBe(true);
    }
    for (const v of [false, 0, 'false', '"false"', ' OFF ', 'no', '0']) {
      expect(coffretsAutoDepuisConfig(v), JSON.stringify(v)).toBe(false);
    }
  });

  it('la clé est celle que lit le serveur', () => {
    expect(CLE_COFFRETS_AUTO).toBe('library_auto_box_sets');
  });

  it('les libellés existent dans toutes les langues du client, vietnamien compris', () => {
    for (const code of ONZE_LANGUES) {
      const d = dictionnaire(code);
      for (const cle of ['settings.autoBoxSets', 'settings.autoBoxSetsHint']) {
        expect(d[cle], `${code} : ${cle}`).toBeTruthy();
      }
    }
    expect(ONZE_LANGUES).toContain('vi');
  });

  it('rangé au niveau intermédiaire, comme la carte qui le porte', () => {
    expect(SETTING_LEVELS['library.autoBoxSets']).toEqual({ tab: 'library', level: 'intermediate' });
  });

  it('la case est rendue, COCHÉE quand le serveur ne publie rien', { timeout: 60_000 }, async () => {
    const h = await poser();
    const c = caseCoffrets(h);
    expect(c, 'aucune case « Coffrets automatiques »').not.toBeNull();
    expect(c!.checked).toBe(true);
    const ligne = c!.closest('.row')!;
    expect(ligne.textContent).toContain(fr['settings.autoBoxSets']);
    expect(ligne.textContent).toContain(fr['settings.autoBoxSetsHint']);
  });

  it('la valeur du serveur est lue, et décocher envoie PATCH { library_auto_box_sets: false }', { timeout: 60_000 }, async () => {
    valeurServeur = false;
    let h = await poser();
    expect(caseCoffrets(h)!.checked).toBe(false);
    unmount(monte!); monte = null; hote?.remove(); hote = null;

    valeurServeur = undefined;
    h = await poser();
    const c = caseCoffrets(h)!;
    c.click();
    await attendre();
    expect(patchs).toContainEqual({ [CLE_COFFRETS_AUTO]: false });
    expect(c.checked).toBe(false);
  });

  it('un refus du serveur remet la case en place et le dit', { timeout: 60_000 }, async () => {
    refuserLePatch = true;
    const h = await poser();
    const c = caseCoffrets(h)!;
    c.click();
    await attendre(8);
    expect(c.checked, 'la case revient à l’état du serveur').toBe(true);
    expect(h.textContent).toContain(fr['settings.errSaveFailed']);
  });
});
