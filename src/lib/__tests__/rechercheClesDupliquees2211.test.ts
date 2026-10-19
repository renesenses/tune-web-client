// @vitest-environment jsdom
//
// LA PAGE RECHERCHE SE FIGEAIT SUR DEUX ARTISTES HOMONYMES — web#2211.
//
// Daniel LEVY, fil forum 2329, 1.0.0-rc6, Chrome, en local comme à distance :
//
//   « Page recherche non fonctionnelle en rc6 et obligé de rafraichir
//     affichage chrome pour en sortir après clic sur autre item »
//   puis, le 19/10 : « il ne se passe rien la page reste vide »
//
// Sa console :
//
//   Uncaught Error: https://svelte.dev/e/each_key_duplicate
//
// et le journal du serveur, propre. La rangée « Artistes les plus écoutés »
// de l'écran de découverte était un `{#each tetesAffiche as a (a.nom)}` : la
// clé était le seul NOM. Or `GET /library/history/top-artists` joignait
// l'historique aux fiches d'artistes sur `LOWER(name)` et rendait DEUX lignes
// au même nom pour deux fiches homonymes de la bibliothèque. Svelte lève sur
// la clé répétée, le graphe d'effets s'arrête : la saisie ne produit plus
// aucun résultat et la page ne se laisse plus quitter — exactement ses deux
// symptômes. Le serveur est corrigé à part (tune-server-rust, même issue) ;
// le client ne doit plus mourir d'une donnée répétée, d'où qu'elle vienne.
//
// ⚠️ CE QUE CES TÉMOINS GARDENT. L'écran est MONTÉ, `fetch` bouchonné avec
// la forme réelle de la route, et la garde TAPE une requête puis attend ses
// résultats : c'est la page qui doit répondre, pas un texte de composant.
// Contre-épreuve faite : remettre la clé `(a.nom)` rend le premier témoin
// rouge sur `each_key_duplicate`.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import SearchV2 from '../../components/v2/SearchV2.svelte';
import { setSearchCriteria } from '../stores/shortcuts';
import { activeView } from '../stores/navigation';

vi.setConfig({ testTimeout: 30_000 });

/** La forme MESURÉE de la route (vignetteTeteAffiche1341), deux fiches
 *  « Diana Krall » comprises — ce que rendait le serveur de la rc6. */
const TETES_HOMONYMES = [
  { artist_id: 410, artist_name: 'Diana Krall', id: 410, name: 'Diana Krall', plays: 30 },
  { artist_id: 411, artist_name: 'Diana Krall', id: 411, name: 'Diana Krall', plays: 30 },
  // Deux graphies de l'historique rattachées à la MÊME fiche : un même
  // identifiant deux fois, l'autre façon de répéter une clé.
  { artist_id: 430, artist_name: 'Bill Evans', id: 430, name: 'Bill Evans', plays: 12 },
  { artist_id: 430, artist_name: 'BILL EVANS', id: 430, name: 'BILL EVANS', plays: 2 },
  // Sans fiche de bibliothèque : la clé retombe sur le nom.
  { artist_name: 'Infiniti', name: 'Infiniti', plays: 3 },
];

const RESULTATS = {
  artists: [{ id: 410, name: 'Diana Krall', source: 'local' }],
  albums: [{ id: 11, title: 'The Look of Love', artist_name: 'Diana Krall', source: 'local' }],
  labels: [], playlists: [],
  tracks: [{ id: 101, title: 'Cry Me a River', artist_name: 'Diana Krall', album_id: 11 }],
  totals: { artists: 1, albums: 1, tracks: 1, tracks_via_metadata: 0 },
  totals_capped: { artists: false, albums: false, tracks: false },
  has_more: { artists: false, albums: false, tracks: false },
  limit: 40, offset: 0,
};

const reponse = (corps: unknown) => ({
  ok: true, status: 200, statusText: 'OK',
  headers: new Map([['content-type', 'application/json']]),
  json: async () => corps,
  text: async () => JSON.stringify(corps),
} as unknown as Response);
const attendre = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function jusqua(condition: () => boolean, borne = 5000): Promise<boolean> {
  const fin = Date.now() + borne;
  for (;;) {
    flushSync();
    if (condition()) return true;
    if (Date.now() >= fin) return false;
    await attendre(0);
  }
}

let tetes: unknown[] = [];
let resultats: unknown = RESULTATS;
let hote: HTMLDivElement | null = null;
let monte: Record<string, unknown> | null = null;
/** Ce que le runtime lève hors de tout appelant — la console du testeur. */
let erreurs: string[] = [];
const noter = (e: unknown) => { erreurs.push(String((e as Error)?.message ?? e)); };

beforeEach(() => {
  erreurs = [];
  tetes = TETES_HOMONYMES;
  resultats = RESULTATS;
  process.on('uncaughtException', noter);
  process.on('unhandledRejection', noter);
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  try { localStorage.clear(); } catch { /* jsdom sans stockage */ }
  activeView.set('search');
  vi.stubGlobal('fetch', vi.fn(async (url: any) => {
    const u = String(url);
    if (/\/library\/history\/top-artists/.test(u)) return reponse(tetes);
    if (/\/library\/albums\/recent/.test(u)) return reponse([]);
    if (/\/library\/artists\?/.test(u)) return reponse([]);
    if (/\/library\/search/.test(u)) return reponse(resultats);
    if (/\/search\?/.test(u)) return reponse({ local: resultats, services: {}, radios: [] });
    return reponse([]);
  }));
  vi.stubGlobal('WebSocket', class {
    close() {} addEventListener() {} removeEventListener() {} send() {}
  } as unknown as typeof WebSocket);
});

afterEach(() => {
  try { if (monte) unmount(monte); } catch { /* écran déjà mort */ }
  monte = null;
  hote?.remove();
  hote = null;
  setSearchCriteria(null);
  process.off('uncaughtException', noter);
  process.off('unhandledRejection', noter);
  vi.unstubAllGlobals();
});

async function decouvrir(): Promise<HTMLDivElement> {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(SearchV2, { target: hote, props: {} as any });
  for (let i = 0; i < 12; i++) await attendre(0);
  flushSync();
  return hote;
}

const nomsAffiches = (el: HTMLElement) =>
  Array.from(el.querySelectorAll<HTMLElement>('.artile .an')).map((n) => n.textContent);

/** Taper une requête et attendre que la page réponde. */
async function taper(el: HTMLElement, q: string): Promise<boolean> {
  const champ = el.querySelector<HTMLInputElement>('input[type="search"]')!;
  champ.value = q;
  champ.dispatchEvent(new Event('input', { bubbles: true }));
  return jusqua(() => (el.textContent ?? '').includes('Cry Me a River'));
}

const dupliquees = () => erreurs.filter((e) => /each_key_duplicate/.test(e));

describe('web#2211 — une clé répétée ne fige plus la Recherche', () => {
  it('🔴 deux fiches homonymes dans « Artistes les plus écoutés » : la rangée se peint, la page répond', async () => {
    const el = await decouvrir();
    expect(dupliquees(), 'la console du fil 2329').toEqual([]);
    // Une vignette par artiste : les deux fiches Krall (deux identifiants),
    // une seule pour les deux graphies de la fiche 430.
    expect(nomsAffiches(el)).toEqual(['Diana Krall', 'Diana Krall', 'Bill Evans', 'Infiniti']);
    // « il ne se passe rien la page reste vide » : la saisie doit rendre ses
    // résultats.
    expect(await taper(el, 'krall'), 'la page est restée vide après la saisie').toBe(true);
    expect(dupliquees()).toEqual([]);
  });

  it('deux artistes SANS identifiant au même nom ne lèvent pas non plus', async () => {
    tetes = [
      { artist_name: 'Infiniti', name: 'Infiniti', plays: 3 },
      { artist_name: 'Infiniti', name: 'Infiniti', plays: 1 },
    ];
    const el = await decouvrir();
    expect(dupliquees()).toEqual([]);
    expect(nomsAffiches(el)).toEqual(['Infiniti']);
    expect(await taper(el, 'krall')).toBe(true);
  });

  it('une recherche récente enregistrée deux fois ne fige pas l’écran', async () => {
    // `localStorage` est partagé avec d'autres clients et d'anciennes versions.
    localStorage.setItem('tune_search_history', JSON.stringify([
      { query: 'krall', timestamp: 2 }, { query: 'krall', timestamp: 1 },
    ]));
    tetes = [];
    const el = await decouvrir();
    expect(dupliquees()).toEqual([]);
    expect(el.querySelectorAll('.chips .chip')).toHaveLength(1);
    expect(await taper(el, 'krall')).toBe(true);
  });

  it('un label rendu deux fois par la recherche ne fige pas les résultats', async () => {
    resultats = { ...RESULTATS, labels: [
      { name: 'Verve', album_count: 3 }, { name: 'Verve', album_count: 1 },
    ] };
    const el = await decouvrir();
    expect(await taper(el, 'krall')).toBe(true);
    await jusqua(() => el.querySelectorAll('.labels .lab').length > 0);
    expect(dupliquees()).toEqual([]);
    expect(el.querySelectorAll('.labels .lab')).toHaveLength(1);
  });
});
