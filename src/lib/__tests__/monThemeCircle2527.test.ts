// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import { get } from 'svelte/store';
import CarteThemeCercleV2 from '../../components/v2/CarteThemeCercleV2.svelte';
import MonThemeV2 from '../../components/v2/MonThemeV2.svelte';
import { carteAPartager, carteCercle, envoyerMessage, themeDeCarte, type CarteTheme } from '../circleMessagerie';
import { appliquerThemeRecu, etatGreffonTheme, themeDuProfil, urlMonTheme } from '../stores/monTheme';
import { jugerTheme } from '../monTheme';

// #2527 — « Mon thème » dans Tune Circle (décision de Bertrand du 30/10,
// voie A) : la carte `theme` du contrat cloud (site-mozaiklabs#429), son
// rendu dans le fil, et « Appliquer » qui passe par le juge d'un import.

const DELAI_MONTAGE = 60_000;
const COULEURS: Record<string, string> = {
  '--v2-bg': '#000000', '--v2-bg2': '#080A09', '--v2-surface': '#1F2321',
  '--v2-surface2': '#151817', '--v2-hover': '#101312',
  '--v2-txt': '#FFFFFF', '--v2-txt2': '#D2D8D5', '--v2-txt3': '#A9B1AD',
  '--v2-acc1': '#2A9F5B', '--v2-acc2': '#28BA9B', '--v2-acc-tint': '#E4F9D8',
  '--v2-on-acc': '#000000', '--v2-line': '#2B302D', '--v2-line2': '#3A413D',
  '--v2-active1': '#0F2A1B', '--v2-active2': '#0A1A12', '--v2-player1': '#050606',
  '--v2-player2': '#000000', '--v2-danger': '#FF8F87', '--v2-danger-bd': '#FF6B6B',
};
const carte = (colors: Record<string, string> = COULEURS): CarteTheme => ({ type: 'theme', title: 'Nuit verte', colors: { ...colors } });

let envois: { url: string; methode: string; corps: any }[] = [];
let cible: HTMLElement;
let monte: Record<string, any> | null = null;

beforeEach(() => {
  envois = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const corps = init?.body ? JSON.parse(String(init.body)) : null;
    envois.push({ url: String(url), methode: init?.method ?? 'GET', corps });
    return new Response(JSON.stringify({ profile_id: 1, actif: corps?.actif ?? true, theme: corps?.theme ?? null, id: 1 }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    });
  }));
  urlMonTheme.set('/api/v1/ext/mon-theme/theme');
  etatGreffonTheme.set('actif');
  themeDuProfil.set({ actif: false, theme: null });
  carteAPartager.set(null);
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

describe('#2527 — la carte « thème » de la messagerie', () => {
  it('🔴 se lit au contrat cloud : nom et 20 couleurs, rien d’autre', () => {
    const recue = carteCercle({ ...carte({ ...COULEURS, '--v2-bg2': '#080a09' }), cover_url: 'https://coverartarchive.org/x', artist_name: 'X' });
    expect(recue).toEqual(carte());
    expect(Object.keys(recue!)).toEqual(['type', 'title', 'colors']);
  });

  it.each([
    ['une couleur en trop', { ...COULEURS, '--v2-danger-soft': '#FF0000' }],
    ['une couleur injectée', { ...COULEURS, '--v2-bg': '#000000;}body{x:y' }],
    ['une couleur manquante', Object.fromEntries(Object.entries(COULEURS).slice(1))],
  ])('une carte abîmée (%s) ne s’affiche pas', (_n, colors) => {
    expect(carteCercle({ type: 'theme', title: 'X', colors })).toBeNull();
  });

  it('les cartes musique ne changent pas', () => {
    expect(carteCercle({ type: 'album', title: 'Kind of Blue', colors: COULEURS })).toEqual({ type: 'album', title: 'Kind of Blue' });
  });

  it('part au relais du greffon Circle, projetée', async () => {
    await envoyerMessage(7, 'Voici mon thème', carte());
    expect(envois).toHaveLength(1);
    expect(envois[0].url).toContain('/ext/circle/conversations/7/messages');
    expect(envois[0].corps).toEqual({ body: 'Voici mon thème', card: carte() });
  });
});

describe('#2527 — « Appliquer » un thème reçu', () => {
  it('🔴 un thème illisible n’est jamais rangé', async () => {
    const r = await appliquerThemeRecu(themeDeCarte(carte({ ...COULEURS, '--v2-txt': '#111111' })));
    expect(r).toBe('illisible');
    expect(envois).toEqual([]);
  });

  it('un thème lisible se range dans le profil, et devient actif', async () => {
    expect(await appliquerThemeRecu(themeDeCarte(carte()))).toBe('applique');
    expect(envois).toHaveLength(1);
    expect(envois[0]).toMatchObject({ methode: 'PUT', corps: { actif: true, theme: jugerTheme(themeDeCarte(carte())).ok ? themeDeCarte(carte()) : null } });
    expect(get(themeDuProfil).actif).toBe(true);
  });

  it('dans le fil : aperçu, bouton, et application d’un clic', async () => {
    monte = mount(CarteThemeCercleV2, { target: cible, props: { carte: carte() } });
    flushSync();
    const b = cible.querySelector('button')!;
    expect(b.textContent).toContain('Appliquer ce thème');
    expect(b.disabled).toBe(false);
    b.click();
    await vi.waitFor(() => expect(envois.some((e) => e.methode === 'PUT')).toBe(true));
  }, DELAI_MONTAGE);

  it('dans le fil, un thème illisible a son bouton désactivé', () => {
    monte = mount(CarteThemeCercleV2, { target: cible, props: { carte: carte({ ...COULEURS, '--v2-txt': '#111111' }) } });
    flushSync();
    expect(cible.querySelector('button')!.disabled).toBe(true);
    expect(cible.textContent).toContain('pas lisible');
  }, DELAI_MONTAGE);
});

describe('#2527 — « Envoyer à un contact » depuis « Mon thème »', () => {
  it('ouvre la boîte de partage de la messagerie avec la carte du thème', () => {
    themeDuProfil.set({ actif: true, theme: themeDeCarte(carte()) });
    monte = mount(MonThemeV2, { target: cible });
    flushSync();
    [...cible.querySelectorAll('button')].find((b) => /Modifier mon thème/.test(b.textContent ?? ''))!.click();
    flushSync();
    [...cible.querySelectorAll('button')].find((b) => /Envoyer à un contact/.test(b.textContent ?? ''))!.click();
    expect(get(carteAPartager)).toEqual(carte());
  }, DELAI_MONTAGE);
});
