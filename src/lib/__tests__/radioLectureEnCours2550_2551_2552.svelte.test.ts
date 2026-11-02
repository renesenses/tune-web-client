// @vitest-environment jsdom
//
// Trois demandes d'alec_eiffel (rc9, 30/10/2026), go de Bertrand le 30/10 :
//   web#2552 (fil 2556) — les flux d'une fiche radio, du meilleur au moins bon ;
//   web#2550 (fil 2560) — Lecture en cours d'une radio : le logo de la station
//     reste visible quand la pochette du morceau a pris sa place ;
//   web#2551 (fil 2562) — Lecture en cours d'une radio : ajouter la station à
//     « Mes radios » ou l'en retirer, avec les gestes de l'annuaire.
//
// Le témoin monte « En cours de lecture » sur une radio et regarde l'écran et
// ce qui part sur le réseau. Chaque comportement a sa contre-épreuve.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import NowPlaying from '../../components/partages/NowPlaying.svelte';
import { zones, currentZoneId } from '../stores/zones';
import { activeView } from '../stores/navigation';
import { queueTracks } from '../stores/queue';
import { dialogs } from '../stores/dialogs';
import { locale } from '../i18n';
import { logoAuNomDeLaStation, oublierBadgesDeLecture, ordonnerFluxParQualite } from '../ficheStation';
import type { FluxRadio } from '../types';

vi.setConfig({ testTimeout: 30_000 });

describe('web#2552 — les flux du meilleur au moins bon', () => {
  const f = (url: string, codec: string | null, bitrate: number | null, extra: Partial<FluxRadio> = {}): FluxRadio =>
    ({ url, codec, bitrate, ...extra });

  it('🔴 le cas du fil 2556 : HLS 320 (principal), HLS 96, HLS 320 → les deux 320 devant le 96', () => {
    const r = ordonnerFluxParQualite([
      f('a', 'HLS', 320, { primary: true }), f('b', 'HLS', 96), f('c', 'HLS', 320),
    ]);
    expect(r.map((x) => x.url)).toEqual(['a', 'c', 'b']);
  });

  it('🔴 le sans perte d’abord, même sans débit connu ; puis le débit ; absent en dernier', () => {
    const r = ordonnerFluxParQualite([
      f('mp3', 'MP3', 128), f('inconnu', 'AAC', null), f('flac', 'flac', null), f('aac', 'AAC', 192),
    ]);
    expect(r.map((x) => x.url)).toEqual(['flac', 'aac', 'mp3', 'inconnu']);
  });

  it('à débit égal : la fréquence, puis le principal, puis l’ordre de la fiche ; la liste d’entrée est intacte', () => {
    const entree = [
      f('x', 'AAC', 128), f('y', 'AAC', 128, { primary: true }), f('z', 'AAC', 128, { sample_rate: 48000 }),
    ];
    expect(ordonnerFluxParQualite(entree).map((x) => x.url)).toEqual(['z', 'y', 'x']);
    expect(entree.map((x) => x.url)).toEqual(['x', 'y', 'z']);
  });
});

describe('web#2550 — logoAuNomDeLaStation', () => {
  it('le logo quand la pochette est autre ; rien quand c’est le logo lui-même, ou sans logo', () => {
    expect(logoAuNomDeLaStation('https://l/fip.png', 'https://c/pochette.jpg')).toBe('https://l/fip.png');
    expect(logoAuNomDeLaStation('https://l/fip.png', 'https://l/fip.png')).toBeNull();
    expect(logoAuNomDeLaStation(null, 'https://c/pochette.jpg')).toBeNull();
    expect(logoAuNomDeLaStation('  ', null)).toBeNull();
  });
});

// ─── Lecture en cours, monté ────────────────────────────────────────────────

const FLUX = 'https://icecast.radiofrance.fr/fip-hifi.aac';
const LOGO = 'https://l/fip.png';
const RADIO = {
  title: 'So What', artist_name: 'Miles Davis', album_title: 'FIP', source: 'radio',
  source_id: FLUX, duration_ms: 0, cover_path: 'https://c/kind-of-blue.jpg',
};
const FIP_MIENNE = { id: 7, name: 'FIP', stream_url: FLUX, favorite: false, logo_url: LOGO };
const FIP_ANNUAIRE = {
  external_id: 'S000973', name: 'FIP', country_code: 'FR', stream_url: FLUX, logo_url: LOGO,
  now_playing: true, my_radio_id: null as number | null,
};

let miennes: any[] = [];
let annuaire: any[] = [];
let appels: { url: string; methode: string }[] = [];
let hote: HTMLDivElement | null = null;
let monte: Record<string, any> | null = null;

function reponse(url: string, methode: string): Response {
  let corps: unknown = /\/(zones|profiles|devices|playlists|shortcuts|search)(\?|$)/.test(url) ? [] : {};
  if (/\/queue/.test(url)) corps = { tracks: [], position: 0, length: 0 };
  if (/\/(credits|history|favorites|plays)/.test(url)) corps = [];
  if (/\/radios\/directory\/S000973\/add$/.test(url) && methode === 'POST') {
    miennes = [FIP_MIENNE];
    annuaire = annuaire.map((a) => ({ ...a, my_radio_id: 7 }));
    corps = FIP_MIENNE;
  } else if (/\/radios\/directory(\?|$)/.test(url)) {
    corps = { total: annuaire.length, offset: 0, limit: 20, count: annuaire.length, items: annuaire, countries: [], genres: [] };
  } else if (/\/radios\/7$/.test(url) && methode === 'DELETE') {
    miennes = [];
    annuaire = annuaire.map((a) => ({ ...a, my_radio_id: null }));
    corps = undefined;
  } else if (/\/radios(\?|$)/.test(url)) {
    corps = miennes;
  }
  return {
    ok: true, status: corps === undefined ? 204 : 200, statusText: 'OK',
    headers: new Map([['content-type', 'application/json']]),
    json: async () => corps, text: async () => (corps === undefined ? '' : JSON.stringify(corps)),
  } as unknown as Response;
}

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
const respirer = async (n = 10) => { for (let i = 0; i < n; i++) await new Promise((r) => setTimeout(r, 5)); flushSync(); };
const boutonMesRadios = (h: HTMLElement) => h.querySelector<HTMLButtonElement>('button[data-mes-radios]');

beforeEach(() => {
  locale.set('fr');
  appels = [];
  miennes = [];
  annuaire = [FIP_ANNUAIRE];
  oublierBadgesDeLecture();
  queueTracks.set([]);
  vi.stubGlobal('fetch', vi.fn(async (entree: unknown, options?: RequestInit) => {
    const url = String(typeof entree === 'string' ? entree : (entree as Request)?.url ?? entree);
    const methode = String(options?.method ?? 'GET').toUpperCase();
    appels.push({ url, methode });
    return reponse(url, methode);
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

describe('web#2550 — Lecture en cours : le logo de la station à côté de son nom', () => {
  it('🔴 pochette du morceau affichée : le logo de la station est là, devant le nom', async () => {
    miennes = [FIP_MIENNE];
    const h = await poser(RADIO);
    const logo = h.querySelector('.radio-station-ligne [data-logo-station]');
    expect(logo, 'le logo de la station n’apparaît nulle part').not.toBeNull();
    expect(logo!.querySelector('img')?.getAttribute('src') ?? '').toContain('fip.png');
  });

  it('CONTRE-ÉPREUVE : la pochette affichée EST le logo, il ne se répète pas', async () => {
    miennes = [FIP_MIENNE];
    const h = await poser({ ...RADIO, cover_path: LOGO });
    expect(h.querySelector('[data-logo-station]')).toBeNull();
  });
});

describe('web#2551 — Lecture en cours : ajouter à « Mes radios » ou en retirer', () => {
  it('🔴 station de l’annuaire hors de « Mes radios » : « + » l’ajoute par la route de l’annuaire', async () => {
    const h = await poser(RADIO);
    const b = boutonMesRadios(h);
    expect(b, 'aucun bouton « Mes radios » sur la lecture en cours').not.toBeNull();
    expect(b!.getAttribute('aria-label')).toBe('Ajouter à mes radios');
    b!.click();
    await respirer();
    expect(appels.filter((a) => a.methode === 'POST' && /\/radios\/directory\/S000973\/add$/.test(a.url))).toHaveLength(1);
    // La station est relue : le bouton dit maintenant « Retirer ».
    expect(boutonMesRadios(h)!.getAttribute('aria-label')).toBe('Retirer de Mes radios');
  });

  it('🔴 station de « Mes radios » : « − » la retire après confirmation', async () => {
    miennes = [FIP_MIENNE];
    const confirmer = vi.spyOn(dialogs, 'confirm').mockResolvedValue(true);
    const h = await poser(RADIO);
    const b = boutonMesRadios(h)!;
    expect(b.getAttribute('aria-pressed')).toBe('true');
    b.click();
    await respirer();
    expect(confirmer).toHaveBeenCalledTimes(1);
    expect(appels.filter((a) => a.methode === 'DELETE' && /\/radios\/7$/.test(a.url))).toHaveLength(1);
    expect(boutonMesRadios(h)!.getAttribute('aria-label')).toBe('Ajouter à mes radios');
  });

  it('confirmation refusée : rien ne part', async () => {
    miennes = [FIP_MIENNE];
    vi.spyOn(dialogs, 'confirm').mockResolvedValue(false);
    const h = await poser(RADIO);
    boutonMesRadios(h)!.click();
    await respirer();
    expect(appels.filter((a) => a.methode === 'DELETE')).toHaveLength(0);
  });

  it('CONTRE-ÉPREUVE : station inconnue de l’annuaire et de « Mes radios » : pas de bouton', async () => {
    annuaire = [];
    const h = await poser(RADIO);
    expect(boutonMesRadios(h)).toBeNull();
  });

  it('CONTRE-ÉPREUVE : piste de bibliothèque, ni logo ni bouton', async () => {
    const h = await poser({ track_id: 1, title: 'X', artist_name: 'Y', album_title: 'Z', source: 'local', duration_ms: 1000 });
    expect(boutonMesRadios(h)).toBeNull();
    expect(h.querySelector('[data-logo-station]')).toBeNull();
  });
});
