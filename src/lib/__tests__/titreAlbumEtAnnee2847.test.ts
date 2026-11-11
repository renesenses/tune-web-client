// @vitest-environment jsdom
//
// web#2847 (FabienM, fil 2723 point 16, rc11) — dans « Lecture en cours », un
// clic sur le titre de l'album menait à la Bibliothèque filtrée sur l'année au
// lieu de la page de l'album.
//
// L'année « (AAAA) » vivait DANS le bouton de l'album : une seule zone de
// survol et de soulignement pour deux gestes, et un clic en fin de titre
// tombait sur l'année. Attendu : titre → album, année → filtre, deux zones
// DISTINCTES — l'année n'est plus une descendante du bouton de l'album.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import { get } from 'svelte/store';
import NowPlaying from '../../components/partages/NowPlaying.svelte';
import { zones, currentZoneId } from '../stores/zones';
import { activeView, pendingLibraryAlbum, pendingLibraryYear } from '../stores/navigation';

const PISTE = {
  track_id: 901,
  id: 901,
  album_id: 55,
  artist_id: 7,
  title: 'Shine On',
  artist_name: 'Pink Floyd',
  album_title: 'Wish You Were Here',
  year: 1975,
  source: 'local',
  duration_ms: 321000,
};
const ZONE = { id: 1, name: 'Salon', state: 'playing', current_track: PISTE, position_ms: 1000 };

let hote: HTMLDivElement | null = null;
let monte: Record<string, any> | null = null;

function reponse(url: string) {
  const corps = /\/(zones|profiles|devices|playlists|shortcuts|search)/.test(url) ? []
    : /\/albums\/55(\?|$)/.test(url) ? { id: 55, title: 'Wish You Were Here', year: 1975 }
    : {};
  return {
    ok: true, status: 200, statusText: 'OK',
    headers: new Map([['content-type', 'application/json']]),
    json: async () => corps, text: async () => JSON.stringify(corps),
  } as unknown as Response;
}

const respirer = (ms = 80) => new Promise((r) => setTimeout(r, ms));

function poser(): HTMLDivElement {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(NowPlaying, { target: hote, props: {} as any });
  flushSync();
  return hote;
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => reponse(String(url))));
  vi.stubGlobal('WebSocket', class { close(){} addEventListener(){} removeEventListener(){} send(){} } as any);
  vi.stubGlobal('ResizeObserver', class { observe(){} unobserve(){} disconnect(){} } as any);
  zones.set([ZONE] as any);
  currentZoneId.set(1);
  activeView.set('nowplaying');
  pendingLibraryAlbum.set(null);
  pendingLibraryYear.set(null);
});

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  if (hote) hote.remove();
  hote = null;
  pendingLibraryAlbum.set(null);
  pendingLibraryYear.set(null);
  vi.unstubAllGlobals();
});

describe('web#2847 — titre de l’album et année : deux gestes, deux zones', () => {
  it('🔴 l’année n’est PAS dans le bouton de l’album (zones de clic distinctes)', async () => {
    const h = poser();
    await respirer();
    const bouton = h.querySelector<HTMLButtonElement>('button.track-album');
    expect(bouton, 'le titre d’album n’est pas rendu — témoin sans objet').not.toBeNull();
    const annee = h.querySelector<HTMLElement>('.track-year');
    expect(annee, 'l’année n’est pas rendue — témoin sans objet').not.toBeNull();
    expect(bouton!.contains(annee), 'l’année est encore DANS le bouton de l’album').toBe(false);
    expect(bouton!.textContent?.trim()).toBe('Wish You Were Here');
    // L'infobulle du bouton ne promet plus l'année : elle ne s'y ouvre pas.
    expect(bouton!.getAttribute('title')).toBe('Wish You Were Here');
  });

  it('clic sur le titre → la page de l’album, sans filtre d’année', async () => {
    const h = poser();
    await respirer();
    h.querySelector<HTMLButtonElement>('button.track-album')!.click();
    await respirer(150);
    expect(get(pendingLibraryAlbum)).toBe(55);
    expect(get(pendingLibraryYear), 'le titre a posé un filtre d’année').toBeNull();
    expect(get(activeView)).toBe('library');
  });

  it('clic sur l’année → la Bibliothèque filtrée sur l’année, sans ouvrir l’album', async () => {
    const h = poser();
    await respirer();
    const lien = h.querySelector<HTMLElement>('.track-year [role="link"]');
    expect(lien, 'l’année n’est pas un lien').not.toBeNull();
    lien!.click();
    await respirer(150);
    expect(get(pendingLibraryYear)).toBe(1975);
    expect(get(pendingLibraryAlbum), 'l’année a ouvert l’album').toBeNull();
    expect(get(activeView)).toBe('library');
  });
});
