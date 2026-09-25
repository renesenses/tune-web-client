/**
 * #1010 — « j'ai lancé une Ambiance (Techno nocturne), j'ai cliqué Tout lire
 * mais malheureusement l'historique n'a conservé que les 3 premiers titres »
 * (Fabien, fil « v0.9.148 : v1 divers bugs », point 2).
 *
 * ## Ce que le code prouve, et il suffit
 *
 * L'écriture d'une écoute n'est PAS dérivée de l'événement qui la déclenche.
 * `v2Live.ts` réagit à `playback.track_changed` par
 *
 *     void rechargerZones().then(() => { … noterSiDebutDEcoute(…, courante, …) })
 *
 * — un `GET /zones` autonome, lancé une fois par événement, jamais sérialisé,
 * dont la réponse est lue pour savoir QUELLE piste noter. Trois faits, tous
 * lisibles dans le dépôt :
 *
 *  1. `rechargerZones()` est appelée par `void … .then(…)` : N avances de
 *     piste lancent N requêtes concurrentes. Rien n'ordonne leurs réponses,
 *     rien n'apparie une réponse à l'événement qui l'a demandée.
 *  2. L'instantané `/zones` décrit l'état du serveur à l'instant de la
 *     RÉPONSE, pas à celui de l'événement. Sur un enchaînement sans blanc, il
 *     peut porter la piste d'avant comme celle d'après.
 *  3. `playbackHistory.add` (`stores/history.ts`) refuse toute piste égale à
 *     la PRÉCÉDENTE ligne. Un instantané en retard n'écrit donc pas une
 *     mauvaise ligne : il n'en écrit AUCUNE, en silence.
 *
 * Les trois composés donnent exactement la forme du symptôme : une file de N
 * titres ne laisse que quelques lignes.
 *
 * ## Et le serveur porte déjà la réponse
 *
 * `now_playing_event_data` (tune-server-rust, `playback/mod.rs`) sérialise le
 * `NowPlaying` COMPLET dans la charge de `playback.started` et de
 * `playback.track_changed` — titre, `track_id`, format, `queue_position` —
 * et le fait exprès depuis #1096. Le client jetait cette charge pour aller
 * redemander par le réseau ce qu'il tenait déjà.
 *
 * ## Ce que cette garde tient
 *
 * Que l'écoute notée est celle de l'ÉVÉNEMENT, et que le repli sur
 * `zone.current_track` survit quand l'événement ne porte pas de piste.
 *
 * ## Ce qu'elle ne tient PAS
 *
 * Que ce soit LA cause du compte de Fabien : personne n'a relevé son
 * `localStorage`. Elle tient qu'un instantané en retard perdait des lignes, et
 * qu'il ne le peut plus.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  noterEcoute,
  noterSiDebutDEcoute,
  pisteDeLEvenement,
} from '../historiqueEcoutes';
import { playbackHistory } from '../stores/history';
import { nowPlayingToTrack } from '../stores/nowPlaying';
import { get } from 'svelte/store';
import type { Track } from '../types';

/** La charge d'un `track_changed` : un `NowPlaying` sérialisé par le serveur. */
const np = (id: number, titre: string) => ({
  track_id: id,
  title: titre,
  artist_name: 'Techno nocturne',
  queue_position: id,
});

function carnet() {
  const pose: { piste: Track; zone: string }[] = [];
  return { pose, ajouter: (piste: Track, zone: string) => pose.push({ piste, zone }) };
}

describe('#1010 — l’écoute notée est celle de l’événement', () => {
  it('une charge qui porte un titre est une piste', () => {
    expect(pisteDeLEvenement(np(1, 'Nachtmusik'))).not.toBeNull();
    // `track_id` seul suffit aussi : une piste locale sans titre reste une piste.
    expect(pisteDeLEvenement({ track_id: 42 })).not.toBeNull();
  });

  /**
   * 🔴 Le serveur retombe sur `{}` quand la zone a disparu entre l'événement
   * et sa mise en forme (`unwrap_or_else(|| json!({}))`). Une charge vide ne
   * doit pas écraser le repli, sinon on noterait une écoute sans piste.
   */
  it('une charge vide, ou sans titre ni identifiant, n’en est pas une', () => {
    for (const d of [null, undefined, {}, { queue_position: 3 }, { title: '   ' }, 'x', 7]) {
      expect(pisteDeLEvenement(d as any), JSON.stringify(d)).toBeNull();
    }
  });

  it('`noterEcoute` note la piste de l’événement, pas celle de l’instantané', () => {
    const c = carnet();
    const zone = { id: 7, name: 'Salon', current_track: np(1, 'en retard') };
    expect(noterEcoute(zone, nowPlayingToTrack, c.ajouter, np(4, 'Nachtmusik'))).toBe(true);
    expect(c.pose).toHaveLength(1);
    expect(c.pose[0].piste.title).toBe('Nachtmusik');
    expect(c.pose[0].piste.id).toBe(4);
    // Le NOM de zone, lui, reste celui de la zone : l'événement ne le porte pas.
    expect(c.pose[0].zone).toBe('Salon');
  });

  /**
   * Le transport voyage avec la piste sans en faire partie : le garder
   * figerait l'index de file d'un instant dans `localStorage`, pour deux cents
   * lignes.
   */
  it('le transport de l’événement n’entre pas dans l’historique', () => {
    const c = carnet();
    const charge = {
      ...np(4, 'Nachtmusik'),
      zone_id: 7, queue_length: 120, track_generation: 3,
    };
    noterEcoute({ id: 7, name: 'Salon' }, nowPlayingToTrack, c.ajouter, charge);
    const piste = c.pose[0].piste as unknown as Record<string, unknown>;
    for (const k of ['zone_id', 'queue_position', 'queue_length', 'track_generation']) {
      expect(piste, k).not.toHaveProperty(k);
    }
    expect(piste.title).toBe('Nachtmusik');
    expect(piste.id).toBe(4);
  });

  it('sans piste dans l’événement, le repli sur `current_track` tient', () => {
    const c = carnet();
    const zone = { id: 7, name: 'Salon', current_track: np(1, 'Nachtmusik') };
    expect(noterEcoute(zone, nowPlayingToTrack, c.ajouter, null)).toBe(true);
    expect(c.pose[0].piste.id).toBe(1);
    // Ni l'un ni l'autre : rien à noter.
    expect(noterEcoute({ id: 7, name: 'Salon' }, nowPlayingToTrack, c.ajouter, null)).toBe(false);
    expect(c.pose).toHaveLength(1);
  });
});

/**
 * 🔴 LE TÉMOIN. Il ne réimplémente pas le dédoublonnage : il appelle le VRAI
 * magasin, celui que `v2Live` appelle, et compte les lignes qui y tombent.
 */
describe('#1010 — « Tout lire » d’une Ambiance laisse une ligne par titre', () => {
  beforeEach(() => playbackHistory.clear());

  it('un instantané de zone en retard d’un cran ne replie plus la file en une ligne', () => {
    const file = [np(1, 'Nachtmusik'), np(2, 'Spätkauf'), np(3, 'Ostkreuz'), np(4, 'Rummelsburg')];
    /**
     * L'instantané est en retard d'un cran : c'est le cas que le code rend
     * possible — `rechargerZones()` n'est pas appariée à l'événement, et sa
     * réponse peut décrire la piste d'avant.
     */
    let enRetard: any = null;
    for (const piste of file) {
      const zone = { id: 7, name: 'Salon', current_track: enRetard ?? piste };
      noterSiDebutDEcoute(
        'playback.track_changed', 7, zone, zone,
        nowPlayingToTrack,
        (p, nom) => playbackHistory.add(p, nom),
        piste,
      );
      enRetard = piste;
    }
    const lignes = get(playbackHistory);
    expect(lignes).toHaveLength(4);
    expect(lignes.map((l) => l.track.title)).toEqual(
      ['Rummelsburg', 'Ostkreuz', 'Spätkauf', 'Nachtmusik'],
    );
  });

  /**
   * La contre-épreuve du témoin : SANS la piste de l'événement, le même
   * enchaînement perd bien des lignes. C'est l'état d'avant, et il doit rester
   * mesurable, sans quoi la garde ci-dessus ne garderait rien.
   */
  it('contre-épreuve : sans la piste de l’événement, l’instantané en retard en perd', () => {
    const file = [np(1, 'Nachtmusik'), np(2, 'Spätkauf'), np(3, 'Ostkreuz'), np(4, 'Rummelsburg')];
    let enRetard: any = null;
    for (const piste of file) {
      const zone = { id: 7, name: 'Salon', current_track: enRetard ?? piste };
      noterSiDebutDEcoute(
        'playback.track_changed', 7, zone, zone,
        nowPlayingToTrack,
        (p, nom) => playbackHistory.add(p, nom),
        // pas de piste d'événement : le comportement d'avant
      );
      enRetard = piste;
    }
    expect(get(playbackHistory).length).toBeLessThan(4);
  });
});
