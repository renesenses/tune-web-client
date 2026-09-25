// @vitest-environment jsdom
//
// renesenses/tune-server-rust#4051 — l'interrupteur « Paroles en ligne
// (LRCLIB) » manquait au client v2.
//
// Le serveur ne cherche les paroles chez LRCLIB que si `lyrics_lrclib_enabled`
// vaut "true" (`GET`/`PATCH /system/config`). Le seul interrupteur qui le
// posait vivait dans l'ancien écran Réglages, retiré à la phase 5 (d5ed7deb),
// et ses deux libellés sont partis avec lui (35e66cd0). Depuis, le message
// vide des paroles — « La recherche en ligne est désactivée : Paramètres ›
// Bibliothèque › Paroles en ligne (LRCLIB) » — renvoyait vers un réglage qui
// n'existait plus nulle part : il pointait dans le vide.
//
// Ce banc MONTE l'écran Réglages v2 au niveau DÉBUTANT (le niveau par défaut ;
// arbitrage #2859 : la case est `beginner`) et regarde le DOM, puis vérifie
// que le message nomme, dans chacune des onze langues, le chemin RÉELLEMENT
// affiché : titre de l'écran › onglet › carte › libellé de la case.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import { get } from 'svelte/store';

import SettingsV2 from '../../components/v2/SettingsV2.svelte';
import { V2_SETTINGS } from '../v2Settings';
import { preferences } from '../stores/preferences';
import { parolesEnLigneActives } from '../lyricsOnline';
import type { SettingsLevel } from '../uiLevel';
import { dictionnaire, ONZE_LANGUES } from './onzeDictionnaires';

const fr = dictionnaire('fr');

let hote: HTMLDivElement | null = null;
let monte: Record<string, any> | null = null;
/** Valeur de `lyrics_lrclib_enabled` rendue par `GET /system/config`. */
let valeurServeur: unknown = undefined;
/** Le `PATCH` échoue-t-il ? */
let patchEchoue = false;
const patchs: Record<string, unknown>[] = [];

async function attendre(tours = 4) {
  for (let i = 0; i < tours; i++) {
    await new Promise((r) => setTimeout(r, 0));
    flushSync();
  }
}

async function poser(niveau: SettingsLevel = 'beginner'): Promise<HTMLDivElement> {
  preferences.update((p) => ({ ...p, settingsLevel: niveau }));
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(SettingsV2, { target: hote, props: {} });
  flushSync();
  const onglet = [...hote.querySelectorAll('button')].find(
    (b) => (b.textContent ?? '').trim() === fr['settings.tabLibrary'],
  );
  expect(onglet, `onglet Bibliothèque introuvable au niveau ${niveau}`).toBeDefined();
  (onglet as HTMLButtonElement).click();
  await attendre();
  // Témoin : l'onglet Bibliothèque est bien rendu, sinon « absent » ne prouve rien.
  expect(hote.textContent).toContain(fr['settings.musicDirs']);
  return hote;
}

const caseLrclib = (h: HTMLElement) =>
  h.querySelector<HTMLInputElement>('input[type="checkbox"][data-cle="lyrics_lrclib_enabled"]');

beforeEach(() => {
  valeurServeur = undefined;
  patchEchoue = false;
  patchs.length = 0;
  parolesEnLigneActives.set(null);
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} } as any);
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const u = String(url);
    if (init?.method === 'PATCH' && /\/system\/config(\?|$)/.test(u)) {
      const corps = JSON.parse(String(init.body ?? '{}'));
      patchs.push(corps);
      if (patchEchoue) {
        return new Response(JSON.stringify({ error: 'boom' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
      }
      return new Response(JSON.stringify(corps), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    const corps = /\/system\/config(\?|$)/.test(u)
      ? { music_dirs: [], quality_split: true, ...(valeurServeur === undefined ? {} : { lyrics_lrclib_enabled: valeurServeur }) }
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

describe('#4051 — la case « Paroles en ligne (LRCLIB) » existe dans les Réglages v2', () => {
  it('son libellé et son aide existent dans les onze langues', () => {
    for (const code of ONZE_LANGUES) {
      const d = dictionnaire(code);
      expect(d['settings.lyricsLrclib'], `${code} : settings.lyricsLrclib`).toBeTruthy();
      expect(d['settings.lyricsLrclibHelp'], `${code} : settings.lyricsLrclibHelp`).toBeTruthy();
    }
  });

  it('la carte qui la porte est offerte au niveau débutant (#2859)', () => {
    const onglet = V2_SETTINGS.find((t) => t.id === 'library')!;
    expect(onglet.min).toBe('beginner');
    const carte = onglet.sections.find((s) => s.id === 'metadata');
    expect(carte, 'carte Métadonnées absente').toBeDefined();
    expect(carte!.min, 'la case resterait invisible au niveau par défaut').toBe('beginner');
    // La recherche du menu avatar la trouve par ce que l'utilisateur cherche.
    expect(carte!.keywords ?? []).toEqual(expect.arrayContaining(['paroles', 'lrclib']));
  });

  it('au niveau débutant, la case est rendue dans la carte Métadonnées, décochée si la clé est absente', { timeout: 60_000 }, async () => {
    const h = await poser();
    const c = caseLrclib(h);
    expect(c, 'aucun interrupteur LRCLIB dans l’onglet Bibliothèque').not.toBeNull();
    expect(c!.checked).toBe(false);
    const carte = c!.closest('section.card')!;
    expect(carte.querySelector('h3')?.textContent?.trim()).toBe(fr['metadata.title']);
    expect(carte.textContent).toContain(fr['settings.lyricsLrclib']);
  });

  it('la valeur du serveur est lue — chaîne "true" comme booléen', { timeout: 60_000 }, async () => {
    valeurServeur = 'true';
    const h = await poser();
    expect(caseLrclib(h)!.checked).toBe(true);
  });

  it('basculer envoie PATCH { lyrics_lrclib_enabled: true } et rallume le témoin des paroles', { timeout: 60_000 }, async () => {
    const h = await poser();
    const c = caseLrclib(h)!;
    c.click();
    await attendre();
    expect(patchs).toContainEqual({ lyrics_lrclib_enabled: true });
    expect(c.checked).toBe(true);
    // Le panneau des paroles lit ce témoin : sans cela il continuerait à
    // dire « désactivée » jusqu'au rechargement.
    expect(get(parolesEnLigneActives)).toBe(true);
  });

  it('🔴 un PATCH refusé remet la case dans son état et le DIT (le défaut de l’ancien écran)', { timeout: 60_000 }, async () => {
    patchEchoue = true;
    const h = await poser();
    const c = caseLrclib(h)!;
    c.click();
    await attendre();
    expect(patchs).toContainEqual({ lyrics_lrclib_enabled: true });
    expect(c.checked, 'la case affirme un réglage que le serveur n’a pas écrit').toBe(false);
    expect(c.closest('section.card')!.textContent).toContain(fr['settings.errSaveFailed']);
    expect(get(parolesEnLigneActives)).not.toBe(true);
  });
});

describe('#4051 — le message des paroles nomme l’endroit RÉEL du réglage', () => {
  it.each(ONZE_LANGUES)('%s : écran › onglet › carte › case, tels qu’affichés', (code) => {
    const d = dictionnaire(code);
    const chemin = [d['settings.titleV2'], d['settings.tabLibrary'], d['metadata.title'], d['settings.lyricsLrclib']];
    for (const morceau of chemin) expect(morceau, `${code} : libellé manquant`).toBeTruthy();
    expect(d['lyrics.empty.onlineOff']).toContain(chemin.join(' › '));
  });
});
