// @vitest-environment jsdom
// tune-server-rust#5975 — Alex Campbell, fil forum 2178 (1.0.0-rc2 Docker,
// Safari 18.6, zone « This computer ») : radios muettes, « Tourist » et la
// première piste d'une playlist qui ne jouent pas, alors que des FLAC locaux
// jouent.
//
// Tous les chemins de lecture de la zone navigateur appellent `audio.play()`
// APRÈS une requête au serveur (`api.playRadio`, `api.play`…), donc hors du
// geste de l'utilisateur. Safari (WebKit) refuse alors `play()` par
// `NotAllowedError` tant que l'élément n'a jamais été lancé ou chargé PENDANT
// un geste ; il ne tolère le délai que si la réponse arrive vite. Une radio ou
// une piste Qobuz, plus lentes à résoudre qu'un FLAC local, restent muettes.
// Chrome, qui retient l'activation de la page, ne montre rien de tel.
//
// Le simulacre ci-dessous applique cette règle : `play()` est refusé tant que
// l'élément n'a pas reçu `load()` ou `play()` pendant un geste. Le geste est
// le `click` envoyé par le test, et lui seul.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';
import { zones, currentZoneId } from '../stores/zones';
import { stopSeekTimer } from '../stores/nowPlaying';
import {
  browserPlay,
  browserPause,
  browserAudioDestroy,
  browserAudioPlaying,
  deverrouillerAuPremierGeste,
} from '../stores/browserAudio';
import * as moduleAudio from '../stores/browserAudio';

let gesteEnCours = false;

class AudioSafari extends EventTarget {
  static instances: AudioSafari[] = [];
  src = ''; crossOrigin = ''; preload = ''; volume = 1;
  currentTime = 0; duration = 300; readyState = 4; paused = true;
  error: { code: number } | null = null;
  chargements = 0;
  lectures = 0;
  autorise = false;
  constructor() { super(); AudioSafari.instances.push(this); }
  play() {
    this.lectures += 1;
    if (gesteEnCours) this.autorise = true;
    if (!this.autorise) {
      const refus = new Error('The request is not allowed by the user agent');
      refus.name = 'NotAllowedError';
      return Promise.reject(refus);
    }
    this.paused = false;
    this.dispatchEvent(new Event('playing'));
    return Promise.resolve();
  }
  pause() { this.paused = true; this.dispatchEvent(new Event('pause')); }
  load() { this.chargements += 1; if (gesteEnCours) this.autorise = true; }
  removeAttribute(name: string) { if (name === 'src') this.src = ''; }
}

const RADIO = '/stream/radio-12';
const audio = () => AudioSafari.instances.at(-1)!;
const vider = async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); };
/** Un clic de l'utilisateur, n'importe où dans la page. */
function cliquer() {
  gesteEnCours = true;
  try {
    document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  } finally {
    gesteEnCours = false;
  }
}

beforeEach(() => {
  vi.stubGlobal('Audio', AudioSafari);
  AudioSafari.instances = [];
  zones.set([{ id: 12, name: 'This computer', output_type: 'browser', state: 'playing', stream_url: RADIO }] as any);
  currentZoneId.set(12);
  // Ce que fait `main.ts` au démarrage : le SEUL déverrouillage (10/10/2026).
  deverrouillerAuPremierGeste(document);
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  browserAudioDestroy(); stopSeekTimer();
  vi.restoreAllMocks(); vi.unstubAllGlobals();
});

describe('#5975 — Safari : la lecture lancée après une réponse du serveur', () => {
  it('le clic qui lance la radio déverrouille l’élément : la lecture différée est permise', async () => {
    // Le clic sur la station : la requête au serveur part, la réponse
    // arrive plus tard, hors du geste.
    cliquer();
    await vider();
    browserPlay(RADIO, false, 12);
    await vider();
    expect(AudioSafari.instances.length).toBe(1);
    expect(audio().paused).toBe(false);
    expect(get(browserAudioPlaying)).toBe(true);
  });

  it('une lecture refusée hors geste démarre au geste suivant', async () => {
    browserPlay(RADIO, false, 12);
    await vider();
    expect(audio().paused).toBe(true);
    cliquer();
    await vider();
    expect(audio().paused).toBe(false);
    expect(get(browserAudioPlaying)).toBe(true);
  });

  it('un clic pendant la lecture ne recharge ni ne relance l’élément', async () => {
    cliquer();
    browserPlay(RADIO, false, 12);
    await vider();
    const chargements = audio().chargements;
    const lectures = audio().lectures;
    cliquer();
    cliquer();
    await vider();
    expect(audio().chargements).toBe(chargements);
    expect(audio().lectures).toBe(lectures);
  });

  it('un clic après une pause de l’utilisateur ne relance pas la lecture', async () => {
    cliquer();
    browserPlay(RADIO, false, 12);
    await vider();
    browserPause();
    const lectures = audio().lectures;
    cliquer();
    await vider();
    expect(audio().paused).toBe(true);
    expect(audio().lectures).toBe(lectures);
  });
});

describe('un seul déverrouillage au geste (décision du 10/10/2026 : celui du pont)', () => {
  it('le premier geste déverrouille une fois, par le silence du pont, et le second ne fait rien', async () => {
    cliquer();
    await vider();
    const a = audio();
    // Un seul play() — le silence en sourdine — et aucun load() à vide :
    // l'ancien déverrouillage de #2026 (load() sur document) n'existe plus.
    expect(a.lectures).toBe(1);
    expect(a.chargements).toBe(0);
    expect(a.src).toBe('');
    expect(get(browserAudioPlaying)).toBe(false);
    cliquer();
    cliquer();
    await vider();
    expect(a.lectures).toBe(1);
    expect(a.chargements).toBe(0);
    // Et l'élément reste déverrouillé : la lecture différée passe.
    browserPlay(RADIO, false, 12);
    await vider();
    expect(a.paused).toBe(false);
    expect(get(browserAudioPlaying)).toBe(true);
  });

  it('le module n’exporte plus le déverrouillage en double', () => {
    expect('deverrouillerAuGeste' in moduleAudio).toBe(false);
  });
});
