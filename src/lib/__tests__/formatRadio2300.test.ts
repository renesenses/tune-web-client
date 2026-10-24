// @vitest-environment jsdom
//
// web#2300 (fil 2376, Tades, rc7) — « pourquoi indiques-tu le format de
// lecture sur les fichiers musicaux mais pas sur les radios ? »
//
// Une station n'a pas de fiche : ce que Tune sait du flux vient de la sonde,
// publiée par le serveur dans l'étape `Source` du chemin du signal (codec et
// fréquence depuis tune-server-rust#4346 ; débit annoncé par `icy-br` depuis
// tune-server-rust#6821). La barre de lecture et Lecture en cours l'affichent
// désormais pour une radio, comme les pastilles d'un fichier.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import TransportBar from '../../components/partages/TransportBar.svelte';
import NowPlaying from '../../components/partages/NowPlaying.svelte';
import { zones, currentZoneId } from '../stores/zones';
import { activeView } from '../stores/navigation';
import { CODE_CODEC_INCONNU, formatDuFluxRadio } from '../formatInconnu';

const DELAI = 60_000;

const RADIO = { id: null, title: 'FIP', artist_name: 'Live Radio', album_title: 'FIP', source: 'radio', source_id: 'https://icecast.example/fip.mp3' };

/** Le chemin du signal tel que le serveur le publie pour une radio sondée. */
function chemin(source: Record<string, unknown>) {
  return {
    bit_perfect: false,
    lossless: false,
    summary: 'MP3 → WAV',
    steps: [{ name: 'Source', bit_perfect: true, ...source }, { name: 'Decoder', description: 'MP3 → PCM', bit_perfect: false }],
  };
}
const SONDEE = chemin({ description: 'MP3 128 kbit/s 44kHz' });
const PAS_SONDEE = { ...chemin({ description: '?', code: CODE_CODEC_INCONNU }), lossless: null };

let hote: HTMLDivElement | null = null;
let monte: Record<string, unknown> | null = null;

function poserLaZone(signal_path: unknown, piste: Record<string, unknown> = RADIO) {
  zones.set([{ id: 1, name: 'Salon', state: 'playing', online: true, volume: 0.4, output_type: 'dlna', current_track: piste, signal_path }] as never);
  currentZoneId.set(1);
}
function poser(composant: any): HTMLDivElement {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(composant, { target: hote, props: {} as any });
  flushSync();
  return hote;
}
const respirer = (ms = 30) => new Promise((r) => setTimeout(r, ms));

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async () => ({
    ok: true, status: 200, statusText: 'OK',
    headers: new Headers({ 'Content-Type': 'application/json' }),
    json: async () => ({}), text: async () => '{}',
  }) as unknown as Response));
  vi.stubGlobal('WebSocket', class { close() {} addEventListener() {} removeEventListener() {} send() {} } as any);
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} } as any);
  activeView.set('nowplaying');
});

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  hote?.remove();
  hote = null;
  vi.unstubAllGlobals();
});

describe('#2300 — ce que le chemin du signal dit d’une radio', () => {
  it('rend la description de l’étape Source', () => {
    expect(formatDuFluxRadio(SONDEE)).toBe('MP3 128 kbit/s 44kHz');
  });
  it('🔴 rien tant que le codec n’est pas connu (station pas encore sondée)', () => {
    expect(formatDuFluxRadio(PAS_SONDEE)).toBeNull();
    expect(formatDuFluxRadio(null)).toBeNull();
    expect(formatDuFluxRadio({ steps: [] })).toBeNull();
    expect(formatDuFluxRadio(chemin({ description: '  ' }))).toBeNull();
  });
});

describe('#2300 — la barre de lecture', () => {
  const badge = (h: HTMLElement) => h.querySelector<HTMLElement>('.mini-badges .tb-quality-badge');

  it('🔴 une radio sondée montre son format', { timeout: DELAI }, async () => {
    poserLaZone(SONDEE);
    const h = poser(TransportBar);
    await respirer();
    flushSync();
    expect(badge(h)?.textContent?.trim()).toBe('MP3 128 kbit/s 44kHz');
  });

  it('une radio pas encore sondée ne montre rien', { timeout: DELAI }, async () => {
    poserLaZone(PAS_SONDEE);
    const h = poser(TransportBar);
    await respirer();
    flushSync();
    expect(badge(h)).toBeNull();
  });
});

describe('#2300 — Lecture en cours', () => {
  const pastilles = (h: HTMLElement) => Array.from(h.querySelectorAll('.track-tech-info .tech-chip')).map((e) => e.textContent?.trim());

  it('🔴 une radio sondée montre son format', { timeout: DELAI }, async () => {
    poserLaZone(SONDEE);
    const h = poser(NowPlaying);
    await respirer(60);
    flushSync();
    expect(pastilles(h)).toEqual(['MP3 128 kbit/s 44kHz']);
  });

  it('une radio pas encore sondée ne montre rien', { timeout: DELAI }, async () => {
    poserLaZone(PAS_SONDEE);
    const h = poser(NowPlaying);
    await respirer(60);
    flushSync();
    expect(pastilles(h)).toEqual([]);
  });
});
