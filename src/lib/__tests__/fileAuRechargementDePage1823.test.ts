// @vitest-environment jsdom
//
// #1823 — « LECTURE EN COURS N'AFFICHE PLUS LES PISTES DES ALBUMS ».
//
// Gros Bidon (Didier), fil 2049, 0.9.168 Windows Firefox : sous les boutons
// de transport, ni le bandeau « File d'attente » ni la liste « À suivre ».
// « Un rafraîchissement de la page n'y change rien. Par contre aller sur la
// fenêtre "File d'attente" et revenir sur "Lecture en cours" fait réapparaître
// les pistes. »
//
// ## Le geste rejoué ici
//
// Un RECHARGEMENT de page sur un appareil qui a déjà choisi sa zone :
//
//  1. `currentZoneId` naît de `localStorage` (`tune_current_zone_id`) — la zone
//     est connue AVANT que la liste des zones soit arrivée ;
//  2. `demarrerTransportV2()` s'abonne à `currentZoneId` et appelle aussitôt
//     `rechargerFile()`, qui lit `currentZone` — un dérivé qui vaut `null` tant
//     que `zones` est vide — et rend la main SANS rien charger ;
//  3. l'amorçage (`bootstrapV2`) remplit `zones`, mais la zone mémorisée existe
//     toujours : il ne réécrit pas `currentZoneId`, l'abonnement ne se
//     redéclenche pas, la file n'est JAMAIS redemandée ;
//  4. la lecture enchaîne sans blanc : le serveur n'émet que des
//     `playback.track_changed` porteurs de `queue_position`, qui ne déplacent
//     qu'un pointeur (#1126) et ne rechargent pas la file.
//
// `queueTracks` reste donc vide : le bandeau (`$queueTracks.length > 0`) et
// « À suivre » (`$upNextTracks.length > 0`) disparaissent tous les deux, jusqu'au
// prochain `playback.started` ou à une ouverture de l'écran File d'attente, qui
// recharge elle-même (`QueueV2.svelte`).
//
// Ce témoin ne lit pas le source : il compte les requêtes `/queue` parties sur
// le réseau et regarde le contenu des magasins que l'écran rend.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';
import { demarrerTransportV2 } from '../v2Live';
import { currentZoneId, zones } from '../stores/zones';
import { queueTracks, queuePosition, upNextTracks } from '../stores/queue';

/** L'album des captures : 9 titres, Daryl Hall & John Oates. */
const PISTES = Array.from({ length: 9 }, (_, i) => ({
  id: 700 + i,
  title: `Titre ${i + 1}`,
  artist_name: 'Daryl Hall & John Oates',
  album_title: 'Abandoned Luncheonette',
  duration_ms: 200_000,
}));

const ZONE = {
  id: 2,
  name: 'SMSL SU-8',
  state: 'playing',
  volume: 40,
  position_ms: 14_000,
  current_track: { id: 704, title: 'Titre 5', duration_ms: 198_000 },
};

let urls: string[] = [];
let positionServeur = 4;

let pousser: (e: unknown) => void = () => {};
vi.mock('../websocket', () => ({
  tuneWS: {
    connect: () => {},
    setCurrentZoneId: () => {},
    get isPolling() {
      return false;
    },
    onEvent: (h: (e: unknown) => void) => {
      pousser = h;
      return () => {};
    },
  },
}));

function reponse(url: string): unknown {
  if (/\/zones\/\d+\/queue/.test(url)) return { tracks: PISTES, position: positionServeur, length: PISTES.length };
  if (/\/zones\/\d+(\?|$)/.test(url)) return ZONE;
  if (/\/zones(\?|$)/.test(url)) return [ZONE];
  return {};
}

beforeEach(() => {
  urls = [];
  positionServeur = 4;
  queueTracks.set([]);
  queuePosition.set(0);
  zones.set([]);
  vi.stubGlobal('fetch', (url: string, init?: RequestInit) => {
    const u = String(url);
    urls.push(`${init?.method ?? 'GET'} ${u}`);
    return Promise.resolve(
      new Response(JSON.stringify(reponse(u)), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const chargementsDeFile = () => urls.filter((u) => /GET \S*\/zones\/\d+\/queue/.test(u)).length;
const attendre = () => new Promise((r) => setTimeout(r, 0));

describe('#1823 — la file est chargée après un rechargement de page', () => {
  it('zone mémorisée, zones arrivées APRÈS le branchement, lecture sans blanc : la file est là', async () => {
    // 1. La zone mémorisée sur cet appareil, liste des zones pas encore reçue.
    currentZoneId.set(2);
    const arreter = demarrerTransportV2();
    await attendre();

    // 3. L'amorçage remplit les zones ; la zone mémorisée existe toujours,
    //    `currentZoneId` n'est pas réécrit (`v2Bootstrap.loadZones`).
    zones.set([ZONE as never]);
    await attendre();

    // 4. Deux enchaînements sans blanc (journal : `avance_gapless_flux_adopte`).
    positionServeur = 5;
    pousser({ type: 'playback.track_changed', data: { zone_id: 2, queue_position: 5, track_id: 705 } });
    await attendre();
    arreter();

    expect(
      chargementsDeFile(),
      'la file n’a jamais été demandée : `rechargerFile()` est parti avant que la zone ' +
        'courante soit résolue, et rien ne l’a relancé quand les zones sont arrivées',
    ).toBeGreaterThanOrEqual(1);
    // Le bandeau « File d'attente » lit `$queueTracks.length > 0`.
    expect(get(queueTracks)).toHaveLength(9);
    // « À suivre » lit `$upNextTracks` : 3 titres après le 6e (index 5).
    expect(get(queuePosition)).toBe(5);
    expect(get(upNextTracks).map((p: any) => p.id)).toEqual([706, 707, 708]);
  });

  it('un rafraîchissement ordinaire des zones ne redemande pas la file (#1126)', async () => {
    currentZoneId.set(2);
    zones.set([ZONE as never]);
    const arreter = demarrerTransportV2();
    await attendre();
    const auMontage = chargementsDeFile();

    // Les `zone.updated` arrivent en continu : chacun réécrit `zones`.
    for (let i = 0; i < 5; i++) {
      zones.set([{ ...ZONE, position_ms: 20_000 + i * 1000 } as never]);
      await attendre();
    }
    arreter();

    expect(auMontage).toBe(1);
    expect(chargementsDeFile() - auMontage).toBe(0);
  });
});
