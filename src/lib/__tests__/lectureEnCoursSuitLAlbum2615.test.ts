// @vitest-environment jsdom
//
// web#2615 (Belkadi Yacine, rc9) — « Lecture en cours : il faut actualiser la
// page pour la rafraîchir à chaque changement d'album ».
//
// L'écran lit `zones` (via `currentZone` → `currentTrack`). Le client relit
// `/zones` UNE fois par `playback.started` / `playback.track_changed`, et les
// relevés de position qui suivent ne relisent rien. Quand cette unique
// relecture rend encore la piste d'avant — zone du serveur en retard d'une à
// deux secondes (#954), ou réponse d'une relecture plus ancienne arrivée en
// dernier —, l'écran gardait l'album précédent jusqu'au prochain événement.
//
// Ce banc pousse les vraies trames dans le vrai gestionnaire (`v2Live`), avec
// un `GET /zones` qui répond la piste d'avant, et regarde le magasin `zones`.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';
import { demarrerTransportV2 } from '../v2Live';
import { currentZoneId, zones } from '../stores/zones';
import {
  appliquerPistesAnnoncees,
  clePiste,
  retenirPisteAnnoncee,
  DUREE_ATTENTE_MS,
  type PisteAttendue,
} from '../pisteAnnoncee';

const ANCIENNE = { track_id: 11, title: 'Dernier titre', album_title: 'Album A', cover_path: 'a.jpg' };
const NOUVELLE = { track_id: 22, title: 'Premier titre', album_title: 'Album B', cover_path: 'b.jpg' };

/** La piste que `GET /zones` rend à l'instant. */
let pisteServeur: Record<string, unknown> = ANCIENNE;
let urls: string[] = [];

const zoneCourante = () => ({
  id: 3,
  name: 'Salon',
  state: 'playing',
  volume: 50,
  position_ms: 1000,
  output_type: 'local',
  current_track: pisteServeur ? { ...pisteServeur } : null,
});

function reponse(url: string): unknown {
  if (/\/zones\/\d+\/queue/.test(url)) return { tracks: [], position: 0, length: 0 };
  if (/\/zones(\?|$)/.test(url)) return [zoneCourante()];
  return {};
}

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

beforeEach(() => {
  urls = [];
  pisteServeur = ANCIENNE;
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
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const relectures = () => urls.filter((u) => /GET \S*\/zones(\?|$)/.test(u)).length;
const pisteAffichee = () => (get(zones).find((z: any) => z?.id === 3) as any)?.current_track;

/** La trame `playback.track_changed` du serveur (`now_playing_event_data`). */
const changementDAlbum = (generation = 7) => ({
  type: 'playback.track_changed',
  data: { zone_id: 3, ...NOUVELLE, queue_position: 12, queue_length: 20, track_generation: generation },
});

async function demarrer() {
  vi.useFakeTimers();
  zones.set([zoneCourante() as never]);
  currentZoneId.set(3);
  const arreter = demarrerTransportV2();
  await vi.advanceTimersByTimeAsync(0);
  return arreter;
}

describe('web#2615 — Lecture en cours suit le changement d’album sans recharger la page', () => {
  it('une relecture qui rend encore l’album d’avant ne l’affiche pas', async () => {
    const arreter = await demarrer();

    pousser(changementDAlbum());
    await vi.advanceTimersByTimeAsync(0);

    const piste = pisteAffichee();
    arreter();
    expect(
      piste?.album_title,
      'le serveur a annoncé l’album B, mais `/zones` rendait encore l’album A : ' +
        'l’écran resterait sur l’album A jusqu’au prochain événement (web#2615).',
    ).toBe('Album B');
    expect(piste?.cover_path).toBe('b.jpg');
    expect(piste?.queue_position, 'le transport de l’événement ne se recopie pas dans la piste').toBeUndefined();
  });

  it('la zone en retard est relue, et la relecture à jour met fin à l’attente', async () => {
    const arreter = await demarrer();
    pousser(changementDAlbum());
    await vi.advanceTimersByTimeAsync(0);
    const apresEvenement = relectures();

    // Le serveur a rattrapé son retard : la relecture programmée le voit.
    pisteServeur = { ...NOUVELLE, duration_ms: 200_000 };
    await vi.advanceTimersByTimeAsync(1_000);
    expect(relectures(), 'aucune relecture n’a suivi la réponse périmée').toBe(apresEvenement + 1);
    expect(pisteAffichee()?.duration_ms, 'la relecture du serveur fait foi dès qu’elle est à jour').toBe(200_000);

    // Plus rien n'est attendu : pas de relecture en boucle.
    await vi.advanceTimersByTimeAsync(5_000);
    arreter();
    expect(relectures()).toBe(apresEvenement + 1);
  });

  it('au-delà du délai d’attente, la relecture du serveur fait foi', async () => {
    const arreter = await demarrer();
    pousser(changementDAlbum());
    await vi.advanceTimersByTimeAsync(DUREE_ATTENTE_MS + 2_000);
    const piste = pisteAffichee();
    const n = relectures();
    await vi.advanceTimersByTimeAsync(5_000);
    arreter();
    expect(piste?.album_title).toBe('Album A');
    expect(relectures(), 'les relectures cessent avec l’attente').toBe(n);
  });

  it('une zone arrêtée (sans piste) n’est pas ressuscitée par l’annonce', async () => {
    const arreter = await demarrer();
    pisteServeur = null as never;
    pousser(changementDAlbum());
    await vi.advanceTimersByTimeAsync(0);
    const piste = pisteAffichee();
    arreter();
    expect(piste ?? null).toBeNull();
  });
});

describe('web#2615 — règles de l’attente', () => {
  it('la clé lit `track_id` comme `id`, et le service sans identifiant', () => {
    expect(clePiste({ track_id: 5 })).toBe(clePiste({ id: 5 }));
    expect(clePiste({ source: 'qobuz', source_id: '9', title: 'X' })).toBe('s:qobuz:9:x');
    expect(clePiste({})).toBeNull();
  });

  it('un événement plus ancien ne remplace pas l’annonce retenue', () => {
    const attentes = new Map<number, PisteAttendue>();
    retenirPisteAnnoncee(attentes, 'playback.track_changed', { zone_id: 3, ...NOUVELLE, track_generation: 8 }, 0);
    retenirPisteAnnoncee(attentes, 'playback.track_changed', { zone_id: 3, ...ANCIENNE, track_generation: 7 }, 1);
    expect(attentes.get(3)?.cle).toBe('id:22');
  });

  it('les autres événements ne posent rien', () => {
    const attentes = new Map<number, PisteAttendue>();
    expect(retenirPisteAnnoncee(attentes, 'playback.paused', { zone_id: 3, ...NOUVELLE }, 0)).toBe(false);
    expect(attentes.size).toBe(0);
  });

  it('sans attente, la liste passe telle quelle', () => {
    const liste = [{ id: 3, current_track: ANCIENNE }];
    const r = appliquerPistesAnnoncees(liste, new Map(), 0);
    expect(r.liste).toBe(liste);
    expect(r.relire).toBe(false);
  });
});
