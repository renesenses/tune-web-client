// @vitest-environment jsdom
//
// 15/11/2026 (Bertrand, rc12) — Qobuz › Genres › Pop/Rock : chaque rubrique
// (« New Releases », puis les suivantes) était une longue grille complète ;
// pour atteindre la suivante, il fallait toute la faire défiler.
//
// Ces témoins MONTENT le vrai `StreamingV2` : des puces d'ancrage, une par
// rubrique présente, amènent à la rubrique ; chaque grille ne montre d'abord
// que deux rangées, et « Voir plus » déplie la suite (déjà chargée). TIDAL,
// qui ne sert pas de rubriques, garde sa grille unique — avec « Voir plus ».
//
// Contre-épreuve : `StreamingV2.svelte` d'`origin/main` n'a ni `.ancres-genre`
// ni bouton `[data-voir-plus]` : les témoins de rendu rougissent.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import { get } from 'svelte/store';
import { activeStreamingService } from '../stores/streaming';
import { activeView } from '../stores/navigation';
import { detailOuvert, ongletCourant } from '../historiqueCoquille';
import { oublierMemoireStreaming } from '../memoireStreaming';
import { t } from '../i18n';
import StreamingV2 from '../../components/v2/StreamingV2.svelte';
import { colonnesDeGrille, limiteInitiale, rubriqueCourante } from '../ancresGenre';

vi.setConfig({ testTimeout: 60_000 });

const SERVICES = {
  qobuz: { enabled: true, authenticated: true, username: 'Bertrand' },
  tidal: { enabled: true, authenticated: true, username: 'Bertrand' },
} as any;

function reponse(corps: unknown) {
  return {
    ok: true, status: 200, statusText: 'OK',
    headers: new Map([['content-type', 'application/json']]),
    json: async () => corps,
    text: async () => JSON.stringify(corps),
  } as unknown as Response;
}

class ObservateurInerte { observe() {} unobserve() {} disconnect() {} }

const albums = (svc: string, prefixe: string, n: number) => Array.from({ length: n }, (_, i) => ({
  source: svc, source_id: `${prefixe}${i}`, title: `${prefixe} ${i}`, artist_name: 'Artiste', cover_path: null,
}));

// 1000 px de large : (1000 + 20) / (150 + 20) = 6 colonnes, donc 12 pochettes d'abord.
const LARGEUR = 1000;
const PREMIERES = 12;

function corpsPour(u: string): unknown {
  if (/\/streaming\/services/.test(u)) return SERVICES;
  if (/\/streaming\/qobuz\/featured\/sections/.test(u)) {
    return [{ id: 'new-releases', name: 'New Releases' }, { id: 'press-awards', name: 'Press Awards' }, { id: 'qobuzissims', name: 'Qobuzissims' }];
  }
  if (/\/streaming\/qobuz\/genres\/112\/albums.*section=new-releases/.test(u)) return albums('qobuz', 'nr', 30);
  if (/\/streaming\/qobuz\/genres\/112\/albums.*section=press-awards/.test(u)) return albums('qobuz', 'pa', 20);
  // Une rubrique qui tient en deux rangées : pas de « Voir plus ».
  if (/\/streaming\/qobuz\/genres\/112\/albums.*section=qobuzissims/.test(u)) return albums('qobuz', 'qz', 5);
  if (/\/streaming\/qobuz\/genres(\?|$)/.test(u)) return [{ id: '112', name: 'Pop/Rock' }, { id: '80', name: 'Jazz' }];
  if (/\/streaming\/tidal\/genres\/pop\/albums/.test(u)) return albums('tidal', 'td', 25);
  if (/\/streaming\/tidal\/genres(\?|$)/.test(u)) return [{ id: 'pop', name: 'Pop' }, { id: 'rock', name: 'Rock' }];
  if (/\/config/.test(u)) return {};
  return [];
}

let hote: HTMLDivElement | null = null;
let monte: Record<string, any> | null = null;
let defilements: string[] = [];

async function laisserFaire(n = 60, jusqua?: () => boolean) {
  for (let i = 0; i < n; i++) {
    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));
    flushSync();
    if (jusqua?.()) return;
  }
}

const boutons = (sel: string) => Array.from(hote!.querySelectorAll<HTMLButtonElement>(sel));
const bouton = (sel: string, texte: string) => boutons(sel).find((b) => (b.textContent ?? '').trim() === texte) ?? null;
const tuilesDe = (sec: Element | null) => sec?.querySelectorAll('.grid > *').length ?? 0;

async function ouvrirGenre(service: string, genre: string) {
  activeStreamingService.set(service);
  activeView.set('streaming');
  monte = mount(StreamingV2 as any, { target: hote! });
  const genres = get(t)('common.genres' as any);
  await laisserFaire(80, () => !!bouton('nav.subs > button', genres));
  bouton('nav.subs > button', genres)!.click();
  await laisserFaire(80, () => !!bouton('.chips .chip', genre));
  bouton('.chips .chip', genre)!.click();
  await laisserFaire(120, () => hote!.querySelectorAll('.grid > *').length > 0);
}

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', ObservateurInerte as any);
  if (!('IntersectionObserver' in globalThis)) vi.stubGlobal('IntersectionObserver', ObservateurInerte as any);
  vi.stubGlobal('fetch', vi.fn(async (url: any) => {
    const u = String(url);
    if (/\/ext\/bandcamp\/tags/.test(u)) throw new Error('extension absente');
    return reponse(corpsPour(u));
  }));
  // jsdom ne mesure rien : on donne au volet la largeur d'un écran de bureau.
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(LARGEUR);
  defilements = [];
  (Element.prototype as any).scrollIntoView = function (this: Element) { defilements.push(this.id); };
  hote = document.createElement('div');
  document.body.appendChild(hote);
});

afterEach(() => {
  if (monte) { try { unmount(monte); } catch { /* hors sujet */ } }
  monte = null;
  hote?.remove();
  hote = null;
  document.body.innerHTML = '';
  activeStreamingService.set(null as any);
  activeView.set('home');
  detailOuvert.set(null);
  ongletCourant.set(null);
  oublierMemoireStreaming();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  delete (Element.prototype as any).scrollIntoView;
});

describe('15/11 — les rubriques d’un genre : puces d’ancrage', () => {
  it('une puce par rubrique présente, dans l’ordre des rubriques', async () => {
    await ouvrirGenre('qobuz', 'Pop/Rock');
    const titres = Array.from(hote!.querySelectorAll('section.rubrique > h2')).map((h) => (h.textContent ?? '').trim());
    const puces = boutons('nav.ancres-genre .chip').map((b) => (b.textContent ?? '').trim());
    expect(titres).toHaveLength(3);
    expect(puces).toEqual(titres);
  });

  it('un clic fait défiler jusqu’à la rubrique et met sa puce en évidence', async () => {
    await ouvrirGenre('qobuz', 'Pop/Rock');
    const puces = boutons('nav.ancres-genre .chip');
    const sections = Array.from(hote!.querySelectorAll('section.rubrique'));
    puces[1].click();
    flushSync();
    expect(defilements).toEqual([sections[1].id]);
    expect(puces[1].classList.contains('active')).toBe(true);
    expect(puces[1].getAttribute('aria-current')).toBe('true');
    expect(puces[0].classList.contains('active')).toBe(false);
  });

  it('la rangée est figée en haut et défile à l’horizontale sous 640 px', async () => {
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const src = readFileSync(resolve(process.cwd(), 'src/components/v2/StreamingV2.svelte'), 'utf-8');
    expect(src).toMatch(/<nav class="sommaire ancres-genre"/);
    expect(src).toMatch(/\.sommaire\{position:sticky; top:-8px;/);
    expect(src).toMatch(/@media \(max-width: 640px\)\{\s*\.ancres-genre\{flex-wrap:nowrap; overflow-x:auto;/);
  });

  it('TIDAL (une seule liste, sans rubriques) : pas de puces', async () => {
    await ouvrirGenre('tidal', 'Pop');
    expect(hote!.querySelector('nav.ancres-genre')).toBeNull();
  });
});

describe('15/11 — « Voir plus » : deux rangées d’abord, la suite au clic', () => {
  it('chaque grille montre deux rangées, « Voir plus » montre toute la rubrique', async () => {
    await ouvrirGenre('qobuz', 'Pop/Rock');
    const [nr, pa, qz] = Array.from(hote!.querySelectorAll('section.rubrique'));
    expect(tuilesDe(nr)).toBe(PREMIERES);
    expect(tuilesDe(pa)).toBe(PREMIERES);
    const plus = nr.querySelector<HTMLButtonElement>('[data-voir-plus]');
    expect(plus?.textContent?.trim()).toBe(get(t)('v2.rech.seeMore' as any).replace('{n}', '18'));
    plus!.click();
    flushSync();
    expect(tuilesDe(nr), 'toute la rubrique, rien de perdu').toBe(30);
    expect(nr.querySelector('[data-voir-plus]')).toBeNull();
    expect(tuilesDe(pa), 'les autres rubriques restent repliées').toBe(PREMIERES);
    // Tout tient en deux rangées : pas de bouton.
    expect(tuilesDe(qz)).toBe(5);
    expect(qz.querySelector('[data-voir-plus]')).toBeNull();
  });

  it('TIDAL : la grille unique se replie aussi, et se déplie', async () => {
    await ouvrirGenre('tidal', 'Pop');
    expect(hote!.querySelectorAll('.grid > *').length).toBe(PREMIERES);
    hote!.querySelector<HTMLButtonElement>('[data-voir-plus]')!.click();
    flushSync();
    expect(hote!.querySelectorAll('.grid > *').length).toBe(25);
  });
});

describe('ancresGenre — le calcul', () => {
  it('suit `repeat(auto-fill, minmax(150px, 1fr))` avec 20 px d’écart', () => {
    expect(colonnesDeGrille(0)).toBe(0);
    expect(colonnesDeGrille(100)).toBe(1);
    expect(colonnesDeGrille(320)).toBe(2);
    expect(colonnesDeGrille(1000)).toBe(6);
    expect(limiteInitiale(1000)).toBe(12);
    // Largeur inconnue : tout est montré, rien n'est replié à l'aveugle.
    expect(limiteInitiale(0)).toBe(Infinity);
  });
  it('la rubrique courante est la dernière passée sous la bande', () => {
    const pos = [{ id: 'a', haut: -400 }, { id: 'b', haut: 30 }, { id: 'c', haut: 600 }];
    expect(rubriqueCourante(pos, 60)).toBe('b');
    expect(rubriqueCourante(pos, 10)).toBe('a');
    expect(rubriqueCourante([{ id: 'a', haut: 200 }], 60)).toBe('a');
    expect(rubriqueCourante([], 60)).toBeNull();
  });
});
