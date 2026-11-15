// @vitest-environment jsdom
//
/**
 * web#2883 — décision de Bertrand du 12/11/2026 : la bande « Albums favoris »
 * de l'Accueil ne montre QUE des albums. Un profil sans album favori ne l'a
 * PAS — ni « Rien à montrer ici pour l'instant. », ni le repli de #1509 sur
 * ses artistes ou ses pistes favoris sous un titre qui dit « Albums ».
 *
 * Monté sur la VRAIE page (`PageWidgets`) : une garde sur `charger` seul
 * resterait verte si la page affichait encore la bande vide.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import * as api from '../api';
import { widgetParId } from '../accueilWidgets';
import PageWidgets from '../../components/v2/PageWidgets.svelte';
import { currentProfileId } from '../stores/profile';

const VIDE = { tracks: [], albums: [], artists: [], playlists: [], smartPlaylistIds: [] } as any;
const ARTISTE = { id: 7, name: 'Nick Cave', image_path: '/a/7.jpg' };
const PISTE = { id: 42, album_id: 12, title: 'Around the World', artist_name: 'Daft Punk', cover_path: '/c/12.jpg' };
const ALBUM = { id: 12, title: 'Homework', artist_name: 'Daft Punk', cover_path: '/c/12.jpg' };

function poserLeServeur() {
  // Tout le reste de la page (préférences, profils…) : une réponse vide.
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: new Map([['content-type', 'application/json']]),
      json: async () => ({}),
      text: async () => '{}',
    })) as any,
  );
}

const souffler = (ms = 40) => new Promise((r) => setTimeout(r, ms));
async function laisserCharger() {
  for (let i = 0; i < 5; i++) {
    await souffler();
    flushSync();
  }
}

let hote: HTMLDivElement | null = null;
let monte: Record<string, any> | null = null;

async function accueil(locaux: any) {
  vi.spyOn(api, 'getFavorites').mockResolvedValue(locaux);
  vi.spyOn(api, 'getProfileStreamingFavorites').mockResolvedValue([]);
  const ws = ['favoris', 'favoris-artistes'].map((i) => widgetParId(i)!);
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(PageWidgets, {
    target: hote,
    props: { catalogue: ws, dispositionDefaut: ws.map((w) => w.id), cle: 'accueil_2883_test' } as any,
  });
  flushSync();
  await laisserCharger();
  return hote;
}

const titresDesBandes = (h: HTMLElement) =>
  [...h.querySelectorAll<HTMLElement>('section.bloc h2')].map((e) => e.textContent?.trim());

beforeEach(() => {
  vi.restoreAllMocks();
  currentProfileId.set(1);
  poserLeServeur();
});

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  hote?.remove();
  hote = null;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('web#2883 — « Albums favoris » masquée sans album favori', () => {
  it('🔴 aucun album favori (mais des artistes et des pistes) ⇒ la bande est ABSENTE', async () => {
    const page = await accueil({ ...VIDE, artists: [ARTISTE], tracks: [PISTE] });
    const titres = titresDesBandes(page);
    expect(titres, 'la bande « Artistes favoris » doit rester').toContain('Artistes favoris');
    expect(titres, 'la bande « Albums favoris » est encore rendue').not.toContain('Albums favoris');
    expect(page.textContent, 'plus de « Rien à montrer » à la place').not.toContain('Rien à montrer ici');
    // Le repli de #1509 est retiré : aucun artiste ni piste sous « Albums favoris ».
    expect(await widgetParId('favoris')!.charger({ profileId: 1, langue: 'fr', albums: [], zones: [] } as any)).toEqual([]);
  });

  it('des albums favoris ⇒ la bande est PRÉSENTE, avec ses albums', async () => {
    const page = await accueil({ ...VIDE, albums: [ALBUM], artists: [ARTISTE] });
    expect(titresDesBandes(page)).toContain('Albums favoris');
    const bande = [...page.querySelectorAll<HTMLElement>('section.bloc')].find(
      (s) => s.querySelector('h2')?.textContent?.trim() === 'Albums favoris',
    )!;
    expect([...bande.querySelectorAll('.carte .ct')].map((e) => e.textContent?.trim())).toEqual(['Homework']);
  });
});
