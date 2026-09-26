// @vitest-environment jsdom
//
// `renesenses/tune-server-rust#4806` suite — bannir un titre de SERVICE.
//
// FabienM, fil 1946, réponse 6820 (25/09/2026) : « Il faut pouvoir bannir un
// titre service, pas uniquement local ». Go de Bertrand le 26/09/2026.
//
// Contrat serveur assumé (PR serveur du lot `batch/bannir-titre-service-20260926`) :
//   POST /library/tracks/streaming/ban    { source, source_id, title, artist,
//                                           album, album_source_id, cover_url }
//   POST /library/tracks/streaming/unban  { source, source_id }
//   GET  /library/tracks/banned  →  les titres de service y figurent avec
//        `track_id: null` et la paire `source` + `source_id`.
//
// 🔴 Ces témoins MONTENT les composants et lisent les requêtes RÉELLEMENT
// émises. Contre-épreuve : sur `origin/main`, une piste Qobuz n'a pas
// l'entrée « Bannir » (le premier témoin rougit), et `api.banStreamingTrack`
// n'existe pas.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import { get } from 'svelte/store';
import PisteActions from '../../components/v2/PisteActions.svelte';
import LignePisteV2 from '../../components/v2/LignePisteV2.svelte';
import TitresBannisV2 from '../../components/v2/TitresBannisV2.svelte';
import { locale } from '../i18n';
import { oublierBannisDeService, surchargesBannissement } from '../titreBanni';
import { dialogs } from '../stores/dialogs';
import lFr from '../locales/fr';
import type { Track } from '../types';

vi.setConfig({ testTimeout: 30_000 });
const fr = lFr as unknown as Record<string, string>;

interface Requete { method: string; url: string; body: any }
let requetes: Requete[] = [];
let reponses: [string, unknown][] = [];
class ObservateurInerte { observe() {} unobserve() {} disconnect() {} }
async function souffler(n = 10) {
  for (let i = 0; i < n; i++) { await new Promise((r) => setTimeout(r, 0)); flushSync(); }
}
let hote: HTMLDivElement | null = null;
let monte: Record<string, unknown> | null = null;

const QOBUZ = { id: null, title: 'Lovely Day', artist_name: 'Bill Withers', album_title: 'Menagerie',
  album_id: 'alb-77', source: 'qobuz', source_id: '4791523', cover_path: 'https://exemple.invalid/p.jpg',
  duration_ms: 255000 } as unknown as Track;
const LOCALE_12 = { id: 12, title: 'Kaya', artist_name: 'Bob Marley', album_id: 3, source: 'local',
  duration_ms: 200000, banned: false } as unknown as Track;
const QOBUZ_12 = { ...QOBUZ, title: 'Homonyme', source_id: '12' } as unknown as Track;

beforeEach(() => {
  requetes = [];
  reponses = [];
  locale.set('fr');
  surchargesBannissement.set(new Map());
  oublierBannisDeService();
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
  for (const d of get(dialogs)) dialogs.settle(d.id, false);
  vi.unstubAllGlobals();
});

const items = () => [...document.querySelectorAll<HTMLButtonElement>('button[role="menuitem"]')];
const entree = (libelle: string) => items().find((b) => (b.textContent ?? '').includes(libelle));
async function ouvrirMenu(piste: Track) {
  monte = mount(PisteActions, { target: hote!, props: { piste } });
  await souffler();
  hote!.querySelector<HTMLButtonElement>('button[aria-haspopup="menu"]')!.click();
  await souffler();
}

describe('#4806 suite — le menu « … » d’un titre Qobuz', () => {
  it('🔴 « Bannir ce titre » → POST /library/tracks/streaming/ban avec la paire et l’instantané', async () => {
    reponses = [['/library/tracks/streaming/ban', { source: 'qobuz', source_id: '4791523', banned: true }]];
    await ouvrirMenu(QOBUZ);
    const e = entree(fr['ban.ban']);
    expect(e, '« Bannir ce titre » absent du menu d’un titre Qobuz').toBeTruthy();
    e!.click();
    await souffler(20);
    const post = requetes.find((r) => r.method === 'POST' && /\/library\/tracks\/streaming\/ban$/.test(r.url));
    expect(post, 'aucune requête de bannissement de service').toBeTruthy();
    expect(post!.body).toEqual({
      source: 'qobuz', source_id: '4791523', title: 'Lovely Day', artist: 'Bill Withers',
      album: 'Menagerie', album_source_id: 'alb-77', cover_url: 'https://exemple.invalid/p.jpg',
    });
    expect(requetes.some((r) => /\/library\/tracks\/[^/]+\/ban$/.test(r.url) && !r.url.includes('streaming')),
      'jamais la route par identifiant local').toBe(false);
    expect(get(surchargesBannissement).get('s:qobuz:4791523')).toBe(true);
    // Rouvrir : « Débannir », qui part par la route de service.
    hote!.querySelector<HTMLButtonElement>('button[aria-haspopup="menu"]')!.click();
    await souffler();
    const d = entree(fr['ban.unban']);
    expect(d, '« Débannir » absent après le bannissement').toBeTruthy();
    requetes = [];
    d!.click();
    await souffler(20);
    const unban = requetes.find((r) => /\/library\/tracks\/streaming\/unban$/.test(r.url));
    expect(unban?.method).toBe('POST');
    expect(unban?.body).toEqual({ source: 'qobuz', source_id: '4791523' });
    expect(get(surchargesBannissement).get('s:qobuz:4791523')).toBe(false);
  });
});

describe('#4806 suite — la LIGNE d’un album de service se grise', () => {
  it('🔴 la liste du serveur (GET /library/tracks/banned) grise le titre Qobuz banni', async () => {
    reponses = [['/library/tracks/banned', { total: 1, items: [
      { track_id: null, source: 'qobuz', source_id: '4791523', title: 'Lovely Day', artist: 'Bill Withers',
        album_id: null, album_title: 'Menagerie', banned_at: null, resolved: true },
    ] }]];
    monte = mount(LignePisteV2, { target: hote!, props: { piste: QOBUZ, onLire: () => {} } });
    await souffler(20);
    expect(requetes.some((r) => r.method === 'GET' && /\/library\/tracks\/banned$/.test(r.url)),
      'la liste des bannis n’a pas été lue').toBe(true);
    expect(hote!.querySelector('.trk')?.classList.contains('bannie')).toBe(true);
    expect(hote!.querySelector('.tt')?.textContent, 'visible, pas caché').toBe('Lovely Day');
  });
  it('le titre Qobuz « 12 » banni ne grise pas la piste LOCALE 12, ni l’inverse', async () => {
    reponses = [['/library/tracks/banned', { total: 1, items: [
      { track_id: null, source: 'qobuz', source_id: '12', title: 'Homonyme', artist: null,
        album_id: null, album_title: null, banned_at: null, resolved: true },
    ] }]];
    monte = mount(LignePisteV2, { target: hote!, props: { piste: QOBUZ_12, onLire: () => {} } });
    await souffler(20);
    expect(hote!.querySelector('.trk')?.classList.contains('bannie'), 'témoin : le titre Qobuz').toBe(true);
    unmount(monte); monte = null;
    monte = mount(LignePisteV2, { target: hote!, props: { piste: LOCALE_12, onLire: () => {} } });
    await souffler(20);
    expect(hote!.querySelector('.trk')?.classList.contains('bannie')).toBe(false);
  });
  it('un clic délibéré sur un titre de service banni demande confirmation', async () => {
    surchargesBannissement.set(new Map([['s:qobuz:4791523', true]]));
    const lu = vi.fn();
    monte = mount(LignePisteV2, { target: hote!, props: { piste: QOBUZ, onLire: lu } });
    await souffler();
    hote!.querySelector<HTMLButtonElement>('.tclick')!.click();
    await souffler();
    const attente = get(dialogs);
    expect(attente.length, 'aucune confirmation demandée').toBe(1);
    expect(lu).not.toHaveBeenCalled();
    dialogs.settle(attente[0].id, true);
    await souffler();
    expect(lu).toHaveBeenCalledTimes(1);
  });
});

describe('#4806 suite — l’écran « Titres bannis » porte les titres de service', () => {
  const LISTE = {
    total: 2,
    items: [
      { track_id: 7, source: null, source_id: null, title: 'Song A', artist: 'Artist A', album_id: 3,
        album_title: 'Album A', banned_at: '2026-09-26T10:00:00Z', resolved: true },
      { track_id: null, source: 'qobuz', source_id: '4791523', album_source_id: 'alb-77',
        title: 'Lovely Day', artist: 'Bill Withers', album_id: null, album_title: 'Menagerie',
        cover_path: 'https://exemple.invalid/p.jpg', banned_at: '2026-09-26T11:00:00Z', resolved: true },
    ],
  };
  it('🔴 la ligne de service dit son service, et « Débannir » part par la route de service', async () => {
    reponses = [['/library/tracks/banned', LISTE],
      ['/library/tracks/streaming/unban', { source: 'qobuz', source_id: '4791523', banned: false }]];
    monte = mount(TitresBannisV2, { target: hote!, props: {} });
    await souffler(20);
    const lignes = [...hote!.querySelectorAll('.ligne')];
    expect(lignes.length).toBe(2);
    const service = lignes.find((l) => l.getAttribute('data-service') === 'qobuz');
    expect(service, 'la ligne de service est absente').toBeTruthy();
    expect(service!.textContent).toContain('Lovely Day');
    expect(service!.textContent).toContain('Qobuz');
    expect(service!.textContent).toContain('Menagerie');
    requetes = [];
    service!.querySelector<HTMLButtonElement>('button[data-debannir]')!.click();
    await souffler(20);
    const unban = requetes.find((r) => /\/library\/tracks\/streaming\/unban$/.test(r.url));
    expect(unban?.method).toBe('POST');
    expect(unban?.body).toEqual({ source: 'qobuz', source_id: '4791523' });
    expect(requetes.some((r) => r.method === 'DELETE'), 'la ligne locale n’est pas touchée').toBe(false);
    const restantes = [...hote!.querySelectorAll('.ligne .tt')].map((e) => e.textContent);
    expect(restantes).toEqual(['Song A']);
  });
});
