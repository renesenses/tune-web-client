// @vitest-environment jsdom
//
// web#2804 — côté client de tune-server-rust#8154 (PR serveur #8411, lot rc12).
// Spotify refuse le jeton de Tune à librespot tant que l'appareil de Tune n'a
// jamais été choisi dans l'application Spotify. Le serveur répond 409
// `spotify_liaison_connect_requise` avec sa phrase traduite, l'appareil
// (`device_name`), l'état du récepteur (`receiver_active`) et la route qui
// l'allume (`enable_endpoint`). L'écran n'affichait que « Erreur de lecture ».
//
// Corps des réponses copiés de `refus_liaison_spotify`
// (tune-server/src/routes/playback.rs, lot batch/bugs-rc12-20261108).
//
// Contre-épreuve : sans la branche `CODE_LIAISON_SPOTIFY` de `fetchJSON`, les
// tests 🔴 du toast tombent (code inconnu : aucun toast, `dejaAnnonce` absent) ;
// sans l'étape des Réglages, ceux de `SettingsV2` tombent.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';
import * as api from '../api';
import { locale, t } from '../i18n';
import { notifications } from '../stores/notifications';
import { etapeLiaison, lireRefusLiaison, zoneDeLaRoute } from '../spotifyLiaison';
import { ONZE_LANGUES, dictionnaire } from './onzeDictionnaires';

type Appel = { url: string; methode: string; corps: any };
let appels: Appel[];
let reponse: (a: Appel) => { statut: number; corps?: unknown };

const PHRASE = 'Spotify demande une étape unique : dans l’application Spotify (téléphone ou ordinateur, même réseau, même compte), choisissez une fois l’appareil « Tune — Salon ». Tune garde ensuite cette liaison.';
const refus = (extra: Record<string, unknown> = {}) => ({
  error: 'spotify_liaison_connect_requise',
  code: 'spotify_liaison_connect_requise',
  message: PHRASE,
  message_key: 'spotify.playback.linkRequired',
  params: { device: 'Tune — Salon' },
  device_name: 'Tune — Salon',
  receiver_active: true,
  enable_endpoint: '/api/v1/spotify-connect/enable',
  cause: 'librespot : INVALID_CREDENTIALS',
  ...extra,
});

const toutes = () => get(notifications);
const derniere = () => { const l = toutes(); return l[l.length - 1]; };
async function respirer() { for (let i = 0; i < 6; i++) await new Promise((r) => setTimeout(r, 0)); }

beforeEach(() => {
  locale.set('fr');
  appels = [];
  for (const n of get(notifications)) notifications.dismiss(n.id);
  reponse = () => ({ statut: 409, corps: refus() });
  vi.stubGlobal('fetch', vi.fn(async (url: string, options?: RequestInit) => {
    const a: Appel = { url: String(url), methode: options?.method ?? 'GET', corps: options?.body ? JSON.parse(String(options.body)) : null };
    appels.push(a);
    const r = reponse(a);
    return new Response(JSON.stringify(r.corps ?? {}), { status: r.statut, headers: { 'Content-Type': 'application/json' } });
  }));
});
afterEach(() => { vi.unstubAllGlobals(); locale.set('fr'); });

describe('web#2804 — lecture du refus', () => {
  it('l’appareil vient de `device_name`, puis de `params.device`, puis « Tune »', () => {
    expect(lireRefusLiaison(refus())).toEqual({ appareil: 'Tune — Salon', recepteurEteint: false });
    expect(lireRefusLiaison({ params: { device: 'Bureau' }, receiver_active: false })).toEqual({ appareil: 'Bureau', recepteurEteint: true });
    expect(lireRefusLiaison({})).toEqual({ appareil: 'Tune', recepteurEteint: false });
  });
  it('la zone se lit dans la route de lecture', () => {
    expect(zoneDeLaRoute('/api/v1/zones/7/play')).toBe(7);
    expect(zoneDeLaRoute('/api/v1/queue')).toBeNull();
  });
});

describe('web#2804 — le 409 de la lecture', () => {
  it('🔴 affiche la phrase du serveur, sans bouton quand le récepteur tourne', async () => {
    const err: any = await api.play(7, { track_id: 1 }).catch((e) => e);
    expect(derniere()?.message).toBe(PHRASE);
    expect(derniere()?.action).toBeUndefined();
    expect(err.message).toBe(PHRASE);
    expect(err.dejaAnnonce).toBe(true);
  });

  it('🔴 récepteur éteint : « Activer le récepteur » allume celui de la zone qui jouait, puis rappelle l’étape', async () => {
    reponse = () => ({ statut: 409, corps: refus({ receiver_active: false, message_key: 'spotify.playback.linkRequiredReceiverOff' }) });
    await api.play(7, { track_id: 1 }).catch(() => {});
    const n = derniere();
    expect(n?.action?.label).toBe(get(t)('settings.enableReceiver' as any));
    reponse = (a) => a.url.endsWith('/spotify-connect/enable') ? { statut: 200, corps: { enabled: true, active: true } } : { statut: 404 };
    n!.action!.run();
    await respirer();
    const post = appels.find((a) => a.methode === 'POST' && a.url.endsWith('/spotify-connect/enable'));
    expect(post, 'le récepteur n’a pas été demandé au serveur').toBeTruthy();
    expect(post!.corps).toEqual({ zone_id: 7 });
    const ok = derniere();
    expect(ok?.level ?? (ok as any)?.type).toBe('success');
    expect(ok?.message).toContain('« Tune — Salon »');
  });

  it('🔴 sans phrase du serveur : le repli traduit, avec l’appareil', async () => {
    locale.set('en');
    reponse = () => ({ statut: 409, corps: refus({ message: undefined }) });
    const err: any = await api.play(3, { track_id: 1 }).catch((e) => e);
    expect(err.message).toContain('“Tune — Salon”');
    expect(err.message).toBe(get(t)('playback.errorSpotifyLinkRequired' as any).replace('{device}', 'Tune — Salon'));
    expect(derniere()?.message).toBe(err.message);
  });

  it('TÉMOIN — un serveur sans `receiver_active` ne fait pas apparaître de bouton', async () => {
    reponse = () => ({ statut: 409, corps: { code: 'spotify_liaison_connect_requise', error: 'spotify_liaison_connect_requise', message: PHRASE, message_key: 'spotify.playback.linkRequired' } });
    await api.play(7, { track_id: 1 }).catch(() => {});
    expect(derniere()?.message).toBe(PHRASE);
    expect(derniere()?.action).toBeUndefined();
  });
});

describe('web#2804 — l’étape des Réglages suit `librespot_linked`', () => {
  const st = (x: Record<string, unknown>) => ({ enabled: true, active: true, lecture_experimentale: true, device_name: 'Tune', ...x });
  it('🔴 non lié : l’étape ; récepteur éteint : avec le bouton', () => {
    expect(etapeLiaison(st({ librespot_linked: false }))).toBe('choisir');
    expect(etapeLiaison(st({ librespot_linked: false, active: false }))).toBe('activer');
  });
  it('lié, champ absent, ou lecture Spotify coupée : rien', () => {
    expect(etapeLiaison(st({ librespot_linked: true }))).toBe('masquee');
    expect(etapeLiaison(st({}))).toBe('masquee');
    expect(etapeLiaison(st({ librespot_linked: false, lecture_experimentale: false }))).toBe('masquee');
    expect(etapeLiaison(null)).toBe('masquee');
  });
});

describe('web#2804 — les trois textes existent dans les quinze langues', () => {
  it.each(ONZE_LANGUES)('%s', (code) => {
    const d = dictionnaire(code);
    for (const cle of ['playback.errorSpotifyLinkRequired', 'playback.errorSpotifyLinkRequiredReceiverOff', 'playback.spotifyReceiverEnabled']) {
      expect(d[cle], `${code} : ${cle}`).toBeTruthy();
      expect(d[cle], `${code} : ${cle} sans {device}`).toContain('{device}');
    }
    expect(d['settings.enableReceiver']).toBeTruthy();
  });
});
