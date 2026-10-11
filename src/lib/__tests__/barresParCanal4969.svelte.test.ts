// @vitest-environment jsdom
//
// tune-server-rust#4969 (Gros Bidon, fil 1929) — « avoir un bargraphe avec une
// barre par canal quand un album est en multicanal […] à la place de
// l'analyseur de spectre actuel ». Le serveur publie `channel_levels` (et
// `channel_names`) dans `playback.audio_levels` depuis la rc3 (#5937) ;
// aucun écran web ne les lisait.
//
// 🔴 CE TÉMOIN MONTE LE VRAI `AudioVisualizer` et lui envoie une trame 5.1
// telle que le serveur la publie : six barres nommées FL…BR, le LFE muet
// signalé comme tel. En stéréo, rien ne change : pas de barres, la toile
// du spectre reste visible.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import AudioVisualizer from '../../components/partages/AudioVisualizer.svelte';
import { FRAICHEUR_TRAME_MS, handleAudioLevelsEvent } from '../stores/audioLevels';
import { currentZoneId } from '../stores/zones';
import { barresParCanal, hauteurDb } from '../barresParCanal';

const ZONE = 4969;
let hote: HTMLDivElement;
let monte: ReturnType<typeof mount> | null = null;

function trame51() {
  handleAudioLevelsEvent({
    zone_id: ZONE, channels: 6,
    rms_left_db: -20, rms_right_db: -21, peak_left_db: -8, peak_right_db: -9,
    channel_levels: [
      { rms_db: -20, peak_db: -8, over: false },
      { rms_db: -21, peak_db: -9, over: false },
      { rms_db: -18, peak_db: -6, over: false },
      { rms_db: -96, peak_db: -96, over: false }, // LFE muet
      { rms_db: -30, peak_db: -15, over: false },
      { rms_db: -31, peak_db: 0, over: true },
    ],
    channel_names: ['FL', 'FR', 'FC', 'LFE', 'BL', 'BR'],
  });
  flushSync();
}

function trameStereo() {
  handleAudioLevelsEvent({
    zone_id: ZONE, channels: 2,
    rms_left_db: -20, rms_right_db: -21, peak_left_db: -8, peak_right_db: -9,
  });
  flushSync();
}

function monter(props: Record<string, unknown> = {}) {
  monte = mount(AudioVisualizer, { target: hote, props: { playing: true, mode: 'spectrum', ...props } });
  flushSync();
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1));
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
    new Proxy({}, { get: () => () => ({ addColorStop() {} }), set: () => true }) as unknown as CanvasRenderingContext2D,
  );
  currentZoneId.set(ZONE);
  hote = document.createElement('div');
  document.body.append(hote);
});

afterEach(async () => {
  if (monte) await unmount(monte);
  monte = null;
  hote.remove();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('#4969 — une barre par canal en multicanal', () => {
  it('🔴 une trame 5.1 affiche six barres nommées, LFE muet, BR en surcharge', () => {
    monter();
    trame51();
    const groupe = hote.querySelector('[data-testid="barres-par-canal"]');
    expect(groupe, 'aucune barre par canal affichée pour une trame 5.1').not.toBeNull();
    const canaux = [...groupe!.querySelectorAll('[data-canal]')];
    expect(canaux.map((c) => c.getAttribute('data-canal'))).toEqual(['FL', 'FR', 'FC', 'LFE', 'BL', 'BR']);
    expect(canaux[3].classList.contains('muet')).toBe(true);
    expect(canaux[2].classList.contains('muet')).toBe(false);
    expect(canaux[5].classList.contains('over')).toBe(true);
    // Le spectre est remplacé, pas superposé.
    expect(hote.querySelector('canvas')!.classList.contains('masque')).toBe(true);
  });

  it('en stéréo, aucune barre : le spectre reste affiché', () => {
    monter();
    trameStereo();
    expect(hote.querySelector('[data-testid="barres-par-canal"]')).toBeNull();
    expect(hote.querySelector('canvas')!.classList.contains('masque')).toBe(false);
  });

  it('les barres s’éteignent quand les trames cessent (#1791)', () => {
    monter();
    trame51();
    expect(hote.querySelector('[data-testid="barres-par-canal"]')).not.toBeNull();
    vi.advanceTimersByTime(FRAICHEUR_TRAME_MS + 1);
    flushSync();
    expect(hote.querySelector('[data-testid="barres-par-canal"]')).toBeNull();
  });

  it('pas de barres dans le mini-analyseur de la barre de transport', () => {
    monter({ mini: true });
    trame51();
    expect(hote.querySelector('[data-testid="barres-par-canal"]')).toBeNull();
  });

  it('sans noms publiés (> 8 canaux), le numéro du canal', () => {
    const b = barresParCanal({
      channel_levels: Array.from({ length: 10 }, () => ({ rms_db: -20, peak_db: -10, over: false })),
      channel_names: null,
    });
    expect(b.map((x) => x.nom)).toEqual(['1', '2', '3', '4', '5', '6', '7', '8', '9', '10']);
    expect(hauteurDb(0)).toBe(1);
    expect(hauteurDb(-96)).toBe(0);
    expect(hauteurDb(-30)).toBeCloseTo(0.5);
  });
});
