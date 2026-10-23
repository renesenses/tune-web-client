// @vitest-environment jsdom
//
// tune-server-rust#6465 (FabienM, fil 2379, point 1, rc7) — « Playlist avec
// lecture aléatoire → dans l'historique on n'a pas le conteneur playlist.
// […] Seuls les titres sont affichés au 1er niveau ».
//
// La fiche playlist lançait son « Aléatoire » en `track_ids` (liste locale)
// ou en tête + suite (liste de service) : aucun de ces corps ne disait qu'il
// venait d'une playlist, et le serveur écrivait des titres nus. La fiche
// énonce désormais la playlist (`context_type`, `context_id`,
// `context_source`) sur la lecture ET sur la file.
//
// 🔴 On MONTE la vraie fiche, on clique « Aléatoire » et on lit les requêtes
// réellement parties (`fetch` bouchonné au plus bas niveau).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import PlaylistDetailV2 from '../../components/v2/PlaylistDetailV2.svelte';
import { locale } from '../i18n';
import { currentZoneId } from '../stores/zones';
import lFr from '../locales/fr';

vi.setConfig({ testTimeout: 30_000 });

const fr = lFr as unknown as Record<string, string>;

interface Requete { method: string; url: string; body: any }
let requetes: Requete[] = [];
let reponses: [string, unknown][] = [];

class ObservateurInerte { observe() {} unobserve() {} disconnect() {} }
async function attendreQue(condition: () => boolean, quoi: string) {
  await vi.waitFor(
    () => {
      flushSync();
      if (!condition()) throw new Error(`attente expirée : ${quoi}`);
    },
    { timeout: 25_000, interval: 10 },
  );
}

let hote: HTMLDivElement | null = null;
let monte: Record<string, unknown> | null = null;

beforeEach(() => {
  requetes = [];
  reponses = [
    ['/streaming/qobuz/playlists/11/tracks', [
      { id: null, title: 'Lovely Day', artist_name: 'Bill Withers', source: 'qobuz', source_id: '4791523' },
      { id: null, title: 'Grandma\'s Hands', artist_name: 'Bill Withers', source: 'qobuz', source_id: '4791524' },
    ]],
    ['/playlists/12/tracks', [
      { id: 501, title: 'Nightswimming', artist_name: 'R.E.M.', source: 'local' },
      { id: 502, title: 'Drive', artist_name: 'R.E.M.', source: 'local' },
    ]],
    ['/zones/1/play', { id: 1, name: 'Salon' }],
  ];
  locale.set('fr');
  currentZoneId.set(1);
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
  currentZoneId.set(null);
  vi.unstubAllGlobals();
});

async function ouvrir(item: unknown, titre: string) {
  monte = mount(PlaylistDetailV2, { target: hote!, props: { item: item as any, onClose: () => {} } });
  await attendreQue(() => (hote!.textContent ?? '').includes(titre), 'les titres affichés');
}
function cliquerAleatoire() {
  const b = [...hote!.querySelectorAll<HTMLButtonElement>('button')]
    .find((x) => x.getAttribute('title') === fr['library.shuffle']);
  expect(b, 'pas de bouton Aléatoire — le témoin ne mesure rien').toBeTruthy();
  b!.click();
}
const lecture = () => requetes.find((r) => r.method === 'POST' && /\/zones\/1\/play(\?|$)/.test(r.url));
const ajout = () => requetes.find((r) => r.method === 'POST' && /\/zones\/1\/queue\/add(\?|$)/.test(r.url));

describe('#6465 — « Aléatoire » d’une fiche playlist énonce la playlist', () => {
  it('🔴 playlist QOBUZ : la lecture et la suite portent la playlist 11 chez Qobuz', async () => {
    await ouvrir({ kind: 'streaming', service: 'qobuz', pl: { source_id: '11', name: 'Soul', track_count: 2 } }, 'Lovely Day');
    cliquerAleatoire();
    await attendreQue(() => !!lecture() && !!ajout(), 'la lecture et la suite parties');
    for (const r of [lecture()!, ajout()!]) {
      expect(r.body, `${r.url} : la playlist mélangée part sans son conteneur — #6465`).toMatchObject({
        context_type: 'playlist', context_id: '11', context_source: 'qobuz',
      });
    }
  });

  it('🔴 playlist LOCALE : la liste part d’un coup, avec la playlist 12 de la bibliothèque', async () => {
    await ouvrir({ kind: 'local', pl: { id: 12, name: 'R.E.M.', track_count: 2 } }, 'Nightswimming');
    cliquerAleatoire();
    await attendreQue(() => !!lecture(), 'la lecture partie');
    expect(lecture()!.body.track_ids?.length).toBe(2);
    expect(lecture()!.body, 'la playlist locale mélangée part sans son conteneur — #6465').toMatchObject({
      context_type: 'playlist', context_id: '12', context_source: 'local',
    });
  });
});
