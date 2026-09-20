// @vitest-environment jsdom
//
// #1268 — Cyrille Moutia, fil 1850, 19/09/2026 :
//
//   « Lorsque je fais ajouter à une playlist dans Streaming Qobuz un titre, il
//     ne m'est pas proposé mes playlists existantes. »
//
// Depuis tune-server-rust#1848, « Ajouter à une playlist » était ABSENT pour
// une piste de service : un titre Qobuz n'allait dans aucune playlist. Le
// serveur sait écrire dans une playlist du compte :
// `POST /streaming/{service}/playlists/{id}/tracks` `{ track_ids }`.
//
// 🔴 CE TÉMOIN MONTE la barre d'actions d'une piste Qobuz, ouvre le menu « … »,
// choisit « Ajouter à une playlist », lit la liste proposée (celle du compte
// Qobuz, forme mesurée sur le .18 le 19/09/2026), clique une playlist et lit
// la requête RÉELLEMENT émise.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import PisteActions from '../../components/v2/PisteActions.svelte';
import { locale } from '../i18n';
import { serviceDePlaylist } from '../playlistService';
import { entreesMenuPiste } from '../menuPiste';
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

// `GET /streaming/qobuz/playlists` sur le .18 (0.9.156), 19/09/2026 — extrait.
const PLAYLISTS_QOBUZ = [
  { cover_path: null, description: null, name: 'Soirées jazz', owner: null, source_id: '69142842', track_count: 3 },
  { cover_path: null, description: null, name: 'Route', owner: null, source_id: '68857313', track_count: 2 },
];
const PLAYLISTS_TUNE = [{ id: 7, name: 'Liste Tune', track_count: 4 }];

const PISTE_QOBUZ = {
  id: null, title: 'Lovely Day', artist_name: 'Bill Withers', album_title: 'Menagerie',
  source: 'qobuz', source_id: '4791523', duration_ms: 255000,
} as unknown as Track;

beforeEach(() => {
  requetes = [];
  reponses = [
    ['/streaming/qobuz/playlists/69142842/tracks', { added: 1 }],
    ['/streaming/qobuz/playlists', PLAYLISTS_QOBUZ],
    ['/playlists', PLAYLISTS_TUNE],
  ];
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
  document.querySelectorAll('.fond, .modal-backdrop').forEach((e) => e.remove());
  vi.unstubAllGlobals();
});

/**
 * Attend une condition, et ÉCHOUE EN LE DISANT si elle n'arrive pas — #1335.
 *
 * 🔴 La fenêtre est chargée à la demande (`{#await import(…)}` dans
 * `PisteActions.svelte:493`). En production, c'est un fragment JS déjà bâti,
 * servi en quelques millisecondes. Sous vitest, c'est vite qui COMPILE
 * `AddToPlaylistModal` à cet instant — et sous huit portes `npm test`
 * simultanées, cela dépasse largement les deux secondes que la boucle d'avant
 * s'accordait (400 tours de 5 ms).
 *
 * Cette boucle-là ne disait rien en expirant : l'exécution CONTINUAIT, la liste
 * était vide, et le rouge accusait `AddToPlaylistModal` de ne lister aucune
 * playlist — 14 portes rouges sur 24, mesurées sur Shrek le 20/09/2026.
 *
 * `vi.waitFor` est l'usage du dépôt (`viderLaFileNeCoupePas.test.ts`). Il lève
 * en nommant l'attente, et son budget suit le chronomètre du cas.
 */
async function attendreQue(condition: () => boolean, quoi: string) {
  await vi.waitFor(
    () => {
      flushSync();
      if (!condition()) throw new Error(`attente expirée : ${quoi}`);
    },
    { timeout: 25_000, interval: 10 },
  );
}

/** Ouvre « … » puis l'entrée « Ajouter à une playlist », si elle existe. */
async function ouvrirAjout(piste: Track): Promise<boolean> {
  monte = mount(PisteActions, { target: hote!, props: { piste } });
  await souffler();
  const plus = hote!.querySelector<HTMLButtonElement>('button[aria-haspopup="menu"]');
  expect(plus, 'le bouton « … » est absent').toBeTruthy();
  plus!.click();
  await souffler();
  const entree = [...document.querySelectorAll<HTMLButtonElement>('button[role="menuitem"]')]
    .find((b) => (b.textContent ?? '').includes(fr['nowplaying.addToPlaylist']));
  if (!entree) return false;
  entree.click();
  // Posée ET sa liste chargée : `.playlist-list` vit dans le `{:else}` du
  // `{#if loading}` de la fenêtre, donc son apparition dit les deux.
  await attendreQue(
    () => !!document.querySelector('.modal .modal-body .playlist-list'),
    'la fenêtre « Ajouter à une playlist » et sa liste',
  );
  await souffler();
  return true;
}
const nomsProposes = () =>
  [...document.querySelectorAll('.playlist-option .pl-name')].map((e) => (e.textContent ?? '').trim());

describe('#1268 — un titre Qobuz va dans une playlist Qobuz du compte', () => {
  it('🔴 le menu propose l’entrée, et la fenêtre liste les playlists QOBUZ, pas celles de Tune', async () => {
    expect(await ouvrirAjout(PISTE_QOBUZ), '« Ajouter à une playlist » absent pour un titre Qobuz').toBe(true);
    expect(nomsProposes()).toEqual(['Soirées jazz', 'Route']);
    expect(requetes.some((r) => r.method === 'GET' && /\/api\/v1\/playlists$/.test(r.url)),
      'la fenêtre a interrogé les playlists Tune pour un titre Qobuz').toBe(false);
  });

  it('🔴 choisir une playlist écrit CHEZ QOBUZ, avec l’identifiant Qobuz de la piste', async () => {
    await ouvrirAjout(PISTE_QOBUZ);
    const b = [...document.querySelectorAll<HTMLButtonElement>('.playlist-option')]
      .find((x) => x.textContent?.includes('Soirées jazz'));
    b!.click();
    await souffler();
    const ecriture = requetes.find((r) => r.method === 'POST');
    expect(ecriture?.url).toMatch(/\/streaming\/qobuz\/playlists\/69142842\/tracks$/);
    expect(ecriture?.body).toEqual({ track_ids: ['4791523'] });
    expect(requetes.some((r) => r.method === 'POST' && /\/api\/v1\/playlists\//.test(r.url))).toBe(false);
  });

  it('🔴 le bouton « playlist » de la barre mène AUSSI aux playlists Qobuz', async () => {
    // C'est ce bouton que Cyrille cliquait : il ouvrait les playlists TUNE,
    // où l'ajout d'une piste de service se perdait en silence (201, liste vide).
    monte = mount(PisteActions, { target: hote!, props: { piste: PISTE_QOBUZ } });
    await souffler();
    const b = hote!.querySelector<HTMLButtonElement>(`button.pa[aria-label="${fr['v2.pa.playlist']}"]`);
    expect(b, 'le bouton playlist de la barre est absent').toBeTruthy();
    b!.click();
    await attendreQue(
      () => !!document.querySelector('.modal .playlist-list'),
      'la fenêtre ouverte par le bouton « playlist » de la barre',
    );
    await souffler();
    expect(nomsProposes()).toEqual(['Soirées jazz', 'Route']);
  });

  it('un service qui ne sait pas écrire n’a pas de bouton playlist', async () => {
    const yt = { ...PISTE_QOBUZ, source: 'youtube', source_id: 'abc' } as unknown as Track;
    monte = mount(PisteActions, { target: hote!, props: { piste: yt } });
    await souffler();
    expect(hote!.querySelector(`button.pa[aria-label="${fr['v2.pa.playlist']}"]`)).toBeNull();
  });

  it('une piste de la bibliothèque garde les playlists Tune', async () => {
    const locale_ = { id: 12, title: 'X', artist_name: 'Y', source: 'local' } as unknown as Track;
    expect(await ouvrirAjout(locale_)).toBe(true);
    expect(nomsProposes()).toEqual(['Liste Tune']);
  });
});

describe('serviceDePlaylist et le menu — la règle, appelée', () => {
  it('seuls les services qui savent écrire, avec un identifiant', () => {
    expect(serviceDePlaylist(PISTE_QOBUZ)).toBe('qobuz');
    expect(serviceDePlaylist({ id: null, source: 'tidal', source_id: 9 } as any)).toBe('tidal');
    expect(serviceDePlaylist({ id: null, source: 'youtube', source_id: 'a' } as any)).toBeNull();
    expect(serviceDePlaylist({ id: null, source: 'qobuz', source_id: null } as any)).toBeNull();
    expect(serviceDePlaylist({ id: 3, source: 'local', source_id: null } as any)).toBeNull();
  });
  it('sans playlist de service, une piste de service n’a toujours pas l’entrée (#1848)', () => {
    const base = { jouable: true, idBibliotheque: null, artistId: null, albumId: null };
    const f = () => {};
    const cles = (c: object) => entreesMenuPiste({ ...base, ...c }, { ajouterAPlaylist: f }).map((e) => e.cle);
    expect(cles({})).not.toContain('nowplaying.addToPlaylist');
    expect(cles({ playlistDeService: 'qobuz' })).toContain('nowplaying.addToPlaylist');
  });
});
