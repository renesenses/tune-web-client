// @vitest-environment jsdom
//
// LA FILE RECHARGÉE POUR RIEN, ET REPEINTE EN ENTIER — RÉGRESSION DE LA
// BASCULE v2.
//
// ## Le signalement
//
// Alex Campbell, 20/09/2026, playlist Qobuz de 1454 titres : « that seems to
// break my session ». Le silence de sa zone est réglé côté serveur (#4611) ;
// l'interface figée, elle, vient d'ici.
//
// ## Les deux défauts, et ce sont bien deux
//
//  1. `v2Live.ts` rappelait `rechargerFile()` sur TOUT événement `playback.*`
//     — pause, reprise, volume, changement d'état compris — et réécrivait
//     `queueTracks` en entier à chaque fois. Le serveur pose pourtant
//     `queue_position` DANS l'événement, et le fait exprès depuis #1096 :
//     « the client updates its highlight without refetching the whole queue ».
//
//  2. `QueueV2.svelte` rendait toutes les lignes restantes, sans fenêtre ni
//     plafond : 1453 lignes, chacune avec sa pochette et sa barre d'actions.
//
// L'ANCIENNE interface évitait explicitement le premier — `App.svelte`
// portait la note « no fetchQueue() here […] which froze the UI under a large
// queue (#1126) » — et le second par du confinement CSS. La bascule v2 a
// perdu les deux. Refs #1126.
//
// ## Ce que ce témoin mesure
//
// Il ne cherche pas un appel dans le source : une garde de texte est
// satisfaite par un appel posé n'importe où. Il COMPTE — les requêtes parties
// sur le réseau pendant une lecture ordinaire, et les lignes réellement
// construites dans le DOM pour une file de 1454 entrées.
//
// ⚠️ Tous les imports sont STATIQUES, composant compris : charger un `.svelte`
// dans le corps d'un cas ferait payer sa compilation au chronomètre de ce cas
// (#1333).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import { get, writable } from 'svelte/store';
import QueueV2 from '../../components/v2/QueueV2.svelte';
import { demarrerTransportV2 } from '../v2Live';
import { currentZoneId, zones } from '../stores/zones';
import { queueTracks, queuePosition } from '../stores/queue';
import { fenetreListe } from '../fenetreListe';

/** La file d'Alex : 1454 titres. */
const TAILLE_FILE = 1454;

vi.setConfig({ testTimeout: 180_000, hookTimeout: 120_000 });

function pisteFactice(i: number) {
  return {
    id: 10_000 + i,
    title: `Titre ${i}`,
    artist_name: `Artiste ${i % 97}`,
    album_title: `Album ${i % 143}`,
    album_id: 500 + (i % 143),
    duration_ms: 180_000 + i,
    cover_path: `/covers/${i % 143}.jpg`,
    source: 'qobuz',
    format: 'flac',
    sample_rate: 44_100,
    bit_depth: 16,
    track_number: (i % 12) + 1,
  };
}

const PISTES = Array.from({ length: TAILLE_FILE }, (_, i) => pisteFactice(i));
/** Poids réel d'une réponse `/zones/1/queue` pour cette file. */
const CORPS_FILE = JSON.stringify({ tracks: PISTES, position: 0, length: TAILLE_FILE });
const POIDS_KO = Math.round(CORPS_FILE.length / 1024);

/** Les appels partis sur le réseau, dans l'ordre. */
let urls: string[] = [];

function reponse(url: string): unknown {
  if (/\/zones\/\d+\/queue/.test(url)) {
    return { tracks: PISTES, position: get(positionServeur), length: TAILLE_FILE };
  }
  if (/\/zones\/\d+(\?|$)/.test(url)) return ZONE;
  if (/\/zones(\?|$)/.test(url)) return [ZONE];
  return {};
}

const ZONE = {
  id: 1,
  name: 'Salon',
  state: 'playing',
  volume: 40,
  position_ms: 1000,
  current_track: { id: 10_000, title: 'Titre 0', duration_ms: 180_000 },
};

const positionServeur = writable(0);

// Le WebSocket réel ouvrirait une connexion : on garde la main sur le flux
// d'événements, c'est tout l'objet de la mesure.
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
  positionServeur.set(0);
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

const rechargements = () => urls.filter((u) => /GET \S*\/zones\/\d+\/queue/.test(u)).length;
const attendre = () => new Promise((r) => setTimeout(r, 0));

/**
 * Raccorde le transport sur une zone DÉJÀ connue.
 *
 * `rechargerFile()` lit la zone courante dans le magasin et rend la main si
 * elle n'y est pas : démarrer sur un magasin vide compterait zéro requête pour
 * les premiers événements, et la mesure vaudrait pour rien.
 */
async function demarrer() {
  zones.set([ZONE as never]);
  currentZoneId.set(1);
  const arreter = demarrerTransportV2();
  await attendre();
  return arreter;
}

/**
 * Une lecture ORDINAIRE, telle que le serveur l'émet : un départ, des points
 * de position, un changement de piste, une pause, une reprise, un volume.
 * Aucun de ces gestes ne change le CONTENU de la file.
 */
const LECTURE_ORDINAIRE: Array<Record<string, unknown>> = [
  { type: 'playback.started', data: { zone_id: 1, queue_position: 0, track_id: 10_000 } },
  { type: 'playback.state_changed', data: { zone_id: 1, state: 'playing' } },
  { type: 'playback.position', data: { zone_id: 1, position_ms: 5_000 } },
  { type: 'playback.position', data: { zone_id: 1, position_ms: 10_000 } },
  { type: 'playback.track_changed', data: { zone_id: 1, queue_position: 1, track_id: 10_001 } },
  { type: 'playback.paused', data: { zone_id: 1 } },
  { type: 'playback.resumed', data: { zone_id: 1 } },
  { type: 'playback.volume', data: { zone_id: 1, volume: 45 } },
  { type: 'playback.position', data: { zone_id: 1, position_ms: 20_000 } },
  { type: 'playback.track_changed', data: { zone_id: 1, queue_position: 2, track_id: 10_002 } },
  { type: 'playback.state_changed', data: { zone_id: 1, state: 'playing' } },
];

describe('#1126 — la file n’est rechargée que si elle CHANGE', () => {
  it('une lecture ordinaire ne redemande pas la file à chaque événement', async () => {
    const arreter = await demarrer();
    // Le montage charge la file une fois : c'est légitime, on part de là.
    const auMontage = rechargements();

    for (const e of LECTURE_ORDINAIRE) {
      pousser(e);
      await attendre();
    }
    const pendantLaLecture = rechargements() - auMontage;
    arreter();

    // eslint-disable-next-line no-console
    console.log(
      `\n  MESURE — ${LECTURE_ORDINAIRE.length} événements d'une lecture ordinaire ` +
        `sur une file de ${TAILLE_FILE} titres :\n` +
        `    rechargements complets de la file : ${pendantLaLecture}\n` +
        `    poids transféré : ${pendantLaLecture * POIDS_KO} Ko ` +
        `(${POIDS_KO} Ko par rechargement)\n`,
    );

    // `playback.started` seul : le contenu peut être neuf. Tout le reste porte
    // `queue_position` et ne déplace qu'un pointeur.
    expect(
      pendantLaLecture,
      `${pendantLaLecture} rechargements complets pour une lecture ordinaire — ` +
        `${pendantLaLecture * POIDS_KO} Ko et autant de réécritures de queueTracks.`,
    ).toBe(1);

    // Et la surbrillance suit quand même : c'est l'événement qui la porte.
    expect(get(queuePosition), 'la position n’a pas suivi le dernier changement de piste').toBe(2);
  });

  /**
   * LA CONTRE-ÉPREUVE. Une garde qui coupe trop produit le défaut inverse :
   * une file qui ment. Chacun de ces événements change le CONTENU et doit
   * TOUJOURS provoquer une relecture.
   */
  const CHANGENT_LA_FILE: Array<[string, Record<string, unknown>]> = [
    ['un ajout', { type: 'playback.queue.track_added', data: { zone_id: 1 } }],
    ['un retrait', { type: 'playback.queue.track_removed', data: { zone_id: 1 } }],
    ['un vidage', { type: 'playback.queue.cleared', data: { zone_id: 1 } }],
    ['« vider la suite »', { type: 'playback.queue.cleared', data: { zone_id: 1, keep_current: true } }],
    ['un changement d’ordre', { type: 'playback.queue.moved', data: { zone_id: 1 } }],
    ['la file du sondeur', { type: 'playback.queue_changed', data: { zone_id: 1 } }],
    ['l’autoplay qui rallonge', { type: 'playback.autoplay_tracks_added', data: { zone_id: 1 } }],
    ['l’aléatoire, qui rebat l’ordre', { type: 'playback.shuffle', data: { zone_id: 1, shuffle: true } }],
    ['un transfert de zone', { type: 'playback.transferred', data: { zone_id: 1 } }],
    [
      'un changement de piste SANS position annoncée (vieux serveur)',
      { type: 'playback.track_changed', data: { zone_id: 1, track_id: 10_009 } },
    ],
    ['un événement inconnu', { type: 'playback.quelque_chose_de_neuf', data: { zone_id: 1 } }],
  ];

  for (const [quoi, evenement] of CHANGENT_LA_FILE) {
    it(`rafraîchit TOUJOURS la file sur ${quoi}`, async () => {
      const arreter = await demarrer();
      const avant = rechargements();

      pousser(evenement);
      await attendre();
      const apres = rechargements();
      arreter();

      expect(
        apres - avant,
        `${evenement.type} ne rafraîchit plus la file : l’écran afficherait une file périmée.`,
      ).toBeGreaterThanOrEqual(1);
    });
  }
});

/**
 * La GÉOMÉTRIE de la fenêtre. Une fenêtre juste qui pose des cales fausses
 * ment autant qu'un plafond : la barre de défilement ne correspond plus à la
 * file, et le contenu saute sous le doigt.
 */
describe('#1126 — la fenêtre rend compte de la file ENTIÈRE', () => {
  it('cales + lignes construites = la hauteur de toute la liste', () => {
    const H = 55;
    for (const decalage of [0, 1, 500, 12_345, 79_915, 10_000_000]) {
      const f = fenetreListe(TAILLE_FILE, H, decalage, 900);
      const total = f.avant + (f.fin - f.debut) * H + f.apres;
      expect(total, `cales fausses à ${decalage} px : la file entière fait ${TAILLE_FILE * H} px`)
        .toBe(TAILLE_FILE * H);
      expect(f.debut).toBeGreaterThanOrEqual(0);
      expect(f.fin).toBeLessThanOrEqual(TAILLE_FILE);
    }
  });

  it('tout en bas, la DERNIÈRE ligne est dans la fenêtre', () => {
    const H = 55;
    const f = fenetreListe(TAILLE_FILE, H, TAILLE_FILE * H - 900, 900);
    expect(f.fin, 'la fin de la file n’est pas atteignable').toBe(TAILLE_FILE);
  });

  it('sans hauteur de ligne exploitable, on rend TOUT plutôt que faux', () => {
    expect(fenetreListe(TAILLE_FILE, 0, 0, 900)).toEqual({
      debut: 0,
      fin: TAILLE_FILE,
      avant: 0,
      apres: 0,
    });
  });
});

describe('#1126 — l’écran de file tient une file de 1454 titres', () => {
  let hote: HTMLElement;

  beforeEach(() => {
    hote = document.createElement('div');
    document.body.appendChild(hote);
  });

  afterEach(() => {
    hote.remove();
  });

  it('ne construit pas les 1453 lignes restantes d’un coup', async () => {
    zones.set([ZONE as never]);
    currentZoneId.set(1);
    queueTracks.set(PISTES as never);
    queuePosition.set(0);

    const debut = performance.now();
    const app = mount(QueueV2, { target: hote });
    flushSync();
    await attendre();
    flushSync();
    const ms = Math.round(performance.now() - debut);

    const lignes = hote.querySelectorAll('.row').length;
    // eslint-disable-next-line no-console
    console.log(
      `\n  MESURE — écran « File d'attente », ${TAILLE_FILE} titres :\n` +
        `    lignes construites : ${lignes} (sur ${TAILLE_FILE - 1} à suivre)\n` +
        `    temps de montage : ${ms} ms\n`,
    );

    unmount(app);

    expect(
      lignes,
      `${lignes} lignes construites en une passe (${ms} ms) : l’écran repeint toute la file.`,
    ).toBeLessThan(120);
    expect(lignes, 'plus aucune ligne n’est rendue : l’écran serait vide.').toBeGreaterThan(0);
  });

  /**
   * CONTRE-ÉPREUVE de la fenêtre : ce qui n'est pas construit doit rester
   * ATTEIGNABLE. Une fenêtre qui ne suit pas le défilement ampute la file
   * aussi sûrement qu'un plafond.
   */
  it('le défilement atteint la FIN de la file', async () => {
    zones.set([ZONE as never]);
    currentZoneId.set(1);
    queueTracks.set(PISTES as never);
    queuePosition.set(0);

    const app = mount(QueueV2, { target: hote });
    flushSync();
    await attendre();
    flushSync();

    const scroller = hote.querySelector('.scroll') as HTMLElement;
    expect(scroller, 'le conteneur défilant a changé de nom : la fenêtre ne l’écoute plus').toBeTruthy();

    // Tout en bas.
    scroller.scrollTop = 10_000_000;
    scroller.dispatchEvent(new Event('scroll'));
    // La mesure est repoussée à l'image suivante : une rafale de défilement ne
    // doit pas coûter une mesure par pixel.
    await new Promise((r) => setTimeout(r, 60));
    flushSync();

    const titres = Array.from(hote.querySelectorAll('.row .ti')).map((e) => e.textContent ?? '');
    unmount(app);

    expect(
      titres.some((s) => s.startsWith(`Titre ${TAILLE_FILE - 1}`)),
      'le dernier titre de la file est introuvable après défilement : la fenêtre ampute la file.',
    ).toBe(true);
  });
});
