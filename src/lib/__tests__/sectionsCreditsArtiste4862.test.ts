// @vitest-environment jsdom
//
// « COLLABORATIONS » ET « REPRISES » DE LA PAGE ARTISTE — suite de
// renesenses/tune-server-rust#4767 (FabienM, fils forum 1875 / 1906), données
// servies par tune-server-rust#4862 dans `GET /library/artists/{id}/albums?sections=1` :
//
//   collaborations: [{artist_id, artist_name, albums: [album…]}]
//   covers: [album…]
//
// chaque album portant `focus_track_ids` et `credit_roles`. Sur ces disques,
// `tracks.artist_id` désigne l'artiste PRINCIPAL : le focus de la fiche
// d'album doit filtrer sur `focus_track_ids`, jamais sur l'artiste de piste.
//
// 🔴 CES TÉMOINS MONTENT la grille et la fiche d'album, et CLIQUENT.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import DiscographieCommune from '../../components/v2/DiscographieCommune.svelte';
import AlbumDetailV2 from '../../components/v2/AlbumDetailV2.svelte';
import { focusDeSection, rangsDuFocus, type FocusArtiste } from '../focusArtiste';
import { sectionsDepuisReponse } from '../api';
import type { Album } from '../types';
import lFr from '../locales/fr';

vi.setConfig({ testTimeout: 30_000 });

const fr = lFr as unknown as Record<string, string>;
const al = (o: Record<string, unknown>) => o as unknown as Album;

/** Neil Young (id 1) guitariste invité chez CSN, auteur repris par deux autres. */
const DEJA_VU = al({
  id: 55, title: 'Déjà Vu', artist_id: 3, artist_name: 'Crosby, Stills & Nash', year: 1970, source: 'local',
  focus_track_ids: [502, 504], credit_roles: ['guitar', 'vocals'],
});
const CSN_LIVE = al({
  id: 56, title: '4 Way Street', artist_id: 3, artist_name: 'Crosby, Stills & Nash', year: 1971, source: 'local',
  focus_track_ids: [601], credit_roles: ['guitar'],
});
const HARVEST_MOON_COVER = al({
  id: 70, title: 'Helpless Covers', artist_id: 9, artist_name: 'k.d. lang', year: 2004, source: 'local',
  focus_track_ids: [701], credit_roles: ['composer', 'writer'],
});

const SECTIONS = {
  collaborations: [
    { artist_id: 3, artist_name: 'Crosby, Stills & Nash', albums: [DEJA_VU, CSN_LIVE] },
  ],
  covers: [HARVEST_MOON_COVER],
};

class ResizeObserverInerte {
  observe() {}
  unobserve() {}
  disconnect() {}
}

let hote: HTMLDivElement | null = null;
let monte: ReturnType<typeof mount> | null = null;

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', ResizeObserverInerte);
  vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } })));
});

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  hote?.remove();
  hote = null;
  vi.unstubAllGlobals();
});

function poserGrille(props: Record<string, unknown>): HTMLDivElement {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(DiscographieCommune, { target: hote, props: { onOuvrir: () => {}, onLire: () => {}, ...props } as any });
  flushSync();
  return hote;
}

const titresDe = (racine: Element | null) =>
  [...(racine?.querySelectorAll('.ct') ?? [])].map((n) => n.textContent?.trim());

describe('#4862 — la réponse du serveur se lit, avec ou sans les nouvelles clés', () => {
  it('les deux clés passent telles quelles', () => {
    const r = sectionsDepuisReponse({ albums: [], ...SECTIONS });
    expect(r.collaborations).toHaveLength(1);
    expect(r.collaborations![0].albums).toHaveLength(2);
    expect(r.covers).toHaveLength(1);
  });

  it('un serveur v0.9.163 (sans les clés) : sections absentes, rien ne tombe', () => {
    const r = sectionsDepuisReponse({ albums: [{ id: 1 }], compilations: [{ id: 2 }] });
    expect(r.collaborations).toBeUndefined();
    expect(r.covers).toBeUndefined();
    expect(sectionsDepuisReponse([{ id: 1 }]).collaborations).toBeUndefined();
  });
});

describe('#4862 — la grille rend « Collaborations » et « Reprises »', () => {
  it('rendues depuis la réponse : une sous-section « Avec {artiste} » et les rôles', () => {
    const h = poserGrille({ collaborations: SECTIONS.collaborations, reprises: SECTIONS.covers });
    const collab = h.querySelector('[data-section="collaborations"]');
    expect(collab, 'la section « Collaborations » n’est pas rendue').not.toBeNull();
    expect(collab!.querySelector('h3')!.textContent).toContain(fr['v2.disco.collaborations']);
    expect(collab!.querySelector('h3 .cpt')!.textContent).toBe('2');
    const groupe = collab!.querySelector('.groupe');
    expect(groupe!.querySelector('h4')!.textContent).toBe(
      fr['v2.disco.withArtist'].replace('{artist}', 'Crosby, Stills & Nash'),
    );
    expect(titresDe(groupe)).toEqual(expect.arrayContaining(['Déjà Vu', '4 Way Street']));
    expect(collab!.textContent, 'les rôles ne sont pas montrés').toContain('guitar · vocals');

    const rep = h.querySelector('[data-section="reprises"]');
    expect(rep, 'la section « Reprises » n’est pas rendue').not.toBeNull();
    expect(rep!.querySelector('h3')!.textContent).toContain(fr['v2.disco.covers']);
    expect(titresDe(rep)).toEqual(['Helpless Covers']);
  });

  it('sans les clés (serveur v0.9.163) : aucune des deux sections', () => {
    const h = poserGrille({});
    expect(h.querySelector('[data-section="collaborations"]')).toBeNull();
    expect(h.querySelector('[data-section="reprises"]')).toBeNull();
  });

  it('un groupe sans album ne rend pas de section vide', () => {
    const h = poserGrille({ collaborations: [{ artist_id: 3, artist_name: 'CSN', albums: [] }] });
    expect(h.querySelector('[data-section="collaborations"]')).toBeNull();
  });

  it('le clic sur un album dit sa section et transmet l’album qui porte `focus_track_ids`', () => {
    const ouvertures: { album: Album; origine: unknown }[] = [];
    const h = poserGrille({
      ...{ collaborations: SECTIONS.collaborations, reprises: SECTIONS.covers },
      onOuvrir: (ex: { album: Album }, origine: unknown) => ouvertures.push({ album: ex.album, origine }),
    });
    const carte = [...h.querySelectorAll('[data-section="collaborations"] .meta')].find(
      (b) => b.querySelector('.ct')?.textContent === 'Déjà Vu',
    ) as HTMLButtonElement;
    carte.click();
    const rep = h.querySelector('[data-section="reprises"] .meta') as HTMLButtonElement;
    rep.click();
    expect(ouvertures.map((o) => o.origine)).toEqual(['collaborations', 'reprises']);
    expect(ouvertures[0].album.focus_track_ids).toEqual([502, 504]);

    // Ce que la page artiste en fait (`ArtisteServiceV2.ouvrirExemplaire`).
    expect(focusDeSection('collaborations', ouvertures[0].album, { id: 1, name: 'Neil Young' })).toEqual({
      id: 1, nom: 'Neil Young', pistes: [502, 504],
    });
    expect(focusDeSection('reprises', ouvertures[1].album, { id: 1, name: 'Neil Young' })?.pistes).toEqual([701]);
  });
});

describe('#4862 — le focus des sections de crédits filtre sur `focus_track_ids`', () => {
  /** Déjà Vu : toutes les pistes sont de CSN (artist_id 3) — Neil Young n'y
   *  est l'artiste d'aucune, il y est CRÉDITÉ sur deux. */
  const PISTES = [
    { id: 501, title: 'Carry On', artist_id: 3 },
    { id: 502, title: 'Helpless', artist_id: 3 },
    { id: 503, title: 'Teach Your Children', artist_id: 3 },
    { id: 504, title: 'Country Girl', artist_id: 3 },
  ];

  it('les rangs retenus sont ceux des pistes créditées', () => {
    expect(rangsDuFocus(PISTES, { id: 1, nom: 'Neil Young', pistes: [502, 504] })).toEqual([1, 3]);
    // Le focus d'avant (compilations, apparitions) ne change pas.
    expect(rangsDuFocus([{ artist_id: 1 }, { artist_id: 2 }], { id: 1, nom: 'X' })).toEqual([0]);
    // Aucune piste retrouvée : l'album entier, jamais un écran vide.
    expect(rangsDuFocus(PISTES, { id: 1, nom: 'Neil Young', pistes: [999] })).toEqual([0, 1, 2, 3]);
  });

  it('sans `focus_track_ids`, une section de crédits n’ouvre pas de focus', () => {
    const sans = al({ id: 55, title: 'Déjà Vu' });
    expect(focusDeSection('collaborations', sans, { id: 1, name: 'Neil Young' })).toBeNull();
    // Discographie : jamais de focus ; compilations : par artiste de piste.
    expect(focusDeSection(null, DEJA_VU, { id: 1, name: 'Neil Young' })).toBeNull();
    expect(focusDeSection('compilations', DEJA_VU, { id: 1, name: 'Neil Young' })).toEqual({ id: 1, nom: 'Neil Young' });
  });

  it('la fiche d’album MONTÉE ne montre que les pistes créditées, sous la pastille', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      const u = String(url);
      const corps = /\/library\/albums\/55\/tracks/.test(u) ? PISTES : /\/library\/albums\/55(\?|$)/.test(u) ? DEJA_VU : {};
      return new Response(JSON.stringify(corps), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }));
    vi.stubGlobal('WebSocket', class {
      close() {}
      addEventListener() {}
      removeEventListener() {}
      send() {}
    } as unknown as typeof WebSocket);
    const focus: FocusArtiste = { id: 1, nom: 'Neil Young', pistes: [502, 504] };
    hote = document.createElement('div');
    document.body.appendChild(hote);
    monte = mount(AlbumDetailV2, { target: hote, props: { album: DEJA_VU, artisteFocus: focus, onClose: () => {} } });
    for (let i = 0; i < 8; i++) {
      await new Promise((r) => setTimeout(r, 0));
      flushSync();
    }
    const texte = hote.textContent ?? '';
    expect(texte).toContain('Helpless');
    expect(texte).toContain('Country Girl');
    expect(texte, 'une piste non créditée reste affichée').not.toContain('Carry On');
    expect(texte).not.toContain('Teach Your Children');
    expect(hote.querySelector('.focus-artiste')!.textContent).toContain(
      fr['v2.album.creditedOnly'].replace('{artist}', 'Neil Young'),
    );
  });
});
