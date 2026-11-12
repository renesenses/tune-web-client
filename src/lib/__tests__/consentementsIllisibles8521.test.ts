// @vitest-environment jsdom
//
// tune-server-rust#8521 (Tades, fil 2726, rc11) — « écrire les métadonnées »
// et « paroles en ligne » : « ils sont décochés quand je redémarre... il
// arrive que cela marche ».
//
// Les deux cases partaient DÉCOCHÉES et ne changeaient qu'une fois
// `GET /system/config` lu. Pendant un redémarrage du serveur, cette lecture
// rend 503 (répondeur de démarrage) : les cases restaient décochées alors que
// la base les avait cochées, l'erreur s'affichait sous les dossiers de
// musique, et rien ne relisait. Attendu : une case non lue n'est jamais
// présentée décochée — grisée, l'échec dit dans la carte —, et la valeur
// réelle arrive dès que le serveur répond.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';

import SettingsV2 from '../../components/v2/SettingsV2.svelte';
import { preferences } from '../stores/preferences';
import { dictionnaire } from './onzeDictionnaires';

const fr = dictionnaire('fr');

let hote: HTMLDivElement | null = null;
let monte: Record<string, any> | null = null;
/** Le serveur a-t-il fini de démarrer ? Avant : 503 sur `/system/config`. */
let serveurPret = false;
const patchs: Record<string, unknown>[] = [];

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
  expect(hote.textContent).toContain(fr['settings.musicDirs']);
  return hote;
}

const caseDe = (h: HTMLElement, cle: string) =>
  h.querySelector<HTMLInputElement>(`input[type="checkbox"][data-cle="${cle}"]`);
const CLES = ['library_write_files_enabled', 'lyrics_lrclib_enabled'];

beforeEach(() => {
  serveurPret = false;
  patchs.length = 0;
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} } as any);
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const u = String(url);
    if (init?.method === 'PATCH') {
      patchs.push(JSON.parse(String(init.body ?? '{}')));
      return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    if (/\/system\/config(\?|$)/.test(u)) {
      if (!serveurPret) {
        return new Response(
          JSON.stringify({ status: 'starting', code: 'server_starting', phase_code: 'database', phase: 'base de données' }),
          { status: 503, headers: { 'Content-Type': 'application/json' } },
        );
      }
      return new Response(
        JSON.stringify({ music_dirs: [], quality_split: true, library_write_files_enabled: true, lyrics_lrclib_enabled: 'true' }),
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

describe('#8521 — des consentements non lus ne sont jamais présentés décochés', () => {
  it('🔴 config illisible au redémarrage : cases grisées, échec dit dans la carte, puis valeur réelle relue', { timeout: 60_000 }, async () => {
    const h = await poser();
    for (const cle of CLES) {
      const c = caseDe(h, cle);
      expect(c, `case ${cle} absente`).not.toBeNull();
      expect(
        c!.disabled,
        `${cle} : la case s'offre DÉCOCHÉE et cliquable alors que le réglage n'a pas été lu`,
      ).toBe(true);
    }
    const carte = caseDe(h, CLES[0])!.closest('section.card')!;
    expect(
      carte.querySelector('[data-temoin="consentements-illisibles"]')?.textContent,
      'l’échec de lecture n’est pas dit dans la carte des deux cases',
    ).toBe(fr['settings.errConfigUnavailable']);
    // Aucun clic ne peut écrire un « non » sur un réglage non lu.
    caseDe(h, CLES[0])!.click();
    await attendre();
    expect(patchs.filter((p) => CLES.some((k) => k in p))).toEqual([]);

    // Le serveur a fini de démarrer : la relecture rapporte les vraies valeurs.
    serveurPret = true;
    await new Promise((r) => setTimeout(r, 3400));
    await attendre();
    for (const cle of CLES) {
      const c = caseDe(h, cle)!;
      expect(c.disabled, `${cle} reste grisée après la relecture`).toBe(false);
      expect(c.checked, `${cle} : la valeur de la base (cochée) n'est pas relue`).toBe(true);
    }
    expect(carte.querySelector('[data-temoin="consentements-illisibles"]')).toBeNull();
  });

  it('config lue du premier coup : rien ne change (cases actives, valeur de la base)', { timeout: 60_000 }, async () => {
    serveurPret = true;
    const h = await poser();
    for (const cle of CLES) {
      const c = caseDe(h, cle)!;
      expect(c.disabled).toBe(false);
      expect(c.checked).toBe(true);
    }
    expect(h.querySelector('[data-temoin="consentements-illisibles"]')).toBeNull();
  });
});
