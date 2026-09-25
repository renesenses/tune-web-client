// @vitest-environment jsdom
//
// « ÉCRIRE DANS LES FICHIERS » — tranche 4 du chantier « édition des albums,
// compilations et coffrets » (GO de Bertrand, 25/09/2026).
//
// Ces témoins MONTENT `AlbumDetailV2`, ouvrent le mode « Modifier » et lisent
// ce qui part sur le réseau : `fetch` est remplacé, pas `api.ts`. Contrat du
// lot serveur :
//
//   GET  /library/albums/{id}/edition              → { album, discs, tracks, ecriture_balises }
//   POST /library/albums/{id}/edition/write-tags   ← { dry_run }
//        → { dry_run, ecrits, a_ecrire, inchanges, plan, ignores, erreurs }
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';
import { mount, unmount, flushSync } from 'svelte';
import { t } from '../i18n';
import { dialogs } from '../stores/dialogs';
import { activeView } from '../stores/navigation';
import type { Album } from '../types';
import AlbumDetailV2 from '../../components/v2/AlbumDetailV2.svelte';
import {
  champsDuPlan, ecritureBalisesAnnoncee, estRapportBalises, raisonsIgnorees,
  type EditionReponse, type RapportBalises,
} from '../editionAlbum';

class ResizeObserverInerte {
  observe() {} unobserve() {} disconnect() {}
}

const ALBUM_ID = 101;
const LOCAL = { id: ALBUM_ID, title: 'Kind of Blue', artist_name: 'Miles Davis', year: 1959 } as Album;

function edition(annonce: boolean): EditionReponse {
  return {
    album: {
      id: ALBUM_ID, title: 'Kind of Blue', album_artist: 'Miles Davis', year: 1959, label: null,
      genre: 'Jazz', release_type: 'album', cover_path: null, compilation_mode: 'auto',
      compilation_effective: false, coffret: null, champs_edites: ['title'],
    },
    discs: [{ number: 1, title: null, cover_path: null, track_count: 2 }],
    tracks: [
      { id: 11, disc_number: 1, track_number: 1, title: 'So What', artist_name: 'Miles Davis', duration_ms: 562000 },
      { id: 12, disc_number: 1, track_number: 2, title: 'Freddie Freeloader', artist_name: 'Miles Davis', duration_ms: 586000 },
    ],
    ...(annonce ? { ecriture_balises: true } : {}),
  };
}

function rapport(dryRun: boolean, aEcrire = 2): RapportBalises {
  const plan = Array.from({ length: aEcrire }, (_, k) => ({
    track_id: 11 + k,
    path: `/musique/Kind of Blue/0${k + 1}.flac`,
    changements: [
      { champ: 'ALBUM', avant: 'Kind Of Blue', apres: 'Kind of Blue' },
      { champ: 'TRACKTOTAL', avant: null, apres: '2' },
    ],
  }));
  return {
    dry_run: dryRun,
    ecrits: dryRun ? 0 : aEcrire,
    a_ecrire: aEcrire,
    inchanges: 0,
    plan,
    ignores: [{ track_id: 13, path: '/musique/Kind of Blue/03.dsf', raison: 'format_non_gere' }],
    erreurs: [],
  };
}

const reponse = (corps: unknown, status = 200) => ({
  ok: status >= 200 && status < 300, status, statusText: status === 200 ? 'OK' : 'Err',
  headers: new Map([['content-type', 'application/json']]),
  json: async () => corps,
  text: async () => JSON.stringify(corps),
} as unknown as Response);
const respirer = () => new Promise((r) => setTimeout(r, 0));
async function jusqua(condition: () => boolean, borne = 3000): Promise<boolean> {
  const fin = Date.now() + borne;
  for (;;) {
    flushSync();
    if (condition()) return true;
    if (Date.now() >= fin) return false;
    await respirer();
  }
}

let hote: HTMLDivElement | null = null;
let monte: Record<string, unknown> | null = null;
let appels: { methode: string; url: string; corps: any }[] = [];
/** Le serveur annonce-t-il `ecriture_balises` dans la fiche d'édition ? */
let annonce = true;
/** `absente` : la route d'écriture répond 404 (relais, serveur partiel). */
let routeBalises: 'presente' | 'absente' = 'presente';
let aEcrire = 2;

beforeEach(() => {
  appels = [];
  annonce = true;
  routeBalises = 'presente';
  aEcrire = 2;
  vi.stubGlobal('ResizeObserver', ResizeObserverInerte);
  vi.stubGlobal('fetch', vi.fn(async (url: any, init?: RequestInit) => {
    const u = String(url);
    const methode = (init?.method ?? 'GET').toUpperCase();
    const corps = typeof init?.body === 'string' ? JSON.parse(init.body) : null;
    appels.push({ methode, url: u, corps });
    if (/\/library\/albums\/\d+\/edition\/write-tags$/.test(u)) {
      if (routeBalises === 'absente') return reponse({ error: 'not found', path: u }, 404);
      return reponse(rapport(corps?.dry_run === true, aEcrire));
    }
    if (/\/library\/albums\/\d+\/edition$/.test(u)) return reponse(edition(annonce));
    if (/\/library\/albums\/\d+\/tracks/.test(u)) return reponse([]);
    if (/\/library\/albums\/\d+$/.test(u)) return reponse(LOCAL);
    return reponse([]);
  }));
  vi.stubGlobal('WebSocket', class {
    close() {} addEventListener() {} removeEventListener() {} send() {}
  } as unknown as typeof WebSocket);
  activeView.set('library');
});
afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  hote?.remove();
  hote = null;
  for (const d of get(dialogs)) dialogs.settle(d.id, false);
  vi.unstubAllGlobals();
});

const q = <T extends Element = HTMLElement>(sel: string) => hote?.querySelector<T>(sel) ?? null;
const bouton = () => q<HTMLButtonElement>('[data-ecrire-balises]');
const ecritures = () => appels.filter((a) => /\/write-tags$/.test(a.url));
const tr = (cle: string) => get(t)(cle as any);

async function ouvrirEdition() {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(AlbumDetailV2, { target: hote, props: { onClose: () => {}, album: LOCAL } as any });
  flushSync();
  expect(await jusqua(() => !!q('[data-modifier-album]')), 'pas de bouton « Modifier »').toBe(true);
  q<HTMLButtonElement>('[data-modifier-album]')!.click();
  expect(await jusqua(() => !!q('.edition'))).toBe(true);
}

describe('le bouton « Écrire dans les fichiers » n’apparaît que si le serveur l’annonce', () => {
  it('présent quand la fiche d’édition annonce `ecriture_balises`', async () => {
    await ouvrirEdition();
    expect(bouton()).not.toBeNull();
    expect(bouton()!.disabled).toBe(false);
    expect(ecritures(), 'la sonde ne doit rien écrire ni rien planifier').toHaveLength(0);
  });
  it('🔴 absent sur un serveur des tranches 1 à 3 (pas d’annonce)', async () => {
    annonce = false;
    await ouvrirEdition();
    for (let i = 0; i < 10; i++) { await respirer(); flushSync(); }
    expect(bouton()).toBeNull();
  });
  it('🔴 un 404 au clic retire le bouton et dit de mettre à jour le serveur', async () => {
    routeBalises = 'absente';
    await ouvrirEdition();
    bouton()!.click();
    expect(await jusqua(() => bouton() === null)).toBe(true);
    expect(q('[data-erreur-edition]')?.textContent).toContain(tr('v2.edition.errWriteTagsServer'));
    expect(get(dialogs)).toHaveLength(0);
  });
});

describe('grisé tant qu’il reste des modifications non enregistrées', () => {
  it('une saisie grise le bouton, l’effacer le rend', async () => {
    await ouvrirEdition();
    const titre = q<HTMLInputElement>('.ed-champs [name="title"]')!;
    titre.value = 'Kind of Blue (Legacy)';
    titre.dispatchEvent(new Event('input', { bubbles: true }));
    flushSync();
    expect(bouton()!.disabled).toBe(true);
    expect(bouton()!.title).toBe(tr('v2.edition.saveFirst'));
    bouton()!.click();
    for (let i = 0; i < 5; i++) { await respirer(); flushSync(); }
    expect(ecritures(), 'un bouton grisé ne doit rien envoyer').toHaveLength(0);
    // Contre-épreuve : revenir au titre enregistré dégrise.
    titre.value = 'Kind of Blue';
    titre.dispatchEvent(new Event('input', { bubbles: true }));
    flushSync();
    expect(bouton()!.disabled).toBe(false);
  });
});

describe('plan d’abord, confirmation, puis écriture', () => {
  it('dry_run → confirmation qui dit le plan → écriture → résultat', async () => {
    await ouvrirEdition();
    bouton()!.click();
    expect(await jusqua(() => get(dialogs).length === 1)).toBe(true);
    expect(ecritures()).toHaveLength(1);
    expect(ecritures()[0].methode).toBe('POST');
    expect(ecritures()[0].corps).toEqual({ dry_run: true });
    const question = get(dialogs)[0].message;
    expect(question).toContain('ALBUM');
    expect(question).toContain('TRACKTOTAL');
    expect(question).toContain(tr('v2.edition.tagsSkip.format_non_gere'));
    expect(question).toMatch(/\b2\b/);

    dialogs.settle(get(dialogs)[0].id, true);
    expect(await jusqua(() => !!q('[data-resultat-balises]'))).toBe(true);
    expect(ecritures()).toHaveLength(2);
    expect(ecritures()[1].corps).toEqual({ dry_run: false });
    expect(q('[data-resultat-balises]')!.textContent).toBe(
      tr('v2.edition.writeTagsResult').replace('{ecrits}', '2').replace('{ignores}', '1').replace('{erreurs}', '0'),
    );
    expect(q('[data-ignore="format_non_gere"]')?.textContent).toContain('03.dsf');
    expect(appels.some((a) => a.methode === 'PUT'), 'écrire ne ré-enregistre pas l’édition').toBe(false);
  });

  it('🔴 annuler la confirmation n’écrit rien', async () => {
    await ouvrirEdition();
    bouton()!.click();
    expect(await jusqua(() => get(dialogs).length === 1)).toBe(true);
    dialogs.settle(get(dialogs)[0].id, false);
    for (let i = 0; i < 10; i++) { await respirer(); flushSync(); }
    expect(ecritures()).toHaveLength(1);
    expect(ecritures()[0].corps).toEqual({ dry_run: true });
    expect(q('[data-resultat-balises]')).toBeNull();
  });

  it('rien à écrire : pas de confirmation, le dire', async () => {
    aEcrire = 0;
    await ouvrirEdition();
    bouton()!.click();
    expect(await jusqua(() => !!q('[data-rien-a-ecrire]'))).toBe(true);
    expect(get(dialogs)).toHaveLength(0);
    expect(ecritures()).toHaveLength(1);
  });
});

describe('règles pures du rapport', () => {
  it('forme, champs sans doublon, raisons regroupées', () => {
    const r = rapport(true, 2);
    expect(estRapportBalises(r)).toBe(true);
    expect(estRapportBalises(edition(true))).toBe(false);
    expect(estRapportBalises([])).toBe(false);
    expect(champsDuPlan(r)).toEqual(['ALBUM', 'TRACKTOTAL']);
    expect(raisonsIgnorees({ ...r, ignores: [
      { track_id: 1, path: 'a', raison: 'en_lecture' },
      { track_id: 2, path: 'b', raison: 'piste_cue' },
      { track_id: 3, path: 'c', raison: 'en_lecture' },
    ] })).toEqual([{ raison: 'piste_cue', n: 1 }, { raison: 'en_lecture', n: 2 }]);
    expect(ecritureBalisesAnnoncee(edition(true))).toBe(true);
    expect(ecritureBalisesAnnoncee(edition(false))).toBe(false);
  });
});
