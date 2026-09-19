// @vitest-environment jsdom
//
// renesenses/tune-server-rust#3973 — option 3 de Bertrand, côté client web.
//
// En mode PURE, quand la fréquence dépasse ce que le périphérique accepte,
// Tune rééchantillonnait EN SILENCE. Désormais :
//   1. par défaut il joue ET le dit : « PURE dégradé — 192 → 96 kHz, pas
//      bit-perfect » dans le chemin du signal ;
//   2. « Bit-perfect strict » activé sur la zone ⇒ il REFUSE, et le refus doit
//      se lire dans la langue de l'interface, pas en français brut.
//
// Ce fichier garde les deux chemins du refus (HTTP 422 synchrone, WebSocket
// `zone.playback_error` asynchrone) et l'affichage du chemin du signal.
// L'interrupteur de zone est gardé à part (`bitperfectStrictReglage3973`) : il
// monte un autre écran, avec une couche d'API simulée.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import { get } from 'svelte/store';
import * as api from '../api';
import { locale } from '../i18n';
import { notifications } from '../stores/notifications';
import { signalerErreurServeur } from '../echecLecture';
import NowPlaying from '../../components/partages/NowPlaying.svelte';
import { zones, currentZoneId } from '../stores/zones';

/** Le refus exact du contrat serveur (#3973). */
const REFUS_HTTP = {
  error: 'bitperfect_strict_refused',
  message: 'Bit-perfect strict : lecture refusée (phrase du serveur)',
  requested_hz: 192000,
  device_hz: 96000,
};

const PHRASE_FR_192_96 =
  'Bit-perfect strict : lecture refusée — la sortie ne lit pas le 192 kHz sans conversion (elle tourne à 96 kHz). ' +
  'Désactivez « Bit-perfect strict » dans les réglages de la zone pour jouer avec conversion.';

function derniereNotification(): string | undefined {
  const l = get(notifications);
  return l[l.length - 1]?.message;
}

function viderNotifications() {
  for (const n of get(notifications)) notifications.dismiss(n.id);
}

beforeEach(() => {
  viderNotifications();
  locale.set('fr');
});

afterEach(() => {
  vi.unstubAllGlobals();
  locale.set('fr');
});

describe('#3973 — refus synchrone : 422 `bitperfect_strict_refused` du POST de lecture', () => {
  function stubRefus() {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(REFUS_HTTP), {
      status: 422, statusText: 'Unprocessable Entity', headers: { 'Content-Type': 'application/json' },
    })));
  }

  it('pose la phrase LOCALISÉE construite depuis les fréquences, et le dit à l’appelant', async () => {
    stubRefus();
    const err: any = await api.play(7, { track_id: 1 }).catch((e) => e);
    expect(err).toBeInstanceOf(Error);
    expect(derniereNotification()).toBe(PHRASE_FR_192_96);
    // L'écran v2 qui pose son propre bandeau ne doit pas en empiler un second.
    expect(err.dejaAnnonce).toBe(true);
    // Et le message de l'erreur est la même phrase : un bandeau d'écran qui
    // l'accole à son préfixe dit la même chose que le toast.
    expect(err.message).toBe(PHRASE_FR_192_96);
  });

  it('suit la langue de l’interface (anglais)', async () => {
    locale.set('en');
    stubRefus();
    await api.play(7, { track_id: 1 }).catch(() => {});
    const m = derniereNotification() ?? '';
    expect(m).toContain('192 kHz');
    expect(m).toContain('96 kHz');
    expect(m).toContain('Bit-perfect strict');
    expect(m).not.toContain('lecture refusée');
  });
});

describe('#3973 — refus asynchrone : `zone.playback_error` avec `code`', () => {
  const evenement = (over: Record<string, unknown> = {}) => ({
    zone_id: 3,
    code: 'bitperfect_strict_refused',
    requested_hz: 192000,
    device_hz: 96000,
    error: 'phrase française du serveur',
    fatal: true,
    ...over,
  });

  it('affiche la phrase localisée, pas le texte brut du serveur', () => {
    signalerErreurServeur(evenement());
    expect(derniereNotification()).toBe(PHRASE_FR_192_96);
  });

  it('en allemand, la phrase est allemande et porte les fréquences', () => {
    locale.set('de');
    signalerErreurServeur(evenement());
    const m = derniereNotification() ?? '';
    expect(m).toContain('192 kHz');
    expect(m).toContain('96 kHz');
    expect(m).not.toBe('phrase française du serveur');
    expect(m).not.toContain('lecture refusée');
  });

  it('fréquences non entières : décimale, à la française (44,1 / 22,05)', () => {
    signalerErreurServeur(evenement({ requested_hz: 44100, device_hz: 22050 }));
    const m = derniereNotification() ?? '';
    expect(m).toContain('le 44,1 kHz');
    expect(m).toContain('à 22,05 kHz');
  });

  it('code inconnu : repli sur le texte du serveur, inchangé', () => {
    signalerErreurServeur(evenement({ code: 'autre_chose', error: 'Sortie indisponible' }));
    expect(derniereNotification()).toBe('Sortie indisponible');
  });
});

describe('#3973 — chemin du signal : la conversion se VOIT', () => {
  let hote: HTMLDivElement | null = null;
  let monte: Record<string, any> | null = null;

  const PISTE = {
    track_id: 1, album_id: 1, artist_id: 1, title: 'Piste', artist_name: 'Artiste',
    album_title: 'Album', source: 'local', duration_ms: 200000,
  };
  const ETAPES = [
    { name: 'Source', description: 'FLAC 192kHz/24bit', bit_perfect: true },
    { name: 'Resampler', description: '192kHz → 96kHz (mesuré)', bit_perfect: false, code: 'rate_conversion' },
  ];

  function poser(signal_path: Record<string, unknown>): HTMLDivElement {
    zones.set([{ id: 1, name: 'Salon', state: 'playing', current_track: PISTE, position_ms: 1000, signal_path }] as any);
    currentZoneId.set(1);
    hote = document.createElement('div');
    document.body.appendChild(hote);
    monte = mount(NowPlaying, { target: hote, props: {} as any });
    flushSync();
    return hote;
  }

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      const corps = /\/(zones|profiles|devices|playlists|shortcuts|search)/.test(String(url)) ? [] : {};
      return new Response(JSON.stringify(corps), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }));
    vi.stubGlobal('WebSocket', class { close() {} addEventListener() {} removeEventListener() {} send() {} } as any);
    vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} } as any);
  });

  afterEach(() => {
    if (monte) unmount(monte);
    monte = null;
    hote?.remove();
    hote = null;
  });

  it('PURE dégradé : « PURE dégradé — 192 → 96 kHz, pas bit-perfect »', { timeout: 60_000 }, () => {
    const h = poser({
      bit_perfect: false, steps: ETAPES, summary: '',
      pure: true, pure_degraded: true, strict_bitperfect: false,
      rate_conversion: { from_hz: 192000, to_hz: 96000 },
    });
    const el = h.querySelector('.sp-conversion');
    expect(el, 'aucune mention de conversion dans le chemin du signal').not.toBeNull();
    expect(el!.textContent?.trim()).toBe('PURE dégradé — 192 → 96 kHz, pas bit-perfect');
  });

  it('conversion hors PURE : « 192 → 96 kHz, pas bit-perfect »', { timeout: 60_000 }, () => {
    const h = poser({
      bit_perfect: false, steps: ETAPES, summary: '',
      pure: false, pure_degraded: false,
      rate_conversion: { from_hz: 192000, to_hz: 96000 },
    });
    expect(h.querySelector('.sp-conversion')?.textContent?.trim()).toBe('192 → 96 kHz, pas bit-perfect');
  });

  it('vieux serveur, sans les champs : rien ne change', { timeout: 60_000 }, () => {
    const h = poser({ bit_perfect: false, steps: ETAPES, summary: '' });
    expect(h.querySelector('.signal-path-pill'), 'témoin sans objet : la pastille n’est pas rendue').not.toBeNull();
    expect(h.querySelector('.sp-conversion')).toBeNull();
  });
});
