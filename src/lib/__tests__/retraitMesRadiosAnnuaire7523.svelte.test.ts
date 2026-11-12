// @vitest-environment jsdom
//
// tune-server-rust#7523 (alec_eiffel ; discussion #7564, go de Bertrand du
// 12/11/2026) — la fenêtre « Retirer de mes radios » précise que la station
// reste disponible dans l'annuaire, pour ne pas inquiéter.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import { get } from 'svelte/store';
import { clearViewContext } from '../stores/navigation';

const mocks = vi.hoisted(() => ({
  getRadios: vi.fn(), deleteRadio: vi.fn(), updateRadio: vi.fn(), createRadio: vi.fn(),
  playRadio: vi.fn(), importRadios: vi.fn(), exportRadiosUrl: vi.fn(() => '#'), uploadRadioCover: vi.fn(),
}));
vi.mock('../api', async (importOriginal) => ({ ...(await importOriginal<object>()), getConfig: vi.fn(async () => ({ radios_country: '' })), ...mocks }));

import RadiosV2 from '../../components/v2/RadiosV2.svelte';
import { dialogs } from '../stores/dialogs';
import { locale } from '../i18n';
import { questionRetraitMesRadios } from '../mesRadios';
import { ONZE_LANGUES, dictionnaire } from './onzeDictionnaires';
import NowPlaying from '../../components/partages/NowPlaying.svelte';
import { zones, currentZoneId } from '../stores/zones';
import { activeView } from '../stores/navigation';
import { queueTracks } from '../stores/queue';
import { oublierBadgesDeLecture } from '../ficheStation';

vi.setConfig({ testTimeout: 30_000 });
const respirerNp = async (n = 10) => { for (let i = 0; i < n; i++) await new Promise((r) => setTimeout(r, 5)); flushSync(); };

const DE_L_ANNUAIRE = {
  id: 7, name: 'FIP', stream_url: 'https://stream.example/fip', favorite: false,
  annuaire: { external_id: 'rm-fip', rapproche_par: null },
};

const fr = dictionnaire('fr');
const tFr = (k: string) => fr[k] ?? k;
const attendre = () => new Promise((r) => setTimeout(r, 0));
const respirer = async () => { for (let i = 0; i < 6; i++) await attendre(); flushSync(); };
let hote: HTMLDivElement | null = null;
let instance: Record<string, unknown> | null = null;

beforeEach(() => {
  clearViewContext('radios');
  for (const fn of Object.values(mocks)) fn.mockReset();
  mocks.getRadios.mockResolvedValue([DE_L_ANNUAIRE]);
  mocks.deleteRadio.mockResolvedValue(undefined);
  mocks.exportRadiosUrl.mockReturnValue('#');
  locale.set('fr');
});
afterEach(() => {
  for (const d of get(dialogs)) dialogs.settle(d.id, false);
  if (instance) unmount(instance as any);
  instance = null;
  hote?.remove();
  hote = null;
  document.body.innerHTML = '';
});

describe('#7523 — retirer de « Mes radios » : la station reste dans l’annuaire', () => {
  it('station de l’annuaire : la question dit qu’elle y reste', () => {
    const q = questionRetraitMesRadios(tFr, 'FIP', true);
    expect(q).toContain('« FIP »');
    expect(q).toContain("reste disponible dans l'annuaire");
  });

  it('station saisie à la main : la question courte, sans promesse d’annuaire', () => {
    expect(questionRetraitMesRadios(tFr, 'Ma radio', false)).toBe('Retirer « Ma radio » de Mes radios ?');
  });

  it('le libellé existe dans toutes les langues du client, avec {name}', () => {
    for (const l of ONZE_LANGUES) {
      const d = dictionnaire(l);
      expect(d['v2.radio.removeConfirmDirectory'], l).toContain('{name}');
      expect(d['v2.radio.removeConfirmDirectory'], l).not.toBe(d['v2.radio.removeConfirm']);
    }
  });

  it('🔴 « Mes radios » : le bouton Retirer ouvre la question qui rassure', async () => {
    hote = document.createElement('div');
    document.body.append(hote);
    instance = mount(RadiosV2, { target: hote, props: {} });
    flushSync();
    await respirer();
    const retirer = hote.querySelector<HTMLButtonElement>(`.coin[aria-label="${fr['v2.radio.removeFromMine']}"]`);
    expect(retirer, 'pas de bouton Retirer sur la pochette').not.toBeNull();
    retirer!.click();
    await respirer();
    const d = get(dialogs);
    expect(d).toHaveLength(1);
    expect(d[0].message).toContain("reste disponible dans l'annuaire");
    dialogs.settle(d[0].id, true);
    await respirer();
    expect(mocks.deleteRadio).toHaveBeenCalledWith(7);
  });

});

// ─── Lecture en cours, monté ────────────────────────────────────────────────
//
// Relecture du 12/11 : la station qui joue et qui est DÉJÀ dans « Mes radios »
// revient de `stationDeLecture` avec `annuaire: null` ; seule son entrée
// personnelle (`mienne.annuaire.external_id`) dit qu'elle vient de l'annuaire.
// Le témoin monte « En cours de lecture » sur une telle station et lit la
// question posée. Contre-épreuve : une station saisie à la main garde la
// question courte.

const FLUX = 'https://icecast.radiofrance.fr/fip-hifi.aac';
const RADIO = {
  title: 'So What', artist_name: 'Miles Davis', album_title: 'FIP', source: 'radio',
  source_id: FLUX, duration_ms: 0, cover_path: null,
};
let miennesNp: any[] = [];
let appelsNp: { url: string; methode: string }[] = [];
let hoteNp: HTMLDivElement | null = null;
let monteNp: Record<string, any> | null = null;

function reponseNp(url: string, methode: string): Response {
  let corps: unknown = /\/(zones|profiles|devices|playlists|shortcuts|search)(\?|$)/.test(url) ? [] : {};
  if (/\/queue/.test(url)) corps = { tracks: [], position: 0, length: 0 };
  if (/\/(credits|history|favorites|plays)/.test(url)) corps = [];
  if (/\/radios\/directory(\?|$)/.test(url)) {
    corps = { total: 0, offset: 0, limit: 20, count: 0, items: [], countries: [], genres: [] };
  }
  return {
    ok: true, status: corps === undefined ? 204 : 200, statusText: 'OK',
    headers: new Map([['content-type', 'application/json']]),
    json: async () => corps, text: async () => (corps === undefined ? '' : JSON.stringify(corps)),
  } as unknown as Response;
}

describe('#7523 — Lecture en cours : station de l’annuaire déjà dans « Mes radios »', () => {
  beforeEach(() => {
    appelsNp = [];
    // `../api` est simulé plus haut : « Mes radios » se lit par `getRadios`.
    mocks.getRadios.mockImplementation(async () => miennesNp);
    mocks.deleteRadio.mockImplementation(async () => { miennesNp = []; });
    oublierBadgesDeLecture();
    queueTracks.set([]);
    vi.stubGlobal('fetch', vi.fn(async (entree: unknown, options?: RequestInit) => {
      const url = String(typeof entree === 'string' ? entree : (entree as Request)?.url ?? entree);
      const methode = String(options?.method ?? 'GET').toUpperCase();
      appelsNp.push({ url, methode });
      return reponseNp(url, methode);
    }));
    vi.stubGlobal('WebSocket', class { close() {} addEventListener() {} removeEventListener() {} send() {} } as any);
    vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} } as any);
    activeView.set('nowplaying');
  });
  afterEach(() => {
    if (monteNp) unmount(monteNp);
    monteNp = null;
    hoteNp?.remove();
    hoteNp = null;
    zones.set([]);
    currentZoneId.set(null);
    vi.unstubAllGlobals();
  });

  async function retirerDepuisLecture(): Promise<string> {
    zones.set([{ id: 1, name: 'Salon', state: 'playing', current_track: RADIO, position_ms: 1000 }] as any);
    currentZoneId.set(1);
    hoteNp = document.createElement('div');
    document.body.appendChild(hoteNp);
    monteNp = mount(NowPlaying, { target: hoteNp, props: {} as any });
    flushSync();
    await respirerNp();
    const b = hoteNp.querySelector<HTMLButtonElement>('button[data-mes-radios]');
    expect(b, 'aucun bouton « Mes radios » sur la lecture en cours').not.toBeNull();
    expect(b!.getAttribute('aria-pressed')).toBe('true');
    b!.click();
    await respirerNp();
    const d = get(dialogs);
    expect(d).toHaveLength(1);
    const message = d[0].message;
    dialogs.settle(d[0].id, true);
    await respirerNp();
    return message;
  }

  it('🔴 entrée personnelle portant `annuaire.external_id` : la question dit qu’elle reste dans l’annuaire', async () => {
    miennesNp = [{
      id: 7, name: 'FIP', stream_url: FLUX, favorite: false, logo_url: 'https://l/fip.png',
      annuaire: { external_id: 'S000973', rapproche_par: null },
    }];
    const message = await retirerDepuisLecture();
    expect(message).toContain("reste disponible dans l'annuaire");
    expect(mocks.deleteRadio).toHaveBeenCalledWith(7);
  });

  it('CONTRE-ÉPREUVE : station saisie à la main, la question courte', async () => {
    miennesNp = [{ id: 7, name: 'FIP', stream_url: FLUX, favorite: false, logo_url: 'https://l/fip.png' }];
    const message = await retirerDepuisLecture();
    expect(message).toBe('Retirer « FIP » de Mes radios ?');
  });
});
