// @vitest-environment jsdom
//
// ══════════════════════════════════════════════════════════════════════════
// 🔴 Fil forum 1906 (FabienM, point 3) — un titre de STREAMING n'avait ni
// « Plus comme ça » ni « Tous les champs piste », les deux entrées que porte un
// titre de bibliothèque.
//
// « Tous les champs piste » : le tiroir ne savait lire que les tags du FICHIER
// (`/library/tracks/{id}/all-tags`, un `i64`). Une piste de service montre
// désormais, en lecture seule, les champs qu'elle porte, complétés par
// `GET /streaming/{service}/tracks/{id}` — sans jamais appeler la route du
// fichier.
//
// « Plus comme ça » : vérifié sur la tête du serveur (v0.9.163), AUCUNE route
// ne rend de titres voisins d'une piste désignée par `source` + `source_id`,
// pour aucun service (voir le commentaire de `menuPiste.ts`). L'entrée reste
// donc ABSENTE d'un titre de service — jamais un geste muet.
//
// Cette garde MONTE les deux surfaces (barre v2 et menu du client actuel) et
// ouvre leur menu : une règle écrite mais pas branchée y serait rouge.
// ══════════════════════════════════════════════════════════════════════════
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import PisteActions from '../../components/v2/PisteActions.svelte';
import MenuPisteV1 from '../../components/partages/MenuPisteV1.svelte';
import TrackTagsDrawer from '../../components/partages/TrackTagsDrawer.svelte';
import { currentZoneId } from '../stores/zones';
import { locale } from '../i18n';
import { entreesMenuPiste } from '../menuPiste';
import {
  champsConnusDePisteService,
  completerChampsService,
  pisteDeServiceDe,
} from '../champsPisteService';

vi.setConfig({ testTimeout: 30_000 });

const PLUS_COMME_CA = 'Plus comme ça';
const CHAMPS = 'Tous les champs piste';

const QOBUZ = {
  id: null, source: 'qobuz', source_id: '441078583', title: 'Second Song',
  artist_name: 'Neil Young', artist_id: '35865', album_title: 'Second Song',
  album_id: 'atua1kxxk4tis', duration_ms: 360000, track_number: 3, disc_number: 1,
  isrc: 'USRE11500123', format: 'flac', sample_rate: 96000, bit_depth: 24,
  cover_path: 'https://static.qobuz.com/images/covers/x_600.jpg',
};
const service = (source: string, source_id = 'x-42') => ({ ...QOBUZ, source, source_id });
const BIBLIO = {
  id: 2450, source: 'local', title: 'Harvest', artist_name: 'Neil Young',
  artist_id: 125, album_id: 259, album_title: 'Harvest', duration_ms: 200000,
};

/** Ce que le serveur rend pour `GET /streaming/qobuz/tracks/441078583`. */
const DETAIL_QOBUZ = {
  source_id: '441078583', title: 'Second Song', artist_name: 'Neil Young',
  album_title: 'Second Song', album_id: 'atua1kxxk4tis', duration_ms: 360000,
  track_number: 3, disc_number: 1, explicit: false, isrc: 'USRE11500123',
  composer: 'Neil Young',
  quality: { codec: 'FLAC', sample_rate: 96000, bit_depth: 24, bitrate: 4608, channels: 2 },
};

let appels: string[] = [];
let hote: HTMLDivElement | null = null;
let monte: Record<string, any> | null = null;

function poser(composant: any, props: Record<string, unknown>): HTMLDivElement {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(composant, { target: hote, props: props as any });
  flushSync();
  return hote;
}

/** Ouvre le « … » de la barre v2 et rend les libellés de son menu. */
function menuV2(piste: Record<string, unknown>): HTMLButtonElement[] {
  const el = poser(PisteActions, { piste });
  const plus = Array.from(el.querySelectorAll<HTMLButtonElement>('button.pa'))
    .find((b) => b.getAttribute('aria-haspopup') === 'menu');
  expect(plus, 'la barre n’a pas de « … »').toBeTruthy();
  plus!.click();
  flushSync();
  return Array.from(document.querySelectorAll<HTMLButtonElement>('.menu button.item'));
}

/** Même chose pour le « … » du client actuel (`MenuPisteV1` → `TrackContextMenu`). */
function menuV1(piste: Record<string, unknown>): HTMLButtonElement[] {
  const el = poser(MenuPisteV1, { piste });
  el.querySelector<HTMLButtonElement>('button.track-more-btn')!.click();
  flushSync();
  return Array.from(document.querySelectorAll<HTMLButtonElement>('.track-menu-item'));
}

const libelles = (items: HTMLButtonElement[]) => items.map((b) => (b.textContent ?? '').trim());
const aLibelle = (items: HTMLButtonElement[], l: string) => libelles(items).some((x) => x.includes(l));

beforeEach(() => {
  locale.set('fr');
  currentZoneId.set(1);
  appels = [];
  vi.stubGlobal('fetch', vi.fn(async (entree: unknown) => {
    const url = String(typeof entree === 'string' ? entree : (entree as Request)?.url ?? entree);
    appels.push(url);
    const corps = url.includes('/streaming/qobuz/tracks/441078583') ? DETAIL_QOBUZ : {};
    return {
      ok: true, status: 200, statusText: 'OK',
      headers: new Map([['content-type', 'application/json']]),
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
  currentZoneId.set(null);
  vi.unstubAllGlobals();
});

describe('fil 1906 — la règle, UNE fois : `pisteDeServiceDe`', () => {
  it('une piste Qobuz se désigne chez Qobuz', () => {
    expect(pisteDeServiceDe(QOBUZ)).toEqual({ service: 'qobuz', sourceId: '441078583' });
  });

  it('ni piste locale, ni radio, ni piste sans identifiant de service', () => {
    expect(pisteDeServiceDe(BIBLIO)).toBeNull();
    expect(pisteDeServiceDe(service('radio', 'https://flux.example/aac'))).toBeNull();
    expect(pisteDeServiceDe({ ...QOBUZ, source_id: null })).toBeNull();
    expect(pisteDeServiceDe(null)).toBeNull();
  });

  it('les champs connus : ce que la piste PORTE, rien d’inventé', () => {
    const c = champsConnusDePisteService({ ...QOBUZ, label: '', genre: null });
    expect(c).toMatchObject({
      title: 'Second Song', artist_name: 'Neil Young', isrc: 'USRE11500123',
      source: 'qobuz', source_id: '441078583', album_id: 'atua1kxxk4tis',
      track_number: 3, duration_ms: 360000, sample_rate: 96000,
    });
    expect(c).not.toHaveProperty('id');
    expect(c).not.toHaveProperty('label');
    expect(c).not.toHaveProperty('genre');
  });

  it('le détail du service complète sans gommer ; la qualité est aplatie', () => {
    const c = completerChampsService(champsConnusDePisteService(QOBUZ), DETAIL_QOBUZ);
    expect(c).toMatchObject({ composer: 'Neil Young', bitrate: 4608, channels: 2, source: 'qobuz' });
    expect(c.cover_path).toBe(QOBUZ.cover_path);
    expect(c).not.toHaveProperty('quality');
  });
});

describe('fil 1906 — `entreesMenuPiste`', () => {
  const tout = {
    lire: () => {}, plusCommeCa: () => {}, champsDuFichier: () => {},
  };
  it('service : « Tous les champs » avec la capacité, jamais « Plus comme ça »', () => {
    const cles = entreesMenuPiste(
      { jouable: true, idBibliotheque: null, artistId: null, albumId: null, champsDeService: true },
      tout,
    ).map((e) => e.cle);
    expect(cles).toContain('trackTags.title');
    expect(cles).not.toContain('library.playSimilar');
  });
});

describe('🔴 fil 1906 — barre v2 (`PisteActions`)', () => {
  it('titre Qobuz : « Tous les champs piste » présent, « Plus comme ça » absent (aucune route)', () => {
    const items = menuV2(QOBUZ);
    expect(aLibelle(items, CHAMPS), libelles(items).join(' | ')).toBe(true);
    expect(aLibelle(items, PLUS_COMME_CA)).toBe(false);
  });

  for (const s of ['tidal', 'deezer', 'spotify', 'youtube', 'amazon', 'bandcamp']) {
    it(`titre ${s} : « Plus comme ça » absent — pas de route serveur`, () => {
      const items = menuV2(service(s));
      expect(aLibelle(items, PLUS_COMME_CA)).toBe(false);
      expect(aLibelle(items, CHAMPS)).toBe(true);
    });
  }

  it('titre de bibliothèque : les deux entrées restent', () => {
    const items = menuV2(BIBLIO);
    expect(aLibelle(items, PLUS_COMME_CA)).toBe(true);
    expect(aLibelle(items, CHAMPS)).toBe(true);
  });

  it('🔴 le tiroir d’un titre Qobuz montre ses champs SANS la route des tags du fichier', async () => {
    const items = menuV2(QOBUZ);
    const entree = items.find((b) => (b.textContent ?? '').includes(CHAMPS));
    expect(entree).toBeTruthy();
    entree!.click();
    flushSync();
    await vi.waitFor(() => {
      expect(document.querySelector('[data-champs-service]')).toBeTruthy();
    });
    const texte = () => document.querySelector('[data-champs-service]')!.textContent ?? '';
    expect(texte()).toContain('Second Song');
    expect(texte()).toContain('USRE11500123');
    expect(texte()).toContain('441078583');
    // Le complément du service arrive ensuite : `composer` et `bitrate` ne
    // sont pas sur la piste de la ligne.
    await vi.waitFor(() => {
      expect(texte()).toContain('4608');
    });
    expect(appels.some((u) => u.includes('/streaming/qobuz/tracks/441078583'))).toBe(true);
    expect(appels.filter((u) => u.includes('all-tags'))).toEqual([]);
    // Lecture seule : aucune saisie, aucun bouton d'écriture.
    expect(document.querySelectorAll('.drawer input').length).toBe(0);
    expect(document.querySelector('.btn-save')).toBeNull();
    expect(document.querySelector('.btn-write-tags')).toBeNull();
  });
});

describe('🔴 fil 1906 — menu du client actuel (`MenuPisteV1`)', () => {
  it('titre Qobuz : « Tous les champs piste » présent, « Plus comme ça » absent', () => {
    const items = menuV1(QOBUZ);
    expect(aLibelle(items, CHAMPS), libelles(items).join(' | ')).toBe(true);
    expect(aLibelle(items, PLUS_COMME_CA)).toBe(false);
  });

  it('radio : pas de « Tous les champs piste »', () => {
    const items = menuV1(service('radio', 'https://flux.example/aac'));
    expect(aLibelle(items, CHAMPS)).toBe(false);
  });
});

describe('fil 1906 — le tiroir, monté seul', () => {
  it('un service qui ne répond pas laisse les champs connus, sans route du fichier', async () => {
    const el = poser(TrackTagsDrawer, { pisteService: service('bandcamp', 'bc-7'), onClose: () => {} });
    const bloc = el.querySelector('[data-champs-service]');
    expect(bloc, 'le tiroir d’une piste de service ne s’affiche pas').toBeTruthy();
    expect(bloc!.textContent).toContain('bc-7');
    expect(bloc!.textContent).toContain('bandcamp');
    await vi.waitFor(() => {
      expect(appels.some((u) => u.includes('/streaming/bandcamp/tracks/bc-7'))).toBe(true);
    });
    expect(appels.filter((u) => u.includes('all-tags'))).toEqual([]);
  });
});
