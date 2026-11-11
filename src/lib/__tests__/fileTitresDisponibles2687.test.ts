// @vitest-environment jsdom
//
// web#2687 — FabienM, fil « v1.0.0rc10: Divers bugs », point 18 (07/11/2026) :
// quand on lance un album MIXTE (titres disponibles, « Indisponible » ou « À
// paraître », fréquent chez Qobuz), la file ne doit contenir que les titres
// disponibles. Les titres grisés restent affichés, mais ne partent pas.
//
// Deux étages : les fonctions qui fabriquent les corps (Tout lire, Aléatoire,
// Lire à partir d'ici, Ajouter à la file), puis la VRAIE fiche d'album de
// service, montée, dont on clique « Lire » et « Aléatoire ».
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import AlbumDetailV2 from '../../components/v2/AlbumDetailV2.svelte';
import * as api from '../api';
import { preferences } from '../stores/preferences';
import { currentZoneId } from '../stores/zones';
import { locale } from '../i18n';
import lFrBrut from '../locales/fr';
import { lireListeDepuis, pistesJouables, planDeLecture } from '../lectureEnMasse';
import { corpsDeFileListe } from '../pisteFile';
import type { Album, Track } from '../types';

vi.mock('../api', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  getAlbumTracks: vi.fn(async () => []),
  getStreamingAlbumTracks: vi.fn(async () => []),
  getAlbumExtendedMetadata: vi.fn(async () => ({})),
  play: vi.fn(async () => ({ id: 7 })),
  addToQueue: vi.fn(async () => ({})),
  getZone: vi.fn(async () => ({ id: 7 })),
}));

const q = (sid: string, n: number, disponible?: boolean) =>
  ({ id: null, source: 'qobuz', source_id: sid, title: `T${n}`, track_number: n, disc_number: 1,
     duration_ms: 1000, ...(disponible === undefined ? {} : { disponible }) }) as unknown as Track;
// 1 dispo, 2 indisponible, 3 dispo (champ absent = on ne sait pas = jouable), 4 à paraître.
const MIXTE = [q('a', 1, true), q('b', 2, false), q('c', 3), q('d', 4, false)];
const lFr = lFrBrut as Record<string, string>;
const sids = (corps: any) => (corps?.tracks ?? []).map((t: any) => t.source_id);

describe('web#2687 — corps de lecture et de file', () => {
  it('pistesJouables écarte les titres `disponible === false`, garde ceux dont le service n’a rien dit', () => {
    expect(pistesJouables(MIXTE).map((t) => t.source_id)).toEqual(['a', 'c']);
  });

  it('« Tout lire » : la tête est le 1er titre disponible, la suite n’enfile que les disponibles', () => {
    const plan = planDeLecture(MIXTE);
    expect(plan.voie).toBe('tete-et-reste');
    if (plan.voie !== 'tete-et-reste') return;
    expect(plan.tete).toMatchObject({ source: 'qobuz', source_id: 'a' });
    expect(sids(plan.reste)).toEqual(['c']);
    expect(plan.pistes).toBe(2);
  });

  it('« Ajouter à la file » (corpsDeFileListe) n’enfile pas les titres grisés', () => {
    expect(sids(corpsDeFileListe(MIXTE))).toEqual(['a', 'c']);
    expect(corpsDeFileListe([q('b', 2, false)])).toBeNull();
  });

  it('« Lire à partir d’ici » ne met aucun titre grisé en file', async () => {
    const lus: any[] = [], enfiles: any[] = [];
    await lireListeDepuis(MIXTE, 0, { lire: async (c) => { lus.push(c); }, enfiler: async (c) => { enfiles.push(c); } });
    expect(lus).toHaveLength(1);
    expect(lus[0]).toMatchObject({ source_id: 'a' });
    expect(enfiles.flatMap(sids)).toEqual(['c']);
  });
});

describe('web#2687 — la vraie fiche d’un album Qobuz mixte', () => {
  let hote: HTMLDivElement | null = null;
  let monte: Record<string, any> | null = null;
  const respirer = () => new Promise((r) => setTimeout(r, 0));

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true, status: 200, statusText: 'OK',
      headers: new Map([['content-type', 'application/json']]),
      json: async () => ({}), text: async () => '{}',
    } as unknown as Response)));
    locale.set('fr');
    preferences.update((p) => ({ ...p, settingsLevel: 'expert' }));
    vi.mocked(api.play).mockClear();
    vi.mocked(api.addToQueue).mockClear();
    currentZoneId.set(7);
  });
  afterEach(() => {
    if (monte) unmount(monte);
    monte = null;
    hote?.remove();
    hote = null;
    vi.unstubAllGlobals();
  });

  async function ouvrir(pistes: Track[]): Promise<HTMLDivElement> {
    vi.mocked(api.getStreamingAlbumTracks).mockResolvedValue(pistes as any);
    hote = document.createElement('div');
    document.body.appendChild(hote);
    monte = mount(AlbumDetailV2, {
      target: hote,
      props: { album: { id: null, source: 'qobuz', source_id: 'alb-1', title: 'Mixte' } as unknown as Album,
               service: 'qobuz', onClose: () => {} },
    });
    for (let i = 0; i < 8; i++) await respirer();
    flushSync();
    return hote;
  }
  const corpsLus = () => vi.mocked(api.play).mock.calls.map((c) => c[1] as any);
  const sidsEnfiles = () => vi.mocked(api.addToQueue).mock.calls.flatMap((c) => sids(c[1]));

  it('🔴 « Lire » : plus de `streaming_album_id`, seuls les titres disponibles partent, en contexte d’album', async () => {
    const el = await ouvrir(MIXTE);
    el.querySelector<HTMLButtonElement>('[data-bouton-lecture] button.bl-lire')!.click();
    for (let i = 0; i < 6; i++) await respirer();
    expect(corpsLus()).toHaveLength(1);
    expect(corpsLus()[0].streaming_album_id).toBeUndefined();
    expect(corpsLus()[0]).toMatchObject({ source: 'qobuz', source_id: 'a', context_type: 'album', context_id: 'alb-1' });
    expect(sidsEnfiles()).toEqual(['c']);
  });

  it('🔴 « Aléatoire » : la file mélangée ne contient aucun titre grisé', async () => {
    const el = await ouvrir(MIXTE);
    const alea = [...el.querySelectorAll<HTMLButtonElement>('button.ghost')]
      .find((b) => b.title === lFr['v2.album.shuffleTip']);
    expect(alea, 'bouton « Aléatoire » introuvable').toBeTruthy();
    alea!.click();
    for (let i = 0; i < 6; i++) await respirer();
    const tous = [...corpsLus().map((c) => c.source_id), ...sidsEnfiles()];
    expect(tous.sort()).toEqual(['a', 'c']);
  });

  it('témoin : album entièrement disponible → `streaming_album_id`, comme avant', async () => {
    const el = await ouvrir([q('a', 1, true), q('c', 2)]);
    el.querySelector<HTMLButtonElement>('[data-bouton-lecture] button.bl-lire')!.click();
    for (let i = 0; i < 6; i++) await respirer();
    expect(corpsLus()[0]).toMatchObject({ streaming_album_id: 'alb-1', source: 'qobuz', start_index: 0 });
    expect(api.addToQueue).not.toHaveBeenCalled();
  });
});
