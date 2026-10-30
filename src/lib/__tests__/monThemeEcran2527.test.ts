// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import MonThemeV2 from '../../components/v2/MonThemeV2.svelte';
import { etatGreffonTheme, themeDuProfil, urlMonTheme } from '../stores/monTheme';
import type { ThemePerso } from '../monTheme';

// #2527 — l'écran « Mon thème » : le contraste se juge EN DIRECT, un thème
// illisible ne s'enregistre pas, un thème lisible part au greffon du profil.

/** Transformation Svelte payée au premier montage (voir sortieMonoZone). */
const DELAI_MONTAGE = 60_000;

function lisible(): ThemePerso {
  return {
    format: 'tune-theme', version: 1, name: 'Nuit verte',
    colors: {
      '--v2-bg': '#000000', '--v2-bg2': '#080A09', '--v2-surface': '#1F2321',
      '--v2-surface2': '#151817', '--v2-hover': '#101312',
      '--v2-txt': '#FFFFFF', '--v2-txt2': '#D2D8D5', '--v2-txt3': '#A9B1AD',
      '--v2-acc1': '#2A9F5B', '--v2-acc2': '#28BA9B', '--v2-acc-tint': '#E4F9D8',
      '--v2-on-acc': '#000000', '--v2-line': '#2B302D', '--v2-line2': '#3A413D',
      '--v2-active1': '#0F2A1B', '--v2-active2': '#0A1A12', '--v2-player1': '#050606',
      '--v2-player2': '#000000', '--v2-danger': '#FF8F87', '--v2-danger-bd': '#FF6B6B',
    },
  };
}

let cible: HTMLElement;
let monte: Record<string, any> | null = null;
let envois: { url: string; methode: string; corps: any }[] = [];

beforeEach(() => {
  envois = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const corps = init?.body ? JSON.parse(String(init.body)) : null;
    envois.push({ url: String(url), methode: init?.method ?? 'GET', corps });
    return new Response(JSON.stringify({ profile_id: 1, actif: corps?.actif ?? true, theme: corps?.theme ?? null }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    });
  }));
  urlMonTheme.set('/api/v1/ext/mon-theme/theme');
  etatGreffonTheme.set('actif');
  themeDuProfil.set({ actif: true, theme: lisible() });
  cible = document.createElement('div');
  cible.className = 'tune-v2';
  document.body.appendChild(cible);
});

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  cible.remove();
  vi.unstubAllGlobals();
});

const bouton = (texte: RegExp) =>
  [...cible.querySelectorAll('button')].find((b) => texte.test(b.textContent ?? '')) as HTMLButtonElement | undefined;

function ouvrir() {
  monte = mount(MonThemeV2, { target: cible });
  flushSync();
  bouton(/Modifier mon thème/)!.click();
  flushSync();
}

function saisir(jeton: string, valeur: string) {
  const champ = [...cible.querySelectorAll<HTMLInputElement>('input.hex')]
    .find((i) => i.value === lisible().colors[jeton] && i.closest('.jeton')?.textContent?.includes(etiquette[jeton]));
  if (!champ) throw new Error(`champ ${jeton} introuvable`);
  champ.value = valeur;
  champ.dispatchEvent(new Event('input', { bubbles: true }));
  flushSync();
}
const etiquette: Record<string, string> = { '--v2-txt3': 'Texte atténué' };

describe('#2527 — l’écran « Mon thème »', () => {
  it('propose l’installation quand le greffon dort', () => {
    etatGreffonTheme.set('a_installer');
    monte = mount(MonThemeV2, { target: cible });
    flushSync();
    expect(bouton(/Installer le greffon/)).toBeTruthy();
    expect(bouton(/Modifier mon thème/)).toBeUndefined();
  }, DELAI_MONTAGE);

  it('ouvre l’éditeur avec les 20 couleurs du profil, et l’aperçu les porte', () => {
    ouvrir();
    expect(cible.querySelectorAll('input[type="color"]')).toHaveLength(20);
    const apercu = cible.querySelector<HTMLElement>('[data-apercu-mon-theme]')!;
    expect(apercu.style.getPropertyValue('--v2-acc1').trim()).toBe('#2A9F5B');
    expect(cible.textContent).toContain('Lisible');
    expect(bouton(/Enregistrer et appliquer/)!.disabled).toBe(false);
  }, DELAI_MONTAGE);

  it('🔴 un texte illisible désactive l’enregistrement et nomme les paires, en direct', () => {
    ouvrir();
    saisir('--v2-txt3', '#333333');
    expect(bouton(/Enregistrer et appliquer/)!.disabled).toBe(true);
    expect(cible.textContent).toContain('Illisible');
    expect(cible.querySelectorAll('[data-echecs-mon-theme] li').length).toBe(5);
    // L'aperçu suit la saisie.
    expect(cible.querySelector<HTMLElement>('[data-apercu-mon-theme]')!.style.getPropertyValue('--v2-txt3').trim()).toBe('#333333');
  }, DELAI_MONTAGE);

  it('🔴 un thème lisible part au greffon (PUT), et rien d’autre', async () => {
    ouvrir();
    bouton(/Enregistrer et appliquer/)!.click();
    await vi.waitFor(() => expect(envois.length).toBe(1));
    expect(envois[0].methode).toBe('PUT');
    expect(envois[0].url).toContain('/ext/mon-theme/theme');
    expect(envois[0].corps).toEqual({ theme: lisible(), actif: true });
  }, DELAI_MONTAGE);

  it('un thème illisible n’est jamais envoyé, même en forçant le clic', async () => {
    ouvrir();
    saisir('--v2-txt3', '#333333');
    const b = bouton(/Enregistrer et appliquer/)!;
    b.disabled = false;
    b.click();
    await new Promise((r) => setTimeout(r, 20));
    expect(envois).toEqual([]);
  }, DELAI_MONTAGE);
});
