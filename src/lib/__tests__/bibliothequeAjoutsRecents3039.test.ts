// @vitest-environment jsdom
//
// renesenses/tune-server-rust#3039 — Sevy Tabroc, forum 1630 (31/08/2026) :
//
//   « 1 J'ouvre Bibliothèque
//     2 Je souhaite voir les albums que j'ai récemment ajouté à ma
//       bibliothèque locale
//     […] Possibilité de choisir entre dans les derniers quinze jour et/ou
//     dans le dernier mois »
//
// Ses deux captures d'Audirvana montrent un ONGLET de premier niveau, un
// sous-titre qui énonce la règle (« Pistes et albums ajoutés à la bibliothèque
// locale au cours des 15 derniers jours ») et un décompte qui compte les DEUX :
// « 7 albums • 71 pistes • 5 h 55 min ».
//
// ## Ce que le serveur rendait déjà — tout
//
//   * `GET /home/recently-added?days=N&limit=M` — `days` va de 1 à 730, défaut
//     7 (`routes/home.rs`, `borne_basse_de_fenetre`) ;
//   * `GET /home/recently-added/summary?days=N` — albums, pistes et durée sur
//     la MÊME fenêtre ;
//   * et la vraie date d'ajout : `COALESCE(ffs.first_seen_at, file_mtime)`,
//     gardée par un test qui refuse un SQL filtrant sur `t.file_mtime >` seul.
//
// AUCUNE vue cliente ne lisait `days`, aucune ne lisait le résumé. « Écrit mais
// pas branché », treizième du nom.
//
// 🔴 CES TÉMOINS MONTENT `LibraryView`, CLIQUENT l'onglet et les fenêtres, et
// lisent les URL RÉELLEMENT DEMANDÉES et le DOM réellement rendu.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';
import { mount, unmount, flushSync } from 'svelte';
import LibraryView from '../../components/LibraryView.svelte';
import { albums, libraryTab, selectedAlbum, selectedArtist } from '../stores/library';
import { notifications } from '../stores/notifications';
import { formatDuration } from '../utils';
import lFr from '../locales/fr';

const fr = lFr as unknown as Record<string, string>;

/** Monter `LibraryView` compile un composant de 4 000 lignes. */
vi.setConfig({ testTimeout: 30_000 });

class ResizeObserverInerte {
  observe() {}
  unobserve() {}
  disconnect() {}
}
// La grille est virtualisée sur une hauteur mesurée ; jsdom n'a pas de mise en
// page et rendrait zéro vignette.
for (const [prop, valeur] of [['clientHeight', 2000], ['clientWidth', 1400]] as const) {
  Object.defineProperty(HTMLElement.prototype, prop, { configurable: true, get: () => valeur });
}

function reponse(corps: unknown) {
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    headers: new Map([['content-type', 'application/json']]),
    json: async () => corps,
    text: async () => JSON.stringify(corps),
  } as unknown as Response;
}

/** Ce que rend `/home/recently-added` pour une fenêtre donnée. */
const ajoutsPour = (jours: number) =>
  Array.from({ length: jours === 15 ? 3 : 7 }, (_, i) => ({
    id: 900 + jours * 10 + i,
    title: `Ajout ${jours}j n°${i + 1}`,
    artist_name: `Artiste ${i + 1}`,
    cover_path: null,
    year: 2026,
  }));

/** Ce que rend `/home/recently-added/summary` pour la MÊME fenêtre. */
const resumePour = (jours: number) => ({
  days: jours,
  album_count: jours === 15 ? 7 : 19,
  track_count: jours === 15 ? 71 : 204,
  duration_ms: jours === 15 ? 21_300_000 : 60_000_000,
  duration_seconds: jours === 15 ? 21_300 : 60_000,
});

let hote: HTMLDivElement | null = null;
let monte: Record<string, any> | null = null;
let urls: string[] = [];

function serveur(opts: { echoue?: boolean } = {}) {
  urls = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: any) => {
      const u = String(url);
      urls.push(u);
      const jours = Number(new URL(u, 'http://x').searchParams.get('days') ?? 0);
      if (/\/home\/recently-added\/summary/.test(u)) {
        if (opts.echoue) throw new Error('500');
        return reponse(resumePour(jours));
      }
      if (/\/home\/recently-added/.test(u)) {
        if (opts.echoue) throw new Error('500');
        return reponse(ajoutsPour(jours));
      }
      if (/\/library\/albums(\?|$)/.test(u)) return reponse([]);
      return reponse([]);
    }),
  );
}

async function reposer(tours = 8) {
  for (let i = 0; i < tours; i++) {
    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));
  }
  flushSync();
}

async function poser(): Promise<HTMLDivElement> {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(LibraryView, { target: hote, props: {} as any });
  flushSync();
  await reposer();
  return hote;
}

/** Clique l'onglet dont le libellé est exactement `nom`. */
function cliquerOnglet(el: HTMLElement, nom: string) {
  const b = ([...el.querySelectorAll('button.tab')] as HTMLButtonElement[]).find(
    (x) => (x.textContent ?? '').trim() === nom,
  );
  expect(b, `aucun onglet « ${nom} »`).toBeTruthy();
  b!.click();
  flushSync();
}

/** Clique le bouton de fenêtre portant ce libellé. */
function cliquerFenetre(el: HTMLElement, libelle: string) {
  const b = ([...el.querySelectorAll('button.recent-window')] as HTMLButtonElement[]).find(
    (x) => (x.textContent ?? '').trim() === libelle,
  );
  expect(b, `aucune fenêtre « ${libelle} »`).toBeTruthy();
  b!.click();
  flushSync();
}

const ONGLET = fr['library.recentlyAdded'];
const fenetre = (j: number) => fr['library.recentWindowDays'].replace('{d}', String(j));
const regle = (j: number) => fr['library.recentlyAddedRule'].replace('{d}', String(j));
const comptes = (a: number, t: number, ms: number) =>
  fr['library.recentCounts']
    .replace('{a}', String(a))
    .replace('{t}', String(t))
    .replace('{h}', formatDuration(ms));

const urlsAjouts = () => urls.filter((u) => /\/home\/recently-added/.test(u));
const messages = () => get(notifications).map((n) => n.message);

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', ResizeObserverInerte);
  albums.set([]);
  selectedAlbum.set(null);
  selectedArtist.set(null);
  libraryTab.set('albums');
  for (const n of get(notifications)) notifications.dismiss(n.id);
});

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  if (hote) hote.remove();
  hote = null;
  libraryTab.set('albums');
  vi.unstubAllGlobals();
});

describe('l’onglet demandé existe, au même rang que les autres', () => {
  it('la barre d’onglets de la Bibliothèque le porte', async () => {
    serveur();
    const el = await poser();
    const libelles = [...el.querySelectorAll('button.tab')].map((b) => (b.textContent ?? '').trim());
    expect(libelles).toContain(ONGLET);
  });

  it('l’ouvrir DEMANDE la fenêtre de quinze jours, liste et résumé', async () => {
    serveur();
    const el = await poser();
    urls.length = 0;
    cliquerOnglet(el, ONGLET);
    await reposer();

    const demandes = urlsAjouts();
    expect(demandes.some((u) => /\/home\/recently-added\?/.test(u) && u.includes('days=15'))).toBe(
      true,
    );
    expect(
      demandes.some((u) => /\/home\/recently-added\/summary\?/.test(u) && u.includes('days=15')),
    ).toBe(true);
  });
});

describe('ce que l’écran affiche, et sur quelle fenêtre', () => {
  it('la règle est ÉNONCÉE, avec la fenêtre en cours', async () => {
    serveur();
    const el = await poser();
    cliquerOnglet(el, ONGLET);
    await reposer();
    expect(el.querySelector('.recent-rule')!.textContent!.trim()).toBe(regle(15));
  });

  it('le décompte compte les DEUX, plus la durée — celui de la capture', async () => {
    serveur();
    const el = await poser();
    cliquerOnglet(el, ONGLET);
    await reposer();
    // « 7 albums • 71 pistes • 5 h 55 min » chez Audirvana.
    expect(el.querySelector('.recent-counts')!.textContent!.trim()).toBe(
      comptes(7, 71, 21_300_000),
    );
  });

  it('les albums de la fenêtre sont rendus', async () => {
    serveur();
    const el = await poser();
    cliquerOnglet(el, ONGLET);
    await reposer();
    const titres = [...el.querySelectorAll('.album-card-title')].map((n) =>
      (n.textContent ?? '').trim(),
    );
    expect(titres).toHaveLength(3);
    expect(titres[0]).toBe('Ajout 15j n°1');
  });
});

describe('la seconde fenêtre demandée par le testeur', () => {
  it('« 30 jours » REDEMANDE au serveur, et la liste ET le décompte suivent', async () => {
    serveur();
    const el = await poser();
    cliquerOnglet(el, ONGLET);
    await reposer();
    urls.length = 0;

    cliquerFenetre(el, fenetre(30));
    await reposer();

    const demandes = urlsAjouts();
    expect(demandes.some((u) => u.includes('days=30')), 'la fenêtre n’a pas été demandée').toBe(
      true,
    );
    expect(demandes.some((u) => u.includes('days=15'))).toBe(false);
    // 🔴 La règle, le décompte et la liste décrivent la MÊME fenêtre.
    expect(el.querySelector('.recent-rule')!.textContent!.trim()).toBe(regle(30));
    expect(el.querySelector('.recent-counts')!.textContent!.trim()).toBe(
      comptes(19, 204, 60_000_000),
    );
    expect([...el.querySelectorAll('.album-card-title')]).toHaveLength(7);
  });
});

describe('un échec est DIT, et ne laisse pas une liste d’une autre fenêtre', () => {
  it('la liste tombe et l’utilisateur est prévenu', async () => {
    serveur({ echoue: true });
    const el = await poser();
    cliquerOnglet(el, ONGLET);
    await reposer();
    expect(el.textContent).toContain(fr['library.noRecentAlbums']);
    expect(messages()).toContain(fr['library.recentLoadError']);
  });
});
