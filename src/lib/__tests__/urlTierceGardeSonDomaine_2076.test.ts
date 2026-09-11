/**
 * #2076 / #2158 — la moitié « rien ne joue » : une URL TIERCE perdait son
 * domaine, et l'onglet demandait le flux à Tune.
 *
 * Bilou, fil 1509, console du 22/08/2026 :
 *
 *     ⛔ Browser audio error: MediaError { code: 4, message: "Failed to init decoder" }
 *     ⚠ Impossible de lire le média. Aucun décodeur pour les formats nécessaires : text/html
 *
 * `browserPlay` réécrivait TOUTE URL absolue en `u.pathname + u.search`. La
 * règle est juste pour une adresse de Tune — le serveur annonce son IP de LAN,
 * que le navigateur ne joint pas forcément derrière un proxy. Appliquée à
 * l'URL Bandcamp, elle faisait demander `/stream/<hash>/mp3-128/<id>` à Tune,
 * qui ne connaît pas ce chemin et sert son repli SPA : `200 text/html`.
 *
 * Le serveur a été rapiécé source par source (Bandcamp #2076/#2158, radio
 * #2670) ; le commentaire de `servir_la_radio_au_reseau` nomme lui-même ce
 * fichier client comme la cause commune. Le dernier bras de `resolve_direct`
 * — podcast et serveur multimédia — rend toujours l'URL amont telle quelle,
 * sans garde `is_browser_output` : la même panne y attend.
 *
 * Ce qui est mesuré ici est l'EFFET OBSERVABLE : ce que `browserPlay` pose
 * réellement dans `audio.src`.
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { writable } from 'svelte/store';
import { sourceDuLecteur } from '../urlDeFluxNavigateur';

// Les voisins de `browserAudio` ne sont pas le sujet : les charger pour de
// vrai coûtait plus de cinq secondes de transformation sous la suite complète
// — un rouge de calendrier, pas de code. On les remplace par le strict
// nécessaire pour que `browserPlay` s'exécute.
vi.mock('../stores/zones', () => ({
  currentZone: writable(null),
  syncZone: () => {},
}));
vi.mock('../stores/nowPlaying', () => ({
  seekPositionMs: writable(0),
  startSeekTimer: () => {},
  stopSeekTimer: () => {},
}));
vi.mock('../api', () => ({}));

// ⚠️ L'aiguille est ASSEMBLÉE à l'exécution. Écrite en clair, elle figurerait
// dans ce fichier — et un témoin qui se trouve lui-même reste vert sous
// sabotage.
const HOTE_TIERS = ['t4', 'bcbits', 'com'].join('.');
const URL_BANDCAMP = `https://${HOTE_TIERS}/stream/1f2e3d4c5b6a/mp3-128/2128684265?token=1787503620_0d0790ca`;
const ORIGINE_PAGE = 'http://tune.local';

describe('#2076 — ce que le lecteur du navigateur reçoit', () => {
  it('🔴 une URL TIERCE garde son domaine — c’était LE défaut', () => {
    const pose = sourceDuLecteur(URL_BANDCAMP, ORIGINE_PAGE);
    expect(pose).toContain(HOTE_TIERS);
    // Et surtout : ce n'est pas un chemin nu, que l'onglet aurait demandé à Tune.
    expect(pose.startsWith('/')).toBe(false);
  });

  it('une adresse de flux de TUNE part toujours en relatif — la règle d’origine tient', () => {
    // La forme est construite à un seul endroit du serveur :
    // `tune-core/src/http/streamer.rs:1181`,
    // `format!("http://{server_ip}:{}/stream/{stream_id}.{ext}", self.port)`.
    for (const ext of ['mp3', 'flac', 'wav']) {
      expect(
        sourceDuLecteur(`http://192.168.1.18:8888/stream/8c16bc18-1dd6.${ext}`, ORIGINE_PAGE),
      ).toBe(`/stream/8c16bc18-1dd6.${ext}`);
    }
    // Sans extension (relais cloud, `cloud/relay.rs:276`) : un seul segment.
    expect(sourceDuLecteur('http://127.0.0.1:9000/stream/abcdef', ORIGINE_PAGE)).toBe(
      '/stream/abcdef',
    );
    // La chaîne de requête suit.
    expect(sourceDuLecteur('http://10.0.0.9:8888/stream/abc.mp3?x=1', ORIGINE_PAGE)).toBe(
      '/stream/abc.mp3?x=1',
    );
  });

  it('une URL de la MÊME origine que la page reste relative', () => {
    expect(sourceDuLecteur(`${ORIGINE_PAGE}/podcasts/episode-4.mp3`, ORIGINE_PAGE)).toBe(
      '/podcasts/episode-4.mp3',
    );
  });

  it('un podcast ou un serveur multimédia tiers garde son hôte', () => {
    // `resolve_direct.rs`, dernier bras : l'URL amont est rendue telle quelle,
    // sans garde `is_browser_output`. C'est le cas encore ouvert côté serveur.
    const podcast = 'https://cdn.example.org/feed/episode-4.mp3';
    expect(sourceDuLecteur(podcast, ORIGINE_PAGE)).toBe(podcast);
    const nas = 'http://192.168.1.42:8200/MediaItems/7391.flac';
    expect(sourceDuLecteur(nas, ORIGINE_PAGE)).toBe(nas);
  });

  it('une adresse déjà relative traverse sans être touchée', () => {
    expect(sourceDuLecteur('/stream/abc.mp3', ORIGINE_PAGE)).toBe('/stream/abc.mp3');
  });

  it('sans origine connue, la règle reste celle du chemin de flux', () => {
    expect(sourceDuLecteur('http://192.168.1.18:8888/stream/abc.mp3')).toBe('/stream/abc.mp3');
    expect(sourceDuLecteur(URL_BANDCAMP)).toContain(HOTE_TIERS);
  });
});

// ---------------------------------------------------------------------------
// L'EFFET OBSERVABLE : ce que `browserPlay` pose dans `audio.src`.
// ---------------------------------------------------------------------------

/** Le minimum d'un `HTMLAudioElement` pour que `browserPlay` s'exécute. */
class AudioTemoin {
  src = '';
  volume = 1;
  crossOrigin: string | null = null;
  preload = '';
  currentTime = 0;
  paused = true;
  chargements = 0;
  addEventListener() {}
  load() {
    this.chargements += 1;
  }
  play() {
    return Promise.resolve();
  }
  pause() {}
}

let dernierAudio: AudioTemoin | null = null;
let browserPlay: (url: string, force?: boolean) => void;

describe('#2076 — l’effet observable de browserPlay', () => {
  beforeAll(async () => {
    vi.stubGlobal(
      'Audio',
      class extends AudioTemoin {
        constructor() {
          super();
          dernierAudio = this;
        }
      },
    );
    vi.stubGlobal('location', { origin: ORIGINE_PAGE, href: `${ORIGINE_PAGE}/` });
    ({ browserPlay } = await import('../stores/browserAudio'));
  });

  beforeEach(() => {
    if (dernierAudio) dernierAudio.src = '';
  });

  it('🔴 l’élément audio reçoit l’URL Bandcamp ENTIÈRE, domaine compris', () => {
    browserPlay(URL_BANDCAMP);
    expect(dernierAudio).not.toBeNull();
    expect(dernierAudio!.src).toContain(HOTE_TIERS);
    expect(dernierAudio!.src.startsWith('/')).toBe(false);
  });

  it('l’élément audio reçoit toujours le chemin relatif pour un flux de Tune', () => {
    browserPlay('http://192.168.1.18:8888/stream/8c16bc18.mp3');
    expect(dernierAudio!.src).toBe('/stream/8c16bc18.mp3');
  });
});
