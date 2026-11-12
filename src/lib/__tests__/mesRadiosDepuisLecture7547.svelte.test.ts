// @vitest-environment jsdom
//
// tune-server-rust#7547 (alec_eiffel, rc9, fil « Écran Now Playing pour une
// radio ») — discussion #7566, go de Bertrand le 12/11/2026 pour la rc12 :
// depuis Lecture en cours, ajouter la station à « Mes radios » ou l'en retirer.
//
// web#2551 avait posé le bouton pour une station de « Mes radios » ou de
// l'annuaire trouvée par son NOM EXACT. Le testeur jugeait la livraison
// « inexacte » : une station jouée hors de l'annuaire, ou dont le nom
// affiché diffère de celui de l'annuaire, n'avait AUCUN bouton.
//   1. l'annuaire est aussi cherché par le flux qui joue ;
//   2. une station inconnue partout entre dans « Mes radios » par son flux.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import NowPlaying from '../../components/partages/NowPlaying.svelte';
import { zones, currentZoneId } from '../stores/zones';
import { activeView } from '../stores/navigation';
import { queueTracks } from '../stores/queue';
import { locale } from '../i18n';
import { ficheAuFlux, fluxAjoutable, oublierBadgesDeLecture } from '../ficheStation';

vi.setConfig({ testTimeout: 30_000 });

const FLUX = 'https://stream.example.org/jazz-hifi.flac';
const RADIO = {
  title: 'Blue in Green', artist_name: 'Miles Davis', album_title: 'Jazz Hi-Fi', source: 'radio',
  source_id: FLUX, duration_ms: 0, cover_path: 'https://c/kind-of-blue.jpg',
};

let miennes: any[] = [];
let annuaire: any[] = [];
let appels: { url: string; methode: string; corps: any }[] = [];
let recherches: string[] = [];
const replier = (x: string) => x.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
let hote: HTMLDivElement | null = null;
let monte: Record<string, any> | null = null;

function reponse(url: string, methode: string, corpsEnvoye: any): Response {
  let corps: unknown = /\/(zones|profiles|devices|playlists|shortcuts|search)(\?|$)/.test(url) ? [] : {};
  if (/\/queue/.test(url)) corps = { tracks: [], position: 0, length: 0 };
  if (/\/(credits|history|favorites|plays)/.test(url)) corps = [];
  if (/\/radios\/directory\/S1\/add$/.test(url) && methode === 'POST') {
    miennes = [{ id: 9, name: 'Jazz Radio', stream_url: FLUX }];
    corps = miennes[0];
  } else if (/\/radios\/directory\/S2\/add$/.test(url) && methode === 'POST') {
    miennes = [{ id: 10, name: 'FIP', stream_url: 'https://icecast.radiofrance.fr/fip-hifi.aac' }];
    corps = miennes[0];
  } else if (/\/radios\/directory(\?|$)/.test(url)) {
    // Comme le serveur (`radios_annuaire.rs`, `correspond`) : sans accents ni
    // casse, CHAQUE mot de `q` dans un même champ ; le flux n'est pas cherché.
    const p = new URL(url, 'http://h').searchParams;
    const mots = replier(p.get('q') ?? '').split(/\s+/).filter(Boolean);
    const items = annuaire.filter((f) => !mots.length
      || [f.name, f.genre, f.country_code, f.description].filter(Boolean).some((champ: string) => mots.every((m) => replier(champ).includes(m))));
    const limite = Number(p.get('limit') ?? 120);
    recherches.push(p.get('q') ?? '');
    corps = { total: items.length, offset: 0, limit: limite, count: Math.min(limite, items.length), items: items.slice(0, limite), countries: [], genres: [] };
  } else if (/\/radios$/.test(url) && methode === 'POST') {
    miennes = [{ id: 12, ...corpsEnvoye }];
    corps = miennes[0];
  } else if (/\/radios(\?|$)/.test(url)) {
    corps = miennes;
  }
  return {
    ok: true, status: 200, statusText: 'OK',
    headers: new Map([['content-type', 'application/json']]),
    json: async () => corps, text: async () => JSON.stringify(corps),
  } as unknown as Response;
}

const respirer = async (n = 10) => { for (let i = 0; i < n; i++) await new Promise((r) => setTimeout(r, 5)); flushSync(); };
async function poser(piste: unknown): Promise<HTMLDivElement> {
  zones.set([{ id: 1, name: 'Salon', state: 'playing', current_track: piste, position_ms: 1000 }] as any);
  currentZoneId.set(1);
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(NowPlaying, { target: hote, props: {} as any });
  flushSync();
  await respirer();
  return hote;
}
const bouton = (h: HTMLElement) => h.querySelector<HTMLButtonElement>('button[data-mes-radios]');

beforeEach(() => {
  locale.set('fr');
  appels = [];
  recherches = [];
  miennes = [];
  annuaire = [];
  oublierBadgesDeLecture();
  queueTracks.set([]);
  vi.stubGlobal('fetch', vi.fn(async (entree: unknown, options?: RequestInit) => {
    const url = String(typeof entree === 'string' ? entree : (entree as Request)?.url ?? entree);
    const methode = String(options?.method ?? 'GET').toUpperCase();
    const corps = options?.body ? JSON.parse(String(options.body)) : null;
    appels.push({ url, methode, corps });
    return reponse(url, methode, corps);
  }));
  vi.stubGlobal('WebSocket', class { close() {} addEventListener() {} removeEventListener() {} send() {} } as any);
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} } as any);
  activeView.set('nowplaying');
});

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  hote?.remove();
  hote = null;
  zones.set([]);
  currentZoneId.set(null);
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('#7547 — fluxAjoutable', () => {
  it('une adresse http(s) seulement', () => {
    expect(fluxAjoutable(FLUX)).toBe(FLUX);
    expect(fluxAjoutable('http://x.org/a.mp3')).toBe('http://x.org/a.mp3');
    expect(fluxAjoutable('radio:42')).toBeNull();
    expect(fluxAjoutable('file:///etc/passwd')).toBeNull();
    expect(fluxAjoutable('  ')).toBeNull();
    expect(fluxAjoutable(null)).toBeNull();
  });
});

describe('#7547 — ficheAuFlux', () => {
  it('le flux principal OU l’un des autres flux, sans schéma, casse ni « / » final', () => {
    const f = { stream_url: 'https://a.org/main.mp3', streams: [{ url: 'https://a.org/hifi.aac' }] };
    expect(ficheAuFlux(f, 'https://a.org/main.mp3')).toBe(true);
    expect(ficheAuFlux(f, 'http://A.org/hifi.aac/')).toBe(true);
    expect(ficheAuFlux(f, 'https://a.org/autre.mp3')).toBe(false);
    expect(ficheAuFlux({ stream_url: 'https://a.org/main.mp3' }, '')).toBe(false);
  });
});

describe('#7547 — Lecture en cours : « Mes radios » pour toute station', () => {
  it('🔴 station inconnue partout : « + » la crée dans « Mes radios » par son flux, puis « − »', async () => {
    const h = await poser(RADIO);
    const b = bouton(h);
    expect(b, 'station hors annuaire : aucun bouton « Mes radios »').not.toBeNull();
    expect(b!.getAttribute('aria-label')).toBe('Ajouter à mes radios');
    b!.click();
    await respirer();
    const crees = appels.filter((a) => a.methode === 'POST' && /\/radios$/.test(a.url));
    expect(crees).toHaveLength(1);
    expect(crees[0].corps).toEqual({ name: 'Jazz Hi-Fi', stream_url: FLUX });
    expect(bouton(h)!.getAttribute('aria-label')).toBe('Retirer de Mes radios');
  });

  it('🔴 nom affiché différent de l’annuaire : la fiche est trouvée par son flux', async () => {
    annuaire = [{ external_id: 'S1', name: 'Jazz Radio', stream_url: FLUX, logo_url: null, my_radio_id: null }];
    const h = await poser(RADIO);
    bouton(h)!.click();
    await respirer();
    expect(appels.filter((a) => a.methode === 'POST' && /\/radios\/directory\/S1\/add$/.test(a.url))).toHaveLength(1);
    expect(appels.filter((a) => a.methode === 'POST' && /\/radios$/.test(a.url))).toHaveLength(0);
  });

  it('🔴 « FIP Hi-Fi » joue, l’annuaire dit « FIP » et publie ce flux parmi ses autres flux : pas de doublon manuel', async () => {
    const HIFI = 'https://icecast.radiofrance.fr/fip-hifi.aac';
    annuaire = [
      { external_id: 'S2', name: 'FIP', genre: 'eclectic', country_code: 'FR', logo_url: null, my_radio_id: null,
        stream_url: 'https://icecast.radiofrance.fr/fip-midfi.mp3',
        streams: [{ url: 'https://icecast.radiofrance.fr/fip-midfi.mp3' }, { url: HIFI, codec: 'AAC' }] },
    ];
    const h = await poser({ ...RADIO, album_title: 'FIP Hi-Fi', source_id: HIFI });
    // La recherche par le nom entier ne rend rien (comme le vrai serveur) :
    // c'est la recherche large qui trouve la fiche.
    expect(recherches).toContain('FIP Hi-Fi');
    expect(recherches).toContain('FIP');
    bouton(h)!.click();
    await respirer();
    expect(appels.filter((a) => a.methode === 'POST' && /\/radios\/directory\/S2\/add$/.test(a.url))).toHaveLength(1);
    expect(appels.filter((a) => a.methode === 'POST' && /\/radios$/.test(a.url)), 'station manuelle créée en double').toHaveLength(0);
  });

  it('CONTRE-ÉPREUVE : une radio sans nom n’est pas créée', async () => {
    const h = await poser({ ...RADIO, album_title: '' });
    expect(bouton(h)).toBeNull();
  });
});
