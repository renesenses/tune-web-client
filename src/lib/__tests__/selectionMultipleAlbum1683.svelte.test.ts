// @vitest-environment jsdom
//
// web#1683, point 3 — Levente Toth, fil forum 1998 : « maybe there would be a
// nice option to be able to select multiple all songs - in case the user
// wants to update metadata eg. Artist / Genre so they don't have to do it
// one-by-one. » Go de Bertrand le 27/09/2026.
//
// 🔴 CES TÉMOINS MONTENT LA FICHE et cochent. Ils lisent ce qui part sur le
// réseau — `fetch` est remplacé, pas `api.ts` — parce que chaque geste groupé
// promet une ROUTE EXISTANTE :
//
//   lire      POST /zones/{id}/play                 { track_ids }
//   file      POST /zones/{id}/queue/add            { track_ids }
//   artiste   PUT  /library/albums/{id}/edition     { tracks: [{ id, artist_name }] }
//   genre     PUT  /library/tracks/{id}             { genre }
//
// Et toujours dans l'ORDRE DE L'ALBUM, jamais dans celui des clics.
//
// Contre-épreuve : sans le branchement de la fiche (bouton, cases, barre),
// `[data-selection-album]` n'existe pas et chaque cas monté échoue sur
// « pas de bouton Sélectionner ».
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';
import { mount, unmount, flushSync } from 'svelte';
import { t } from '../i18n';
import { activeView } from '../stores/navigation';
import { currentZoneId } from '../stores/zones';
import { preferences } from '../stores/preferences';
import type { Album } from '../types';
import AlbumDetailV2 from '../../components/v2/AlbumDetailV2.svelte';
import {
  SELECTION_VIDE, appliquerGenre, basculer, choisiesDansLOrdre, corpsArtistePistes,
  restreindre, toutOuRien,
} from '../selectionPistes';

class ResizeObserverInerte {
  observe() {} unobserve() {} disconnect() {}
}

const ALBUM_ID = 156;
const ALBUM = { id: ALBUM_ID, title: "What's Going On", artist_name: 'Marvin Gaye', year: 1971 } as Album;
const PISTES = [
  { id: 11, title: "What's Going On", track_number: 1, disc_number: 1, album_id: ALBUM_ID, artist_name: 'Marvin Gaye', duration_ms: 1000, source: 'local' },
  { id: 12, title: "What's Happening Brother", track_number: 2, disc_number: 1, album_id: ALBUM_ID, artist_name: 'Marvin Gaye', duration_ms: 1000, source: 'local' },
  { id: 13, title: 'Flyin\' High', track_number: 3, disc_number: 1, album_id: ALBUM_ID, artist_name: 'Marvin Gaye', duration_ms: 1000, source: 'local' },
];
/** La forme que `estReponseEdition` reconnaît : la sonde du mode Modifier. */
const EDITION = {
  album: { id: ALBUM_ID, title: ALBUM.title, album_artist: 'Marvin Gaye', year: 1971, label: null, genre: 'Soul',
    release_type: null, cover_path: null, compilation_mode: 'auto', compilation_effective: false, coffret: null, champs_edites: [] },
  discs: [{ number: 1, title: null, cover_path: null, track_count: 3 }],
  tracks: PISTES.map((p) => ({ id: p.id, disc_number: 1, track_number: p.track_number, title: p.title, artist_name: p.artist_name, duration_ms: 1000 })),
};

const reponse = (corps: unknown) => ({
  ok: true, status: 200, statusText: 'OK',
  headers: new Map([['content-type', 'application/json']]),
  json: async () => corps,
  text: async () => JSON.stringify(corps),
} as unknown as Response);
const respirer = () => new Promise((r) => setTimeout(r, 0));
async function jusqua(condition: () => boolean, borne = 4000): Promise<void> {
  const fin = Date.now() + borne;
  for (;;) {
    flushSync();
    if (condition()) return;
    if (Date.now() >= fin) return;
    await respirer();
  }
}

let hote: HTMLDivElement | null = null;
let monte: Record<string, unknown> | null = null;
let appels: { methode: string; url: string; corps: any }[] = [];

beforeEach(() => {
  appels = [];
  vi.stubGlobal('ResizeObserver', ResizeObserverInerte);
  vi.stubGlobal('fetch', vi.fn(async (url: any, init?: RequestInit) => {
    const u = String(url);
    const methode = (init?.method ?? 'GET').toUpperCase();
    appels.push({ methode, url: u, corps: init?.body ? JSON.parse(String(init.body)) : null });
    if (/\/library\/albums\/\d+\/tracks/.test(u)) return reponse(PISTES);
    if (/\/library\/albums\/\d+\/edition$/.test(u)) return reponse(EDITION);
    if (/\/library\/albums\/\d+$/.test(u)) return reponse(ALBUM);
    if (/\/library\/tracks\/\d+$/.test(u)) return reponse({ status: 'ok' });
    if (/\/queue\/add$/.test(u)) return reponse({ queue_length: 3 });
    if (/\/zones\/\d+\/play$/.test(u)) return reponse({ id: 1, name: 'Salon' });
    return reponse([]);
  }));
  vi.stubGlobal('WebSocket', class {
    close() {} addEventListener() {} removeEventListener() {} send() {}
  } as unknown as typeof WebSocket);
  activeView.set('library');
  currentZoneId.set(1);
});

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  hote?.remove();
  hote = null;
  document.querySelectorAll('.modal-backdrop').forEach((n) => n.remove());
  vi.unstubAllGlobals();
});

function poser(props: Record<string, unknown>) {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(AlbumDetailV2, { target: hote, props: { onClose: () => {}, ...props } as any });
  flushSync();
}

const boutonSelection = () => hote?.querySelector<HTMLButtonElement>('[data-selection-album]') ?? null;
const cases = () => Array.from(hote?.querySelectorAll<HTMLInputElement>('input[data-case-piste]') ?? []);
const caseDe = (id: number) => hote!.querySelector<HTMLInputElement>(`input[data-case-piste="${id}"]`)!;
const barre = (attr: string) => hote!.querySelector<HTMLButtonElement>(`.barre-selection [${attr}]`)!;
const cliquer = (el: HTMLElement, shiftKey = false) => {
  el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, shiftKey }));
  flushSync();
};
const envois = (motif: RegExp, methode = 'POST') => appels.filter((a) => a.methode === methode && motif.test(a.url));

async function ouvrirLaSelection() {
  poser({ album: ALBUM });
  await jusqua(() => !!boutonSelection());
  expect(boutonSelection(), 'pas de bouton Sélectionner').not.toBeNull();
  // Pas de case tant que la sélection n'est pas ouverte : la liste d'avant.
  expect(cases()).toHaveLength(0);
  cliquer(boutonSelection()!);
  await jusqua(() => cases().length === 3);
  expect(cases()).toHaveLength(3);
}

describe.each(['beginner', 'intermediate'] as const)('la fiche d’un album de la bibliothèque (mode %s)', (niveau) => {
  beforeEach(() => { preferences.update((p) => ({ ...p, settingsLevel: niveau })); });

  it('🔴 cocher 13 puis 11 ⇒ « Ajouter à la file » envoie [11, 13], l’ordre de l’album, en UNE requête', async () => {
    await ouvrirLaSelection();
    cliquer(caseDe(13));
    cliquer(caseDe(11));
    expect(hote!.querySelector('[data-sel-compte]')?.textContent?.trim())
      .toBe(get(t)('v2.selection.countMany' as any).replace('{n}', '2'));
    cliquer(barre('data-sel-file'));
    await jusqua(() => envois(/\/zones\/1\/queue\/add$/).length > 0);
    const file = envois(/\/zones\/1\/queue\/add$/);
    expect(file).toHaveLength(1);
    expect(file[0].corps).toEqual({ track_ids: [11, 13] });
  });

  it('Maj+clic coche la plage ; « Lire » envoie les trois pistes', async () => {
    await ouvrirLaSelection();
    cliquer(caseDe(11));
    cliquer(caseDe(13), true);
    expect(cases().map((c) => c.checked)).toEqual([true, true, true]);
    cliquer(barre('data-sel-lire'));
    await jusqua(() => envois(/\/zones\/1\/play$/).length > 0);
    expect(envois(/\/zones\/1\/play$/)[0].corps).toEqual({ track_ids: [11, 12, 13] });
  });

  it('🔴 « Changer le genre » ⇒ PUT /library/tracks/{id} { genre } pour CHAQUE piste choisie, et rien d’autre', async () => {
    await ouvrirLaSelection();
    cliquer(barre('data-sel-tout'));
    cliquer(caseDe(12));
    cliquer(barre('data-sel-genre'));
    const champ = hote!.querySelector<HTMLInputElement>('[data-sel-edition] input')!;
    champ.value = '  Soul  ';
    champ.dispatchEvent(new Event('input', { bubbles: true }));
    flushSync();
    hote!.querySelector<HTMLFormElement>('[data-sel-edition]')!
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await jusqua(() => envois(/\/library\/tracks\/\d+$/, 'PUT').length === 2);
    const puts = envois(/\/library\/tracks\/\d+$/, 'PUT');
    expect(puts.map((p) => [p.url.replace(/.*\/tracks\//, ''), p.corps])).toEqual([
      ['11', { genre: 'Soul' }],
      ['13', { genre: 'Soul' }],
    ]);
  });

  it('🔴 « Changer l’artiste » ⇒ UN PUT /library/albums/{id}/edition { tracks: [{ id, artist_name }] }', async () => {
    await ouvrirLaSelection();
    await jusqua(() => !!hote!.querySelector('.barre-selection [data-sel-artiste]'));
    cliquer(caseDe(12));
    cliquer(caseDe(13));
    cliquer(barre('data-sel-artiste'));
    const champ = hote!.querySelector<HTMLInputElement>('[data-sel-edition] input')!;
    champ.value = 'Marvin Gaye & Tammi Terrell';
    champ.dispatchEvent(new Event('input', { bubbles: true }));
    flushSync();
    hote!.querySelector<HTMLFormElement>('[data-sel-edition]')!
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await jusqua(() => envois(/\/library\/albums\/\d+\/edition$/, 'PUT').length > 0);
    const puts = envois(/\/library\/albums\/\d+\/edition$/, 'PUT');
    expect(puts).toHaveLength(1);
    expect(puts[0].url).toMatch(new RegExp(`/library/albums/${ALBUM_ID}/edition$`));
    expect(puts[0].corps).toEqual({ tracks: [
      { id: 12, artist_name: 'Marvin Gaye & Tammi Terrell' },
      { id: 13, artist_name: 'Marvin Gaye & Tammi Terrell' },
    ] });
    // Aucune écriture piste par piste pour l'artiste.
    expect(envois(/\/library\/tracks\/\d+$/, 'PUT')).toHaveLength(0);
  });

  it('« Terminer » retire les cases : la liste redevient celle d’avant', async () => {
    await ouvrirLaSelection();
    cliquer(caseDe(11));
    cliquer(boutonSelection()!);
    expect(cases()).toHaveLength(0);
    expect(hote!.querySelector('.barre-selection')).toBeNull();
  });
});

describe('🔴 pas de sélection quand l’album n’est pas de NOTRE bibliothèque', () => {
  it('album de service : pas d’identifiant local', async () => {
    poser({ album: { ...ALBUM, id: null, source: 'qobuz', source_id: 'q-1' } as any, service: 'qobuz' });
    await jusqua(() => (hote?.querySelectorAll('.actions button').length ?? 0) > 0);
    expect(boutonSelection()).toBeNull();
  });

  it('dépôt Tune distant : son `id` est celui d’un autre serveur', async () => {
    poser({ album: ALBUM, depot: { base: 'http://10.0.0.2:8080/api/v1', nom: 'Salon', hote: '10.0.0.2' } });
    await jusqua(() => (hote?.querySelectorAll('.actions button').length ?? 0) > 0);
    expect(boutonSelection()).toBeNull();
  });
});

describe('lib/selectionPistes — les règles', () => {
  const ordre = [11, 12, 13, 14];

  it('basculer, puis Maj+clic : la plage prend l’état de l’ancre, dans les deux sens', () => {
    let e = basculer(SELECTION_VIDE, 14, ordre);
    e = basculer(e, 12, ordre, true);
    expect(choisiesDansLOrdre(e, ordre)).toEqual([12, 13, 14]);
    e = basculer(e, 13, ordre);           // décoche 13, nouvelle ancre
    e = basculer(e, 11, ordre, true);     // la plage 11–13 prend l'état « décoché »
    expect(choisiesDansLOrdre(e, ordre)).toEqual([14]);
  });

  it('tout, puis rien', () => {
    const tout = toutOuRien(SELECTION_VIDE, ordre);
    expect(choisiesDansLOrdre(tout, ordre)).toEqual(ordre);
    expect(choisiesDansLOrdre(toutOuRien(tout, ordre), ordre)).toEqual([]);
  });

  it('restreindre retire ce qui n’existe plus, et garde l’objet quand rien ne change', () => {
    const e = toutOuRien(SELECTION_VIDE, ordre);
    expect(restreindre(e, ordre)).toBe(e);
    expect(choisiesDansLOrdre(restreindre(e, [11, 13]), ordre)).toEqual([11, 13]);
  });

  it('corpsArtistePistes : rien à envoyer pour un nom vide', () => {
    expect(corpsArtistePistes([11], '   ')).toBeNull();
    expect(corpsArtistePistes([], 'X')).toBeNull();
    expect(corpsArtistePistes([11, 12], ' X ')).toEqual({ tracks: [{ id: 11, artist_name: 'X' }, { id: 12, artist_name: 'X' }] });
  });

  it('appliquerGenre : en série, un échec n’arrête pas la suite, le bilan compte', async () => {
    const vus: number[] = [];
    const bilan = await appliquerGenre([11, 12, 13], 'Soul', async (id) => {
      vus.push(id);
      if (id === 12) throw new Error('500');
    });
    expect(vus).toEqual([11, 12, 13]);
    expect(bilan).toEqual({ reussies: 2, echouees: 1 });
    expect(await appliquerGenre([11], '  ', async () => {})).toEqual({ reussies: 0, echouees: 0 });
  });
});
