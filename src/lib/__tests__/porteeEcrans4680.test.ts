// @vitest-environment jsdom
//
// tune-server-rust#4680 — recette v0.9.161, Eversolo DMP-A8 en DLNA : basculer
// PURE (ou le crossfeed) affichait « Prendra effet à la piste suivante » alors
// que l'effet s'entend aussitôt. Sur une zone réseau le serveur relance le flux
// à la position courante ; il répondait `applied_live: false`, que les écrans
// lisaient « piste suivante ». Depuis la PR serveur #5338, il dit QUAND :
// `portee` (bascule PURE) et `crossfeed_portee` (PUT /zones/{id}/dsp).
//
// Le témoin MONTE les trois écrans qui annoncent la piste suivante, fait le
// geste de l'utilisateur, et regarde ce que l'écran DIT :
//   - `restart`    → rien à annoncer (le défaut de la recette) ;
//   - `next_track` → l'annonce reste (sinon on aurait juste tout tu) ;
//   - pas de portée (serveur antérieur) → `applied_live: false` l'annonce encore.
//
// CONTRE-ÉPREUVE : sur origin/main (a143fe0d), les trois témoins `restart`
// rougissent — l'écran annonce « Prendra effet à la piste suivante ».
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import { get } from 'svelte/store';

const reseau = vi.hoisted(() => ({
  audiophile: {} as Record<string, unknown>,
  dsp: {} as Record<string, unknown>,
}));

vi.mock('../api', async (importOriginal) => {
  const reel = await importOriginal<typeof import('../api')>();
  // Seuls les appels du réglage sont remplacés : le reste du module reste le
  // vrai, servi par le `fetch` bouchonné plus bas.
  return {
    ...reel,
    getAudiophileMode: vi.fn(async () => ({ enabled: false, lock_volume: null, effective_lock_volume: false })),
    setAudiophileMode: vi.fn(async (_id: number, enabled: boolean) => ({ enabled, ...reseau.audiophile })),
    getDsp: vi.fn(async () => ({ crossfeed: { enabled: false, amount: 0.3, delay_ms: 0.3 } })),
    setDsp: vi.fn(async (_id: number, corps: any) => ({ crossfeed: corps.crossfeed, ...reseau.dsp })),
    listCrossfeedPresets: vi.fn(async () => []),
    getLevelCompensation: vi.fn(async () => null),
  };
});

import TransportBar from '../../components/partages/TransportBar.svelte';
import CrossfeedV2 from '../../components/v2/CrossfeedV2.svelte';
import NowPlaying from '../../components/partages/NowPlaying.svelte';
import { zones, currentZoneId } from '../stores/zones';
import { notifications } from '../stores/notifications';
import { audiophileEnabled, audiophileLockVolume } from '../stores/audiophile';
import { activeView } from '../stores/navigation';
import { queueTracks } from '../stores/queue';
import { locale } from '../i18n';
import { fr } from './onzeDictionnaires';

/** Premier montage : la transformation Svelte se paie à froid. */
const DELAI = 60_000;
const PISTE_SUIVANTE = fr['eq.effectNextTrack'];

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
  for (let i = 0; i < tours; i++) {
    await new Promise((r) => setTimeout(r, 0));
    flushSync();
  }
}

function zoneEnLecture() {
  zones.set([{
    id: 1, name: 'Salon', state: 'playing', online: true, volume: 0.4,
    output_type: 'local', output_device_id: 'local:dac-1', position_ms: 1000,
    current_track: { track_id: 77, title: 'Video Games', artist_name: 'Lana Del Rey', source: 'local', duration_ms: 281000 },
    signal_path: { bit_perfect: true, lossless: true, steps: [{ name: 'Source', description: 'FLAC', bit_perfect: true }] },
  }] as never);
  currentZoneId.set(1);
}

const annonces = () => get(notifications).map((n) => n.message);

beforeEach(() => {
  locale.set('fr');
  reseau.audiophile = {};
  reseau.dsp = {};
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
  zoneEnLecture();
});

afterEach(async () => {
  if (monte) await unmount(monte);
  monte = undefined;
  hote.remove();
  zones.set([]);
  currentZoneId.set(null);
  queueTracks.set([]);
  for (const n of get(notifications)) notifications.dismiss(n.id);
  vi.unstubAllGlobals();
});

// Les trois cas, pour les trois écrans. `annonce` = l'écran doit dire
// « Prendra effet à la piste suivante ».
const CAS = [
  { nom: 'restart (zone réseau relancée) : rien à annoncer', applied_live: false, portee: 'restart', annonce: false },
  { nom: 'next_track : l’annonce reste', applied_live: false, portee: 'next_track', annonce: true },
  { nom: 'serveur antérieur, sans portée : `applied_live: false` l’annonce', applied_live: false, portee: undefined, annonce: true },
] as const;

describe('#4680 — TransportBar, bascule PURE', () => {
  for (const c of CAS) {
    it(c.nom, { timeout: DELAI }, async () => {
      reseau.audiophile = { applied_live: c.applied_live, ...(c.portee ? { portee: c.portee } : {}) };
      monte = mount(TransportBar, { target: hote });
      await attendre();
      const bouton = hote.querySelector<HTMLButtonElement>('.audiophile-btn');
      expect(bouton, 'bouton PURE absent — témoin sans objet').not.toBeNull();
      bouton!.click();
      await attendre();
      expect(get(audiophileEnabled), 'la bascule n’a pas eu lieu — témoin sans objet').toBe(true);
      expect(annonces().includes(PISTE_SUIVANTE)).toBe(c.annonce);
    });
  }
});

describe('#4680 — CrossfeedV2', () => {
  for (const c of CAS) {
    it(c.nom, { timeout: DELAI }, async () => {
      reseau.dsp = { crossfeed_applied_live: c.applied_live, ...(c.portee ? { crossfeed_portee: c.portee } : {}) };
      monte = mount(CrossfeedV2, { target: hote, props: {} });
      await attendre();
      const inter = hote.querySelector<HTMLInputElement>('.sw input[type=checkbox]');
      expect(inter, 'interrupteur absent — témoin sans objet').not.toBeNull();
      expect(inter!.disabled, 'crossfeed verrouillé — témoin sans objet').toBe(false);
      inter!.click();
      await attendre();
      expect(annonces().includes(PISTE_SUIVANTE)).toBe(c.annonce);
    });
  }
});

describe('#4680 — NowPlaying, panneau crossfeed', () => {
  for (const c of CAS) {
    it(c.nom, { timeout: DELAI }, async () => {
      reseau.dsp = { crossfeed_applied_live: c.applied_live, ...(c.portee ? { crossfeed_portee: c.portee } : {}) };
      monte = mount(NowPlaying, { target: hote, props: {} as any });
      await attendre();
      const ouvrir = [...hote.querySelectorAll<HTMLButtonElement>('button.np-credits-btn')]
        .find((b) => (b.textContent ?? '').trim() === fr['dsp.crossfeedTitle']);
      expect(ouvrir, 'bouton Crossfeed absent — témoin sans objet').toBeDefined();
      ouvrir!.click();
      await attendre();
      const inter = hote.querySelector<HTMLInputElement>('.np-crossfeed .cf-bascule input[type=checkbox]');
      expect(inter, 'panneau crossfeed non ouvert — témoin sans objet').not.toBeNull();
      inter!.click();
      await attendre();
      const notes = [...hote.querySelectorAll('.np-crossfeed .cf-note-alerte')].map((n) => (n.textContent ?? '').trim());
      expect(notes.includes(PISTE_SUIVANTE)).toBe(c.annonce);
    });
  }
});
