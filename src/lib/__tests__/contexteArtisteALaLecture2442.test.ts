// @vitest-environment jsdom
//
// « Le type pris en compte dans ces rubriques dépend de l'endroit où
// l'utilisateur a cliqué sur "Lire" » — FabienM, fil forum 1557, réponse 5777
// (renesenses/tune-server-rust#2442).
//
// Le serveur tient cette règle DEPUIS v0.9.116 (#2441 / PR #2479) :
//
//   • `tune-server/src/routes/playback.rs:519` —
//     `const CONTEXTES_CONNUS: [&str; 5] = ["track","album","playlist","artist","label"];`
//   • `playback.rs:550-557` — « L'appelant l'a dit explicitement : sa parole
//     prime sur toute déduction. C'est la SEULE voie pour `artist` et `label`. »
//   • `routes/home.rs:431` et `:528` — « Continuer l'écoute » résout la nature
//     `artist` et l'affiche sous le nom de l'artiste.
//
// Et aucun client ne l'énonçait : `api.play()` n'avait ni `context_type` ni
// `context_id` dans sa signature. Une discographie part en liste nue de
// `track_ids`, que rien ne distingue d'une sélection quelconque —
// `contexte_de_lecture` rendait `(None, None, None)` (playback.rs:611), la
// ligne d'historique partait sans contexte, et l'écoute retombait dans le
// repli « albums ». Écrit côté serveur, jamais branché côté écran.
//
// 🔴 CE TÉMOIN APPELLE, IL NE LIT PAS. On monte la vraie fiche d'artiste, on
// clique « Tout lire », et on regarde le CORPS que `fetch` a reçu.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import ArtistesV2 from '../../components/v2/ArtistesV2.svelte';
import LibraryView from '../../components/LibraryView.svelte';
import { currentZoneId, zones } from '../stores/zones';
import { libraryTab, selectedArtist, artistAlbums } from '../stores/library';

const ARTISTE = { id: 3, name: 'Miles Davis', album_count: 1 };
const ALBUMS = [{ id: 7, title: 'Kind of Blue', artist_name: 'Miles Davis', year: 1959 }];
/** Pistes LOCALES : `planDeLecture` en fait un seul envoi `{ track_ids }`. */
const PISTES = [
  { id: 101, title: 'So What', source: 'local' },
  { id: 102, title: 'Blue in Green', source: 'local' },
];

let appels: { url: string; method: string; body: string | null }[] = [];

function corpsPour(url: string): unknown {
  if (/\/library\/artists\?/.test(url) || /\/library\/artists$/.test(url)) return [ARTISTE];
  if (/\/library\/artists\/3\/albums/.test(url)) return ALBUMS;
  if (/\/library\/artists\/3\/tracks/.test(url)) return PISTES;
  if (/\/library\/albums\/7\/tracks/.test(url)) return PISTES;
  if (/\/zones\/1\/play$/.test(url)) return { id: 1, name: 'Salon', state: 'playing' };
  if (/\/zones\/1$/.test(url)) return { id: 1, name: 'Salon', state: 'playing' };
  if (/\/zones(\?|$)/.test(url)) return [{ id: 1, name: 'Salon', state: 'stopped', online: true }];
  return {};
}

let hote: HTMLDivElement | null = null;
let monte: Record<string, unknown> | null = null;

const respirer = () => new Promise((r) => setTimeout(r, 0));

async function poserFiche(): Promise<HTMLDivElement> {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  // `ouvrirId` ouvre la fiche dès que la liste est là — le même chemin que le
  // clic sur une vignette, sans avoir à traverser la grille.
  monte = mount(ArtistesV2, { target: hote, props: { q: '', ouvrirId: 3 } });
  for (let i = 0; i < 6; i++) await respirer();
  flushSync();
  return hote;
}

/** « Tout lire » — le premier `.fab`, le second étant l'aléatoire (`.creux`). */
function boutonToutLire(el: HTMLElement): HTMLButtonElement {
  const b = el.querySelector('.fa .fab:not(.creux)') as HTMLButtonElement;
  expect(b, 'le bouton « Tout lire » a disparu de la fiche artiste').not.toBeNull();
  return b;
}

const corpsDuPlay = () => {
  const p = appels.filter((a) => a.method === 'POST' && /\/zones\/1\/play$/.test(a.url));
  expect(
    p.length,
    `la lecture n'a pas été lancée ; appels vus : ${appels.map((a) => `${a.method} ${a.url}`).join(' | ')}`,
  ).toBe(1);
  return JSON.parse(p[0].body!) as Record<string, unknown>;
};

beforeEach(() => {
  appels = [];
  currentZoneId.set(1);
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const method = (init?.method ?? 'GET').toUpperCase();
      appels.push({ url: String(url), method, body: (init?.body as string) ?? null });
      const corps = corpsPour(String(url));
      return {
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: new Map([['content-type', 'application/json']]),
        json: async () => corps,
        text: async () => JSON.stringify(corps),
      } as unknown as Response;
    }),
  );
  vi.stubGlobal('WebSocket', class {
    close() {}
    addEventListener() {}
    removeEventListener() {}
    send() {}
  } as unknown as typeof WebSocket);
});

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  if (hote) hote.remove();
  hote = null;
  currentZoneId.set(null);
  vi.unstubAllGlobals();
});

describe("#2442 — « Tout lire » sur un artiste ANNONCE l'artiste au serveur", () => {
  it('envoie context_type=artist et context_id=<id de l’artiste>', async () => {
    const el = await poserFiche();
    boutonToutLire(el).click();
    for (let i = 0; i < 6; i++) await respirer();
    flushSync();

    const corps = corpsDuPlay();
    expect(
      corps.context_type,
      "la lecture ne dit pas ce qu'elle est : le serveur enregistrera un contexte vide",
    ).toBe('artist');
    // Une CHAÎNE : `context_id` est un `Option<String>` côté serveur, et pour
    // un label il portera un nom, pas un nombre.
    expect(corps.context_id).toBe('3');
  });

  it("continue d'envoyer les pistes — l'annonce s'AJOUTE, elle ne remplace rien", async () => {
    const el = await poserFiche();
    boutonToutLire(el).click();
    for (let i = 0; i < 6; i++) await respirer();
    flushSync();

    const corps = corpsDuPlay();
    // Contre-épreuve de l'autre bord : un contexte annoncé qui aurait mangé la
    // file laisserait la zone silencieuse.
    expect(corps.track_ids).toEqual([101, 102]);
  });

  it("n'annonce que des natures que le serveur connaît", async () => {
    const el = await poserFiche();
    boutonToutLire(el).click();
    for (let i = 0; i < 6; i++) await respirer();
    flushSync();

    // `CONTEXTES_CONNUS`, playback.rs:519. Le serveur écarte silencieusement
    // toute autre valeur : une faute de frappe ici ne se verrait nulle part.
    expect(['track', 'album', 'playlist', 'artist', 'label']).toContain(
      corpsDuPlay().context_type,
    );
  });
});

// ── Le MÊME geste dans l'interface actuelle (v1) ───────────────────────────
//
// Les deux coquilles vivent côte à côte sur `main` et partent dans la même
// livraison : corriger l'une seulement laisserait la moitié des utilisateurs
// avec un historique sans contexte.

let hoteV1: HTMLDivElement | null = null;
let monteV1: Record<string, unknown> | null = null;

async function poserFicheArtisteV1(): Promise<HTMLDivElement> {
  zones.set([{ id: 1, name: 'Salon', state: 'stopped', online: true, volume: 0.4 }] as never);
  currentZoneId.set(1);
  libraryTab.set('artists');
  selectedArtist.set(ARTISTE as never);
  artistAlbums.set(ALBUMS as never);
  hoteV1 = document.createElement('div');
  document.body.appendChild(hoteV1);
  monteV1 = mount(LibraryView, { target: hoteV1, props: {} });
  for (let i = 0; i < 8; i++) await respirer();
  flushSync();
  return hoteV1;
}

describe('#2442 — même annonce dans l’interface actuelle (v1)', () => {
  afterEach(() => {
    if (monteV1) unmount(monteV1);
    monteV1 = null;
    if (hoteV1) hoteV1.remove();
    hoteV1 = null;
    selectedArtist.set(null);
    artistAlbums.set([]);
  });

  it('« Toutes les pistes » envoie context_type=artist avec les pistes', async () => {
    const el = await poserFicheArtisteV1();
    const boutons = Array.from(
      el.querySelectorAll('.artist-play-actions .artist-play-btn'),
    ) as HTMLButtonElement[];
    expect(boutons.length, 'les boutons de lecture de la fiche artiste ont disparu').toBe(2);

    boutons[0].click();
    for (let i = 0; i < 8; i++) await respirer();
    flushSync();

    const corps = corpsDuPlay();
    expect(corps.context_type).toBe('artist');
    expect(corps.context_id).toBe('3');
    expect(corps.track_ids).toEqual([101, 102]);
  });

  it('« Lecture aléatoire » l’envoie aussi — c’est le même artiste demandé', async () => {
    const el = await poserFicheArtisteV1();
    const boutons = Array.from(
      el.querySelectorAll('.artist-play-actions .artist-play-btn'),
    ) as HTMLButtonElement[];
    boutons[1].click();
    for (let i = 0; i < 8; i++) await respirer();
    flushSync();

    const corps = corpsDuPlay();
    expect(corps.context_type).toBe('artist');
    expect(corps.context_id).toBe('3');
    // L'ordre est mélangé : on ne compare que l'ensemble.
    expect([...(corps.track_ids as number[])].sort()).toEqual([101, 102]);
  });
});
