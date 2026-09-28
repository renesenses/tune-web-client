// @vitest-environment jsdom
//
// web#1660 — « Les playlists mis dans l'étiquette apparaîssent en ligne.
// Mettre le mode GRID et permettre d'ouvrir la playlist en cliquant sur la
// vignette et proposer les actions sur la vignettes comme par défaut »
// (FabienM, fil 1990 point 2, 27/09/2026, 0.9.166).
//
// L'onglet Playlists de l'écran Étiquettes dessinait une LIGNE par playlist —
// un pictogramme, le nom, un compte — là où les onglets Albums et Artistes du
// MÊME écran dessinaient déjà des vignettes. Et une playlist de service (id
// nul) y était inerte : « n'a pas encore d'écran qui l'accueille », ce qui
// n'est plus vrai depuis web#1649.
//
// 🔴 CE TÉMOIN MONTE L'ÉCRAN et lit ce qui est réellement dessiné, puis les
// requêtes réellement émises (`fetch` bouchonné au plus bas niveau). Il
// n'appelle aucune fonction interne : un témoin qui le ferait ne prouverait
// pas que l'écran s'en sert.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import EtiquettesV2 from '../../components/v2/EtiquettesV2.svelte';
import { locale } from '../i18n';
import { currentZoneId } from '../stores/zones';
import lFr from '../locales/fr';

vi.setConfig({ testTimeout: 30_000 });

const fr = lFr as unknown as Record<string, string>;

interface Requete { method: string; url: string; body: any }
let requetes: Requete[] = [];
/** Réponse par motif d'URL — le premier motif contenu dans l'URL gagne. */
let reponses: [string, unknown][] = [];

class ObservateurInerte { observe() {} unobserve() {} disconnect() {} }

const respirer = () => new Promise((r) => setTimeout(r, 0));
async function souffler(n = 10) {
  for (let i = 0; i < n; i++) { await respirer(); flushSync(); }
}

/**
 * Attendre une CONDITION, pas un nombre de tours.
 *
 * La fiche d'une playlist de service est chargée à la demande
 * (`{#await import(…)}`) : sous vitest, la transformation du module prend
 * bien plus que quelques `setTimeout(0)`. Compter les tours rendrait ce
 * témoin faussement rouge sur une machine chargée.
 */
async function attendre(pret: () => boolean, tours = 200): Promise<void> {
  for (let i = 0; i < tours; i++) {
    flushSync();
    if (pret()) return;
    await new Promise((r) => setTimeout(r, 25));
  }
  flushSync();
}

let hote: HTMLDivElement | null = null;
let monte: Record<string, unknown> | null = null;

/** Une playlist LOCALE : le serveur ne lui rend aucune pochette, elle se
 *  compose de celles de ses pistes. */
const PL_LOCALE = { id: 7, name: 'Route 66', track_count: 3 };
/** Une playlist DE SERVICE : id nul, la paire `source` + `source_id`, et
 *  l'instantané de pochette posé avec l'étiquette (#1238). */
const PL_QOBUZ = {
  id: null, name: 'Qobuz Weekly', source: 'qobuz', source_id: '70608857',
  cover_path: 'https://static.qobuz.com/weekly.jpg',
};
/** Une playlist INTELLIGENTE : une règle, pas une liste figée (#4798). */
const PL_SMART = { id: 2, name: 'Most Played' };

function bouchonner() {
  reponses = [
    ['/tags/4/albums', { tag_id: 4, count: 0, albums: [] }],
    ['/tags/4/artists', { artists: [], count: 0 }],
    ['/tags/4/tracks', { tracks: [], count: 0 }],
    ['/tags/4/smart-playlists', { smart_playlists: [PL_SMART], count: 1 }],
    ['/tags/4/playlists', { playlists: [PL_LOCALE, PL_QOBUZ], count: 2 }],
    ['/tags/4/smart-collections', { smart_collections: [], count: 0 }],
    ['/tags/4/collections', { collections: [], count: 0 }],
    // Les pistes d'où viennent les quatre cases de la mosaïque.
    ['/playlists/7/tracks', [
      { id: 11, title: 'A', cover_path: '/c/a.jpg' },
      { id: 12, title: 'B', cover_path: '/c/b.jpg' },
    ]],
    ['/library/smart-playlists/2/tracks', [
      { id: 21, title: 'C', cover_path: '/c/c.jpg' },
    ]],
    ['/streaming/qobuz/playlists/70608857/tracks', []],
    ['/tags', [{ id: 4, name: 'Écouter plus tard', color: '#808080' }]],
  ];
}

async function ouvrirEtiquette(): Promise<void> {
  monte = mount(EtiquettesV2, { target: hote!, props: {} });
  await souffler();
  const tag = [...hote!.querySelectorAll('button.tag')]
    .find((b) => b.textContent?.includes('Écouter plus tard')) as HTMLButtonElement;
  expect(tag, 'l’étiquette n’est pas listée').toBeTruthy();
  tag.click();
  await souffler(14);
}

/** L'onglet Playlists est celui que `ouvrir()` choisit ici : c'est la
 *  première famille non vide de l'étiquette. */
function cartes(): HTMLElement[] {
  return [...hote!.querySelectorAll('.grille .carte')] as HTMLElement[];
}

beforeEach(() => {
  requetes = [];
  reponses = [];
  locale.set('fr');
  vi.stubGlobal('ResizeObserver', ObservateurInerte);
  vi.stubGlobal('IntersectionObserver', ObservateurInerte);
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    const method = (init?.method ?? 'GET').toUpperCase();
    let body: any = null;
    if (typeof init?.body === 'string') { try { body = JSON.parse(init.body); } catch { body = init.body; } }
    requetes.push({ method, url, body });
    const trouve = reponses.find(([motif]) => url.includes(motif));
    const charge = trouve ? trouve[1] : {};
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
  document.querySelectorAll('.fond').forEach((e) => e.remove());
  currentZoneId.set(null);
  vi.unstubAllGlobals();
});

describe('web#1660 — l’onglet Playlists d’une étiquette', () => {
  it('🔴 les trois playlists sont des VIGNETTES en grille, plus des lignes', async () => {
    bouchonner();
    await ouvrirEtiquette();

    const noms = cartes().map((c) => c.querySelector('.ct')?.textContent);
    expect(noms, 'les playlists ne sont pas dessinées en grille de vignettes (.grille .carte)')
      .toEqual(['Route 66', 'Qobuz Weekly', 'Most Played']);

    // La LIGNE d'avant ne doit plus être là : deux présentations de la même
    // chose finiraient par diverger.
    expect(
      [...hote!.querySelectorAll('.simple .sn')].map((e) => e.textContent),
      'l’onglet dessine encore des lignes sans pochette',
    ).not.toContain('Route 66');
  });

  it('🔴 chaque vignette porte les actions par défaut : lire, étiqueter, ouvrir', async () => {
    bouchonner();
    await ouvrirEtiquette();

    for (const nom of ['Route 66', 'Qobuz Weekly', 'Most Played']) {
      const lire = [...hote!.querySelectorAll('button')].find(
        (b) => b.getAttribute('aria-label') === `${fr['common.play']} — ${nom}`,
      );
      expect(lire, `pas de bouton Lire sur la vignette « ${nom} »`).toBeTruthy();
      const ouvrir = [...hote!.querySelectorAll('button.ouvrir')].find(
        (b) => b.getAttribute('aria-label') === nom,
      );
      expect(ouvrir, `la vignette « ${nom} » ne s’ouvre pas au clic`).toBeTruthy();
    }
    const etiqueter = [...hote!.querySelectorAll('button')].filter(
      (b) => b.getAttribute('aria-label') === fr['v2.cover.tags'],
    );
    expect(etiqueter.length, 'le bouton Étiquettes manque sur les vignettes de playlists')
      .toBeGreaterThanOrEqual(3);
  });

  it('🔴 la pochette d’une playlist locale est la MOSAÏQUE de ses pistes', async () => {
    bouchonner();
    await ouvrirEtiquette();

    const lu = requetes.find((r) => r.url.includes('/playlists/7/tracks'));
    expect(lu, 'la mosaïque n’a pas été demandée : la vignette reste sans pochette').toBeTruthy();

    const carte = cartes().find((c) => c.querySelector('.ct')?.textContent === 'Route 66')!;
    const images = [...carte.querySelectorAll('img')].map((i) => i.getAttribute('src') ?? '');
    expect(
      images.some((s) => s.includes('a.jpg')) && images.some((s) => s.includes('b.jpg')),
      'les pochettes des pistes ne remplissent pas la mosaïque de la playlist',
    ).toBe(true);
  });

  it('🔴 une playlist DE SERVICE n’est plus inerte : sa vignette ouvre sa fiche', async () => {
    bouchonner();
    await ouvrirEtiquette();

    const ouvrir = [...hote!.querySelectorAll('button.ouvrir')].find(
      (b) => b.getAttribute('aria-label') === 'Qobuz Weekly',
    ) as HTMLButtonElement;
    expect(ouvrir, 'la playlist Qobuz étiquetée ne s’ouvre toujours pas').toBeTruthy();
    ouvrir.click();
    const ouverte = () => requetes.some((r) => r.url.includes('/streaming/qobuz/playlists/70608857/tracks'));
    await attendre(ouverte);

    expect(ouverte(), 'la fiche de la playlist Qobuz ne s’est pas ouverte (ses pistes ne sont pas lues)')
      .toBe(true);
  });

  it('🔴 « Lire » d’une playlist de service part avec la paire, pas avec un entier', async () => {
    currentZoneId.set(1);
    bouchonner();
    reponses.unshift(['/zones/1/play', { id: 1, name: 'Z', state: 'playing' }]);
    await ouvrirEtiquette();

    const lire = [...hote!.querySelectorAll('button')].find(
      (b) => b.getAttribute('aria-label') === `${fr['common.play']} — Qobuz Weekly`,
    ) as HTMLButtonElement;
    lire.click();
    await souffler(14);

    const play = requetes.find((r) => r.method === 'POST' && r.url.includes('/zones/1/play'));
    expect(play, 'un clic sur « Lire » de la playlist Qobuz étiquetée ne fait rien').toBeTruthy();
    expect(play!.body).toEqual({ streaming_playlist_id: '70608857', source: 'qobuz' });
  });
});
