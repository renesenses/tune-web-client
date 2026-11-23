// @vitest-environment jsdom
//
// tune-server-rust#7901 — fil 2658 (Dimitri, Chrome) : « When clicking on Now
// playing in the sidebar, the Library is selected instead ». Signalé en rc10,
// donné pour corrigé en rc11, REVENU en rc12 (réponse 11600).
//
// La capture du fil montre la FICHE d'un album de la Bibliothèque : le
// réglage « Lecture en cours ouvre l'album ou la playlist » (web#1784) est
// coché. Le clic mène donc à la route `library`, et la barre allumait
// « Bibliothèque ». Le premier correctif (1b1adc8d2) ne vérifiait que
// `estActif` sur la route `nowplaying` : ce cas-là n'y passait jamais.
//
// Ce banc MONTE la barre latérale, clique les entrées réellement peintes et
// lit les boutons surlignés (`button.nav.active`). Il ne cherche aucune
// chaîne dans les sources.
//
// CONTRE-ÉPREUVE : sans `vueBarre` dans `Sidebar.svelte` (estActif sur
// `$activeView`), les témoins 🔴 rougissent — « library » est surlignée.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import { get } from 'svelte/store';
import SidebarV2 from '../../components/v2/Sidebar.svelte';
import { activeView, gestesNavigationService, pendingLibraryAlbum } from '../stores/navigation';
import { detailOuvert } from '../historiqueCoquille';
import { zones, currentZoneId } from '../stores/zones';
import { preferences } from '../stores/preferences';
import { tiroirOuvert } from '../largeurEcran';
import { locale } from '../i18n';
import { ouvertureLectureEnCours } from '../ouvertureLectureEnCours';

const PISTE_LOCALE = {
  track_id: 77, album_id: 5, artist_id: 3,
  title: 'Timebombs', artist_name: 'Disarm', album_title: 'Last Studio Recording',
  source: 'local', duration_ms: 181000,
};

let zoneServeur: Record<string, unknown> = {};
let routes: Array<[RegExp, number, unknown]> = [];
let hote: HTMLDivElement | null = null;
let monte: Record<string, any> | null = null;

function reponse(status: number, corps: unknown): Response {
  return {
    ok: status >= 200 && status < 300, status, statusText: String(status),
    headers: new Map([['content-type', 'application/json']]),
    json: async () => corps, text: async () => JSON.stringify(corps),
  } as unknown as Response;
}

function repondre(url: string): Response {
  for (const [motif, status, corps] of routes) if (motif.test(url)) return reponse(status, corps);
  if (/\/zones\/1(\?|$)/.test(url)) return reponse(200, zoneServeur);
  if (/\/(zones|profiles|devices|playlists|shortcuts|plugins|sources)(\?|$)/.test(url)) return reponse(200, []);
  return reponse(200, {});
}

function poserZone(ctx: { type: string; id: string; source: string } | null): void {
  const z = {
    id: 1, name: 'Salon', state: 'playing', current_track: PISTE_LOCALE, position_ms: 1000,
    ...(ctx ? { session_context_type: ctx.type, session_context_id: ctx.id, session_context_source: ctx.source } : {}),
  };
  zoneServeur = z;
  zones.set([{ ...z, session_context_type: undefined, session_context_id: undefined, session_context_source: undefined }] as any);
  currentZoneId.set(1);
}

const respirer = (ms = 30) => new Promise((r) => setTimeout(r, ms));
const reglage = (on: boolean) => preferences.update((p) => ({ ...p, lienLectureVersSource: on }));

function monter(): void {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(SidebarV2, { target: hote });
  flushSync();
}

function entree(vue: string): HTMLButtonElement {
  const b = hote!.querySelector<HTMLButtonElement>(`button.nav[data-vue="${vue}"]`);
  expect(b, `l’entrée « ${vue} » n’est pas peinte — témoin sans objet`).toBeTruthy();
  return b!;
}

/** Les entrées surlignées de la barre (bulle de sélection). */
function surlignees(): string[] {
  return [...hote!.querySelectorAll<HTMLButtonElement>('button.nav.active')]
    .map((b) => b.dataset.vue ?? b.dataset.source ?? b.textContent?.trim() ?? '?');
}

async function cliquer(b: HTMLButtonElement): Promise<void> {
  b.click();
  flushSync();
  await respirer();
  flushSync();
}

beforeEach(() => {
  locale.set('fr');
  routes = [];
  vi.stubGlobal('fetch', vi.fn(async (e: unknown) =>
    repondre(String(typeof e === 'string' ? e : (e as Request)?.url ?? e))));
  vi.stubGlobal('ResizeObserver', class { observe(){} unobserve(){} disconnect(){} } as any);
  activeView.set('home');
  detailOuvert.set(null);
  pendingLibraryAlbum.set(null);
  ouvertureLectureEnCours.set(null);
});

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  hote?.remove();
  hote = null;
  zones.set([]);
  currentZoneId.set(null as any);
  gestesNavigationService.set(null);
  pendingLibraryAlbum.set(null);
  detailOuvert.set(null);
  ouvertureLectureEnCours.set(null);
  tiroirOuvert.set(false);
  activeView.set('home');
  reglage(false);
  vi.unstubAllGlobals();
});

const ALBUM_BIBLIOTHEQUE: [RegExp, number, unknown] = [/\/zones\/1\/album-en-cours/, 200,
  { zone_id: 1, kind: 'library', service: 'local', album_id: '5', artist_id: '3', path: '/albums/5', origin: 'session_context' }];

describe('#7901 (fil 2658, rc12) — « Lecture en cours » ouvre la fiche de ce qui joue', () => {
  it('🔴 la fiche d’album ouverte par Lecture en cours allume « Lecture en cours », pas « Bibliothèque »', async () => {
    reglage(true);
    poserZone({ type: 'album', id: '5', source: 'local' });
    routes.push(ALBUM_BIBLIOTHEQUE);
    monter();
    await cliquer(entree('nowplaying'));
    // Le réglage a bien mené à la fiche (route `library`) — sinon témoin sans objet.
    expect(get(activeView)).toBe('library');
    expect(get(pendingLibraryAlbum)).toBe(5);
    expect(surlignees()).toEqual(['nowplaying']);
    // L'écran Bibliothèque pose la clé de la fiche APRÈS le changement de vue :
    // la fiche de ce qui joue reste « Lecture en cours ».
    detailOuvert.set('album:5');
    flushSync();
    expect(surlignees()).toEqual(['nowplaying']);
  });

  it('🔴 même chose depuis la Bibliothèque déjà ouverte', async () => {
    reglage(true);
    poserZone({ type: 'album', id: '5', source: 'local' });
    routes.push(ALBUM_BIBLIOTHEQUE);
    activeView.set('library');
    monter();
    expect(surlignees()).toEqual(['library']);
    await cliquer(entree('nowplaying'));
    expect(get(activeView)).toBe('library');
    expect(surlignees()).toEqual(['nowplaying']);
  });

  it('🔴 une playlist ouverte par Lecture en cours allume aussi « Lecture en cours »', async () => {
    reglage(true);
    poserZone({ type: 'playlist', id: '12', source: 'local' });
    routes.push([/\/playlists\/12(\?|$)/, 200, { id: 12, name: 'Du soir', track_count: 9 }]);
    monter();
    await cliquer(entree('nowplaying'));
    expect(get(activeView)).toBe('playlists');
    expect(surlignees()).toEqual(['nowplaying']);
  });

  it('la marque tombe dès qu’on quitte la fiche : clic sur Bibliothèque, autre fiche, retour à la liste, autre vue', async () => {
    reglage(true);
    poserZone({ type: 'album', id: '5', source: 'local' });
    routes.push(ALBUM_BIBLIOTHEQUE);
    monter();

    await cliquer(entree('nowplaying'));
    detailOuvert.set('album:5');
    flushSync();
    expect(surlignees()).toEqual(['nowplaying']);
    await cliquer(entree('library'));
    expect(surlignees()).toEqual(['library']);

    await cliquer(entree('nowplaying'));
    detailOuvert.set('album:5');
    flushSync();
    detailOuvert.set('artist:3'); // un lien de la fiche mène à l'artiste
    flushSync();
    expect(surlignees()).toEqual(['library']);

    await cliquer(entree('nowplaying'));
    detailOuvert.set('album:5');
    flushSync();
    detailOuvert.set(null); // le Retour de la fiche ramène à la liste
    flushSync();
    expect(surlignees()).toEqual(['library']);

    await cliquer(entree('nowplaying'));
    activeView.set('queue');
    flushSync();
    expect(surlignees()).toEqual(['queue']);
    activeView.set('library');
    flushSync();
    expect(surlignees()).toEqual(['library']);
  });

  it('rien ne joue : l’écran Lecture en cours, et c’est lui qui est surligné', async () => {
    reglage(true);
    zones.set([{ id: 1, name: 'Salon', state: 'stopped', current_track: null }] as any);
    currentZoneId.set(1);
    monter();
    await cliquer(entree('nowplaying'));
    expect(get(activeView)).toBe('nowplaying');
    expect(surlignees()).toEqual(['nowplaying']);
  });
});

describe('#7901 — chaque entrée de la barre allume la sienne, et elle seule', () => {
  it('réglage décoché : Lecture en cours → écran dédié, « Lecture en cours » surlignée', async () => {
    reglage(false);
    poserZone({ type: 'album', id: '5', source: 'local' });
    routes.push(ALBUM_BIBLIOTHEQUE);
    monter();
    await cliquer(entree('nowplaying'));
    expect(get(activeView)).toBe('nowplaying');
    expect(surlignees()).toEqual(['nowplaying']);
  });

  it('un clic sur chaque entrée peinte n’allume qu’elle', async () => {
    reglage(false);
    monter();
    const vues = [...hote!.querySelectorAll<HTMLButtonElement>('button.nav[data-vue]')]
      .map((b) => b.dataset.vue!)
      .filter((v, i, l) => l.indexOf(v) === i);
    expect(vues).toEqual(expect.arrayContaining(['home', 'nowplaying', 'queue', 'library']));
    for (const v of vues) {
      await cliquer(entree(v));
      expect(surlignees(), `entrée ${v}`).toEqual([v]);
    }
  });
});
