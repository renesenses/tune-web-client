// @vitest-environment jsdom
// web#2063 — le lecteur de la zone navigateur dit au serveur qu'il joue
// (POST /zones/{id}/browser-playing, serveur #6066). Sans lui, le serveur
// confirmait « en écoute » sur un octet tiré, même sans lecture.
// Vrai lecteur (`stores/browserAudio`), vrai `fetchJSON` ; seules les
// frontières HTTP et HTMLAudioElement sont simulées.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';
import { browserPlay, browserAudioDestroy } from '../stores/browserAudio';
import { notifications } from '../stores/notifications';
import { idDuFlux, oublierConfirmationLecture } from '../confirmationLectureNavigateur';

class AudioTemoin extends EventTarget {
  static instances: AudioTemoin[] = [];
  src = ''; crossOrigin = ''; preload = ''; volume = 1; muted = false;
  currentTime = 0; duration = 200; readyState = 4; error = null;
  paused = true;
  constructor() { super(); AudioTemoin.instances.push(this); }
  play() { this.paused = false; this.dispatchEvent(new Event('playing')); return Promise.resolve(); }
  pause() { this.paused = true; this.dispatchEvent(new Event('pause')); }
  load() { this.currentTime = 0; }
  removeAttribute(name: string) { if (name === 'src') this.src = ''; }
}

let statutServeur = 200;
const appels: { url: string; corps: any }[] = [];
const audio = () => AudioTemoin.instances.at(-1)!;
const avancer = (s: number) => { audio().currentTime = s; audio().dispatchEvent(new Event('timeupdate')); };
const confirmations = () => appels.filter((a) => a.url.includes('/browser-playing'));
const attendre = () => new Promise((r) => setTimeout(r, 10));

beforeEach(() => {
  statutServeur = 200;
  appels.length = 0;
  AudioTemoin.instances = [];
  oublierConfirmationLecture();
  for (const n of get(notifications)) notifications.dismiss(n.id);
  vi.stubGlobal('Audio', AudioTemoin);
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    appels.push({ url: String(url), corps: init?.body ? JSON.parse(String(init.body)) : null });
    const corps = statutServeur === 200 ? { status: 'confirmed' } : { error: 'zone_not_found' };
    return {
      ok: statutServeur < 400, status: statutServeur, statusText: '',
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => corps, text: async () => JSON.stringify(corps),
    } as unknown as Response;
  }));
});
afterEach(() => { browserAudioDestroy(); vi.unstubAllGlobals(); });

describe('web#2063 — le lecteur confirme qu\'il joue', () => {
  it('🔴 la première avancée du lecteur envoie stream_id et position', async () => {
    browserPlay('/stream/session-abc.flac', false, 18);
    await attendre();
    // `playing` à 0 : rien ne confirme encore.
    expect(confirmations()).toHaveLength(0);
    avancer(1.5);
    await attendre();
    expect(confirmations()).toHaveLength(1);
    expect(confirmations()[0].url).toMatch(/\/api\/v1\/zones\/18\/browser-playing$/);
    expect(confirmations()[0].corps).toEqual({ stream_id: 'session-abc', position_ms: 1500 });
  });

  it('un seul appel par source, pas un par timeupdate', async () => {
    browserPlay('/stream/session-abc.flac', false, 18);
    avancer(1); avancer(2); avancer(3);
    await attendre();
    expect(confirmations()).toHaveLength(1);
  });

  it('un rechargement forcé (piste suivante sous le même flux) confirme de nouveau', async () => {
    browserPlay('/stream/session-abc.flac', false, 18);
    avancer(1);
    browserPlay('/stream/session-abc.flac', true, 18);
    avancer(0.5);
    await attendre();
    expect(confirmations()).toHaveLength(2);
    expect(confirmations()[1].corps.stream_id).toBe('session-abc');
  });

  it('une adresse tierce (sans /stream/) n\'envoie rien', async () => {
    browserPlay('https://bandcamp.example/track.mp3', false, 18);
    avancer(2);
    await attendre();
    expect(confirmations()).toHaveLength(0);
  });

  it('un serveur sans la route (404) ne lève aucun bandeau', async () => {
    statutServeur = 404;
    browserPlay('/stream/session-abc.flac', false, 18);
    avancer(2);
    await attendre();
    expect(confirmations()).toHaveLength(1);
    expect(get(notifications)).toEqual([]);
  });

  it('idDuFlux lit /stream/<id>.<ext>, relais et paramètres compris', () => {
    expect(idDuFlux('/stream/abc.flac')).toBe('abc');
    expect(idDuFlux('http://h:8888/stream/abc.flac?_t=12')).toBe('abc');
    expect(idDuFlux('/relais/x/stream/s-1.mp3')).toBe('s-1');
    expect(idDuFlux('/stream/abc')).toBe('abc');
    expect(idDuFlux('https://bandcamp.example/track.mp3')).toBeNull();
    expect(idDuFlux(null)).toBeNull();
  });
});
