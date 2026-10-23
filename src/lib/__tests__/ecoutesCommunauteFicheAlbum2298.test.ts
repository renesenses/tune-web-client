// @vitest-environment jsdom
//
// renesenses/tune-web-client#2298 — le total des écoutes de la communauté sur
// la FICHE d'un album, lu sur `GET /library/albums/{id}` (le serveur y pose
// `community_listens`, tune-server-rust#6738). Le témoin monte la vraie fiche.
//
// La GRILLE des albums (`LibraryV2`) est gardée ici par sa source : monter la
// bibliothèque entière demanderait tout son environnement. La garde compte
// les trois cartes (grille, carrousel, grille de facette) HORS de l'import.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import AlbumDetailV2 from '../../components/v2/AlbumDetailV2.svelte';
import { locale } from '../i18n';
import type { Album } from '../types';

vi.mock('../api', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  getAlbumTracks: vi.fn(async () => []),
  getStreamingAlbumTracks: vi.fn(async () => []),
  bandcampAlbum: vi.fn(async () => ({ tracks: [] })),
  getAlbumExtendedMetadata: vi.fn(async () => ({})),
}));

const response = (body: unknown) => new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } });
const respirer = () => new Promise((r) => setTimeout(r, 0));
let hote: HTMLDivElement | null = null;
let monte: Record<string, any> | null = null;
let fiche: Record<string, unknown> = {};

beforeEach(() => {
  localStorage.clear();
  locale.set('fr');
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (/\/library\/albums\/57$/.test(url)) return response(fiche);
    if (url.includes('tune-tested.json')) return response({ version: 1, count: 0, devices: [] });
    return response({});
  }));
  hote = document.createElement('div');
  document.body.appendChild(hote);
});

afterEach(async () => {
  if (monte) await unmount(monte);
  monte = null;
  hote?.remove();
  hote = null;
  vi.unstubAllGlobals();
});

async function poser(props: Record<string, unknown>) {
  monte = mount(AlbumDetailV2, { target: hote!, props: props as any });
  for (let i = 0; i < 10; i++) { await respirer(); flushSync(); }
  return hote!;
}

const ALBUM = { id: 57, title: 'Kind of Blue', artist_name: 'Miles Davis', source: 'local' } as Album;

describe('#2298 — la fiche album', () => {
  it('🔴 affiche le total rendu par la fiche locale', async () => {
    fiche = { ...ALBUM, community_listens: 5400 };
    const el = await poser({ album: ALBUM, onClose: () => {} });
    const s = el.querySelector('.facts [data-ecoutes-communaute]');
    expect(s, 'le total des écoutes manque sur la fiche').not.toBeNull();
    expect(s!.textContent!.replace(/\s/g, ' ')).toMatch(/^\(5\s?400\)$/);
  });

  it('rien quand le serveur n’envoie pas le champ', async () => {
    fiche = { ...ALBUM };
    const el = await poser({ album: ALBUM, onClose: () => {} });
    expect(el.querySelector('[data-ecoutes-communaute]')).toBeNull();
  });
});

describe('#2298 — la grille des albums', () => {
  it('chaque carte d’album porte le total, sous le titre', () => {
    const src = readFileSync(join(process.cwd(), 'src/components/v2/LibraryV2.svelte'), 'utf8');
    const cartes = src.match(/<span class="cbot">[^\n]*<EcoutesCommunaute objet=\{a\} \/><\/span>/g) ?? [];
    expect(cartes.length, 'une carte d’album sans le total des écoutes').toBe(3);
    expect(src.match(/<span class="cbot">/g)?.length, 'une carte de plus, sans le total').toBe(3);
  });
});
