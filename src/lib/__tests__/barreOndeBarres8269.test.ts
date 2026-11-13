// @vitest-environment jsdom
//
// Discussion #8269 — la barre de progression en forme d'onde, MONTÉE : barre
// de lecture du bas, écran de lecture (SeekBar) et Réglages. Le réglage,
// le repli sur la barre classique, la recherche au clic et au clavier.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import { get } from 'svelte/store';
import TransportBar from '../../components/partages/TransportBar.svelte';
import SeekBar from '../../components/partages/SeekBar.svelte';
import SettingsV2 from '../../components/v2/SettingsV2.svelte';
import { zones, currentZoneId } from '../stores/zones';
import { preferences } from '../stores/preferences';
import { seekPositionMs } from '../stores/nowPlaying';
import { locale } from '../i18n';
import { v2SettingsTarget } from '../stores/v2SettingsNav';
import type { V2SettingsTabId } from '../v2Settings';
import * as LANGUES from './lesOnzeLangues';

const LOCALES_COMPLETES = Object.entries(LANGUES) as [string, Record<string, string>][];
vi.setConfig({ testTimeout: 60_000 });
// Lu au chargement, avant tout `beforeEach` : le défaut d'un stockage vide.
const DEFAUT_AU_CHARGEMENT = get(preferences).barreOnde;

class Inerte { observe() {} unobserve() {} disconnect() {} }
let hote: HTMLDivElement | null = null;
let monte: Record<string, unknown> | null = null;
let fetchMock: ReturnType<typeof vi.fn>;
const souffler = async (n = 10) => {
  for (let i = 0; i < n; i++) { await new Promise((r) => setTimeout(r, 0)); flushSync(); }
};
const reponse = (corps: unknown, status = 200) => ({
  ok: status < 400, status, statusText: 'x',
  headers: new Headers({ 'content-type': 'application/json' }),
  json: async () => corps, text: async () => JSON.stringify(corps),
} as unknown as Response);
const urls = () => fetchMock.mock.calls.map((c) => String(c[0]));
const requetesOnde = (id: number) => urls().filter((u) => u.includes(`/library/tracks/${id}/waveform`));
const seeks = () => fetchMock.mock.calls
  .filter((c) => String(c[0]).includes('/seek'))
  .map((c) => JSON.parse(String((c[1] as RequestInit).body)).position_ms as number);

// Ids distincts par test : le cache vit le temps du module, comme dans l'onglet.
function zoneAvec(track: Record<string, unknown>) {
  zones.set([{
    id: 1, name: 'Salon', state: 'playing', online: true, volume: 0.4,
    current_track: { title: 'Titre', artist_name: 'Artiste', album_title: 'Album', duration_ms: 200000, sample_rate: 44100, bit_depth: 16, format: 'flac', ...track },
  }] as never);
}

function poserLargeur(el: Element) {
  (el as HTMLElement).getBoundingClientRect = () =>
    ({ left: 0, top: 0, right: 400, bottom: 20, width: 400, height: 20, x: 0, y: 0, toJSON() {} }) as DOMRect;
}

beforeEach(() => {
  locale.set('en');
  vi.stubGlobal('ResizeObserver', Inerte);
  vi.stubGlobal('IntersectionObserver', Inerte);
  vi.stubGlobal('WebSocket', class { close() {} addEventListener() {} removeEventListener() {} send() {} } as unknown as typeof WebSocket);
  fetchMock = vi.fn(async (url: string) => {
    const u = String(url);
    const m = u.match(/\/library\/tracks\/(\d+)\/waveform/);
    if (m) {
      const id = Number(m[1]);
      if (id >= 900) return reponse({ track_id: id, waveform: null, error: 'file unreadable or unsupported format' });
      return reponse({ track_id: id, waveform: Array.from({ length: 200 }, (_, i) => (i % 10) / 10 + 0.05) });
    }
    return reponse({});
  });
  vi.stubGlobal('fetch', fetchMock);
  currentZoneId.set(1);
  seekPositionMs.set(50_000);
  preferences.update((p) => ({ ...p, barreOnde: true, barreVuMetres: false, settingsLevel: 'expert' }));
  hote = document.createElement('div');
  document.body.appendChild(hote);
});

afterEach(() => {
  if (monte) { try { unmount(monte); } catch { /* sans objet */ } }
  monte = null;
  hote?.remove();
  hote = null;
  v2SettingsTarget.set(null);
  vi.unstubAllGlobals();
});

describe('#8269 — le réglage', () => {
  it('🔴 décoché par défaut', async () => {
    expect(DEFAUT_AU_CHARGEMENT, 'une installation qui n’a rien choisi').toBe(false);
    // Réglage décoché : barre classique, et AUCUNE requête d'onde.
    preferences.update((p) => ({ ...p, barreOnde: false }));
    zoneAvec({ source: 'local', track_id: 101 });
    monte = mount(TransportBar, { target: hote! });
    await souffler();
    expect(hote!.querySelector('.progress-track .onde')).toBeNull();
    expect(hote!.querySelector('.progress-fill')).not.toBeNull();
    expect(requetesOnde(101)).toEqual([]);
  });

  it('🔴 Réglages › Interface porte l’interrupteur, et il agit sur la préférence', async () => {
    preferences.update((p) => ({ ...p, barreOnde: false }));
    v2SettingsTarget.set({ tab: 'general' as V2SettingsTabId, section: 'interface' });
    monte = mount(SettingsV2, { target: hote!, props: {} });
    await souffler(14);
    const ligne = hote!.querySelector('[data-reglage="barre-onde"]');
    expect(ligne, 'l’option est absente de Réglages ▸ Interface').not.toBeNull();
    expect(ligne!.textContent).toContain('Waveform progress bar');
    const case_ = ligne!.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
    expect(case_.checked).toBe(false);
    case_.click();
    flushSync();
    expect(get(preferences).barreOnde).toBe(true);
  });

  it('est traduit dans les 15 langues', () => {
    expect(LOCALES_COMPLETES.length).toBe(15);
    for (const [langue, d] of LOCALES_COMPLETES) {
      expect(d['v2.set.barOnde'], `${langue} : libellé`).toBeTruthy();
      expect(d['v2.set.barOndeHint'], `${langue} : aide`).toBeTruthy();
      expect(d['reglages.termes.barreOnde'], `${langue} : synonymes`).toBeTruthy();
    }
    expect(new Set(LOCALES_COMPLETES.map(([, d]) => d['v2.set.barOnde'])).size).toBe(15);
  });
});

describe('#8269 — la barre de lecture du bas', () => {
  it('🔴 piste locale : l’onde, partie jouée découpée à la position, UNE requête', async () => {
    zoneAvec({ source: 'local', track_id: 102 });
    monte = mount(TransportBar, { target: hote! });
    await souffler();
    const piste = hote!.querySelector('.progress-track')!;
    expect(piste.querySelector('.onde'), 'l’onde n’est pas dessinée').not.toBeNull();
    expect(piste.querySelector('.progress-fill')).toBeNull();
    // Mêmes attributs que la barre classique.
    expect(piste.getAttribute('role')).toBe('slider');
    expect(piste.getAttribute('tabindex')).toBe('0');
    expect(piste.getAttribute('aria-valuemax')).toBe('200000');
    expect(piste.getAttribute('aria-valuenow')).toBe('50000');
    expect(piste.querySelector<SVGElement>('.jouee')!.getAttribute('style')).toContain('inset(0 75% 0 0)');
    // Tics de position : toujours une seule requête.
    seekPositionMs.set(60_000);
    zoneAvec({ source: 'local', track_id: 102 });
    await souffler();
    expect(requetesOnde(102)).toHaveLength(1);
  });

  it('🔴 clic sur l’onde : le même seek que la barre classique', async () => {
    zoneAvec({ source: 'local', track_id: 103 });
    monte = mount(TransportBar, { target: hote! });
    await souffler();
    const piste = hote!.querySelector('.progress-track')!;
    expect(piste.querySelector('.onde')).not.toBeNull();
    poserLargeur(piste);
    piste.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 100 }));
    await souffler(3);
    expect(seeks()).toEqual([50_000]);
    expect(get(seekPositionMs)).toBe(50_000);
  });

  it('clavier : → avance de 10 s', async () => {
    zoneAvec({ source: 'local', track_id: 104 });
    monte = mount(TransportBar, { target: hote! });
    await souffler();
    const piste = hote!.querySelector('.progress-track')!;
    piste.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    await souffler(3);
    expect(seeks()).toEqual([60_000]);
  });

  it('🔴 repli : piste Qobuz — barre classique, aucune requête d’onde', async () => {
    zoneAvec({ source: 'qobuz', track_id: 105, source_id: '123' });
    monte = mount(TransportBar, { target: hote! });
    await souffler();
    expect(hote!.querySelector('.progress-track .onde')).toBeNull();
    expect(hote!.querySelector('.progress-fill')).not.toBeNull();
    expect(urls().filter((u) => u.includes('/waveform'))).toEqual([]);
  });

  it('🔴 repli : le serveur répond `waveform: null` — barre classique, jamais redemandée', async () => {
    zoneAvec({ source: 'local', track_id: 901 });
    monte = mount(TransportBar, { target: hote! });
    await souffler();
    expect(hote!.querySelector('.progress-track .onde')).toBeNull();
    expect(hote!.querySelector('.progress-fill')).not.toBeNull();
    unmount(monte); monte = null;
    monte = mount(TransportBar, { target: hote! });
    await souffler();
    expect(requetesOnde(901)).toHaveLength(1);
  });
});

describe('#8269 — l’écran de lecture (SeekBar)', () => {
  it('🔴 l’onde dans le curseur, et le clic cherche à la position', async () => {
    zoneAvec({ source: 'local', track_id: 106 });
    monte = mount(SeekBar, { target: hote!, props: { positionMs: 50_000, durationMs: 200_000 } });
    await souffler();
    const piste = hote!.querySelector('.seek-track')!;
    expect(piste.classList.contains('onde')).toBe(true);
    expect(piste.querySelector('.onde')).not.toBeNull();
    expect(piste.querySelector('.seek-fill')).toBeNull();
    expect(piste.getAttribute('role')).toBe('slider');
    poserLargeur(piste);
    piste.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 300 }));
    await souffler(3);
    expect(seeks()).toEqual([150_000]);
  });

  it('repli : piste radio — la barre classique', async () => {
    zoneAvec({ source: 'radio', track_id: null });
    monte = mount(SeekBar, { target: hote!, props: { positionMs: 0, durationMs: 200_000 } });
    await souffler();
    expect(hote!.querySelector('.seek-track .onde')).toBeNull();
    expect(hote!.querySelector('.seek-fill')).not.toBeNull();
  });
});
