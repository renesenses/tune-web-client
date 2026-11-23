// @vitest-environment jsdom
//
// Fil forum 3009 (FabienM, point 18 ; go de Bertrand du 23/11/2026) — « Menu
// Qobuz - Playlist : quand on ouvre une playlist toute la description est
// affichée, elle peut être longue. Afficher les 7 premières lignes puis un
// bouton "Voir plus" ».
//
// On MONTE la vraie fiche d'une playlist Qobuz. jsdom ne met pas en page : le
// banc pose une mise en page MODÈLE sur le seul bloc `.clamp-text` (22 px par
// ligne, 80 caractères par ligne, sept lignes visibles quand il porte
// `.clamped`), comme `biographieDepliable1958.svelte.test.ts`.
//
// Contre-épreuve : `PlaylistDetailV2.svelte` remis à `origin/main`, les trois
// premières épreuves rougissent — la description s'affiche en entier, sans
// repli ni bouton.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import PlaylistDetailV2 from '../../components/v2/PlaylistDetailV2.svelte';
import { locale } from '../i18n';
import { currentZoneId } from '../stores/zones';

vi.setConfig({ testTimeout: 30_000 });

const LIGNE = 22;
const VISIBLES = 7;
const LONGUE = 'Une sélection de soul des années soixante-dix, choisie par la rédaction. '.repeat(20); // ≈ 18 lignes
const COURTE = 'Le meilleur de la soul.';

const proto = HTMLElement.prototype as any;
const lignes = (el: HTMLElement) => Math.max(1, Math.ceil((el.textContent ?? '').trim().length / 80));
const visible = (el: HTMLElement) => (el.classList.contains('clamped') ? Math.min(lignes(el), VISIBLES) : lignes(el)) * LIGNE;

class ObservateurInerte { observe() {} unobserve() {} disconnect() {} }

let hote: HTMLDivElement | null = null;
let monte: Record<string, unknown> | null = null;

beforeEach(() => {
  locale.set('fr');
  currentZoneId.set(1);
  vi.stubGlobal('ResizeObserver', ObservateurInerte);
  vi.stubGlobal('IntersectionObserver', ObservateurInerte);
  Object.defineProperty(proto, 'clientHeight', {
    configurable: true,
    get(this: HTMLElement) { return this.classList?.contains('clamp-text') ? visible(this) : 0; },
  });
  Object.defineProperty(proto, 'scrollHeight', {
    configurable: true,
    // Le `line-clamp` standard JETTE les lignes cachées : le bloc replié ne
    // déborde pas, seule la mesure sans la classe dit la vraie hauteur.
    get(this: HTMLElement) {
      if (!this.classList?.contains('clamp-text')) return 0;
      return this.classList.contains('clamped') ? visible(this) : lignes(this) * LIGNE;
    },
  });
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input.toString();
    const charge = url.includes('/streaming/qobuz/playlists/11/tracks')
      ? [{ id: null, title: 'Lovely Day', artist_name: 'Bill Withers', source: 'qobuz', source_id: '4791523' }]
      : {};
    return {
      ok: true, status: 200,
      headers: new Headers({ 'Content-Type': 'application/json' }),
      text: async () => JSON.stringify(charge),
      json: async () => charge,
    } as unknown as Response;
  }));
  hote = document.createElement('div');
  document.body.appendChild(hote);
});

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  hote?.remove();
  hote = null;
  delete proto.clientHeight;
  delete proto.scrollHeight;
  currentZoneId.set(null);
  vi.unstubAllGlobals();
});

async function ouvrir(description: string) {
  monte = mount(PlaylistDetailV2, {
    target: hote!,
    props: {
      item: { kind: 'streaming', service: 'qobuz', pl: { source_id: '11', name: 'Soul', track_count: 1, description } } as any,
      onClose: () => {},
    },
  });
  await vi.waitFor(() => {
    flushSync();
    if (!(hote!.textContent ?? '').includes('Lovely Day')) throw new Error('titres absents');
  }, { timeout: 25_000, interval: 10 });
  for (let i = 0; i < 3; i++) await Promise.resolve();
  flushSync();
}
const bloc = () => hote!.querySelector<HTMLElement>('[data-description-playlist] .clamp-text');
const bouton = () => hote!.querySelector<HTMLButtonElement>('[data-description-playlist] .clamp-toggle');

describe('fil 3009, point 18 — la description d’une playlist Qobuz se replie à sept lignes', () => {
  it('🔴 longue : repliée à SEPT lignes', async () => {
    await ouvrir(LONGUE);
    expect(bloc(), 'la description n’est pas repliable').not.toBeNull();
    expect(bloc()!.classList.contains('clamped')).toBe(true);
    expect(bloc()!.style.getPropertyValue('--clamp-lines')).toBe('7');
    expect(bloc()!.textContent?.trim()).toBe(LONGUE.trim());
  });

  it('🔴 …suivie d’un bouton « Voir plus » qui déplie, puis replie', async () => {
    await ouvrir(LONGUE);
    expect(bouton(), 'pas de bouton « Voir plus »').not.toBeNull();
    expect(bouton()!.textContent?.trim()).toBe('Voir plus');
    bouton()!.click();
    flushSync();
    expect(bloc()!.classList.contains('clamped')).toBe(false);
    expect(bouton()!.getAttribute('aria-expanded')).toBe('true');
    bouton()!.click();
    flushSync();
    expect(bloc()!.classList.contains('clamped')).toBe(true);
    expect(bouton()!.textContent?.trim()).toBe('Voir plus');
  });

  it('🔴 les paragraphes de la description restent des lignes (pre-line)', async () => {
    await ouvrir(LONGUE);
    const src = (await import('node:fs')).readFileSync('src/components/v2/PlaylistDetailV2.svelte', 'utf8');
    expect(src).toMatch(/\[data-description-playlist\]\{white-space:pre-line\}/);
  });

  it('courte : rien à replier, aucun bouton', async () => {
    await ouvrir(COURTE);
    expect(bloc()).not.toBeNull();
    expect(bouton()).toBeNull();
    expect(hote!.textContent).toContain(COURTE);
  });
});
