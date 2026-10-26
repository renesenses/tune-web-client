// @vitest-environment jsdom
//
// tune-server-rust#6474 — René Burmand Johannesson, fil 2313 (« Artist Sort by
// Family Name ») : « a library-wide option for sorting artists by family name
// / surname, while keeping the normal artist name for display […] Settings →
// Library → Artist sort order ». Go de Bertrand du 19/10/2026.
//
// Le nom de tri (`sort_name`) vient des balises ARTISTSORT / ALBUMARTISTSORT
// (le serveur, même issue) ou de « Éditer l'artiste ». Le réglage du profil
// « Trier les artistes par nom de famille » décide de la clé : coché (défaut,
// l'ordre livré depuis #4956) le nom de tri, décoché le nom affiché. Sans nom
// de tri, aucune règle n'est inventée : l'artiste se range à son nom.
//
// 🔴 Ces témoins MONTENT la vraie grille et lisent l'ordre et les lettres
// RENDUS.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import ArtistesV2 from '../../components/v2/ArtistesV2.svelte';
import { preferences } from '../stores/preferences';
import { cleDeTriArtiste, comparerArtistes } from '../ordreAlphabetique';
import de from '../locales/de';
import en from '../locales/en';
import es from '../locales/es';
import fr from '../locales/fr';
import hu from '../locales/hu';
import vi_ from '../locales/vi';
import el_ from '../locales/el';
import nb_ from '../locales/nb';
import it_ from '../locales/it';
import ja from '../locales/ja';
import ko from '../locales/ko';
import ro from '../locales/ro';
import sv from '../locales/sv';
import zh from '../locales/zh';

vi.setConfig({ testTimeout: 30_000 });

const ARTISTES = [
  { id: 1, name: 'Miles Davis', sort_name: 'Davis, Miles', image_path: null },
  { id: 2, name: 'David Bowie', sort_name: 'Bowie, David', image_path: null },
  { id: 3, name: 'Joni Mitchell', sort_name: 'Mitchell, Joni', image_path: null },
  // Sans nom de tri : rangé à son nom, jamais « Beatles, The » inventé.
  { id: 4, name: 'The Beatles', sort_name: null, image_path: null },
  { id: 5, name: 'Ludwig van Beethoven', sort_name: '', image_path: null },
];

describe('#6474 — la clé de tri', () => {
  it('coché (défaut) : le nom de tri s’il existe ; décoché : le nom affiché', () => {
    expect(cleDeTriArtiste(ARTISTES[0])).toBe('Davis, Miles');
    expect(cleDeTriArtiste(ARTISTES[0], true)).toBe('Davis, Miles');
    expect(cleDeTriArtiste(ARTISTES[0], false)).toBe('Miles Davis');
    // Aucune règle inventée quand le nom de tri manque.
    expect(cleDeTriArtiste(ARTISTES[3], true)).toBe('The Beatles');
    expect(cleDeTriArtiste(ARTISTES[4], true)).toBe('Ludwig van Beethoven');
  });

  it('comparerArtistes suit le réglage', () => {
    const noms = (par: boolean) => [...ARTISTES].sort((a, b) => comparerArtistes(a, b, par)).map((a) => a.name);
    expect(noms(true)).toEqual(['David Bowie', 'Miles Davis', 'Ludwig van Beethoven', 'Joni Mitchell', 'The Beatles']);
    expect(noms(false)).toEqual(['David Bowie', 'Joni Mitchell', 'Ludwig van Beethoven', 'Miles Davis', 'The Beatles']);
  });
});

describe('#6474 — le réglage', () => {
  const lire = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf-8');
  it('vit dans Réglages › Bibliothèque, gardé par le profil (ui_preferences)', () => {
    expect(lire('src/lib/v2Settings.ts')).toMatch(/id: 'artistSort', titleKey: 'settings\.artistSort', from: 'library'/);
    const reglages = lire('src/components/v2/SettingsV2.svelte');
    expect(reglages).toContain("s.id === 'artistSort'");
    expect(reglages).toContain('trierArtistesParNomDeTri: (e.currentTarget as HTMLInputElement).checked');
    expect(lire('src/lib/stores/preferences.ts')).toContain('trierArtistesParNomDeTri: true,');
  });

  it('est traduit dans les douze langues', () => {
    const langues = { de, en, es, fr, hu, vi: vi_, el: el_, nb: nb_, it: it_, ja, ko, ro, sv, zh } as Record<string, Record<string, string>>;
    for (const [code, l] of Object.entries(langues)) {
      for (const k of ['settings.artistSort', 'settings.artistSortLabel', 'settings.artistSortHint']) {
        expect(l[k], `${code} : ${k}`).toBeTruthy();
      }
    }
    expect(fr['settings.artistSortLabel']).toBe('Trier les artistes par nom de famille');
  });
});

const reponse = (corps: unknown) => ({
  ok: true, status: 200, statusText: 'OK',
  headers: new Map([['content-type', 'application/json']]),
  json: async () => corps,
  text: async () => JSON.stringify(corps),
} as unknown as Response);

async function jusqua(condition: () => boolean, borne = 8000): Promise<void> {
  const fin = Date.now() + borne;
  for (;;) {
    flushSync();
    if (condition()) return;
    if (Date.now() >= fin) return;
    await new Promise((r) => setTimeout(r, 0));
  }
}

describe('#6474 — la grille montée', () => {
  let hote: HTMLDivElement | null = null;
  let monte: Record<string, unknown> | null = null;
  let avant: boolean;

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(async (url: any) => {
      const u = String(url);
      if (/\/library\/artists(\?|$)/.test(u)) return reponse(ARTISTES);
      return reponse(/\/(artists|albums|tracks|zones|profiles)(\?|\/|$)/.test(u) ? [] : {});
    }));
    vi.stubGlobal('WebSocket', class { close() {} addEventListener() {} removeEventListener() {} send() {} } as any);
    vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} } as any);
    preferences.update((p) => { avant = p.trierArtistesParNomDeTri; return p; });
  });
  afterEach(() => {
    if (monte) unmount(monte);
    monte = null;
    hote?.remove();
    hote = null;
    preferences.update((p) => ({ ...p, trierArtistesParNomDeTri: avant }));
    vi.unstubAllGlobals();
  });

  const noms = () => [...hote!.querySelectorAll('.grille.artistes .carte .ct')].map((n) => n.textContent?.trim());
  const lettres = () =>
    [...hote!.querySelectorAll<HTMLElement>('.grille.artistes .carte[data-lettre]')].map((c) => c.dataset.lettre);

  async function monter(parNomDeTri: boolean) {
    preferences.update((p) => ({ ...p, trierArtistesParNomDeTri: parNomDeTri }));
    hote = document.createElement('div');
    document.body.appendChild(hote);
    monte = mount(ArtistesV2, { target: hote, props: { q: '' } });
    await jusqua(() => noms().length >= ARTISTES.length);
  }

  it('coché : Miles Davis sous D, Joni Mitchell sous M — le nom affiché ne change pas', async () => {
    await monter(true);
    expect(noms()).toEqual(['David Bowie', 'Miles Davis', 'Ludwig van Beethoven', 'Joni Mitchell', 'The Beatles']);
    expect(lettres()).toEqual(['B', 'D', 'L', 'M', 'T']);
  });

  it('décoché : le nom affiché, lettres comprises', async () => {
    await monter(false);
    expect(noms()).toEqual(['David Bowie', 'Joni Mitchell', 'Ludwig van Beethoven', 'Miles Davis', 'The Beatles']);
    expect(lettres()).toEqual(['D', 'J', 'L', 'M', 'T']);
  });
});
