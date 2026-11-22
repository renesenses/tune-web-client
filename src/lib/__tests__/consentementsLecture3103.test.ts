// @vitest-environment jsdom
//
// #3103 (Tades, fils 2854 et 2859, rc12 Windows) — « écrire dans les fichiers »
// et « paroles en ligne » affichés ÉTEINTS alors qu'ils sont actifs en base.
//
// 1. `appliquerConsentements` attendait la fin de `GET /library/repertoires/ordre`
//    après `GET /system/config` : sur un serveur dont la base est tenue 25 à
//    40 s, les deux cases restaient « non lues » tout ce temps.
// 2. L'état « non lu » (case grisée) était identique à « éteint » et rien ne
//    disait qu'une lecture était en cours.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';

import SettingsV2 from '../../components/v2/SettingsV2.svelte';
import { preferences } from '../stores/preferences';
import { dictionnaire } from './onzeDictionnaires';

const fr = dictionnaire('fr');

let hote: HTMLDivElement | null = null;
let monte: Record<string, any> | null = null;
/** `/system/config` répond-il ? Sinon, la requête reste en attente. */
let configRepond = true;

async function attendre(tours = 4) {
  for (let i = 0; i < tours; i++) {
    await new Promise((r) => setTimeout(r, 0));
    flushSync();
  }
}

async function poser(): Promise<HTMLDivElement> {
  preferences.update((p) => ({ ...p, settingsLevel: 'beginner' }));
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

const caseDe = (h: HTMLElement, cle: string) =>
  h.querySelector<HTMLInputElement>(`input[type="checkbox"][data-cle="${cle}"]`);
const CLES = ['library_write_files_enabled', 'lyrics_lrclib_enabled'];
const jamais = () => new Promise<Response>(() => {});

beforeEach(() => {
  configRepond = true;
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} } as any);
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    const u = String(url);
    // L'ordre des dossiers ne répond jamais : base tenue côté serveur.
    if (/\/library\/repertoires\/ordre(\?|$)/.test(u)) return jamais();
    if (/\/system\/config(\?|$)/.test(u)) {
      if (!configRepond) return jamais();
      return new Response(
        JSON.stringify({ music_dirs: ['/musique'], quality_split: true, library_write_files_enabled: true, lyrics_lrclib_enabled: 'true' }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }
    const corps = /\/(zones|profiles|devices|playlists|shortcuts)(\?|$)/.test(u) ? [] : {};
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

describe('#3103 — consentements appliqués dès /system/config, « non lu » distinct de « éteint »', () => {
  it('🔴 config lue, ordre des dossiers en attente : cases cochées et actives', { timeout: 60_000 }, async () => {
    const h = await poser();
    for (const cle of CLES) {
      const c = caseDe(h, cle);
      expect(c, `case ${cle} absente`).not.toBeNull();
      expect(c!.disabled, `${cle} reste « non lue » en attendant l'ordre des dossiers`).toBe(false);
      expect(c!.checked, `${cle} : affichée éteinte alors que la base la dit active`).toBe(true);
    }
    expect(h.querySelector('[data-temoin="consentements-lecture"]')).toBeNull();
  });

  it('🔴 config en attente : « lecture en cours » dite, interrupteur marqué non lu (pas éteint)', { timeout: 60_000 }, async () => {
    configRepond = false;
    const h = await poser();
    for (const cle of CLES) {
      const c = caseDe(h, cle)!;
      expect(c.disabled).toBe(true);
      const sw = c.closest('label.sw')!;
      expect(sw.classList.contains('non-lu'), `${cle} : l'interrupteur non lu ressemble à un éteint`).toBe(true);
      expect(sw.getAttribute('aria-busy')).toBe('true');
    }
    const carte = caseDe(h, CLES[0])!.closest('section.card')!;
    expect(carte.querySelector('[data-temoin="consentements-lecture"]')?.textContent).toBe(fr['settings.consentsReading']);
  });
});
