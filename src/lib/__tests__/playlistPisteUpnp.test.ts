// @vitest-environment jsdom
//
// 🔴 UNE PISTE UPnP DE LA BIBLIOTHÈQUE N'ENTRAIT DANS AUCUNE PLAYLIST.
//
// `AddToPlaylistModal.buildAddArgs()` décidait de la forme d'envoi par
// `track.source === 'local'`, au lieu du prédicat partagé `estPisteLocale`
// (`lib/pisteFile.ts`). Or la règle du dépôt (`lib/provenanceBibliotheque.ts`)
// est qu'une piste de BIBLIOTHÈQUE déposée par un serveur UPnP intégré (#4201)
// porte `source: 'upnp'` — sa PROVENANCE — et un `tracks.id` bien réel.
//
// Le test par chaîne l'envoyait donc dans la branche « service » :
//
//     { track_ids: [], streaming_tracks: [{ source: 'upnp',
//                                           source_id: '<udn>|<hash>' }] }
//
// que le serveur refuse par un **422** (`tune-server/src/routes/playlists.rs`,
// `add_tracks` : « Cette demande ne porte que des pistes de service […] qui ne
// peuvent pas entrer dans une playlist locale » — une ligne de playlist locale
// ne peut porter qu'un `tracks.id`, `playlist_tracks.track_id NOT NULL
// REFERENCES tracks(id)`).
//
// CE TÉMOIN monte la fenêtre, clique une playlist Tune et lit la requête
// RÉELLEMENT émise — pas la fonction, la requête.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import AddToPlaylistModal from '../../components/partages/AddToPlaylistModal.svelte';
import { locale } from '../i18n';
import lFr from '../locales/fr';
import type { Track } from '../types';

vi.setConfig({ testTimeout: 30_000 });

const fr = lFr as unknown as Record<string, string>;

interface Requete { method: string; url: string; body: any }
let requetes: Requete[] = [];
/** Statut rendu par la prochaine écriture — 200 sauf si un cas le change. */
let statutEcriture = 200;

class ObservateurInerte { observe() {} unobserve() {} disconnect() {} }
async function souffler(n = 10) {
  for (let i = 0; i < n; i++) { await new Promise((r) => setTimeout(r, 0)); flushSync(); }
}

let hote: HTMLDivElement | null = null;
let monte: Record<string, unknown> | null = null;

const PLAYLISTS_TUNE = [{ id: 7, name: 'Liste Tune', track_count: 4 }];
const PLAYLISTS_QOBUZ = [
  { cover_path: null, description: null, name: 'Soirées jazz', owner: null, source_id: '69142842', track_count: 3 },
];

// Une piste rendue par `GET /library/tracks` d'un serveur UPnP intégré : un
// identifiant de bibliothèque, `source: 'upnp'`, et un `source_id` qui est
// l'adresse de l'objet sur le serveur — pas un identifiant de service.
const PISTE_UPNP = {
  id: 4242, title: 'Kind of Blue', artist_name: 'Miles Davis', album_title: 'Kind of Blue',
  source: 'upnp', source_id: 'uuid-9f3ac21e-0001|3f7a9b', duration_ms: 333000,
} as unknown as Track;

// Une VRAIE piste de service : aucun identifiant de bibliothèque.
const PISTE_QOBUZ = {
  id: null, title: 'Lovely Day', artist_name: 'Bill Withers', album_title: 'Menagerie',
  source: 'qobuz', source_id: '4791523', duration_ms: 255000,
} as unknown as Track;

beforeEach(() => {
  requetes = [];
  statutEcriture = 200;
  locale.set('fr');
  vi.stubGlobal('ResizeObserver', ObservateurInerte);
  vi.stubGlobal('IntersectionObserver', ObservateurInerte);
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    const method = (init?.method ?? 'GET').toUpperCase();
    let body: any = null;
    if (typeof init?.body === 'string') { try { body = JSON.parse(init.body); } catch { body = init.body; } }
    requetes.push({ method, url, body });
    const ecriture = method === 'POST';
    const statut = ecriture ? statutEcriture : 200;
    const charge = url.includes('/streaming/qobuz/playlists')
      ? (ecriture ? { added: 1 } : PLAYLISTS_QOBUZ)
      : url.includes('/playlists')
        ? (ecriture ? { id: 7, name: 'Liste Tune' } : PLAYLISTS_TUNE)
        : {};
    return {
      ok: statut < 400, status: statut,
      headers: new Headers({ 'Content-Type': 'application/json' }),
      text: async () => (statut >= 400 ? 'refus' : JSON.stringify(charge)),
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
  document.querySelectorAll('.modal-backdrop').forEach((e) => e.remove());
  vi.unstubAllGlobals();
});

/** Ouvre la fenêtre sur `piste` et attend que sa liste soit posée. */
async function ouvrir(piste: Track) {
  monte = mount(AddToPlaylistModal, { target: hote!, props: { track: piste, onClose: () => {} } });
  await vi.waitFor(
    () => {
      flushSync();
      if (!document.querySelector('.modal .modal-body .playlist-list')) {
        throw new Error('attente expirée : la liste des playlists');
      }
    },
    { timeout: 25_000, interval: 10 },
  );
  await souffler();
}

/** Clique la destination dont le nom contient `nom`. */
async function choisir(nom: string) {
  const b = [...document.querySelectorAll<HTMLButtonElement>('.playlist-option')]
    .find((x) => (x.textContent ?? '').includes(nom));
  expect(b, `destination « ${nom} » absente`).toBeTruthy();
  b!.click();
  await souffler();
}

const ecriture = () => requetes.find((r) => r.method === 'POST');

describe('une piste UPnP de la bibliothèque entre dans une playlist Tune', () => {
  it('🔴 elle part en `track_ids`, JAMAIS en `streaming_tracks`', async () => {
    await ouvrir(PISTE_UPNP);
    // La fenêtre propose bien les playlists de Tune : `upnp` n'est pas un
    // service, il n'a pas de playlists à lui.
    expect([...document.querySelectorAll('.playlist-option .pl-name')].map((e) => e.textContent?.trim()))
      .toEqual(['Liste Tune']);

    await choisir('Liste Tune');
    const w = ecriture();
    expect(w?.url, 'aucune écriture émise').toMatch(/\/api\/v1\/playlists\/7\/tracks$/);
    expect(w?.body).toEqual({ track_ids: [4242] });
    // La forme que le serveur refuse par un 422 ne doit plus jamais partir.
    expect(Object.keys(w?.body ?? {})).not.toContain('streaming_tracks');
    expect(w?.body?.track_ids, 'des `track_ids` vides = la branche service').not.toEqual([]);
  });

  it('non-régression : une piste Qobuz va toujours chez Qobuz', async () => {
    await ouvrir(PISTE_QOBUZ);
    await choisir('Soirées jazz');
    const w = ecriture();
    expect(w?.url).toMatch(/\/streaming\/qobuz\/playlists\/69142842\/tracks$/);
    expect(w?.body).toEqual({ track_ids: ['4791523'] });
    expect(requetes.some((r) => r.method === 'POST' && /\/api\/v1\/playlists\//.test(r.url))).toBe(false);
  });

  it('non-régression : une piste de service sans playlist écrivable garde `streaming_tracks`', async () => {
    // YouTube n'est pas dans `SERVICES_PLAYLIST_ECRITURE` : la fenêtre retombe
    // sur les playlists Tune, et c'est là que vit la branche « service » de
    // `buildAddArgs`. Elle doit rester intacte.
    const yt = { ...PISTE_QOBUZ, source: 'youtube', source_id: 'abc123' } as unknown as Track;
    await ouvrir(yt);
    await choisir('Liste Tune');
    const w = ecriture();
    expect(w?.body?.track_ids).toEqual([]);
    expect(w?.body?.streaming_tracks).toEqual([
      expect.objectContaining({ source: 'youtube', source_id: 'abc123' }),
    ]);
  });

  it('un refus du serveur se DIT, dans la langue du client', async () => {
    // Le 422 de `add_tracks` ne doit pas rester dans la console : la fenêtre
    // pose un message traduit, annoncé aux lecteurs d'écran.
    statutEcriture = 422;
    await ouvrir(PISTE_QOBUZ);
    await choisir('Soirées jazz');
    const alerte = document.querySelector('.modal [role="alert"]');
    expect(alerte, 'aucun message après un refus du serveur').toBeTruthy();
    expect((alerte!.textContent ?? '').trim()).toBe(fr['playlist.addFailed']);
  });
});
