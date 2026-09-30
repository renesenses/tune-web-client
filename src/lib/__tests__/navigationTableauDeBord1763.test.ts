// @vitest-environment jsdom
//
// #1763 — FabienM, forum fil 2037 (0.9.168, Firefox 156), point 10, puis sa
// précision du 29/09/2026 à 23:25 :
//
//   « Quand on rentre dans le menu "Tableau de bord" on ne peut plus en
//     ressortir. Il faut rafraichir la page pour naviguer de nouveau. »
//   « Les autres menus s'éclairent au survol, mais un clic ne les déclenche
//     pas : on reste sur le Tableau de bord. »
//
// ## LA CAUSE
//
// Le bloc « Par zone » (`BlocBarres`) rendait ses lignes sous la clé
// `{#each … (l.label)}`. Or le serveur groupe `by_zone` par `zone_id` : deux
// zones du même nom — « Cet ordinateur » sur deux machines, un « DMP-A8 »
// recréé, cas mesuré sur la base du .15 — donnent deux lignes au même libellé.
// Svelte lève alors `each_key_duplicate` PENDANT le rendu, sans frontière pour
// l'arrêter. L'erreur sort de `Batch.flush()` avant `deactivate()` : le lot
// reste ouvert, `Batch.ensure()` le rend à chaque écriture suivante sans
// replanifier de vidage, et plus AUCUNE mise à jour ne s'affiche. Le clic de
// la barre latérale pose bien `activeView`, mais la coquille ne se redessine
// plus. Le survol, lui, est du CSS pur : il continue de répondre. F5 repart
// d'un ordonnanceur neuf.
//
// ⚠️ Ce témoin n'appelle JAMAIS `flushSync()` après le clic : dans un
// navigateur personne ne l'appelle, et un `flushSync` de test RÉPARE le lot
// resté ouvert — la première sonde passait au vert pour cette seule raison.
//
// ## CE QUI EST VÉRIFIÉ
//
//  1. Le geste de FabienM, requêtes `/history/dashboard` pendantes (jamais de
//     réponse), lentes, et servies avec deux zones homonymes : la vue change.
//  2. Une visite ne fait qu'UN appel `/history/dashboard`, et le quitter
//     ANNULE ce fetch (son `signal` est `aborted`).
//  3. Le partage en vol de `tableauDeBord()` : annulé quand le dernier
//     abonné muni d'un signal part, jamais sous un appelant sans signal.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import { get } from 'svelte/store';
import ShellV2 from '../../components/v2/ShellV2.svelte';
import { activeView } from '../stores/navigation';
import { locale } from '../i18n';
import { tableauDeBord } from '../accueilWidgets';

vi.setConfig({ testTimeout: 60_000 });

class ResizeObserverInerte { observe() {} unobserve() {} disconnect() {} }

type Mode = 'pendant' | 'lent' | 'homonymes';
let mode: Mode = 'pendant';

const TABLEAU = {
  period: '7d',
  totals: { plays: 7, listening_ms: 1_000_000, unique_tracks: 5, unique_artists: 3 },
  top_artists: [], top_albums: [], top_tracks: [], trend: [], hourly: [],
  by_zone: [] as { zone_id: number; zone_name: string; plays: number }[],
  by_source: [{ source: 'local', plays: 7 }],
  completion: { completed: 5, skipped: 2, avg_listened_ms: 0, avg_track_duration_ms: 0 },
  by_genre: [], weekday_hourly: [], streak: { current: 1, best: 3, last_day: null }, on_this_day: [],
};

/** Deux zones du même nom : la forme réelle de `by_zone` sur la base du .15. */
const HOMONYMES = [
  { zone_id: 3, zone_name: 'Cet ordinateur', plays: 4 },
  { zone_id: 9, zone_name: 'Cet ordinateur', plays: 3 },
];

function rep(corps: unknown): Response {
  return {
    ok: true, status: 200, statusText: 'OK',
    headers: new Map([['content-type', 'application/json']]),
    json: async () => corps, text: async () => JSON.stringify(corps),
  } as unknown as Response;
}

/** Chaque appel `/history/dashboard`, avec le signal qu'il a reçu. */
let appels: { url: string; signal: AbortSignal | undefined }[] = [];
let hote: HTMLDivElement | null = null;
let monte: Record<string, unknown> | null = null;
const respirer = (ms = 0) => new Promise((r) => setTimeout(r, ms));
/** Le rejet doit venir TOUT DE SUITE, pas au bout du délai du banc. */
const rejetImmediat = (p: Promise<unknown>) =>
  Promise.race([p, respirer(200).then(() => 'toujours en attente')]);

beforeEach(() => {
  locale.set('fr');
  activeView.set('home');
  appels = [];
  vi.stubGlobal('ResizeObserver', ResizeObserverInerte);
  vi.stubGlobal('fetch', vi.fn((entree: unknown, init?: RequestInit) => {
    const url = String(typeof entree === 'string' ? entree : (entree as Request)?.url ?? entree);
    if (url.includes('/history/dashboard')) {
      appels.push({ url, signal: init?.signal ?? undefined });
      // Comme un vrai `fetch` : un signal abattu rejette la requête.
      if (mode === 'pendant') {
        return new Promise((_, rejeter) => init?.signal?.addEventListener('abort', () => {
          const e = new Error('aborted'); e.name = 'AbortError'; rejeter(e);
        }));
      }
      if (mode === 'lent') return new Promise((r) => setTimeout(() => r(rep(TABLEAU)), 400));
      return Promise.resolve(rep({ ...TABLEAU, by_zone: HOMONYMES }));
    }
    if (url.includes('preferences')) return Promise.resolve(rep({}));
    // Un profil connu : sans lui, `PageWidgets` ne charge rien du tout.
    if (/\/profiles(\?|$)/.test(url)) return Promise.resolve(rep([{ id: 1, name: 'default' }]));
    return Promise.resolve(rep(
      /\/(zones|profiles|playlists|devices|shortcuts|tags|favorites|radios)(\?|\/|$)/.test(url) ? [] : {},
    ));
  }));
  vi.stubGlobal('WebSocket', class { close() {} addEventListener() {} removeEventListener() {} send() {} } as never);
});

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  hote?.remove();
  hote = null;
  activeView.set('home');
  history.replaceState(null, '', '/');
  vi.unstubAllGlobals();
});

function entree(h: HTMLElement, motif: RegExp): HTMLButtonElement {
  const b = [...h.querySelectorAll<HTMLButtonElement>('button.nav')].find((x) => motif.test(x.textContent ?? ''));
  if (!b) throw new Error(`entrée ${motif} absente de la barre latérale`);
  return b;
}

const titre = (h: HTMLElement) => h.querySelector('.main h1')?.textContent?.trim() ?? '';

/** La coquille, puis le CLIC sur « Tableau de bord » — le chemin de FabienM. */
async function allerAuTableauDeBord(): Promise<HTMLElement> {
  history.replaceState(null, '', '/');
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(ShellV2, { target: hote });
  for (let i = 0; i < 10; i++) await respirer();
  flushSync();
  // Seuls comptent les appels de CETTE visite, pas ceux de l'Accueil d'où
  // l'on part.
  appels = [];
  entree(hote, /tableau de bord/i).click();
  // Le temps que les blocs partent, et que les réponses servies arrivent.
  for (let i = 0; i < 15; i++) await respirer(20);
  expect(get(activeView)).toBe('tableaudebord');
  expect(titre(hote)).toBe('Mon écoute');
  return hote;
}

describe('#1763 — quitter le Tableau de bord par la barre latérale', () => {
  it('deux zones du même nom : les deux lignes sont rendues, sans erreur', async () => {
    mode = 'homonymes';
    const erreurs: unknown[] = [];
    const surErreur = (e: ErrorEvent) => erreurs.push(e.error ?? e.message);
    window.addEventListener('error', surErreur);
    try {
      const h = await allerAuTableauDeBord();
      const lignes = [...h.querySelectorAll('.main li .nom')].map((n) => n.textContent);
      expect(lignes.filter((l) => l === 'Cet ordinateur')).toHaveLength(2);
      expect(erreurs).toEqual([]);
    } finally {
      window.removeEventListener('error', surErreur);
    }
  });

  // Les homonymes D'ABORD : sur `main`, une requête pendante d'un essai
  // précédent reste dans le partage en vol (rien ne l'annule) et servirait
  // de réponse — jamais — aux essais suivants.
  it.each([
    ['deux zones du même nom dans by_zone', 'homonymes'],
    ['requêtes /history/dashboard qui ne répondent jamais', 'pendant'],
    ['requêtes /history/dashboard très lentes', 'lent'],
  ] as [string, Mode][])('%s : le clic sur Accueil change la vue', async (_nom, m) => {
    mode = m;
    const h = await allerAuTableauDeBord();

    entree(h, /^\s*accueil\s*$/i).click();
    // PAS de flushSync : on laisse l'ordonnanceur de Svelte faire seul, comme
    // dans le navigateur.
    await respirer(50);

    expect(get(activeView)).toBe('home');
    expect(titre(h)).toBe('Accueil');
  });

  it('une visite fait UN appel /history/dashboard, et le quitter l’annule', async () => {
    mode = 'pendant';
    const h = await allerAuTableauDeBord();
    expect(appels).toHaveLength(1);
    expect(appels[0].signal, 'le fetch doit recevoir un signal').toBeInstanceOf(AbortSignal);
    expect(appels[0].signal!.aborted).toBe(false);

    entree(h, /^\s*accueil\s*$/i).click();
    await respirer(50);

    expect(appels[0].signal!.aborted).toBe(true);
  });
});

describe('#1763 — tableauDeBord() : la requête partagée', () => {
  it('annulée quand le DERNIER abonné muni d’un signal abandonne', async () => {
    mode = 'pendant';
    const a = new AbortController();
    const b = new AbortController();
    const pa = tableauDeBord('7d', a.signal);
    const pb = tableauDeBord('7d', b.signal);
    expect(appels).toHaveLength(1);

    a.abort();
    await expect(rejetImmediat(pa)).rejects.toMatchObject({ name: 'AbortError' });
    expect(appels[0].signal!.aborted).toBe(false);

    b.abort();
    await expect(rejetImmediat(pb)).rejects.toMatchObject({ name: 'AbortError' });
    expect(appels[0].signal!.aborted).toBe(true);

    // La suivante repart d'une requête neuve.
    const c = new AbortController();
    const pc = tableauDeBord('7d', c.signal);
    expect(appels).toHaveLength(2);
    c.abort();
    await expect(rejetImmediat(pc)).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('jamais annulée sous un appelant sans signal', async () => {
    mode = 'pendant';
    const a = new AbortController();
    const pa = tableauDeBord('30d', a.signal);
    void tableauDeBord('30d');
    a.abort();
    await expect(rejetImmediat(pa)).rejects.toMatchObject({ name: 'AbortError' });
    expect(appels).toHaveLength(1);
    expect(appels[0].signal!.aborted).toBe(false);
  });
});
