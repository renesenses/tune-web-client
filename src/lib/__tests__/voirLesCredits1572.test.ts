// @vitest-environment jsdom
//
// ══════════════════════════════════════════════════════════════════════════
// #1572 — « Voir les crédits » dans le menu d'un titre, et un bouton
// « Crédits » sur la fiche album (FabienM, fil forum 1921, sur le modèle de
// Roon : « Compositeurs et interprètes », puis « Production »).
//
// Cette garde MONTE les surfaces : la barre v2 (`PisteActions`), le menu du
// client actuel (`MenuPisteV1`), la fiche album (`AlbumDetailV2`) et la fiche
// de crédits elle-même (`CreditsTiroir`), contre des réponses simulées du
// serveur. Une entrée écrite mais pas branchée y serait rouge.
// ══════════════════════════════════════════════════════════════════════════
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import { get } from 'svelte/store';
import PisteActions from '../../components/v2/PisteActions.svelte';
import MenuPisteV1 from '../../components/partages/MenuPisteV1.svelte';
import AlbumDetailV2 from '../../components/v2/AlbumDetailV2.svelte';
import CreditsTiroir from '../../components/partages/CreditsTiroir.svelte';
import { currentZoneId } from '../stores/zones';
import { activeView } from '../stores/navigation';
import { ficheArtisteService } from '../stores/streaming';
import { locale } from '../i18n';
import lFr from '../locales/fr';
import { blocsDeCredits, numerosDePistes } from '../library/credits';
import type { Album } from '../types';

vi.setConfig({ testTimeout: 30_000 });
const fr = lFr as unknown as Record<string, string>;
const VOIR = fr['credits.see'];
const BOUTON_ALBUM = fr['artist.credits'];

const BIBLIO = {
  id: 2450, source: 'local', title: 'The Meaning of Flowers', artist_name: 'Agnes Obel',
  artist_id: 125, album_id: 259, album_title: 'Myopia', duration_ms: 234000,
};
const QOBUZ = {
  id: null, source: 'qobuz', source_id: '441078583', title: 'Second Song',
  artist_name: 'Neil Young', artist_id: '35865', album_title: 'Second Song',
  album_id: 'atua1kxxk4tis', duration_ms: 360000,
};

/** Ce que rend `GET /library/tracks/2450/credits` — la capture de Roon. */
const CREDITS_PISTE = [
  { id: 1, track_id: 2450, artist_id: 125, artist_name: 'Agnes Obel', role: 'composer', instrument: null, position: 0 },
  { id: 2, track_id: 2450, artist_id: 125, artist_name: 'Agnes Obel', role: 'writer', instrument: null, position: 1 },
  { id: 3, track_id: 2450, artist_id: 301, artist_name: 'Charlotte Danhier', role: 'performer', instrument: 'cello', position: 2 },
  { id: 4, track_id: 2450, artist_id: null, artist_name: 'John Corban', role: 'performer', instrument: 'violin', position: 3 },
  { id: 5, track_id: 2450, artist_id: 125, artist_name: 'Agnes Obel', role: 'vocal', instrument: null, position: 4 },
  { id: 6, track_id: 2450, artist_id: 125, artist_name: 'Agnes Obel', role: 'producer', instrument: null, position: 5 },
  { id: 7, track_id: 2450, artist_id: 125, artist_name: 'Agnes Obel', role: 'mixer', instrument: null, position: 6 },
];

/** Ce que rend `GET /library/albums/259/credits` : chaque ligne porte sa piste. */
const CREDITS_ALBUM = [
  { id: 1, track_id: 11, artist_id: 125, artist_name: 'Agnes Obel', role: 'composer', instrument: null, position: 0, track_title: 'Camera’s Rolling', track_number: 1, disc_number: 1 },
  { id: 2, track_id: 12, artist_id: 125, artist_name: 'Agnes Obel', role: 'composer', instrument: null, position: 0, track_title: 'Broken Sleep', track_number: 2, disc_number: 1 },
  { id: 3, track_id: 12, artist_id: 301, artist_name: 'Charlotte Danhier', role: 'performer', instrument: 'cello', position: 1, track_title: 'Broken Sleep', track_number: 2, disc_number: 1 },
  { id: 4, track_id: 15, artist_id: 125, artist_name: 'Agnes Obel', role: 'composer', instrument: null, position: 0, track_title: 'Parliament of Owls', track_number: 5, disc_number: 1 },
];

interface Requete { method: string; url: string }
let requetes: Requete[] = [];
/** Réponse par motif d'URL — le premier motif contenu dans l'URL gagne. */
let reponses: [string, unknown, number?][] = [];

class ObservateurInerte { observe() {} unobserve() {} disconnect() {} }
const respirer = () => new Promise((r) => setTimeout(r, 0));
async function attendreQue(condition: () => boolean, limiteMs = 20_000) {
  const fin = Date.now() + limiteMs;
  while (!condition() && Date.now() < fin) { await respirer(); flushSync(); }
  flushSync();
  return condition();
}

let hote: HTMLDivElement | null = null;
let monte: Record<string, any> | null = null;
function poser(composant: any, props: Record<string, unknown>): HTMLDivElement {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(composant, { target: hote, props: props as any });
  flushSync();
  return hote;
}

function menuV2(piste: Record<string, unknown>): HTMLButtonElement[] {
  const el = poser(PisteActions, { piste });
  const plus = Array.from(el.querySelectorAll<HTMLButtonElement>('button.pa'))
    .find((b) => b.getAttribute('aria-haspopup') === 'menu');
  expect(plus, 'la barre n’a pas de « … »').toBeTruthy();
  plus!.click();
  flushSync();
  return Array.from(document.querySelectorAll<HTMLButtonElement>('.menu button.item'));
}
function menuV1(piste: Record<string, unknown>): HTMLButtonElement[] {
  const el = poser(MenuPisteV1, { piste });
  el.querySelector<HTMLButtonElement>('button.track-more-btn')!.click();
  flushSync();
  return Array.from(document.querySelectorAll<HTMLButtonElement>('.track-menu-item'));
}
const entreeVoir = (items: HTMLButtonElement[]) =>
  items.find((b) => (b.textContent ?? '').trim() === VOIR);

const fiche = () => document.querySelector<HTMLElement>('[data-credits]');
const texteFiche = () => fiche()?.textContent ?? '';

beforeEach(() => {
  locale.set('fr');
  currentZoneId.set(1);
  requetes = [];
  reponses = [
    ['/library/tracks/2450/credits', CREDITS_PISTE],
    ['/library/albums/259/credits', CREDITS_ALBUM],
  ];
  vi.stubGlobal('ResizeObserver', ObservateurInerte);
  vi.stubGlobal('IntersectionObserver', ObservateurInerte);
  vi.stubGlobal('fetch', vi.fn(async (entree: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof entree === 'string' ? entree : entree.toString();
    requetes.push({ method: (init?.method ?? 'GET').toUpperCase(), url });
    const trouve = reponses.find(([motif]) => url.includes(motif));
    const statut = trouve?.[2] ?? 200;
    const corps = trouve ? trouve[1] : [];
    return {
      ok: statut < 400, status: statut, statusText: statut < 400 ? 'OK' : 'Not Found',
      headers: new Headers({ 'Content-Type': 'application/json' }),
      json: async () => corps,
      text: async () => JSON.stringify(corps),
    } as unknown as Response;
  }));
});

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  hote?.remove();
  hote = null;
  document.body.innerHTML = '';
  vi.unstubAllGlobals();
});

describe('#1572 — « Voir les crédits » dans le menu d’un titre', () => {
  it('barre v2 : présente pour un titre de la bibliothèque', () => {
    expect(entreeVoir(menuV2(BIBLIO))).toBeTruthy();
  });
  it('barre v2 : ABSENTE pour un titre de service', () => {
    expect(entreeVoir(menuV2(QOBUZ))).toBeUndefined();
  });
  it('client actuel : présente pour un titre de la bibliothèque', () => {
    expect(entreeVoir(menuV1(BIBLIO))).toBeTruthy();
  });
  it('client actuel : ABSENTE pour un titre de service', () => {
    expect(entreeVoir(menuV1(QOBUZ))).toBeUndefined();
  });

  it('🔴 le clic ouvre la fiche, groupée par rôle comme chez Roon', async () => {
    entreeVoir(menuV2(BIBLIO))!.click();
    flushSync();
    expect(await attendreQue(() => texteFiche().includes('Charlotte Danhier'))).toBe(true);
    expect(requetes.some((r) => r.url.includes('/library/tracks/2450/credits'))).toBe(true);

    const blocs = [...document.querySelectorAll<HTMLElement>('[data-famille]')];
    expect(blocs.map((b) => b.dataset.famille)).toEqual(['interpretes', 'production']);
    expect(blocs[0].querySelector('h4')!.textContent).toBe(fr['credits.block.interpretes']);
    expect(blocs[1].querySelector('h4')!.textContent).toBe(fr['credits.block.production']);

    const lignes = (b: HTMLElement) =>
      [...b.querySelectorAll<HTMLElement>('.ligne')].map((l) =>
        `${l.querySelector('.role')!.textContent!.trim()} = ${l.querySelector('.noms')!.textContent!.replace(/\s+/g, ' ').trim()}`);
    expect(lignes(blocs[0])).toEqual([
      `${fr['credits.composer']} = Agnes Obel`,
      `${fr['credits.writer']} = Agnes Obel`,
      'Cello = Charlotte Danhier',
      'Violin = John Corban',
      `${fr['credits.vocal']} = Agnes Obel`,
    ]);
    expect(lignes(blocs[1])).toEqual([
      `${fr['credits.producer']} = Agnes Obel`,
      `${fr['credits.mixer']} = Agnes Obel`,
    ]);
  });

  it('un nom avec fiche ouvre la page de l’artiste ; un nom sans fiche reste du texte', async () => {
    entreeVoir(menuV2(BIBLIO))!.click();
    flushSync();
    await attendreQue(() => texteFiche().includes('John Corban'));
    const liens = [...fiche()!.querySelectorAll<HTMLButtonElement>('button.lien')].map((b) => b.textContent);
    expect(liens).toContain('Charlotte Danhier');
    expect(liens).not.toContain('John Corban');
    [...fiche()!.querySelectorAll<HTMLButtonElement>('button.lien')]
      .find((b) => b.textContent === 'Charlotte Danhier')!.click();
    flushSync();
    expect(get(activeView)).toBe('streamingartist');
    expect(get(ficheArtisteService)).toMatchObject({ service: null, id: '301' });
    expect(fiche(), 'la fiche doit se refermer').toBeNull();
  });
});

describe('#1572 — la fiche, montée seule', () => {
  it('🔴 état vide : un message clair, et l’enrichissement MusicBrainz proposé', async () => {
    reponses = [['/library/tracks/77/credits', []]];
    poser(CreditsTiroir, { cible: { type: 'piste', trackId: 77, titre: 'Sans crédit' }, onClose: () => {} });
    expect(await attendreQue(() => !!document.querySelector('[data-credits-vide]'))).toBe(true);
    const vide = document.querySelector('[data-credits-vide]')!;
    expect(vide.textContent).toContain(fr['credits.noneTrack']);
    const b = vide.querySelector<HTMLButtonElement>('button.enrichir')!;
    expect(b.textContent!.trim()).toBe(fr['credits.empty.cta_enrich']);
    b.click();
    expect(await attendreQue(() => requetes.some((r) => r.method === 'POST' && r.url.includes('/library/tracks/77/credits/enrich')))).toBe(true);
  });

  it('album : chaque nom une seule fois, suivi de ses pistes', async () => {
    poser(CreditsTiroir, {
      cible: { type: 'album', albumId: 259, titre: 'Myopia', artiste: 'Agnes Obel', pistes: [] },
      onClose: () => {},
    });
    expect(await attendreQue(() => texteFiche().includes('Charlotte Danhier'))).toBe(true);
    const compo = [...document.querySelectorAll<HTMLElement>('.ligne')]
      .find((l) => l.dataset.role === 'composer')!;
    expect(compo.querySelectorAll('.nom').length).toBe(1);
    expect(compo.querySelector('.pistes')!.textContent).toBe(fr['credits.onTracks'].replace('{liste}', '1, 2, 5'));
    // UN aller-retour pour tout le disque.
    expect(requetes.filter((r) => r.url.includes('/credits')).map((r) => r.url))
      .toEqual([expect.stringContaining('/library/albums/259/credits')]);
  });

  it('album, serveur sans la route (404) : repli sur un appel par piste', async () => {
    reponses = [
      ['/library/albums/259/credits', { detail: 'Not Found' }, 404],
      ['/library/tracks/11/credits', [CREDITS_PISTE[0]].map((c) => ({ ...c, track_id: 11 }))],
      ['/library/tracks/12/credits', [CREDITS_PISTE[2]].map((c) => ({ ...c, track_id: 12 }))],
    ];
    poser(CreditsTiroir, {
      cible: {
        type: 'album', albumId: 259, titre: 'Myopia',
        pistes: [
          { id: 11, title: 'Camera’s Rolling', track_number: 1, disc_number: 1 },
          { id: 12, title: 'Broken Sleep', track_number: 2, disc_number: 1 },
        ],
      },
      onClose: () => {},
    });
    expect(await attendreQue(() => texteFiche().includes('Charlotte Danhier'))).toBe(true);
    expect(texteFiche()).toContain('Agnes Obel');
    expect(requetes.some((r) => r.url.includes('/library/tracks/11/credits'))).toBe(true);
    expect(requetes.some((r) => r.url.includes('/library/tracks/12/credits'))).toBe(true);
  });
});

describe('#1572 — le bouton « Crédits » de la fiche album', () => {
  const ALBUM_LOCAL = { id: 259, title: 'Myopia', artist_name: 'Agnes Obel', year: 2020 } as Album;
  const ALBUM_QOBUZ = {
    id: null, title: 'Myopia', artist_name: 'Agnes Obel',
    source: 'qobuz', source_id: 'kxend2k5wdg06',
  } as unknown as Album;
  const boutonCredits = () =>
    [...hote!.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.trim() === BOUTON_ALBUM);

  it('🔴 album de la bibliothèque : le bouton ouvre les crédits de l’album', async () => {
    poser(AlbumDetailV2, { album: ALBUM_LOCAL, onClose: () => {} });
    await attendreQue(() => !!boutonCredits(), 5_000);
    const b = boutonCredits();
    expect(b, 'la fiche d’album n’a pas de bouton Crédits').toBeTruthy();
    b!.click();
    flushSync();
    expect(await attendreQue(() => texteFiche().includes('Charlotte Danhier'))).toBe(true);
    expect(fiche()!.dataset.credits).toBe('album');
    expect(requetes.some((r) => r.url.includes('/library/albums/259/credits'))).toBe(true);
  });

  it('album de service : pas de bouton', async () => {
    poser(AlbumDetailV2, { album: ALBUM_QOBUZ, service: 'qobuz', onClose: () => {} });
    for (let i = 0; i < 10; i++) { await respirer(); flushSync(); }
    expect(boutonCredits()).toBeUndefined();
  });
});

describe('#1572 — les groupes, en pur', () => {
  it('numéros de pistes : « disque.piste » quand l’album a plusieurs disques', () => {
    const p = [
      { track_id: 1, numero: 3, disque: 2, titre: 'a' },
      { track_id: 2, numero: 1, disque: 1, titre: 'b' },
    ];
    expect(numerosDePistes(p, true)).toBe('2.3, 1.1');
    expect(numerosDePistes(p, false)).toBe('3, 1');
  });
  it('un rôle inconnu tombe dans « autres », jamais perdu', () => {
    const b = blocsDeCredits([
      { id: 1, track_id: 1, artist_id: null, artist_name: 'X', role: 'liner notes', instrument: null, position: 0 },
    ]);
    expect(b.map((x) => x.famille)).toEqual(['autres']);
  });
});
