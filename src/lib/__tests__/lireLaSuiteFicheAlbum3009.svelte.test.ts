// @vitest-environment jsdom
//
// Fil 3009, point 10 (FabienM, v1.0.0-rc13) — « Menu bibliothèque : quand on
// clique sur un album, le "Lire la suite" de la bio ne fonctionne pas, ça ne
// fait rien quand on clique dessus alors que ça devrait afficher la suite. »
//
// Le bouton basculait sur l'onglet « Notes / Bio », plus bas dans la page, qui
// remontrait la même notice coupée à quatre lignes : sous la pochette, rien ne
// bougeait. Le témoin MONTE la fiche d'un album de la bibliothèque et CLIQUE :
// la présentation se déplie sur place, « Réduire » la replie, et l'onglet des
// pistes reste ouvert.
//
// Contre-épreuve : sur `origin/main` (a10e4118), le clic ouvre l'onglet
// « Notes / Bio » (`[data-panneau-bio]`) et le paragraphe garde sa coupe : le
// témoin rougit.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import { get } from 'svelte/store';
import { t } from '../i18n';
import AlbumDetailV2 from '../../components/v2/AlbumDetailV2.svelte';

vi.setConfig({ testTimeout: 60_000 });

class ObservateurInerte { observe() {} unobserve() {} disconnect() {} }

const BIO = 'Kind of Blue est un album de Miles Davis, enregistré en 1959. '.repeat(20).trim();

function reponse(corps: unknown) {
  return {
    ok: true, status: 200, statusText: 'OK',
    headers: new Map([['content-type', 'application/json']]),
    json: async () => corps,
    text: async () => JSON.stringify(corps),
  } as unknown as Response;
}

function corpsPour(u: string): unknown {
  if (/\/library\/albums\/7\/bio/.test(u)) return { bio: BIO, source: 'musicbrainz' };
  if (/\/library\/albums\/7(\?|$)/.test(u)) return { id: 7, title: 'Kind of Blue', source: 'local' };
  if (/\/config/.test(u)) return {};
  return [];
}

async function laisserFaire(n = 60, jusqua?: () => boolean) {
  for (let i = 0; i < n; i++) {
    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));
    flushSync();
    if (jusqua?.()) return;
  }
}

let hote: HTMLDivElement;
let monte: Record<string, any> | null = null;

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', ObservateurInerte as any);
  if (!('IntersectionObserver' in globalThis)) vi.stubGlobal('IntersectionObserver', ObservateurInerte as any);
  vi.stubGlobal('fetch', vi.fn(async (url: any) => {
    const u = String(url);
    if (/\/ext\/bandcamp\/tags/.test(u)) throw new Error('extension absente');
    return reponse(corpsPour(u));
  }));
  (Element.prototype as any).scrollIntoView = () => {};
  hote = document.createElement('div');
  document.body.appendChild(hote);
});

afterEach(() => {
  if (monte) { try { unmount(monte); } catch { /* hors sujet */ } }
  monte = null;
  hote.remove();
  document.body.innerHTML = '';
  vi.unstubAllGlobals();
});

describe('fil 3009, point 10 — « Lire la suite » de la fiche album', () => {
  it('déplie la présentation sur place, puis la replie, sans quitter les pistes', async () => {
    const album = { id: 7, title: 'Kind of Blue', source: 'local', artist_name: 'Miles Davis' } as any;
    monte = mount(AlbumDetailV2, { target: hote, props: { album, onClose: () => {} } });
    await laisserFaire(80, () => !!hote.querySelector('[data-lire-suite]'));

    const bouton = hote.querySelector('[data-lire-suite]') as HTMLButtonElement | null;
    expect(bouton, 'la présentation et son « Lire la suite » sont affichés').not.toBeNull();
    const texte = hote.querySelector('[data-description-album] p') as HTMLElement;
    expect(texte.textContent).toBe(BIO);
    expect(texte.classList.contains('depliee')).toBe(false);

    bouton!.click();
    flushSync();
    expect(hote.querySelector('[data-panneau-bio]'), 'le clic ne part pas vers un autre onglet').toBeNull();
    expect(texte.classList.contains('depliee'), '« Lire la suite » doit déplier le texte').toBe(true);
    expect(bouton!.getAttribute('aria-expanded')).toBe('true');
    expect(bouton!.textContent?.trim()).toBe(get(t)('v2.art.bioReadLess' as any));

    bouton!.click();
    flushSync();
    expect(bouton!.getAttribute('aria-expanded')).toBe('false');
    expect(texte.classList.contains('depliee')).toBe(false);
    expect(bouton!.textContent?.trim()).toBe(get(t)('v2.album.fiche.readMore' as any));
  });
});
