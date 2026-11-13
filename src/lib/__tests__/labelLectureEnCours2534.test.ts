// @vitest-environment jsdom
//
// web#2534 — « Lecture en cours : afficher le label de l'album, avec un lien
// vers le label dans la Bibliothèque » (ancienne web#2522, demande de
// Bertrand, réunion communautaire du 29/10).
//
// Le label se lit sur la piste quand elle le porte, sinon sur l'album de la
// bibliothèque (`GET /library/albums/{id}`). Sans label connu, rien n'est
// affiché — pas de ligne vide, pas de lien mort.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import NowPlaying from '../../components/partages/NowPlaying.svelte';
import { zones, currentZoneId } from '../stores/zones';
import { activeView } from '../stores/navigation';
import { queueTracks } from '../stores/queue';
import { locale } from '../i18n';
import { get } from 'svelte/store';

const LOCALE = {
  track_id: 77, album_id: 5, artist_id: 3,
  title: 'It’s No Good', artist_name: 'Depeche Mode', album_title: 'Ultra',
  // Une pochette connue : `AlbumArt` ne relit alors pas l'album pour la trouver,
  // et le compteur ne voit que la lecture du label.
  cover_path: 'covers/ultra.jpg',
  source: 'local', duration_ms: 298000,
};

let hote: HTMLDivElement | null = null;
let monte: Record<string, any> | null = null;
let albumLu: Record<string, unknown> = {};
let appelsAlbum = 0;

function reponse(url: string): Response {
  let corps: unknown = /\/(zones|profiles|devices|playlists|shortcuts|search)(\?|$)/.test(url) ? [] : {};
  if (/\/queue/.test(url)) corps = { tracks: [], position: 0, length: 0 };
  if (/\/(credits|history|favorites|plays)/.test(url)) corps = [];
  if (/\/library\/albums\/5$/.test(url)) { appelsAlbum += 1; corps = albumLu; }
  return {
    ok: true, status: 200, statusText: 'OK',
    headers: new Map([['content-type', 'application/json']]),
    json: async () => corps, text: async () => JSON.stringify(corps),
  } as unknown as Response;
}

async function poser(piste: Record<string, unknown>): Promise<HTMLElement> {
  zones.set([{ id: 1, name: 'Salon', state: 'playing', current_track: piste, position_ms: 12000 }] as any);
  currentZoneId.set(1);
  queueTracks.set([] as any);
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(NowPlaying, { target: hote, props: {} as any });
  flushSync();
  await vi.waitFor(() => { flushSync(); expect(hote?.querySelector('.track-album-ligne')).not.toBeNull(); });
  return hote;
}

beforeEach(() => {
  locale.set('fr');
  albumLu = {};
  appelsAlbum = 0;
  vi.stubGlobal('fetch', vi.fn(async (entree: unknown) =>
    reponse(String(typeof entree === 'string' ? entree : (entree as Request)?.url ?? entree))));
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
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('web#2534 — le label dans Lecture en cours', () => {
  it('🔴 album de la bibliothèque : le label est lu sur l’album et ouvre la Bibliothèque sur ce label', async () => {
    albumLu = { id: 5, title: 'Ultra', label: 'Mute' };
    const facettes: any[] = [];
    const ecoute = (e: Event) => facettes.push((e as CustomEvent).detail);
    window.addEventListener('tune:v2-facette', ecoute);
    const racine = await poser(LOCALE);
    await vi.waitFor(() => { flushSync(); expect(racine.querySelector('[data-np-label]')).not.toBeNull(); });
    const ligne = racine.querySelector('[data-np-label]')!;
    expect(ligne.textContent).toContain('Mute');
    const lien = ligne.querySelector('[role="link"]') as HTMLElement;
    expect(lien, 'le label n’est pas un lien').not.toBeNull();
    lien.click();
    await vi.waitFor(() => expect(facettes).toHaveLength(1), { timeout: 3000 });
    window.removeEventListener('tune:v2-facette', ecoute);
    expect(get(activeView)).toBe('library');
    expect(facettes[0]).toMatchObject({ onglet: 'labels', valeur: 'Mute' });
    expect(appelsAlbum).toBe(1);
  });

  it('la piste qui porte son label n’interroge pas l’album', async () => {
    const racine = await poser({ ...LOCALE, label: 'Sire' });
    await vi.waitFor(() => { flushSync(); expect(racine.querySelector('[data-np-label]')?.textContent).toContain('Sire'); });
    expect(appelsAlbum).toBe(0);
  });

  it('sans label connu : aucune ligne', async () => {
    albumLu = { id: 5, title: 'Ultra', label: '  ' };
    const racine = await poser(LOCALE);
    await vi.waitFor(() => { flushSync(); expect(appelsAlbum).toBe(1); });
    await new Promise((r) => setTimeout(r, 20));
    flushSync();
    expect(racine.querySelector('[data-np-label]')).toBeNull();
  });
});
