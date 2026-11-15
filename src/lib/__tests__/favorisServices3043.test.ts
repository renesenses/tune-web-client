// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import { get } from 'svelte/store';
import StreamingV2 from '../../components/v2/StreamingV2.svelte';
import { activeView } from '../stores/navigation';
import { activeStreamingService, streamingServices } from '../stores/streaming';
import { currentZoneId } from '../stores/zones';
import { preferences } from '../stores/preferences';
import * as lecture from '../lectureEnMasse';

vi.setConfig({ testTimeout: 60_000 });
class ObservateurInerte { observe() {} unobserve() {} disconnect() {} }
const originales = get(preferences);
let hote: HTMLDivElement;
let monte: ReturnType<typeof mount> | null = null;
let service = 'tidal';
let sansDonnees = false;
let livrerSuite: (() => void) | null = null;
const pistes = [
  { source_id: '304301', title: 'Zèbre', artist_name: 'Artiste synthétique',
    duration_ms: 200000, created_at: '2026-01-03T12:00:00Z',
    quality: { codec: 'FLAC', bit_depth: 16, sample_rate: 44100 } },
  { source_id: '304302', title: 'Alpha', artist_name: 'Artiste synthétique',
    duration_ms: 100000, created_at: '2026-01-01T12:00:00Z',
    quality: { codec: 'FLAC', bit_depth: 24, sample_rate: 96000 } },
  { source_id: '304303', title: 'Milieu', artist_name: 'Artiste synthétique' },
];
const reponse = (corps: unknown) => ({
  ok: true, status: 200, statusText: 'OK',
  headers: new Map([['content-type', 'application/json']]),
  json: async () => structuredClone(corps), text: async () => JSON.stringify(corps),
} as unknown as Response);
async function attendre(condition: () => boolean) {
  for (let i = 0; i < 150 && !condition(); i++) {
    await new Promise((r) => setTimeout(r, 0));
    flushSync();
  }
  expect(condition(), 'le vrai écran n’a pas atteint l’état attendu').toBe(true);
}
const titres = () => [...hote.querySelectorAll('#fav-titres .trow .ttxt')].map((e) => e.textContent);
const bouton = (cle: string) => hote.querySelector<HTMLButtonElement>('#fav-titres [data-tri="' + cle + '"]');
async function trier(cle: string) {
  const b = bouton(cle);
  expect(b, '#3043 : en-tête de tri absent pour ' + cle).not.toBeNull();
  b!.click(); flushSync();
  await new Promise((r) => setTimeout(r, 0)); flushSync();
}
async function ouvrir() {
  monte = mount(StreamingV2, { target: hote });
  await attendre(() => !![...hote.querySelectorAll('nav.subs button')].find((b) => /favor/i.test(b.textContent ?? '')));
  const favori = [...hote.querySelectorAll<HTMLButtonElement>('nav.subs button')].find((b) => /favor/i.test(b.textContent ?? ''))!;
  favori.click(); flushSync();
  await attendre(() => titres().length === (sansDonnees ? 1 : 2));
}

beforeEach(() => {
  sansDonnees = false; livrerSuite = null;
  localStorage.clear();
  vi.stubGlobal('ResizeObserver', ObservateurInerte);
  vi.stubGlobal('IntersectionObserver', ObservateurInerte);
  vi.stubGlobal('fetch', vi.fn(async (url: unknown) => {
    const u = String(url);
    if (u.includes('/ext/bandcamp/tags')) throw new Error('extension non chargée');
    if (u.includes('/streaming/services')) return reponse({ [service]: { enabled: true, authenticated: true } });
    if (u.includes('/favorites/tracks')) {
      if (sansDonnees) return reponse({ tracks: [pistes[2]], total: 1 });
      if (u.includes('?')) return reponse({ tracks: pistes.slice(0, 2), total: 3 });
      await new Promise<void>((resolve) => { livrerSuite = resolve; });
      return reponse({ tracks: pistes, total: 3 });
    }
    if (u.includes('/favorites/albums')) return reponse({ albums: [], total: 0 });
    if (u.includes('/favorites/artists')) return reponse({ artists: [], total: 0 });
    if (u.includes('/config')) return reponse({});
    return reponse([]);
  }));
  vi.spyOn(lecture, 'lireListeDepuis').mockResolvedValue(0);
  preferences.set({ ...originales, settingsLevel: 'expert',
    v2Colonnes: { ...originales.v2Colonnes, expert: ['title', 'artist', 'time', 'quality', 'bpm'] } });
  activeStreamingService.set(null); streamingServices.set({});
  currentZoneId.set(3043); activeView.set('streaming');
  hote = document.createElement('div'); document.body.appendChild(hote);
});
afterEach(async () => {
  livrerSuite?.();
  if (monte) await unmount(monte);
  monte = null; hote.remove();
  preferences.set(originales); currentZoneId.set(null);
  vi.unstubAllGlobals(); vi.restoreAllMocks();
});

describe('#3043 — favoris des services, vrai écran et vrai mapping API', () => {
  it.each(['tidal', 'qobuz'])('%s : données, tris et ordre de lecture suivent le chargement progressif', async (source) => {
    service = source;
    await ouvrir();
    expect(titres()).toEqual(['Zèbre', 'Alpha']);
    expect(bouton('title'), '#3043 : les favoris du service ne proposent aucun tri').not.toBeNull();
    expect(hote.querySelector('#fav-titres')?.textContent).toContain('3:20');
    expect(hote.querySelector('#fav-titres')?.textContent).toContain('1:40');
    expect(hote.querySelector('#fav-titres')?.textContent).toContain('2026-01-03');
    expect(bouton('quality'), 'qualité reçue mais non affichée').not.toBeNull();
    expect(bouton('bpm'), 'colonne vide encore affichée').toBeNull();

    await trier('title');
    expect(titres()).toEqual(['Alpha', 'Zèbre']);
    await attendre(() => livrerSuite != null);
    livrerSuite!();
    await attendre(() => titres().length === 3);
    expect(titres()).toEqual(['Alpha', 'Milieu', 'Zèbre']);

    await trier('time');
    expect(titres()).toEqual(['Alpha', 'Zèbre', 'Milieu']);
    await trier('time');
    expect(titres()).toEqual(['Zèbre', 'Alpha', 'Milieu']);
    await trier('added');
    expect(titres()).toEqual(['Alpha', 'Zèbre', 'Milieu']);
    await trier('quality');
    expect(titres()).toEqual(['Zèbre', 'Alpha', 'Milieu']);
    await trier('quality');
    expect(titres()).toEqual(['Alpha', 'Zèbre', 'Milieu']);

    hote.querySelectorAll<HTMLButtonElement>('#fav-titres .trow .titre')[1].click();
    await attendre(() => vi.mocked(lecture.lireListeDepuis).mock.calls.length > 0);
    const [liste, depart] = vi.mocked(lecture.lireListeDepuis).mock.calls.at(-1)!;
    expect(liste.map((p) => p.title)).toEqual(['Alpha', 'Zèbre', 'Milieu']);
    expect(depart).toBe(1);
  });

  it('masque durée, qualité et ajout si le service ne donne aucune valeur', async () => {
    service = 'tidal'; sansDonnees = true;
    await ouvrir();
    expect(titres()).toEqual(['Milieu']);
    expect(bouton('title')).not.toBeNull();
    for (const cle of ['time', 'quality', 'added', 'bpm']) expect(bouton(cle)).toBeNull();
  });
});

