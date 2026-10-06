// @vitest-environment jsdom
//
// Fil forum 1936 — Sevy Tabroc, 1.0.0-rc2, darTZeel LHC-208 en DLNA :
//
//   « 1) sélectionner Recherche dans la barre latérale 2) rechercher un groupe
//     puis jouer un album 3) Lorsqu'on active la flèche retour située à la
//     gauche de la photo du groupe, la musique s'arrête environ 5 secondes
//     puis repart 4) Idem lorsqu'on efface ce qui est écrit dans la case de
//     recherche. »
//
// Ce témoin MONTE l'écran Recherche, refait les deux gestes, et relève tout ce
// qui part sur le réseau. Il établit deux choses :
//
// 1. le client n'envoie AUCUNE commande de lecture (play, pause, stop, seek,
//    file d'attente, transfert) pendant ces gestes : la coupure n'est pas un
//    ordre parti de l'interface ;
// 2. les deux gestes relancent `GET /library/search` alors que la musique joue
//    déjà — au remontage de l'écran (Retour), et à chaque préfixe (effacement).
//    C'est cette route que le serveur faisait tourner SUR son exécuteur
//    (lectures rusqlite synchrones, dont un `LIKE '%…%'` sur les paroles de
//    toute la bibliothèque) ; le correctif est côté serveur, dans
//    `routes/library/search.rs`.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import SearchV2 from '../../components/v2/SearchV2.svelte';
import { setSearchCriteria } from '../stores/shortcuts';
import { preferences } from '../stores/preferences';

vi.setConfig({ testTimeout: 30_000 });

const RESULTATS = {
  artists: [{ id: 7, name: 'Yes', source: 'local' }],
  albums: [{ id: 11, title: 'Fragile', artist_name: 'Yes', source: 'local' }],
  labels: [], playlists: [],
  tracks: [{ id: 101, title: 'Roundabout', artist_name: 'Yes', album_id: 11 }],
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
async function jusqua(condition: () => boolean, borne = 5000): Promise<void> {
  const fin = Date.now() + borne;
  for (;;) {
    flushSync();
    if (condition()) return;
    if (Date.now() >= fin) return;
    await attendre(0);
  }
}

interface Envoi { methode: string; url: string }
let envois: Envoi[] = [];
let hote: HTMLDivElement | null = null;
let monte: Record<string, unknown> | null = null;

/** Une commande de lecture, quelle que soit sa route. */
const COMMANDE = /\/(zones|playback)\/[^?]*(play|pause|stop|resume|seek|next|previous|queue|transfer|volume)/;
const estCommande = (e: Envoi) => e.methode !== 'GET' && COMMANDE.test(e.url);
const recherches = (depuis: number) =>
  envois.slice(depuis).filter((e) => e.methode === 'GET' && /\/library\/search\?/.test(e.url));

beforeEach(() => {
  envois = [];
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  try { localStorage.clear(); } catch { /* jsdom sans stockage */ }
  vi.stubGlobal('fetch', vi.fn(async (url: any, init?: RequestInit) => {
    const u = String(url);
    envois.push({ methode: (init?.method ?? 'GET').toUpperCase(), url: u });
    if (/\/library\/search/.test(u)) return reponse(RESULTATS);
    if (/\/search\?/.test(u)) return reponse({ local: RESULTATS, services: {}, radios: [] });
    return reponse([]);
  }));
  vi.stubGlobal('WebSocket', class {
    close() {} addEventListener() {} removeEventListener() {} send() {}
  } as unknown as typeof WebSocket);
  preferences.update((p) => ({ ...p, settingsLevel: 'expert' }));
});
afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  hote?.remove();
  hote = null;
  setSearchCriteria(null);
  vi.unstubAllGlobals();
});

function monter(): HTMLDivElement {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(SearchV2, { target: hote, props: {} as any });
  return hote;
}

async function rechercherYes(): Promise<HTMLDivElement> {
  const h = monter();
  const champ = h.querySelector<HTMLInputElement>('input[type="search"]')!;
  champ.value = 'yes';
  champ.dispatchEvent(new Event('input', { bubbles: true }));
  await jusqua(() => recherches(0).length > 0 && (h.textContent ?? '').includes('Roundabout'));
  return h;
}

describe('fil 1936 — naviguer dans la Recherche pendant la lecture', () => {
  it('effacer le champ ne commande pas la lecture, mais relance la recherche à chaque préfixe', async () => {
    const h = await rechercherYes();
    const depuis = envois.length;
    const champ = h.querySelector<HTMLInputElement>('input[type="search"]')!;
    // Effacer au clavier, une lettre après l'autre, avec une pause plus longue
    // que l'anti-rebond de l'écran (240 ms).
    for (const v of ['ye', 'y', '']) {
      champ.value = v;
      champ.dispatchEvent(new Event('input', { bubbles: true }));
      flushSync();
      await attendre(300);
    }
    flushSync();
    const apres = envois.slice(depuis);
    expect(apres.filter(estCommande), JSON.stringify(apres)).toEqual([]);
    expect(recherches(depuis).map((e) => e.url).join(' | ')).toMatch(/q=ye/);
  });

  it('le Retour depuis la page de l’artiste remonte l’écran : aucune commande, une recherche de plus', async () => {
    await rechercherYes();
    // Aller sur la page de l'artiste démonte l'écran Recherche ; le Retour
    // le remonte, sur le critère publié.
    unmount(monte!);
    monte = null;
    hote?.remove();
    const depuis = envois.length;
    monter();
    await jusqua(() => recherches(depuis).length > 0);
    await attendre(300);
    flushSync();
    const apres = envois.slice(depuis);
    expect(apres.filter(estCommande), JSON.stringify(apres)).toEqual([]);
    expect(recherches(depuis).length, JSON.stringify(apres)).toBeGreaterThan(0);
  });
});
