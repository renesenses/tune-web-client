// @vitest-environment jsdom
//
// LA FICHE ARTISTE DE BIBLIOTHÈQUE REND LES LIENS DE SA BIOGRAPHIE — #2692,
// et la langue que le serveur a choisie — tune-server-rust#7027.
//
// Constat sur le .18 (07/11, pré-release rc11) : la fiche « LIBRARY · 97
// albums » de John Coltrane affichait sa biographie en texte brut, en
// français dans une interface anglaise, sans mention de langue.
//
// La cause : `GET /library/artists/2851` porte une bio stockée (fonds
// communautaire, `bio_provenance.lang = ''`), et la fiche la prenait pour une
// bio écrite à la main — elle n'appelait jamais `/library/artists/{id}/bio`,
// seule route qui rend `bio_segments` et applique la langue de l'interface.
//
// Le serveur de ce témoin rend les deux réponses telles que le .18 les rend
// (textes raccourcis).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import { get } from 'svelte/store';
import ArtisteServiceV2 from '../../components/v2/ArtisteServiceV2.svelte';
import { activeView, vueDeRetour } from '../stores/navigation';
import { ficheArtisteService, streamingServices } from '../stores/streaming';

const ID = 2851;
const STOCKEE = 'Le John Coltrane Quartet est un groupe de jazz américain formé en 1959.';
const SERVIE = 'Comme Charlie Parker avant lui, John Coltrane a changé le jazz.';

/** `GET /library/artists/{id}/bio` : la bio Qobuz en français, liens compris, repli marqué. */
const BIO_SERVIE = {
  artist: 'John Coltrane',
  bio: SERVIE,
  source: 'qobuz',
  bio_provenance: { source: 'qobuz', lang: 'fr', license: null, source_url: 'https://open.qobuz.com/artist/26028' },
  repli: { raison: 'langue_indisponible', langue_demandee: 'en', langue_disponible: 'fr' },
  bio_segments: [
    { texte: 'Comme ' },
    { texte: 'Charlie Parker', lien: { id: 4354, type: 'artiste' } },
    { texte: ' avant lui, John Coltrane a changé le jazz.' },
  ],
};

let artiste: Record<string, unknown>;
let bioRendue: Record<string, unknown>;
let appelsBio = 0;

const COLLECTIONS =
  /\/(profiles|zones|playlists|devices|shortcuts|collections|tags|favorites|history|radios|podcasts|albums|tracks|top-artists|recent|genres)(\?|\/|$)/;

function corpsPour(url: string) {
  if (/\/streaming\/services(\?|$)/.test(url)) return {};
  if (/\/library\/artists\/\d+\/albums/.test(url)) return {};
  if (/\/library\/artists\/\d+\/bio/.test(url)) {
    appelsBio++;
    return bioRendue;
  }
  if (/\/library\/artists\/\d+\/metadata/.test(url)) return {};
  if (/\/library\/artists\/\d+\/credits/.test(url)) return [];
  if (/\/library\/artists\/\d+(\?|$)/.test(url)) return artiste;
  if (/\/library\/artists(\?|$)/.test(url)) return [artiste];
  return COLLECTIONS.test(url) ? [] : {};
}

function reponsePour(url: string) {
  const corps = corpsPour(url);
  return {
    ok: true, status: 200, statusText: 'OK',
    headers: new Map([['content-type', 'application/json']]),
    json: async () => corps,
    text: async () => JSON.stringify(corps),
  } as unknown as Response;
}

let hote: HTMLDivElement | null = null;
let monte: Record<string, any> | null = null;
const attendre = (ms = 80) => new Promise((r) => setTimeout(r, ms));

/** La fiche ouverte comme la grille de la Bibliothèque l'ouvre (#1501). */
async function ficheOuverte(): Promise<HTMLDivElement> {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  ficheArtisteService.set({ service: null, id: String(ID), nom: 'John Coltrane' });
  activeView.set('streamingartist');
  monte = mount(ArtisteServiceV2, { target: hote });
  flushSync();
  await attendre(300);
  flushSync();
  expect(hote.querySelector('header.tete'), 'la page commune ne s’est pas montée').not.toBeNull();
  return hote;
}

beforeEach(() => {
  appelsBio = 0;
  artiste = {
    id: ID, name: 'John Coltrane', image_path: null, musicbrainz_id: null,
    bio: STOCKEE,
    bio_provenance: { source: 'community', lang: '', license: '', source_url: null, fetched_at: '2026-11-02 14:28:25' },
  };
  bioRendue = BIO_SERVIE;
  vi.stubGlobal('fetch', vi.fn(async (url: string) => reponsePour(String(url))));
  vi.stubGlobal('WebSocket', class {
    close() {} addEventListener() {} removeEventListener() {} send() {}
  } as unknown as typeof WebSocket);
  vi.stubGlobal('ResizeObserver', class {
    observe() {} unobserve() {} disconnect() {}
  } as unknown as typeof ResizeObserver);
  activeView.set('home');
  vueDeRetour.set(null);
  streamingServices.set({} as any);
  ficheArtisteService.set(null);
});

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  hote?.remove();
  hote = null;
  vi.unstubAllGlobals();
});

describe('#2692 — la fiche de bibliothèque rend les bio_segments par TexteDeBio', () => {
  it('une bio stockée AVEC provenance passe par /bio : ses liens sont rendus et ouvrent la page de l’artiste', async () => {
    const h = await ficheOuverte();
    expect(appelsBio, '/library/artists/{id}/bio n’a pas été interrogée').toBeGreaterThan(0);
    const lien = h.querySelector<HTMLButtonElement>('.bio-bloc button.lien-bio[data-lien-bio="artiste"]');
    expect(lien, 'la biographie est rendue sans aucun lien').not.toBeNull();
    expect(lien!.textContent).toBe('Charlie Parker');

    lien!.click();
    await attendre(80);
    flushSync();
    expect(get(ficheArtisteService)?.id).toBe('4354');
    expect(get(ficheArtisteService)?.service ?? null).toBeNull();
    expect(get(activeView)).toBe('streamingartist');
  });

  it('#7027 — la bio de langue inconnue n’est plus affichée ; la langue servie est dite', async () => {
    const h = await ficheOuverte();
    const bloc = h.querySelector('.bio-bloc');
    expect(bloc?.textContent ?? '').not.toContain('John Coltrane Quartet');
    expect(bloc?.querySelector('p.bio')?.getAttribute('lang')).toBe('fr');
    expect(bloc?.querySelector('.bio-repli'), 'aucune mention « disponible seulement en … »').not.toBeNull();
  });

  it('une bio écrite à la main (sans provenance) reste affichée, avec ses liens si /bio les porte sur CE texte', async () => {
    artiste = { ...artiste, bio: SERVIE, bio_provenance: undefined };
    bioRendue = { artist: 'John Coltrane', bio: SERVIE, bio_segments: BIO_SERVIE.bio_segments };
    const h = await ficheOuverte();
    expect(h.querySelector('.bio-bloc p.bio')?.textContent).toBe(SERVIE);
    expect(h.querySelector('.bio-bloc button.lien-bio')?.textContent).toBe('Charlie Parker');
  });

  it('une bio écrite à la main n’est jamais recouverte par une bio rapportée', async () => {
    artiste = { ...artiste, bio: STOCKEE, bio_provenance: undefined };
    const h = await ficheOuverte();
    expect(h.querySelector('.bio-bloc p.bio')?.textContent).toBe(STOCKEE);
    expect(h.querySelector('.bio-bloc button.lien-bio')).toBeNull();
  });
});
