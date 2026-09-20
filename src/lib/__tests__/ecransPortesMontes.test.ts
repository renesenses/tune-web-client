// @vitest-environment jsdom
//
// Les écrans PORTÉS de l'ancienne interface (phase 5, lots 1 à 5), MONTÉS.
//
// 🔴 CES TÉMOINS APPELLENT, ILS NE LISENT PAS. Les gardes de source des lots
// vérifient qu'un geste est branché ; elles ne peuvent pas voir qu'un
// composant lève à l'exécution — c'est l'angle mort qui a laissé partir la
// 0.9.62 (`albumWall`). Ici on monte, on nourrit avec les réponses RÉELLES du
// .18 (relevées le 20/09/2026), et on lit le DOM peint.
//
// Ce que chaque écran doit prouver : il se monte sans lever, il demande au
// serveur ce qu'il annonce, et il peint la donnée reçue.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync, type Component } from 'svelte';
import ConcertsView from '../../components/v2-heritage/ConcertsView.svelte';
import DashboardView from '../../components/v2-heritage/DashboardView.svelte';
import AjoutsRecentsV2 from '../../components/v2/AjoutsRecentsV2.svelte';
import YouTubeDecouverteV2 from '../../components/v2/YouTubeDecouverteV2.svelte';
import BandcampManquantsV2 from '../../components/v2/BandcampManquantsV2.svelte';

vi.setConfig({ testTimeout: 30_000 });

const ALBUM = {
  id: 7, title: 'Kind of Blue', artist_name: 'Miles Davis', artist_id: 3,
  cover_path: null, format: 'FLAC', sample_rate: 96000, bit_depth: 24, year: 1959,
};

/** Les corps que le .18 rend vraiment, réduits à ce que l'écran lit. */
function corpsPour(url: string): unknown {
  if (url.includes('/home/recently-added/summary')) {
    return { album_count: 1955, track_count: 24310, duration_ms: 5711480751, days: 15 };
  }
  if (url.includes('/home/recently-added')) return [ALBUM];
  if (url.includes('/streaming/youtube/charts')) {
    return { trending: [{ title: 'So What', artist_name: 'Miles Davis', source_id: 'yt1', duration_ms: 545000 }], songs: [], videos: [] };
  }
  if (url.includes('/streaming/youtube/moods')) return [{ title: 'Ambiances', items: [{ title: 'Calme', params: 'p1' }] }];
  if (url.includes('/ext/bandcamp/collection')) {
    return { items: [{ artist: 'Aphex Twin', title: 'Syro', type: 'album', url: 'https://x.bandcamp.com/album/syro' }], more_available: false, last_token: null };
  }
  if (url.includes('/library/albums')) return [{ ...ALBUM, title: 'Selected Ambient Works', artist_name: 'Aphex Twin' }];
  // Concerts : le greffon n'est pas installé sur le .18 — 404 traité plus bas.
  // Les palmarès rendent des LISTES ; le tableau de bord, un objet. Les
  // confondre fait échouer la simulation, pas l'écran.
  if (/\/library\/history\/top-(tracks|artists|albums)/.test(url)) return [];
  if (url.includes('/library/history/at')) return { items: [] };
  if (url.includes('/library/stats')) return { tracks: 1, albums: 1, artists: 1 };
  if (url.includes('/genres/tree')) return [];
  if (url.includes('/radios/picks') || url.includes('/radios')) return [];
  if (url.includes('/zones')) return [];
  if (url.includes('/library/history/dashboard')) {
    // Les CLÉS du .18, relevées le 20/09/2026. `hourly` en fait partie — et
    // c'est en l'omettant qu'on a vu l'écran lever (garde posée depuis).
    return {
      by_source: [{ source: 'qobuz', plays: 507, listening_ms: 138807000 }],
      by_zone: [], hourly: [], weekday_hourly: [], top_tracks: [], top_artists: [], top_albums: [],
      top_radios: [], completion: {}, streak: {}, trend: [], period: '30d', range: {},
      totals: { plays: 507, listening_ms: 138807000 },
    };
  }
  // Un serveur qui OMET un tableau ne doit pas blanchir l'écran.
  if (url.includes('/dashboard-tronque')) return { by_source: [] };
  if (url.includes('/home/top-mixes')) return [];
  if (url.includes('/library/recommendations')) return { albums: [], artists: [] };
  if (url.includes('/library/history')) return { items: [], total: 0 };
  return [];
}

let hote: HTMLDivElement | null = null;
let monte: Record<string, unknown> | null = null;
let appels: string[] = [];
let erreursConsole: string[] = [];
const ramasserWindow = (e: ErrorEvent) => { erreursConsole.push(String(e?.error?.message ?? e?.message ?? '')); };

const respirer = () => new Promise((r) => setTimeout(r, 0));
async function souffler(n = 4) {
  for (let i = 0; i < n; i++) { await respirer(); flushSync(); }
}
async function monter<P extends Record<string, unknown>>(Vue: Component<P>, props: P): Promise<HTMLDivElement> {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(Vue, { target: hote, props });
  flushSync();
  await souffler(5);
  // Une erreur de rendu remonte en exception ASYNCHRONE : sans cette pause,
  // elle arrive après les vérifications et le témoin reste vert devant un
  // écran cassé (mesuré en retirant une garde du tableau de bord).
  await new Promise((r) => setTimeout(r, 60));
  flushSync();
  return hote;
}

class ResizeObserverInerte { observe() {} unobserve() {} disconnect() {} }

beforeEach(() => {
  appels = [];
  erreursConsole = [];
  localStorage.clear();
  vi.stubGlobal('ResizeObserver', ResizeObserverInerte);
  vi.stubGlobal('IntersectionObserver', class { observe() {} unobserve() {} disconnect() {} } as any);
  vi.stubGlobal('WebSocket', class { close() {} addEventListener() {} removeEventListener() {} send() {} } as unknown as typeof WebSocket);
  // Une erreur d'exécution d'un composant Svelte atterrit ici sans faire
  // échouer le montage : on la RAMASSE, sinon l'écran « passe » tout en étant
  // cassé (l'incident albumWall, 0.9.62).
  vi.spyOn(console, 'error').mockImplementation((...a: unknown[]) => { erreursConsole.push(a.map(String).join(' ')); });
  // 🔴 Une erreur levée PENDANT le rendu d'un composant ne passe pas par
  // `console.error` : elle remonte en exception non rattrapée, que vitest
  // SIGNALE sans faire échouer le test. Sans ce ramassage, le témoin reste
  // vert devant un écran blanc — vérifié en retirant une garde.
  window.addEventListener('error', ramasserWindow);
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    appels.push(String(url));
    // Le greffon Concerts n'est pas installé : le serveur rend 404, comme sur
    // le .18. L'écran doit le supporter, pas s'effondrer.
    if (String(url).includes('/ext/concerts')) {
      return { ok: false, status: 404, statusText: 'Not Found', headers: new Map([['content-type', 'application/json']]),
        json: async () => ({ error: 'not found' }), text: async () => '{"error":"not found"}' } as unknown as Response;
    }
    const corps = corpsPour(String(url));
    return { ok: true, status: 200, statusText: 'OK', headers: new Map([['content-type', 'application/json']]),
      json: async () => corps, text: async () => JSON.stringify(corps) } as unknown as Response;
  }));
});

afterEach(() => {
  window.removeEventListener('error', ramasserWindow);
  if (monte) { try { unmount(monte); } catch { /* démontage best-effort */ } monte = null; }
  hote?.remove();
  hote = null;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

/**
 * Ce qui compte vraiment : aucun écran ne doit lever au montage.
 *
 * ⚠️ Deux filets, parce qu'une erreur de RENDU Svelte ne passe pas toujours
 * par `console.error` : elle remonte en exception non rattrapée, APRÈS la fin
 * du test. Elle ne fait donc pas rougir l'assertion — mais elle fait sortir
 * vitest en code 1, et c'est ce que la porte lit. Vérifié le 20/09/2026 en
 * retirant la garde `data.hourly?.length` : code 0 → code 1.
 */
const sansErreurDExecution = () => {
  const dures = erreursConsole.filter((m) => /is not defined|is not a function|Cannot read|undefined is not/.test(m));
  expect(dures, `erreur d’exécution au montage :\n${dures.join('\n')}`).toEqual([]);
};

describe('écrans hérités montés dans la coquille v2', () => {
  it('Concerts se monte, et supporte un greffon absent (404)', async () => {
    const el = await monter(ConcertsView as any, {});
    sansErreurDExecution();
    expect(el.textContent?.trim().length, 'l’écran est vide').toBeGreaterThan(0);
  });

  // 🔴 L'écran « Écoute hors-ligne » a été RETIRÉ le 20/09/2026 sur demande de
  // Bertrand : son cas de montage est parti avec lui. Ce qui en reste est la
  // garde de son ABSENCE, dans `vuesHeriteesLot4.test.ts` (« Écoute hors-ligne
  // a bien DISPARU, sans laisser de moignon ») — sans quoi la suppression ne
  // serait tenue par rien. Le décor `/offline/*` part avec le cas : un décor
  // que plus aucun cas ne lit se périme en silence.

  it('🔴 Tableau de bord : un corps SANS `hourly` ne blanchit pas l’écran', async () => {
    // Le cas qui levait : `data.hourly.length` sur un serveur qui n'envoie pas
    // le champ. Les tableaux sont désormais lus en `?.length`.
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      appels.push(String(url));
      const corps = String(url).includes('/library/history/dashboard')
        // Des totaux NON NULS : sans eux l'écran montre son état vide et
        // n'atteint jamais les sections — le témoin ne garderait rien.
        ? { by_source: [{ source: 'qobuz', plays: 1, listening_ms: 1000 }],
            totals: { plays: 5, listening_ms: 10000, unique_tracks: 2, unique_artists: 1 } }
        : corpsPour(String(url));
      return { ok: true, status: 200, statusText: 'OK', headers: new Map([['content-type', 'application/json']]),
        json: async () => corps, text: async () => JSON.stringify(corps) } as unknown as Response;
    }));
    const el = await monter(DashboardView as any, {});
    sansErreurDExecution();
    expect(el.textContent?.trim().length, 'l’écran est blanc').toBeGreaterThan(0);
  });

  it('Tableau de bord se monte et lit l’historique', async () => {
    const el = await monter(DashboardView as any, {});
    sansErreurDExecution();
    expect(appels.some((u) => u.includes('/library/history'))).toBe(true);
    expect(el.textContent?.trim().length).toBeGreaterThan(0);
  });
});

describe('écrans v2 écrits pour le portage', () => {
  it('Ajouts récents peint la liste ET le décompte de la MÊME fenêtre', async () => {
    const el = await monter(AjoutsRecentsV2 as any, { onOuvrir: () => {} });
    sansErreurDExecution();
    const jours = appels.filter((u) => u.includes('/home/recently-added')).map((u) => new URL(u, 'http://x').searchParams.get('days'));
    expect(jours.length, 'la liste et le résumé sont demandés').toBeGreaterThanOrEqual(2);
    expect(new Set(jours).size, 'liste et résumé sur des fenêtres différentes').toBe(1);
    expect(el.textContent).toContain('Kind of Blue');
  });

  it('YouTube Music peint les tendances reçues', async () => {
    const el = await monter(YouTubeDecouverteV2 as any, {});
    sansErreurDExecution();
    expect(appels.some((u) => u.includes('/streaming/youtube/charts'))).toBe(true);
    expect(el.textContent).toContain('So What');
  });

  it('Bandcamp : l’analyse rapproche la collection de la bibliothèque', async () => {
    const el = await monter(BandcampManquantsV2 as any, {});
    sansErreurDExecution();
    const bouton = el.querySelector('button') as HTMLButtonElement;
    expect(bouton, 'aucun bouton d’analyse').not.toBeNull();
    bouton.click();
    await souffler(6);
    sansErreurDExecution();
    expect(appels.some((u) => u.includes('/ext/bandcamp/collection'))).toBe(true);
    // Syro n'est pas dans la bibliothèque simulée : il doit ressortir manquant.
    expect(el.textContent).toContain('Syro');
  });
});
