// @vitest-environment jsdom
//
// jsdom : sans `window`, `$effect` ne se déclenche pas et l'écran ne lirait
// jamais `/ext/circle` — un test vert qui n'aurait rien exécuté.
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import { get } from 'svelte/store';
import CircleV2 from '../../components/v2/CircleV2.svelte';
import { preparerLocale } from '../i18n';
import { preferences } from '../stores/preferences';
import { dialogs } from '../stores/dialogs';
import { notifications } from '../stores/notifications';
import { zones, currentZoneId } from '../stores/zones';
import { licenseState } from '../stores/license';
import { circlePlugin, ecoutePermise, motifEcoute, estEcouteRevoquee } from '../circle';
import fr from '../locales/fr';

/**
 * Tune Circle, étape T4 — renesenses/tune-server-rust#5327 et les décisions
 * de Bertrand du 28/09/2026 : écouter chez un contact, Premium.
 *
 * Le faux greffon suit le contrat de l'issue, sous `/api/v1/ext/circle` :
 *   POST /contacts/{uid}/listen { track_id | track_ids, zone_id } → { ok: true }
 * et ses refus (contrat cloud site-mozaiklabs#237) : 404 `not_found`,
 * 402 `premium_required` (`who: listener`), 409 `owner_unavailable`,
 * 503 `circle.owner_offline`, 503 `circle.cloud_unavailable`.
 *
 * Ce qui est tenu :
 *  - sans Premium : AUCUN bouton Lire, le cadenas, et aucun appel `listen` ;
 *  - avec Premium : Lire envoie l'identifiant de piste DU CONTACT et MA zone
 *    active, rien d'autre ;
 *  - serveur éteint : la phrase nommée, le catalogue reste affiché ;
 *  - 402 : c'est MON abonnement, la phrase le dit ; 409 : phrase NEUTRE, rien
 *    sur le propriétaire ; aucun des deux ne lève le bandeau global ;
 *  - 404 à l'écoute : « ce titre n'est plus partagé », le catalogue reste ;
 *  - l'album part en `track_ids`, dans l'ordre ;
 *  - aucune présence permanente : aucun appel `/presence`, ni à l'ouverture
 *    ni au fil du temps.
 */

let partagesRecus: { user_id: number; name: string; library: boolean }[] = [];
let synchro: Record<string, unknown> | null = null;
let elisePartage = true;
/** Ce que rend le prochain `POST /listen`. */
let refusEcoute: { status: number; corps: unknown } | null = null;

type Appel = { url: string; method: string; body: any };
let appels: Appel[] = [];

const ALBUMS = [
  { id: 11, title: 'Kind of Blue', artist_name: 'Miles Davis', year: 1959, genre: 'Jazz', track_count: 2 },
];
const PISTES = [
  { id: 101, title: 'So What', artist_name: 'Miles Davis', album_title: 'Kind of Blue', album_id: 11, format: 'flac',
    sample_rate: 96000, bit_depth: 24, duration_ms: 562000, track_number: 1, disc_number: 1 },
  { id: 102, title: 'Freddie Freeloader', artist_name: 'Miles Davis', album_title: 'Kind of Blue', album_id: 11, format: 'flac',
    sample_rate: 96000, bit_depth: 24, duration_ms: 586000, track_number: 2, disc_number: 1 },
];

function reponse(status: number, corps: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: String(status),
    headers: new Headers({ 'content-type': 'application/json' }),
    json: async () => corps,
    text: async () => JSON.stringify(corps),
  } as unknown as Response;
}
const introuvable = () => reponse(404, { error: 'not_found' });
const page = <T,>(l: T[]) => ({ data: l, current_page: 1, last_page: 1, per_page: 50, total: l.length });

function greffon(u: string, method: string): Response {
  const chemin = u.split('?')[0].replace(/^.*\/api\/v1\/ext\/circle/, '');
  let m: RegExpMatchArray | null;
  if (method === 'GET' && (chemin === '' || chemin === '/')) {
    return reponse(200, { members: [{ user_id: 40, name: 'Élise', since: '2026-09-01T10:00:00Z' }], sent: [], received: [], circles: [] });
  }
  if (method === 'GET' && chemin === '/library-sync') return synchro ? reponse(200, synchro) : introuvable();
  if (method === 'GET' && chemin === '/shared-with-me') return reponse(200, partagesRecus);
  if ((m = chemin.match(/^\/contacts\/(\d+)\/listen$/)) && method === 'POST') {
    if (Number(m[1]) !== 40 || !elisePartage) return introuvable();
    if (refusEcoute) return reponse(refusEcoute.status, refusEcoute.corps);
    return reponse(200, { ok: true });
  }
  if ((m = chemin.match(/^\/contacts\/(\d+)\/library(\/.*)$/)) && method === 'GET') {
    if (Number(m[1]) !== 40 || !elisePartage) return introuvable();
    const reste = m[2];
    if (reste === '/stats') return reponse(200, { tracks: 2, albums: 1, artists: 1, last_sync: '2026-09-27T08:00:00Z' });
    if (reste === '/albums') return reponse(200, page(ALBUMS));
    if (reste === '/artists') return reponse(200, page([{ id: 1, name: 'Miles Davis' }]));
    if (reste === '/tracks') return reponse(200, page(PISTES));
    if (/^\/albums\/11\/tracks$/.test(reste)) return reponse(200, PISTES);
  }
  return introuvable();
}

beforeAll(async () => { await preparerLocale('fr'); });

beforeEach(() => {
  vi.useFakeTimers();
  appels = [];
  partagesRecus = [{ user_id: 40, name: 'Élise', library: true }];
  synchro = { premium: true, active: true, last_sync: '2026-09-27T08:00:00Z', pending: 0 };
  elisePartage = true;
  refusEcoute = null;
  circlePlugin.set(null);
  licenseState.update((s) => ({ ...s, loaded: false, tier: 'free' }));
  zones.set([{ id: 3, name: 'Salon', state: 'stopped', volume: 50 } as never]);
  currentZoneId.set(3);
  for (const n of get(notifications)) notifications.dismiss(n.id);
  preferences.update((p) => ({ ...p, settingsLevel: 'intermediate' }));
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const u = String(url);
      const method = (init?.method ?? 'GET').toUpperCase();
      const body = init?.body !== undefined && init?.body !== null ? JSON.parse(String(init.body)) : undefined;
      appels.push({ url: u, method, body });
      if (u.includes('/ext/circle')) return greffon(u, method);
      if (u.endsWith('/plugins')) return reponse(200, [{ name: 'circle', type: 'sdk', installed: true, enabled: true }]);
      return reponse(200, {});
    }),
  );
  vi.stubGlobal('WebSocket', class {
    close() {}
    addEventListener() {}
    removeEventListener() {}
    send() {}
  } as unknown as typeof WebSocket);
});

let hote: HTMLDivElement | null = null;
let monte: Record<string, unknown> | null = null;

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  hote?.remove();
  hote = null;
  for (const d of get(dialogs)) dialogs.settle(d.id, false);
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

async function laisserFaire() {
  for (let i = 0; i < 10; i++) {
    await vi.advanceTimersByTimeAsync(0);
    flushSync();
  }
}

async function poser(): Promise<HTMLDivElement> {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(CircleV2, { target: hote, props: {} });
  flushSync();
  await laisserFaire();
  return hote;
}

const texte = (el: Element) => (el.textContent ?? '').replace(/\s+/g, ' ').trim();
const ecoutes = () => appels.filter((a) => /\/ext\/circle\/contacts\/\d+\/listen$/.test(a.url));

async function cliquer(el: Element, sel: string) {
  const b = el.querySelector(sel) as HTMLButtonElement | null;
  if (!b) throw new Error(`bouton introuvable : ${sel}`);
  b.click();
  await laisserFaire();
}

async function ouvrirTitresElise(el: Element) {
  await cliquer(el, 'li.partage-recu button.ouvrir-catalogue');
  await cliquer(el, 'button.onglet-tracks');
}

// ─────────────────────────────────────────────────────────────────────────────

describe('T4 — sans Premium : aucun bouton, aucun appel', () => {
  it('le cadenas, la consultation intacte, et jamais `listen`', async () => {
    synchro = { ...synchro, premium: false };
    const el = await poser();
    await ouvrirTitresElise(el);
    expect(el.querySelectorAll('.pistes-contact .titre .ttxt')).toHaveLength(2);
    expect(el.querySelector('button.lire-piste')).toBeNull();
    expect(texte(el.querySelector('.ecoute-premium')!)).toContain(fr['v2.circle.listen.premiumOnly']);
    expect(texte(el.querySelector('.lecture-seule')!)).toBe(fr['v2.circle.lib.readOnly']);
    await cliquer(el, 'button.onglet-albums');
    await cliquer(el, 'button.album-contact');
    expect(el.querySelectorAll('.pistes-album .titre .ttxt')).toHaveLength(2);
    expect(el.querySelector('button.lire-album')).toBeNull();
    expect(el.querySelector('button.lire-piste')).toBeNull();
    // Le titre ne lance toujours rien.
    (el.querySelector('.pistes-album button.titre') as HTMLButtonElement).click();
    await laisserFaire();
    expect(ecoutes()).toEqual([]);
  });

  it('greffon sans `premium` : la licence décide ; tant qu’elle n’a pas répondu, rien', () => {
    expect(ecoutePermise(undefined, { loaded: false, premium: true })).toBe(false);
    expect(ecoutePermise(undefined, { loaded: true, premium: true })).toBe(true);
    expect(ecoutePermise(null, { loaded: true, premium: false })).toBe(false);
    // Le `premium` du greffon prime sur la licence, dans les deux sens.
    expect(ecoutePermise(false, { loaded: true, premium: true })).toBe(false);
    expect(ecoutePermise(true, { loaded: false, premium: false })).toBe(true);
  });
});

describe('T4 — avec Premium : Lire', () => {
  it('une piste : POST /listen avec l’identifiant DU CONTACT et ma zone active', async () => {
    const el = await poser();
    await ouvrirTitresElise(el);
    expect(el.querySelector('.lecture-seule')).toBeNull();
    expect(texte(el.querySelector('.ecoute-note')!)).toBe(fr['v2.circle.listen.hint']);
    const boutons = el.querySelectorAll('.pistes-contact button.lire-piste');
    expect(boutons).toHaveLength(2);
    (boutons[1] as HTMLButtonElement).click();
    await laisserFaire();
    expect(ecoutes().map((a) => [a.method, a.url.replace(/^.*ext\/circle/, ''), a.body])).toEqual([
      ['POST', '/contacts/40/listen', { track_id: 102, zone_id: 3 }],
    ]);
    // L'écran ne lance rien lui-même sur le serveur local : c'est le greffon qui joue.
    expect(appels.some((a) => /\/zones\/\d+\/(play|queue)/.test(a.url))).toBe(false);
    expect(el.querySelector('.refus-ecoute')).toBeNull();
    // Aucune présence permanente : jamais `/presence`.
    await vi.advanceTimersByTimeAsync(180_000);
    expect(appels.some((a) => a.url.includes('/presence'))).toBe(false);
  });

  it('un album : Lire l’album envoie TOUTES ses pistes, dans l’ordre ; chaque ligne a son bouton', async () => {
    const el = await poser();
    await cliquer(el, 'li.partage-recu button.ouvrir-catalogue');
    await cliquer(el, 'button.album-contact');
    const lignes = el.querySelectorAll('.pistes-album button.lire-piste');
    expect(lignes).toHaveLength(2);
    await cliquer(el, 'button.lire-album');
    (lignes[1] as HTMLButtonElement).click();
    await laisserFaire();
    expect(ecoutes().map((a) => a.body)).toEqual([
      { track_ids: [101, 102], zone_id: 3 },
      { track_id: 102, zone_id: 3 },
    ]);
  });

  it('aucune zone active : la phrase, et aucun appel', async () => {
    zones.set([]);
    currentZoneId.set(null);
    const el = await poser();
    await ouvrirTitresElise(el);
    await cliquer(el, 'button.lire-piste');
    expect(ecoutes()).toEqual([]);
    expect(texte(el.querySelector('.refus-ecoute span')!)).toBe(fr['v2.circle.listen.noZone']);
  });
});

describe('T4 — refus d’écoute', () => {
  it('serveur éteint (503 `circle.owner_offline`) : la phrase nommée, le catalogue reste', async () => {
    refusEcoute = { status: 503, corps: { error: 'circle.owner_offline' } };
    const el = await poser();
    await ouvrirTitresElise(el);
    await cliquer(el, 'button.lire-piste');
    expect(texte(el.querySelector('.refus-ecoute span')!)).toBe('Le serveur de Élise est éteint ou injoignable.');
    expect(el.querySelectorAll('.pistes-contact .titre .ttxt')).toHaveLength(2);
    // Pas de bandeau « Server error » global : l'écran le dit lui-même.
    expect(get(notifications).map((n) => n.message).join('|')).not.toMatch(/Server error/);
    // Réessayer une fois le serveur rallumé.
    refusEcoute = null;
    await cliquer(el, 'button.lire-piste');
    expect(el.querySelector('.refus-ecoute')).toBeNull();
    expect(ecoutes()).toHaveLength(2);
  });

  const bandeaux = () => get(notifications).map((n) => n.message).join('|');

  it.each([
    ['402 relayé (auditeur)', { status: 402, corps: { error: 'premium_required', who: 'listener' } }],
    ['402 préfixé par le greffon', { status: 402, corps: { error: 'circle.premium_required', who: 'listener' } }],
    ['402 sans corps', { status: 402, corps: null }],
  ])('%s : c’est MON abonnement, la phrase le dit ; aucun bandeau global', async (_nom, refus) => {
    refusEcoute = refus;
    const el = await poser();
    await ouvrirTitresElise(el);
    await cliquer(el, 'button.lire-piste');
    expect(texte(el.querySelector('.refus-ecoute span')!)).toBe(fr['v2.circle.listen.premiumRequired']);
    expect(bandeaux()).toBe('');
    expect(el.querySelectorAll('.pistes-contact .titre .ttxt')).toHaveLength(2);
  });

  it.each([
    ['409 owner_unavailable', { status: 409, corps: { error: 'owner_unavailable' } }],
    ['409 préfixé', { status: 409, corps: { error: 'circle.owner_unavailable' } }],
  ])('%s : phrase NEUTRE — rien sur le propriétaire ni sur un abonnement', async (_nom, refus) => {
    refusEcoute = refus;
    const el = await poser();
    await ouvrirTitresElise(el);
    await cliquer(el, 'button.lire-piste');
    expect(texte(el.querySelector('.refus-ecoute span')!)).toBe(fr['v2.circle.listen.unavailable']);
    expect(bandeaux() + texte(el)).not.toMatch(/Premium|abonnement/);
    expect(el.innerHTML).not.toContain(fr['v2.circle.listen.premiumRequired']);
    expect(el.querySelectorAll('.pistes-contact .titre .ttxt')).toHaveLength(2);
  });

  it('404 à l’écoute (révoqué, retiré du cercle) : « ce titre n’est plus partagé », le catalogue reste', async () => {
    const el = await poser();
    await ouvrirTitresElise(el);
    elisePartage = false;
    await cliquer(el, 'button.lire-piste');
    expect(texte(el.querySelector('.refus-ecoute span')!)).toBe(fr['v2.circle.listen.notShared']);
    expect(el.querySelector('.catalogue-contact')).not.toBeNull();
    // La navigation suivante, elle, ferme l'écran comme en T2.
    partagesRecus = [];
    await cliquer(el, 'button.onglet-albums');
    expect(el.querySelector('.catalogue-contact')).toBeNull();
    expect(texte(el.querySelector('.retour')!)).toBe(fr['v2.circle.shared.gone']);
    expect(el.innerHTML).not.toContain('So What');
  });

  it('503 du cloud et 429 : les phrases de T1', () => {
    const e503 = Object.assign(new Error('x'), { status: 503, code: 'circle.cloud_unavailable' });
    expect(motifEcoute(e503)).toMatchObject({ cle: 'v2.circle.err.unavailable' });
    const e429 = Object.assign(new Error('x'), { status: 429, retryAfter: 120 });
    expect(motifEcoute(e429)).toMatchObject({ cle: 'v2.circle.err.tooManyWait', minutes: 2 });
  });
});

describe('T4 — fin d’écoute en cours de lecture', () => {
  it('estEcouteRevoquee : l’événement propre, ou le code d’un échec de lecture', () => {
    expect(estEcouteRevoquee({ type: 'circle.stream_revoked', data: { zone_id: 3 } })).toBe(true);
    expect(estEcouteRevoquee({ type: 'zone.playback_error', data: { code: 'circle.stream_revoked' } })).toBe(true);
    expect(estEcouteRevoquee({ type: 'zone.playback_error', data: { code: 'file_not_found' } })).toBe(false);
    expect(estEcouteRevoquee({ type: 'playback.started', data: {} })).toBe(false);
    expect(estEcouteRevoquee(null)).toBe(false);
  });
});
