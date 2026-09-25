// @vitest-environment jsdom
//
// Fil 1946 — FabienM, v0.9.165 : « on se rend compte qu'on n'aime pas un titre
// quand on l'écoute : proposer le bouton Bannir le titre dans la page Lecture
// en cours, par ex. au même niveau que Réveils, Paroles… »
//
// Le témoin MONTE « En écoute », clique le bouton de la rangée, et regarde ce
// qui PART SUR LE RÉSEAU et ce que l'écran DIT ensuite.
//
// Règles tenues (Bertrand, 23/09/2026) : bibliothèque LOCALE seulement — une
// piste Qobuz n'a pas de bouton ; le geste est celui du menu de piste
// (`titreBanni.bannir`), avec son message de confirmation.
//
// CONTRE-ÉPREUVE : sur origin/main, le bouton n'existe pas — les témoins
// « présent », « clic » et « Débannir » rougissent.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import { get } from 'svelte/store';
import NowPlaying from '../../components/partages/NowPlaying.svelte';
import { zones, currentZoneId } from '../stores/zones';
import { activeView } from '../stores/navigation';
import { queueTracks } from '../stores/queue';
import { notifications } from '../stores/notifications';
import { surchargesBannissement } from '../titreBanni';
import { locale } from '../i18n';

const PISTE_LOCALE = {
  track_id: 77, album_id: 5, artist_id: 3,
  title: 'Video Games', artist_name: 'Lana Del Rey', album_title: 'Born To Die',
  source: 'local', duration_ms: 281000,
};
const PISTE_QOBUZ = {
  track_id: null, album_id: null, artist_id: null,
  title: 'Video Games', artist_name: 'Lana Del Rey', album_title: 'Born To Die',
  source: 'qobuz', source_id: 'q-1', duration_ms: 281000,
};

let appels: { url: string; methode: string }[] = [];
let hote: HTMLDivElement | null = null;
let monte: Record<string, any> | null = null;

function reponse(url: string, methode: string): Response {
  let corps: unknown = /\/(zones|profiles|devices|playlists|shortcuts|search)(\?|$)/.test(url) ? [] : {};
  if (/\/library\/tracks\/\d+\/ban$/.test(url)) {
    corps = methode === 'DELETE' ? { track_id: 77, banned: false } : { track_id: 77, banned: true };
  }
  if (/\/queue/.test(url)) corps = { tracks: [], position: 0, length: 0 };
  // Crédits, historique, favoris… : des LISTES. Un `{}` ferait lever un `for…of`.
  if (/\/(credits|history|favorites|plays)/.test(url)) corps = [];
  return {
    ok: true, status: 200, statusText: 'OK',
    headers: new Map([['content-type', 'application/json']]),
    json: async () => corps, text: async () => JSON.stringify(corps),
  } as unknown as Response;
}

function poser(piste: unknown): HTMLDivElement {
  zones.set([{ id: 1, name: 'Salon', state: 'playing', current_track: piste, position_ms: 1000 }] as any);
  currentZoneId.set(1);
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(NowPlaying, { target: hote, props: {} as any });
  flushSync();
  return hote;
}
const respirer = (ms = 60) => new Promise((r) => setTimeout(r, ms));
const bouton = (h: HTMLElement) => h.querySelector<HTMLButtonElement>('button[data-bannir-en-cours]');

beforeEach(() => {
  locale.set('fr');
  appels = [];
  surchargesBannissement.set(new Map());
  queueTracks.set([]);
  for (const n of get(notifications)) notifications.dismiss(n.id);
  vi.stubGlobal('fetch', vi.fn(async (entree: unknown, options?: RequestInit) => {
    const url = String(typeof entree === 'string' ? entree : (entree as Request)?.url ?? entree);
    const methode = String(options?.method ?? 'GET').toUpperCase();
    appels.push({ url, methode });
    return reponse(url, methode);
  }));
  vi.stubGlobal('WebSocket', class { close(){} addEventListener(){} removeEventListener(){} send(){} } as any);
  vi.stubGlobal('ResizeObserver', class { observe(){} unobserve(){} disconnect(){} } as any);
  activeView.set('nowplaying');
});

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  hote?.remove();
  hote = null;
  zones.set([]);
  queueTracks.set([]);
  surchargesBannissement.set(new Map());
  vi.unstubAllGlobals();
});

describe('fil 1946 — « Bannir ce titre » dans En écoute', () => {
  it('🔴 présent pour une piste LOCALE, dans la rangée de Paroles et Réveil', async () => {
    const h = poser(PISTE_LOCALE);
    await respirer();
    const b = bouton(h);
    expect(b, 'bouton « Bannir » absent').not.toBeNull();
    expect((b!.textContent ?? '').trim()).toBe('Bannir ce titre');
    expect(b!.closest('.np-extra-btns'), 'hors de la rangée des boutons').not.toBeNull();
  });

  it('absent pour une piste Qobuz — bibliothèque locale seulement', async () => {
    const h = poser(PISTE_QOBUZ);
    await respirer();
    expect(h.querySelector('.np-extra-btns'), 'rangée non rendue — témoin sans objet').not.toBeNull();
    expect(bouton(h)).toBeNull();
  });

  it('🔴 clic → POST /library/tracks/77/ban, message de confirmation, puis « Débannir »', async () => {
    const h = poser(PISTE_LOCALE);
    await respirer();
    appels = [];
    bouton(h)!.click();
    await respirer(120);
    flushSync();
    const ban = appels.filter((a) => /\/library\/tracks\/77\/ban$/.test(a.url));
    expect(ban.map((a) => a.methode)).toEqual(['POST']);
    const messages = get(notifications).map((n) => n.message);
    expect(messages.some((m: string) => m.includes('« Video Games » est banni')),
      `message attendu absent ; vus : ${messages.join(' | ')}`).toBe(true);
    expect((bouton(h)!.textContent ?? '').trim()).toBe('Débannir');
  });

  it('🔴 déjà banni (drapeau de la ligne de file) : le bouton est « Débannir », et débannit', async () => {
    queueTracks.set([{ id: 77, title: 'Video Games', source: 'local', banned: true } as any]);
    const h = poser(PISTE_LOCALE);
    await respirer();
    const b = bouton(h)!;
    expect((b.textContent ?? '').trim()).toBe('Débannir');
    appels = [];
    b.click();
    await respirer(120);
    flushSync();
    expect(appels.filter((a) => /\/library\/tracks\/77\/ban$/.test(a.url)).map((a) => a.methode)).toEqual(['DELETE']);
    expect((bouton(h)!.textContent ?? '').trim()).toBe('Bannir ce titre');
  });
});
