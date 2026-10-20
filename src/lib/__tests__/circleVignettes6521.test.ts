// @vitest-environment jsdom
//
// tune-server-rust#6521 — les pochettes des albums d'une bibliothèque amie
// (décision de Bertrand du 19/10/2026, qui complète la décision 4 du 28/09).
//
// Cover Art Archive par MBID laissait 95 à 100 % des albums partagés sans
// pochette (renesenses/tune-web-client#2222). Le serveur du propriétaire
// envoie désormais une petite vignette par album au cloud ; l'écran essaie :
//
//   1. la vignette du cloud, relayée par NOTRE serveur ;
//   2. Cover Art Archive par le MBID ;
//   3. l'icône générique.
//
// Ce témoin MONTE `AlbumArt` et déclenche l'évènement `error` de son `<img>`,
// comme le navigateur sur une vignette absente : il regarde le `src` qui en
// résulte, pas une ligne de source.
//
// Refs renesenses/tune-server-rust#6521, renesenses/tune-web-client#2219
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import AlbumArt from '../../components/partages/AlbumArt.svelte';
import {
  albumContact, pochettesAlbumContact, pochetteAlbumContact, reprisePochetteAlbumContact,
  getPartagePochettes, reglerPartagePochettes,
} from '../circle';

const SHA = 'ab'.repeat(32);
const MBID = '8e8a594c-3a4e-3d2c-8a3a-5b1c3c3f0a10';
const CAA = `https://coverartarchive.org/release-group/${MBID}/front-250`;
const VIGNETTE = `/api/v1/ext/circle/contacts/7/library/albums/10/thumbnail?v=${SHA.slice(0, 16)}`;

describe('l’ordre des sources', () => {
  it('vignette du cloud, puis Cover Art Archive', () => {
    const a = albumContact({ id: 10, title: 'Kind of Blue', musicbrainz_release_group_id: MBID, thumbnail: SHA });
    expect(pochettesAlbumContact(a, 7)).toEqual([VIGNETTE, CAA]);
    expect(pochetteAlbumContact(a, 7)).toBe(VIGNETTE);
    expect(reprisePochetteAlbumContact(a, 7)).toBe(CAA);
  });

  it('sans vignette : Cover Art Archive seul ; sans rien : aucune source', () => {
    const a = albumContact({ id: 10, title: 'x', musicbrainz_release_group_id: MBID, thumbnail: null });
    expect(pochettesAlbumContact(a, 7)).toEqual([CAA]);
    expect(reprisePochetteAlbumContact(a, 7)).toBeNull();
    const b = albumContact({ id: 11, title: 'y' });
    expect(pochettesAlbumContact(b, 7)).toEqual([]);
    expect(pochetteAlbumContact(b, 7)).toBeNull();
  });

  it('une vignette seule, sans MBID : elle, puis rien', () => {
    const a = albumContact({ id: 10, title: 'x', thumbnail: SHA });
    expect(pochettesAlbumContact(a, 7)).toEqual([VIGNETTE]);
  });

  it('une empreinte mal formée ne fabrique aucune adresse', () => {
    for (const t of ['../../etc', SHA + '0', 'zz'.repeat(32), 42, { a: 1 }]) {
      const a = albumContact({ id: 10, title: 'x', musicbrainz_release_group_id: MBID, thumbnail: t });
      expect(a.thumbnail).toBeNull();
      expect(pochettesAlbumContact(a, 7)).toEqual([CAA]);
    }
    // Sans contact connu, pas d'adresse de vignette non plus.
    const a = albumContact({ id: 10, title: 'x', thumbnail: SHA });
    expect(pochettesAlbumContact(a, null)).toEqual([]);
  });
});

describe('AlbumArt : la vignette absente cède la place à Cover Art Archive, puis à l’icône', () => {
  let hote: HTMLDivElement | null = null;
  let monte: Record<string, unknown> | null = null;

  afterEach(() => {
    if (monte) unmount(monte);
    hote?.remove();
    monte = null;
    hote = null;
  });

  function poser(props: Record<string, unknown>) {
    hote = document.createElement('div');
    document.body.appendChild(hote);
    monte = mount(AlbumArt, { target: hote, props: props as never });
    flushSync();
  }
  const img = () => hote?.querySelector('img') ?? null;
  const echouer = () => { img()!.dispatchEvent(new Event('error')); flushSync(); };

  it('vignette → CAA (par le relais) → icône générique, sans boucle', () => {
    poser({ coverPath: VIGNETTE, repli: CAA, albumId: null, size: 0, alt: 'Kind of Blue' });
    expect(img()?.getAttribute('src')).toBe(VIGNETTE);
    echouer();
    expect(img()?.getAttribute('src')).toBe(`/api/v1/library/artwork/proxy?url=${encodeURIComponent(CAA)}`);
    echouer();
    expect(img()).toBeNull();
    expect(hote?.querySelector('.placeholder')).not.toBeNull();
  });

  it('sans repli : comme avant, l’icône dès le premier échec', () => {
    poser({ coverPath: VIGNETTE, albumId: null, size: 0, alt: 'x' });
    echouer();
    expect(img()).toBeNull();
  });
});

describe('le réglage « Partager les pochettes avec mon cercle »', () => {
  let appels: { url: string; method: string; body: unknown }[] = [];
  let reponse: { status: number; body: unknown } = { status: 200, body: {} };

  beforeEach(() => {
    appels = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      appels.push({ url: String(url), method: init?.method ?? 'GET', body: init?.body ? JSON.parse(String(init.body)) : null });
      return new Response(JSON.stringify(reponse.body), { status: reponse.status, headers: { 'Content-Type': 'application/json' } });
    }));
  });
  afterEach(() => vi.unstubAllGlobals());

  it('lu activé par défaut, coupé seulement par un enabled:false explicite', async () => {
    reponse = { status: 200, body: { enabled: true, default: true } };
    expect(await getPartagePochettes()).toBe(true);
    reponse = { status: 200, body: {} };
    expect(await getPartagePochettes()).toBe(true);
    reponse = { status: 200, body: { enabled: false } };
    expect(await getPartagePochettes()).toBe(false);
    expect(appels.every((a) => a.url.endsWith('/ext/circle/artwork-sharing'))).toBe(true);
  });

  it('un greffon qui ne le connaît pas (404) : null, l’écran n’en montre rien', async () => {
    reponse = { status: 404, body: { code: 'circle.not_found' } };
    expect(await getPartagePochettes()).toBeNull();
  });

  it('le couper envoie PUT { enabled: false }', async () => {
    reponse = { status: 200, body: { enabled: false, purged: true } };
    await reglerPartagePochettes(false);
    expect(appels).toEqual([{ url: expect.stringMatching(/\/ext\/circle\/artwork-sharing$/), method: 'PUT', body: { enabled: false } }]);
  });
});
