// @vitest-environment jsdom
/**
 * Essai en 5G du 09/10/2026 : par le pont, la zone « Cet ordinateur » joue sur
 * le serveur et Safari reste muet.
 *
 * 1. Les boutons Lecture / Suivant / reprise passaient `zone.stream_url` (IP du
 *    réseau local) à `browserPlay`, qui la ramenait en relatif :
 *    `bridge.mozaiklabs.fr/stream/<id>.flac`, route que le pont ne sert pas.
 * 2. iOS Safari refuse un `play()` qui arrive après l'aller-retour du relais :
 *    l'élément doit être déverrouillé au premier geste.
 *
 * Vrais stores, vrai lecteur ; seules les frontières HTTP et HTMLAudioElement
 * sont simulées.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';
import * as api from '../api';
import { reinitialiserPourTest, fluxParLeRelais } from '../bridge';
import { zones, currentZoneId, playAndSync, resumeAndSync } from '../stores/zones';
import {
  browserPlay,
  browserStop,
  browserAudioDestroy,
  browserStreamUrl,
  browserAudioPlaying,
  deverrouillerAuPremierGeste,
} from '../stores/browserAudio';

vi.mock('../api', async (original) => ({
  ...(await original<typeof import('../api')>()),
  play: vi.fn(),
  resume: vi.fn(),
  next: vi.fn(),
  getZone: vi.fn(),
}));

const UUID = '75f24b9e-fb8a-4de2-8007-99edd3454263';
const ORIGINE = 'https://bridge.mozaiklabs.fr';
const JETON = 'jeton-du-pont-123';
const LAN = 'http://192.168.1.18:8888/stream/8b996950-a289-492b-affb-519b5b7de30b.flac';
const ATTENDU = `${ORIGINE}/stream/relay/${UUID}/8b996950-a289-492b-affb-519b5b7de30b.flac?token=${JETON}`;

class AudioTemoin extends EventTarget {
  static instances: AudioTemoin[] = [];
  src = ''; crossOrigin = ''; preload = ''; volume = 1; muted = false;
  currentTime = 0; duration = 200; readyState = 4; error = null;
  paused = true; plays: string[] = [];
  constructor() { super(); AudioTemoin.instances.push(this); }
  play() { this.plays.push(this.src); this.paused = false; this.dispatchEvent(new Event('playing')); return Promise.resolve(); }
  pause() { this.paused = true; this.dispatchEvent(new Event('pause')); }
  load() {}
  removeAttribute(name: string) { if (name === 'src') this.src = ''; }
}
const audio = () => AudioTemoin.instances.at(-1)!;

const locationOrigine = window.location;

function pageParLePont(avecJeton = true) {
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: {
      pathname: `/${UUID}/`, hash: '', search: '', origin: ORIGINE,
      host: 'bridge.mozaiklabs.fr', protocol: 'https:', href: `${ORIGINE}/${UUID}/`,
    },
  });
  if (avecJeton) localStorage.setItem('tune.bridge.token', JETON);
  reinitialiserPourTest();
}

const ZONE = {
  id: 15, name: 'Cet ordinateur', output_type: 'browser', state: 'playing', volume: 50,
  stream_url: LAN,
  stream_url_remote: `${ORIGINE}/stream/relay/${UUID}/8b996950-a289-492b-affb-519b5b7de30b.flac`,
};

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  vi.stubGlobal('Audio', AudioTemoin);
  AudioTemoin.instances = [];
});

afterEach(() => {
  browserStop();
  browserAudioDestroy();
  Object.defineProperty(window, 'location', { configurable: true, value: locationOrigine });
  reinitialiserPourTest();
  vi.unstubAllGlobals();
});

describe('flux de la zone navigateur par le pont', () => {
  it("l'adresse du réseau local devient la route de flux du pont, jeton compris", () => {
    pageParLePont();
    expect(fluxParLeRelais(LAN)).toBe(ATTENDU);
    expect(fluxParLeRelais('/stream/abc.flac')).toBe(`${ORIGINE}/stream/relay/${UUID}/abc.flac?token=${JETON}`);
  });

  it('stream_url_remote reçoit le jeton qui lui manque, sans doublon', () => {
    pageParLePont();
    expect(fluxParLeRelais(ZONE.stream_url_remote)).toBe(ATTENDU);
    expect(fluxParLeRelais(ATTENDU)).toBe(ATTENDU);
  });

  it("une adresse tierce n'est pas touchée, ni rien hors du pont", () => {
    pageParLePont();
    expect(fluxParLeRelais('https://bcbits.com/stream/a/mp3-128/1')).toBeNull();
    Object.defineProperty(window, 'location', { configurable: true, value: locationOrigine });
    reinitialiserPourTest();
    expect(fluxParLeRelais(LAN)).toBeNull();
  });

  it('browserPlay(stream_url) pose la source du pont dans <audio>', () => {
    pageParLePont();
    browserPlay(LAN, false, 15);
    expect(audio().src).toBe(ATTENDU);
    expect(get(browserStreamUrl)).toBe(ATTENDU);
  });

  it('le bouton Lecture (playAndSync) fait jouer le téléphone par le pont', async () => {
    pageParLePont();
    zones.set([ZONE] as any);
    currentZoneId.set(15);
    vi.mocked(api.play).mockResolvedValue(ZONE as any);
    await playAndSync(15);
    await vi.waitFor(() => expect(audio().plays).toContain(ATTENDU));
  });

  it('la reprise (resumeAndSync) aussi', async () => {
    pageParLePont();
    zones.set([ZONE] as any);
    currentZoneId.set(15);
    vi.mocked(api.resume).mockResolvedValue(ZONE as any);
    await resumeAndSync(15);
    await vi.waitFor(() => expect(audio().plays).toContain(ATTENDU));
  });

  it('hors pont, rien ne change : chemin relatif comme avant', () => {
    browserPlay(LAN, false, 15);
    expect(audio().src).toBe('/stream/8b996950-a289-492b-affb-519b5b7de30b.flac');
  });
});

describe('iOS : déverrouillage de l’élément audio au premier geste', () => {
  it('le premier appui joue un silence en sourdine puis rend l’élément vide', async () => {
    const cible = new EventTarget();
    deverrouillerAuPremierGeste(cible);
    cible.dispatchEvent(new Event('touchend'));
    await Promise.resolve();
    await Promise.resolve();
    const a = audio();
    expect(a.plays).toHaveLength(1);
    expect(a.plays[0]).toMatch(/^data:audio\/wav;base64,/);
    expect(a.src).toBe('');
    expect(a.muted).toBe(false);
    // Le silence ne passe pas pour une lecture
    expect(get(browserAudioPlaying)).toBe(false);
    // Une seule fois
    cible.dispatchEvent(new Event('click'));
    await Promise.resolve();
    expect(a.plays).toHaveLength(1);
  });

  it('le geste qui déverrouille ET lance la lecture ne coupe pas le flux', async () => {
    pageParLePont();
    const cible = new EventTarget();
    deverrouillerAuPremierGeste(cible);
    cible.dispatchEvent(new Event('touchend'));
    // Le bouton Lecture pose la vraie source avant que le silence ait démarré
    browserPlay(LAN, false, 15);
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(audio().src).toBe(ATTENDU);
    expect(audio().paused).toBe(false);
    expect(audio().muted).toBe(false);
    expect(get(browserAudioPlaying)).toBe(true);
  });

  it('ne touche pas un élément qui joue déjà', async () => {
    browserPlay('/stream/x.flac', false, 15);
    const avant = audio().plays.length;
    const cible = new EventTarget();
    deverrouillerAuPremierGeste(cible);
    cible.dispatchEvent(new Event('pointerup'));
    await Promise.resolve();
    expect(audio().plays.length).toBe(avant);
    expect(audio().src).toBe('/stream/x.flac');
  });
});
