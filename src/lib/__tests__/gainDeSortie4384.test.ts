// @vitest-environment jsdom
//
// tune-server-rust#4384 — « preamp +6 dB, pas de changement » (fil 1797).
// Sur une sortie locale, volume × ReplayGain × préampli sont composés puis
// RABOTÉS à l'unité : à volume plein, +6 dB de préampli ne produisent rien.
// Décision de Bertrand (06/10) : afficher le gain réellement appliqué en
// sortie, et le rabot quand il mord. Plus deux cas voisins : piste sans gain
// ReplayGain (préampli non appliqué) et rendu réseau (gain cuit dans le flux).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import { get } from 'svelte/store';

vi.mock('../api', async (importOriginal) => {
  const reel = await importOriginal<typeof import('../api')>();
  return {
    ...reel,
    getAudiophileMode: vi.fn(async () => ({ enabled: false, lock_volume: null, effective_lock_volume: false })),
    getDsp: vi.fn(async () => ({})),
    getLevelCompensation: vi.fn(async () => null),
  };
});

import TransportBar from '../../components/partages/TransportBar.svelte';
import NowPlaying from '../../components/partages/NowPlaying.svelte';
import { zones, currentZoneId } from '../stores/zones';
import { handleAudioLevelsEvent } from '../stores/audioLevels';
import { activeView } from '../stores/navigation';
import { queueTracks } from '../stores/queue';
import { locale } from '../i18n';
import { dictionnaire, ONZE_LANGUES } from './onzeDictionnaires';
import { gainDeSortieCourant, lireGainDeSortie } from '../gainDeSortie';

const DELAI = 60_000;
let hote: HTMLDivElement;
let monte: ReturnType<typeof mount> | undefined;
const fr = dictionnaire('fr');

function reponse(url: string): Response {
  let corps: unknown = /\/(zones|profiles|devices|playlists|shortcuts|search)(\?|$)/.test(url) ? [] : {};
  if (/\/queue/.test(url)) corps = { tracks: [], position: 0, length: 0 };
  if (/\/(credits|history|favorites|plays)/.test(url)) corps = [];
  return {
    ok: true, status: 200, statusText: 'OK',
    headers: new Map([['content-type', 'application/json']]),
    json: async () => corps, text: async () => JSON.stringify(corps),
  } as unknown as Response;
}
async function attendre(tours = 6) {
  for (let i = 0; i < tours; i++) { await new Promise((r) => setTimeout(r, 0)); flushSync(); }
}

const SOURCE = { name: 'Source', description: 'FLAC 44kHz/16bit', bit_perfect: true };
const LOCAL_RG = {
  bit_perfect: false, lossless: true, pure: false,
  steps: [SOURCE, { name: 'ReplayGain', description: 'ReplayGain (track, +6.0 dB)', bit_perfect: false, gain_db: 6, applied_in: 'local_output' }],
};
const RESEAU_RG = {
  ...LOCAL_RG,
  steps: [SOURCE, { name: 'ReplayGain', description: 'ReplayGain (track, -4.0 dB)', bit_perfect: false, gain_db: -4, applied_in: 'stream' }],
};
const SANS_TAG = { bit_perfect: true, lossless: true, pure: false, steps: [SOURCE], replaygain_untagged: { mode: 'track', preamp_db: 6 } };

function zoneEnLecture(signal_path: unknown) {
  zones.set([{
    id: 1, name: 'Salon', state: 'playing', online: true, volume: 1,
    output_type: 'local', output_device_id: 'local:dac-1', position_ms: 1000,
    current_track: { track_id: 77, title: 'Porcelain', artist_name: 'Moby', source: 'local', duration_ms: 241000,
      format: 'flac', sample_rate: 44100, bit_depth: 16 },
    signal_path,
  }] as never);
  currentZoneId.set(1);
}
/** Une trame `playback.audio_levels` telle que le serveur la publie. */
function trame(champs: Record<string, unknown>) {
  handleAudioLevelsEvent({ zone_id: 1, rms_left_db: -20, rms_right_db: -20, peak_left_db: -6, peak_right_db: -6, ...champs });
}

beforeEach(() => {
  locale.set('fr');
  queueTracks.set([]);
  activeView.set('nowplaying');
  vi.stubGlobal('fetch', vi.fn(async (entree: unknown) =>
    reponse(String(typeof entree === 'string' ? entree : (entree as Request)?.url ?? entree))));
  vi.stubGlobal('WebSocket', class { close() {} addEventListener() {} removeEventListener() {} send() {} } as any);
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} } as any);
  hote = document.createElement('div');
  document.body.append(hote);
});
afterEach(async () => {
  if (monte) await unmount(monte);
  monte = undefined;
  hote.remove();
  // Une trame « ancien serveur » efface ce que le banc précédent a publié.
  trame({});
  zones.set([]);
  currentZoneId.set(null);
  vi.unstubAllGlobals();
});

describe('#4384 — lecture des champs publiés', () => {
  it('sortie locale : gain appliqué, gain demandé, rabot', () => {
    expect(lireGainDeSortie({ output_gain_db: 0, output_gain_requested_db: 6.02, output_gain_limited: true }))
      .toEqual({ appliqueDb: 0, demandeDb: 6.02, limite: true });
  });
  it('serveur d’avant, ou rendu réseau : rien (output_gain_db seul ne suffit pas)', () => {
    expect(lireGainDeSortie({ output_gain_db: 0, output_gain_requested_db: null, output_gain_limited: null })).toBeNull();
    expect(lireGainDeSortie(undefined)).toBeNull();
  });
  it('le magasin ne change que quand l’affichage change', () => {
    currentZoneId.set(1);
    const vus: unknown[] = [];
    const stop = gainDeSortieCourant.subscribe((g) => vus.push(g));
    trame({ output_gain_db: 0, output_gain_requested_db: 6.02, output_gain_limited: true });
    trame({ output_gain_db: 0, output_gain_requested_db: 6.021, output_gain_limited: true });
    trame({ output_gain_db: -6.02, output_gain_requested_db: -6.02, output_gain_limited: false });
    stop();
    expect(vus).toHaveLength(3);
    expect(get(gainDeSortieCourant)).toEqual({ appliqueDb: -6.02, demandeDb: -6.02, limite: false });
  });
});

describe('#4384 — Lecture en cours', () => {
  it('🔴 +6 dB à volume plein : « Gain demandé +6.0 dB, limité à 0 dB »', { timeout: DELAI }, async () => {
    zoneEnLecture(LOCAL_RG);
    monte = mount(NowPlaying, { target: hote, props: {} as any });
    trame({ output_gain_db: 0, output_gain_requested_db: 6.02, output_gain_limited: true });
    await attendre();
    const ligne = hote.querySelector('.sp-gain-rabot');
    expect(ligne, 'le rabot à l’unité reste muet — #4384').not.toBeNull();
    expect(ligne!.textContent).toBe(fr['signal.outputGainLimited'].replace('{db}', '+6.0'));
    expect(ligne!.textContent).toBe('Gain demandé +6.0 dB, limité à 0 dB pour éviter l\'écrêtage');
  });
  it('pas de rabot, ou serveur d’avant : aucune ligne', { timeout: DELAI }, async () => {
    zoneEnLecture(LOCAL_RG);
    monte = mount(NowPlaying, { target: hote, props: {} as any });
    trame({ output_gain_db: -6.02, output_gain_requested_db: -6.02, output_gain_limited: false });
    await attendre();
    expect(hote.querySelector('.sp-gain-rabot')).toBeNull();
    trame({ output_gain_db: 0 });
    await attendre();
    expect(hote.querySelector('.sp-gain-rabot')).toBeNull();
  });
});

describe('#4384 — panneau « Chemin du signal » de la barre de lecture', () => {
  async function ouvrir(signal_path: unknown, champs: Record<string, unknown>) {
    zoneEnLecture(signal_path);
    monte = mount(TransportBar, { target: hote });
    trame(champs);
    await attendre();
    hote.querySelector<HTMLButtonElement>('.signal-led')!.click();
    await attendre();
  }
  it('🔴 sortie locale : le gain appliqué et le rabot', { timeout: DELAI }, async () => {
    await ouvrir(LOCAL_RG, { output_gain_db: 0, output_gain_requested_db: 6.02, output_gain_limited: true });
    expect(hote.querySelector('.sp-card .gds-applique')?.textContent, 'gain appliqué tu — #4384')
      .toBe('Gain appliqué en sortie : 0.0 dB');
    expect(hote.querySelector('.sp-card .gds-rabot')?.textContent)
      .toBe('Gain demandé +6.0 dB, limité à 0 dB pour éviter l\'écrêtage');
  });
  it('sortie locale atténuée : le gain appliqué, sans rabot', { timeout: DELAI }, async () => {
    await ouvrir(LOCAL_RG, { output_gain_db: -9.04, output_gain_requested_db: -9.04, output_gain_limited: false });
    expect(hote.querySelector('.sp-card .gds-applique')?.textContent).toBe('Gain appliqué en sortie : -9.0 dB');
    expect(hote.querySelector('.sp-card .gds-rabot')).toBeNull();
  });
  it('🔴 ReplayGain sans gain tagué : préampli non appliqué', { timeout: DELAI }, async () => {
    await ouvrir(SANS_TAG, { output_gain_db: 0 });
    expect(hote.querySelector('.sp-card .gds-sans-tag')?.textContent, 'préampli ignoré sans un mot — #4384')
      .toBe('Aucun gain ReplayGain pour cette piste, préampli non appliqué');
  });
  it('sans préampli, la phrase courte', { timeout: DELAI }, async () => {
    await ouvrir({ ...SANS_TAG, replaygain_untagged: { mode: 'track', preamp_db: 0 } }, {});
    expect(hote.querySelector('.sp-card .gds-sans-tag')?.textContent).toBe(fr['signal.rgUntagged']);
  });
  it('rendu réseau : le gain est cuit dans le flux', { timeout: DELAI }, async () => {
    await ouvrir(RESEAU_RG, { output_gain_db: 0 });
    expect(hote.querySelector('.sp-card .gds-flux')?.textContent).toBe(fr['signal.rgInStream']);
    expect(hote.querySelector('.sp-card .gds-applique'), 'aucun gain de sortie local à dire').toBeNull();
  });
  it('serveur d’avant : rien de neuf', { timeout: DELAI }, async () => {
    const ancien = { ...LOCAL_RG, steps: LOCAL_RG.steps.map(({ applied_in: _a, ...s }: any) => s) };
    await ouvrir(ancien, { output_gain_db: 0 });
    expect(hote.querySelector('.sp-card'), 'le panneau ne s’est pas ouvert — témoin sans objet').not.toBeNull();
    expect(hote.querySelector('.sp-card .gds')).toBeNull();
  });
});

describe('#4384 — libellés dans les onze langues', () => {
  it.each(ONZE_LANGUES)('%s', (code) => {
    const d = dictionnaire(code);
    for (const cle of ['signal.outputGainApplied', 'signal.outputGainLimited', 'signal.rgUntagged', 'signal.rgUntaggedPreamp', 'signal.rgInStream']) {
      expect(d[cle], `${code} : ${cle}`).toBeTruthy();
    }
    expect(d['signal.outputGainApplied']).toContain('{db}');
    expect(d['signal.outputGainLimited']).toContain('{db}');
    expect(d['signal.outputGainLimited']).toContain('0 dB');
  });
});
