// @vitest-environment jsdom
//
// tune-server-rust#7932 — « PURE actif mais creux » (Didier, fil forum 2386,
// rc9 puis rc11) : l'icône PURE se vide 1 à 2 s après le début de la lecture
// en WASAPI exclusif (Marantz AV 7706) et en ASIO (SMSL SU-8), et reste pleine
// en WASAPI partagé, sans aucun réglage armé sur ces zones.
//
// Cause : seules les sorties exclusives (WASAPI exclusif, ASIO, ALSA natif)
// publient le contrat de signal d'exécution ; sans traitement armé, il porte
// l'étape DSP « PURE actif : aucun traitement armé, rien à contourner »
// (#4176), et la pastille vidait alors son bouclier. En WASAPI partagé, rien
// n'est publié : bouclier plein. Même chemin, deux icônes selon le pilote.
//
// Contre-épreuve : `TransportBar.svelte` avant ce correctif (`fill` à `none`
// quand le chemin dit « rien à contourner ») fait rougir le premier témoin.
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
import { dictionnaire } from './onzeDictionnaires';
import { DESCRIPTION_PURE_SANS_OBJET } from '../pureSansObjet';

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

/** WASAPI partagé : le serveur ne publie aucune étape DSP d'exécution. */
const PURE_PARTAGE = { bit_perfect: true, lossless: true, pure: true, steps: [SOURCE, WASAPI] };

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

describe('tune-server-rust#7932 — bouclier PURE plein quel que soit le pilote', () => {
  it('🔴 sortie exclusive (étape « rien à contourner » publiée) : bouclier plein', { timeout: DELAI }, async () => {
    zoneEnLecture(PURE_SANS_OBJET);
    audiophileEnabled.set(true);
    monte = mount(TransportBar, { target: hote, props: {} as any });
    await attendre();
    audiophileEnabled.set(true);
    await attendre();
    const b = pastille();
    expect(b, 'pastille PURE absente').not.toBeNull();
    expect(b!.querySelector('svg')!.getAttribute('fill'), 'bouclier vidé en sortie exclusive — #7932').toBe('currentColor');
    // L'information de #4176 reste dite, par l'info-bulle.
    expect(b!.getAttribute('title')).toBe(fr['audiophile.pureNothingToBypass']);
  });

  it('WASAPI partagé (aucune étape d\'exécution publiée) : bouclier plein, le même', { timeout: DELAI }, async () => {
    zoneEnLecture(PURE_PARTAGE);
    audiophileEnabled.set(true);
    monte = mount(TransportBar, { target: hote, props: {} as any });
    await attendre();
    audiophileEnabled.set(true);
    await attendre();
    const b = pastille()!;
    expect(b.querySelector('svg')!.getAttribute('fill')).toBe('currentColor');
  });

  it('PURE éteint : bouclier creux, comme avant', { timeout: DELAI }, async () => {
    zoneEnLecture(PURE_PARTAGE);
    audiophileEnabled.set(false);
    monte = mount(TransportBar, { target: hote, props: {} as any });
    await attendre();
    audiophileEnabled.set(false);
    await attendre();
    const b = pastille()!;
    expect(b.querySelector('svg')!.getAttribute('fill')).toBe('none');
  });
});
