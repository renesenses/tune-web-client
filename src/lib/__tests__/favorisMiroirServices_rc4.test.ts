// @vitest-environment jsdom
//
// rc4 — les favoris de Qobuz et de Tidal deviennent un MIROIR du service
// (décision de Bertrand du 08/10/2026, forum #2186 ; serveur
// `tune-server-rust#6011`, lot `batch/bugs-rc4-20261008`).
//
// Le serveur propage désormais lui-même le cœur chez le service. Le client
// d'avant recopiait en plus (`POST|DELETE /streaming/<svc>/favorites/…`) :
// pour un RETRAIT, ce second `/favorite/delete` sur un favori déjà retiré peut
// échouer, et l'avis « le service n'a pas suivi » s'affichait à tort.
//
// Ce que ce fichier éprouve, comportement par comportement :
//   1. `favoris_miroir: true` dans `/streaming/services` → plus de recopie ;
//   2. une réponse add/remove qui porte `miroir` → plus de recopie, même si le
//      magasin des services n'est pas encore rempli ;
//   3. `miroir.statut = "en_attente"` (202) → le cœur tient, avis DISCRET
//      (info, pas erreur) avec le motif ;
//   4. la relecture directe chez le service (`reprendreFavorisDesServices`)
//      ne part plus pour un service en miroir : la liste du serveur fait foi ;
//   5. un serveur ANCIEN (champ absent) garde exactement l'ancien chemin.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync } from 'svelte';
import { toggleStreamingFavorite, favorisEnMiroirChez } from '../streamingFavorites';
import { streamingServices } from '../stores/streaming';
import {
  currentProfileId,
  favoriteStreamingKeys,
  streamingFavKey,
  loadFavoriteIds,
} from '../stores/profile';
import { notifications } from '../stores/notifications';

vi.setConfig({ testTimeout: 30_000 });

type Partie = { url: string; method: string };
let parties: Partie[] = [];

function reponse(corps: unknown, status = 200) {
  const texte = corps === undefined ? '' : JSON.stringify(corps);
  return {
    ok: status < 400,
    status,
    statusText: 'OK',
    headers: new Map([['content-type', 'application/json']]),
    json: async () => corps,
    text: async () => texte,
  } as unknown as Response;
}

/** Ce que rendent add/remove : par défaut, l'ancien serveur. */
let repEcriture: { status: number; corps: unknown } = { status: 201, corps: { ok: true } };
let services: Record<string, unknown> = {};

function serveur() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: any, init?: any) => {
      const u = String(url);
      const method = (init?.method ?? 'GET').toUpperCase();
      parties.push({ url: u, method });
      if (/\/profiles\/\d+\/favorites\/streaming\/(add|remove)$/.test(u)) {
        return reponse(repEcriture.corps, repEcriture.status);
      }
      if (/\/streaming\/services/.test(u)) return reponse(services);
      if (/\/streaming\/\w+\/favorites\//.test(u)) return reponse({ tracks: [], albums: [], artists: [] });
      if (/\/profiles\/\d+\/favorites\/streaming(\?|$)/.test(u)) return reponse([]);
      if (/\/profiles\/\d+\/favorites\/facets/.test(u)) return reponse([]);
      if (/\/profiles\/\d+\/favorites/.test(u)) return reponse([]);
      return reponse([]);
    }),
  );
}

const recopies = () =>
  parties.filter(
    (p) => /\/streaming\/\w+\/favorites\//.test(p.url) && (p.method === 'POST' || p.method === 'DELETE'),
  );
const relecturesChezLeService = (svc: string) =>
  parties.filter((p) => p.method === 'GET' && p.url.includes(`/streaming/${svc}/favorites/`));

async function respirer(tours = 20) {
  for (let i = 0; i < tours; i++) {
    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));
    flushSync();
  }
}

const QOBUZ_MIROIR = { qobuz: { enabled: true, authenticated: true, favoris_ecrivables: true, favoris_miroir: true } };
const QOBUZ_ANCIEN = { qobuz: { enabled: true, authenticated: true, favoris_ecrivables: true } };
const PISTE = { itemType: 'track' as const, service: 'qobuz', serviceId: '9140031', title: 'Get Lucky' };
const CLE = streamingFavKey('track', 'qobuz', '9140031');

let erreurs: ReturnType<typeof vi.spyOn>;
let infos: ReturnType<typeof vi.spyOn>;

beforeEach(async () => {
  parties = [];
  repEcriture = { status: 201, corps: { ok: true } };
  services = {};
  serveur();
  streamingServices.set({});
  favoriteStreamingKeys.set(new Set());
  currentProfileId.set(1);
  // La souscription de `currentProfileId` lance `loadFavoriteIds` : on le
  // laisse finir, sinon sa liste (vide) écraserait les cœurs du témoin.
  await respirer(30);
  erreurs = vi.spyOn(notifications, 'error');
  infos = vi.spyOn(notifications, 'info');
});

afterEach(() => {
  streamingServices.set({});
  favoriteStreamingKeys.set(new Set());
  currentProfileId.set(null);
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('rc4 — le cœur d’un service en miroir ne se recopie plus', () => {
  it('🔴 `favoris_miroir: true` : le RETRAIT ne part pas une seconde fois chez Qobuz', async () => {
    streamingServices.set(QOBUZ_MIROIR as any);
    favoriteStreamingKeys.set(new Set([CLE]));
    repEcriture = { status: 200, corps: { ok: true, miroir: { service: 'qobuz', statut: 'propage' } } };
    parties = [];

    const etat = await toggleStreamingFavorite(PISTE);
    await respirer();

    expect(etat).toBe(false);
    expect(parties.filter((p) => p.url.endsWith('/favorites/streaming/remove')).length).toBe(1);
    expect(recopies().map((p) => `${p.method} ${p.url}`), 'le retrait est parti deux fois').toEqual([]);
    expect(erreurs).not.toHaveBeenCalled();
  });

  it('🔴 `favoris_miroir: true` : l’AJOUT non plus', async () => {
    streamingServices.set(QOBUZ_MIROIR as any);
    repEcriture = { status: 201, corps: { ok: true, miroir: { service: 'qobuz', statut: 'propage' } } };
    parties = [];

    expect(await toggleStreamingFavorite(PISTE)).toBe(true);
    await respirer();
    expect(recopies()).toEqual([]);
  });

  it('🔴 magasin pas encore rempli, mais la réponse porte `miroir` : pas de recopie', async () => {
    streamingServices.set({});
    favoriteStreamingKeys.set(new Set([CLE]));
    repEcriture = { status: 200, corps: { ok: true, miroir: { service: 'qobuz', statut: 'propage' } } };
    parties = [];

    await toggleStreamingFavorite(PISTE);
    await respirer();
    expect(recopies(), 'le serveur a dit avoir propagé, le client recopie quand même').toEqual([]);
  });

  it('CONTRE-ÉPREUVE — serveur ANCIEN (champ absent, réponse sans `miroir`) : la recopie part comme avant', async () => {
    streamingServices.set(QOBUZ_ANCIEN as any);
    favoriteStreamingKeys.set(new Set([CLE]));
    repEcriture = { status: 200, corps: undefined };
    parties = [];

    expect(favorisEnMiroirChez('qobuz')).toBe(false);
    await toggleStreamingFavorite(PISTE);
    await respirer();
    expect(recopies().map((p) => p.method)).toEqual(['DELETE']);
  });

  it('CONTRE-ÉPREUVE — `favoris_miroir: false` (Deezer) : la recopie part', async () => {
    streamingServices.set({ deezer: { enabled: true, authenticated: true, favoris_miroir: false } } as any);
    parties = [];
    await toggleStreamingFavorite({ itemType: 'album', service: 'deezer', serviceId: '42' });
    await respirer();
    expect(recopies().length).toBe(1);
  });
});

describe('rc4 — `en_attente` (202) : le cœur tient, l’avis est discret', () => {
  it('🔴 ajout en attente : info avec le motif, aucune erreur', async () => {
    streamingServices.set(QOBUZ_MIROIR as any);
    repEcriture = {
      status: 202,
      corps: { ok: true, miroir: { service: 'qobuz', statut: 'en_attente', erreur: 'jeton expiré' } },
    };
    parties = [];

    const etat = await toggleStreamingFavorite(PISTE);
    await respirer();

    expect(etat, 'le cœur doit rester posé').toBe(true);
    expect(favoriteStreamingKeys).toBeDefined();
    let cles = new Set<string>();
    favoriteStreamingKeys.subscribe((s) => { cles = s; })();
    expect(cles.has(CLE)).toBe(true);
    expect(erreurs).not.toHaveBeenCalled();
    expect(infos).toHaveBeenCalledTimes(1);
    const msg = String(infos.mock.calls[0][0]);
    expect(msg).toContain('jeton expiré');
    expect(msg).toContain('qobuz');
    expect(recopies()).toEqual([]);
  });

  it('🔴 retrait en attente : le cœur reste vide, info avec le motif', async () => {
    streamingServices.set(QOBUZ_MIROIR as any);
    favoriteStreamingKeys.set(new Set([CLE]));
    repEcriture = {
      status: 202,
      corps: { ok: true, miroir: { service: 'qobuz', statut: 'en_attente', erreur: 'réseau' } },
    };
    parties = [];

    expect(await toggleStreamingFavorite(PISTE)).toBe(false);
    await respirer();
    expect(erreurs).not.toHaveBeenCalled();
    expect(infos).toHaveBeenCalledTimes(1);
    expect(String(infos.mock.calls[0][0])).toContain('réseau');
  });

  it('CONTRE-ÉPREUVE — `propage` : aucun avis', async () => {
    streamingServices.set(QOBUZ_MIROIR as any);
    repEcriture = { status: 201, corps: { ok: true, miroir: { service: 'qobuz', statut: 'propage' } } };
    await toggleStreamingFavorite(PISTE);
    await respirer();
    expect(infos).not.toHaveBeenCalled();
    expect(erreurs).not.toHaveBeenCalled();
  });
});

describe('rc4 — la liste du serveur fait foi pour un service en miroir', () => {
  it('🔴 au chargement du profil, plus de relecture directe chez Qobuz', async () => {
    services = QOBUZ_MIROIR;
    parties = [];
    await loadFavoriteIds(1);
    await respirer(30);
    expect(parties.some((p) => p.url.includes('/streaming/services')), 'témoin sans objet').toBe(true);
    expect(relecturesChezLeService('qobuz').map((p) => p.url)).toEqual([]);
  });

  it('CONTRE-ÉPREUVE — serveur ancien : la relecture directe part toujours', async () => {
    services = QOBUZ_ANCIEN;
    parties = [];
    await loadFavoriteIds(1);
    await respirer(30);
    // ≥ 3 : la souscription de `currentProfileId` relance aussi un chargement.
    expect(relecturesChezLeService('qobuz').length).toBeGreaterThanOrEqual(3);
  });
});
