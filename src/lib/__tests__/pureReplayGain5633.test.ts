// @vitest-environment jsdom
//
// tune-server-rust#5633 — GgB (fil 1797) : basculer PURE sur une piste de
// bibliothèque faisait monter le niveau « de pas loin de 10 dB ». C'était son
// ReplayGain, que PURE cesse d'appliquer. Décision de Bertrand (05/10) : PURE
// garde le bit-perfect, et le DIT — à la bascule, et dans le chemin du signal,
// avec le gain de la piste en cours quand le serveur le publie.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import { get } from 'svelte/store';

const etat = vi.hoisted(() => ({ pure: false }));

vi.mock('../api', async (importOriginal) => {
  const reel = await importOriginal<typeof import('../api')>();
  return {
    ...reel,
    getAudiophileMode: vi.fn(async () => ({ enabled: etat.pure, lock_volume: null, effective_lock_volume: false })),
    setAudiophileMode: vi.fn(async (_id: number, enabled: boolean) => ({ enabled, applied_live: true, portee: 'immediate' })),
    getDsp: vi.fn(async () => ({})),
    getLevelCompensation: vi.fn(async () => null),
  };
});

import TransportBar from '../../components/partages/TransportBar.svelte';
import NowPlaying from '../../components/partages/NowPlaying.svelte';
import { zones, currentZoneId } from '../stores/zones';
import { notifications } from '../stores/notifications';
import { audiophileEnabled, audiophileLockVolume } from '../stores/audiophile';
import { activeView } from '../stores/navigation';
import { queueTracks } from '../stores/queue';
import { locale } from '../i18n';
import { dictionnaire, ONZE_LANGUES } from './onzeDictionnaires';
import { gainIgnoreParPure, gainReplayGainApplique, replayGainActif } from '../pureReplayGain';

const DELAI = 60_000;
let hote: HTMLDivElement;
let monte: ReturnType<typeof mount> | undefined;

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

const HORS_PURE = {
  bit_perfect: false, lossless: true, pure: false,
  steps: [
    { name: 'Source', description: 'FLAC 44kHz/16bit', bit_perfect: true },
    { name: 'ReplayGain', description: 'ReplayGain (track, -8.5 dB, tags du fichier)', bit_perfect: false, gain_db: -8.5 },
  ],
};
const SOUS_PURE = {
  bit_perfect: true, lossless: true, pure: true,
  steps: [{ name: 'Source', description: 'FLAC 44kHz/16bit', bit_perfect: true }],
  pure_replaygain_ignored: { gain_db: -8.5, granularity: 'track' },
};

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
const annonces = () => get(notifications).map((n) => n.message);

beforeEach(() => {
  locale.set('fr');
  etat.pure = false;
  for (const n of get(notifications)) notifications.dismiss(n.id);
  audiophileEnabled.set(false);
  audiophileLockVolume.set(false);
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
  zones.set([]);
  currentZoneId.set(null);
  for (const n of get(notifications)) notifications.dismiss(n.id);
  vi.unstubAllGlobals();
});

describe('#5633 — ce que le chemin du signal publie', () => {
  it('hors PURE : l’étape ReplayGain et son gain ; sous PURE : le gain ignoré', () => {
    expect(replayGainActif(HORS_PURE as never)).toBe(true);
    expect(gainReplayGainApplique(HORS_PURE as never)).toBe(-8.5);
    expect(gainIgnoreParPure(HORS_PURE as never)).toBeNull();
    expect(gainIgnoreParPure(SOUS_PURE as never)).toBe(-8.5);
    // Un serveur d'avant : l'étape sans `gain_db`, rien sous PURE.
    const ancien = { ...HORS_PURE, steps: HORS_PURE.steps.map(({ gain_db: _g, ...s }: any) => s) };
    expect(replayGainActif(ancien as never)).toBe(true);
    expect(gainReplayGainApplique(ancien as never)).toBeNull();
    expect(gainIgnoreParPure({ ...SOUS_PURE, pure_replaygain_ignored: undefined } as never)).toBeNull();
  });
});

describe('#5633 — à la bascule PURE', () => {
  it('🔴 la piste a un ReplayGain : Tune prévient qu’il est ignoré, avec son gain', { timeout: DELAI }, async () => {
    zoneEnLecture(HORS_PURE);
    monte = mount(TransportBar, { target: hote });
    await attendre();
    hote.querySelector<HTMLButtonElement>('.audiophile-btn')!.click();
    await attendre();
    expect(get(audiophileEnabled), 'la bascule n’a pas eu lieu — témoin sans objet').toBe(true);
    const msg = annonces().find((m) => m.includes('ReplayGain'));
    expect(msg, 'PURE a ignoré le ReplayGain sans le dire — #5633').toBeTruthy();
    expect(msg).toContain('-8.5 dB');
  });

  it('serveur d’avant (pas de `gain_db`) : on prévient sans chiffre', { timeout: DELAI }, async () => {
    zoneEnLecture({ ...HORS_PURE, steps: HORS_PURE.steps.map(({ gain_db: _g, ...s }: any) => s) });
    monte = mount(TransportBar, { target: hote });
    await attendre();
    hote.querySelector<HTMLButtonElement>('.audiophile-btn')!.click();
    await attendre();
    const msg = annonces().find((m) => m.includes('ReplayGain'));
    expect(msg).toBe(dictionnaire('fr')['audiophile.rgIgnored']);
  });

  it('aucun ReplayGain sur la piste : rien à dire', { timeout: DELAI }, async () => {
    zoneEnLecture({ ...HORS_PURE, steps: [HORS_PURE.steps[0]] });
    monte = mount(TransportBar, { target: hote });
    await attendre();
    hote.querySelector<HTMLButtonElement>('.audiophile-btn')!.click();
    await attendre();
    expect(annonces().some((m) => m.includes('ReplayGain'))).toBe(false);
  });
});

describe('#5633 — dans le chemin du signal', () => {
  it('🔴 Lecture en cours, sous PURE : « ReplayGain ignoré », avec le gain de la piste', { timeout: DELAI }, async () => {
    audiophileEnabled.set(true);
    zoneEnLecture(SOUS_PURE);
    monte = mount(NowPlaying, { target: hote, props: {} as any });
    await attendre();
    const ligne = hote.querySelector('.sp-pure-rg');
    expect(ligne, 'le chemin du signal tait le ReplayGain ignoré — #5633').not.toBeNull();
    expect(ligne!.textContent).toContain('-8.5 dB');
  });
});

describe('#5633 — le panneau « Chemin du signal » de la barre de lecture', () => {
  it('🔴 sous PURE, le panneau dit que le ReplayGain est ignoré, avec le gain', { timeout: DELAI }, async () => {
    etat.pure = true;
    audiophileEnabled.set(true);
    zoneEnLecture(SOUS_PURE);
    monte = mount(TransportBar, { target: hote });
    await attendre();
    hote.querySelector<HTMLButtonElement>('.signal-led')!.click();
    await attendre();
    const ligne = hote.querySelector('.sp-card .sp-pure-rg');
    expect(ligne, 'le panneau tait le ReplayGain ignoré — #5633').not.toBeNull();
    expect(ligne!.textContent).toContain('-8.5 dB');
  });
  it('sans gain publié, le panneau le dit quand même, sans chiffre', { timeout: DELAI }, async () => {
    etat.pure = true;
    audiophileEnabled.set(true);
    zoneEnLecture({ ...SOUS_PURE, pure_replaygain_ignored: undefined });
    monte = mount(TransportBar, { target: hote });
    await attendre();
    hote.querySelector<HTMLButtonElement>('.signal-led')!.click();
    await attendre();
    expect(hote.querySelector('.sp-card .sp-pure-rg')?.textContent).toBe(dictionnaire('fr')['signal.pureRgIgnored']);
  });
});

describe('#5633 — libellés dans les onze langues', () => {
  it.each(ONZE_LANGUES)('%s', (code) => {
    const d = dictionnaire(code);
    for (const cle of ['audiophile.rgIgnored', 'audiophile.rgIgnoredDb', 'signal.pureRgIgnored', 'signal.pureRgIgnoredDb']) {
      expect(d[cle], `${code} : ${cle}`).toBeTruthy();
    }
    expect(d['audiophile.rgIgnoredDb']).toContain('{db}');
    expect(d['signal.pureRgIgnoredDb']).toContain('{db}');
  });
});
