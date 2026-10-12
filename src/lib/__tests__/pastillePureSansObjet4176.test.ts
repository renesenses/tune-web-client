// @vitest-environment jsdom
//
// tune-server-rust#4176 — « Le fait de basculer sur Pure ne fait rien »
// (Jean Valjean, fil 1798, Windows WASAPI exclusif). Sans traitement armé,
// PURE n'a rien à contourner : depuis la rc4 (PR serveur #6022), le chemin du
// signal publie l'étape DSP « PURE actif : aucun traitement armé, rien à
// contourner ». La pastille PURE de la barre de lecture doit le lire : bouclier
// creux et info-bulle qui le dit, au lieu de s'allumer comme si elle
// changeait le son.
//
// Contre-épreuve : `TransportBar.svelte` à sa base (pastille pleine,
// info-bulle « Mode audiophile actif » quoi que dise le chemin) fait rougir le
// premier témoin.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';

vi.mock('../api', async (importOriginal) => {
  const reel = await importOriginal<typeof import('../api')>();
  return {
    ...reel,
    getAudiophileMode: vi.fn(async () => ({ enabled: true, lock_volume: null, effective_lock_volume: false })),
    getDsp: vi.fn(async () => ({})),
    getLevelCompensation: vi.fn(async () => null),
  };
});

import TransportBar from '../../components/partages/TransportBar.svelte';
import { zones, currentZoneId } from '../stores/zones';
import { audiophileEnabled } from '../stores/audiophile';
import { queueTracks } from '../stores/queue';
import { locale } from '../i18n';
import { dictionnaire, ONZE_LANGUES } from './onzeDictionnaires';
import { DESCRIPTION_PURE_SANS_OBJET, pureSansObjet } from '../pureSansObjet';

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
async function attendre(tours = 8) {
  for (let i = 0; i < tours; i++) { await new Promise((r) => setTimeout(r, 0)); flushSync(); }
}

const SOURCE = { name: 'Source', description: 'FLAC 44kHz/16bit', bit_perfect: true };
const WASAPI = { name: 'Transport', description: 'WASAPI', bit_perfect: true };
/** Ce que publie le serveur rc4 : PURE allumé, rien à contourner. */
const PURE_SANS_OBJET = {
  bit_perfect: true, lossless: true, pure: true,
  steps: [SOURCE, { name: 'DSP', description: DESCRIPTION_PURE_SANS_OBJET, bit_perfect: true }, WASAPI],
};
/** PURE allumé, un égaliseur armé et contourné : PURE agit. */
const PURE_CONTOURNE = {
  bit_perfect: true, lossless: true, pure: true,
  steps: [SOURCE, { name: 'DSP', description: 'DSP contourné par PURE', bit_perfect: true }, WASAPI],
};

function zoneEnLecture(signal_path: unknown) {
  zones.set([{
    id: 3, name: 'Haut-parleurs', state: 'playing', online: true, volume: 1,
    output_type: 'local', output_device_id: 'local:Haut-parleurs', position_ms: 1000,
    current_track: { track_id: 7, title: 'The Third Mind', artist_name: 'X', source: 'local', duration_ms: 241000,
      format: 'flac', sample_rate: 44100, bit_depth: 16 },
    signal_path,
  }] as never);
  currentZoneId.set(3);
}
const pastille = () => hote.querySelector('button.signal-shield-btn') as HTMLButtonElement | null;

beforeEach(() => {
  locale.set('fr');
  queueTracks.set([]);
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
  audiophileEnabled.set(false);
  vi.unstubAllGlobals();
});

describe('tune-server-rust#4176 — la pastille PURE dit quand il n\'y a rien à contourner', () => {
  it('🔴 PURE allumé, rien à contourner : bouclier creux et info-bulle qui le dit', { timeout: DELAI }, async () => {
    zoneEnLecture(PURE_SANS_OBJET);
    audiophileEnabled.set(true);
    monte = mount(TransportBar, { target: hote, props: {} as any });
    await attendre();
    audiophileEnabled.set(true);
    await attendre();
    const b = pastille();
    expect(b, 'pastille PURE absente').not.toBeNull();
    expect(b!.classList.contains('sans-objet'), 'la pastille ne dit pas « rien à contourner » — #4176').toBe(true);
    expect(b!.getAttribute('title')).toBe(fr['audiophile.pureNothingToBypass']);
    expect(b!.querySelector('svg')!.getAttribute('fill')).toBe('none');
  });

  it('PURE allumé qui contourne un égaliseur : pastille pleine, comme avant', { timeout: DELAI }, async () => {
    zoneEnLecture(PURE_CONTOURNE);
    audiophileEnabled.set(true);
    monte = mount(TransportBar, { target: hote, props: {} as any });
    await attendre();
    audiophileEnabled.set(true);
    await attendre();
    const b = pastille()!;
    expect(b.classList.contains('sans-objet')).toBe(false);
    expect(b.getAttribute('title')).toBe(fr['audiophile.enabled']);
    expect(b.querySelector('svg')!.getAttribute('fill')).toBe('currentColor');
  });

  it('la règle pure : seule l\'étape DSP « rien à contourner » compte', () => {
    expect(pureSansObjet(PURE_SANS_OBJET)).toBe(true);
    expect(pureSansObjet(PURE_CONTOURNE)).toBe(false);
    expect(pureSansObjet({ steps: [SOURCE, WASAPI] })).toBe(false);
    expect(pureSansObjet(null)).toBe(false);
  });

  it('le libellé existe dans les onze langues', () => {
    for (const l of ONZE_LANGUES) {
      const v = dictionnaire(l)['audiophile.pureNothingToBypass'];
      expect(v, `manque en ${l}`).toBeTruthy();
      expect(v).toContain('PURE');
    }
  });
});
