// @vitest-environment jsdom
/**
 * web#2790 (reste client de tune-server-rust#7414, Benjithom, fil 2643) — quand
 * la tâche de fond « Enrichissement » est en pause, la passe automatique des
 * logos de labels ne tourne pas, et l'onglet Labels laissait croire qu'il n'y
 * avait pas de logo. Et « Lancer la passe » (État du serveur, carte « Logos
 * des labels ») disait « Traitement lancé. » même quand le serveur (rc11+)
 * répondait `forced: true, reason: "enrichment_paused"`.
 *
 * Tenu ici :
 *  1. `issueDe` : `forced: true` ⇒ `forcee` ; sans `forced`, toujours `lance`
 *     (contre-épreuve) ;
 *  2. la RÈGLE de la ligne « Logos en attente » : enrichissement en pause ET
 *     au moins un label sans logo ;
 *  3. le BRANCHEMENT dans l'onglet Labels : la ligne est là quand il faut,
 *     absente sinon (enrichissement actif, ou tous les labels ont un logo) ;
 *  4. les deux textes dans les quinze langues.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import LibraryV2 from '../../components/v2/LibraryV2.svelte';
import { activeView } from '../stores/navigation';
import { albums as albumsStore, libraryFolderScope } from '../stores/library';
import { locale } from '../i18n';
import type { Album } from '../types';
import { preferences } from '../stores/preferences';
import { CLE_ISSUE, issueDe } from '../lancerTraitement';
import { logosEnAttente } from '../logosLabels';
import de from '../locales/de';
import en from '../locales/en';
import es from '../locales/es';
import fr from '../locales/fr';
import hu from '../locales/hu';
import viLocale from '../locales/vi';
import elLocale from '../locales/el';
import nbLocale from '../locales/nb';
import plLocale from '../locales/pl';
import it_ from '../locales/it';
import ja from '../locales/ja';
import ko from '../locales/ko';
import ro from '../locales/ro';
import sv from '../locales/sv';
import zh from '../locales/zh';

vi.setConfig({ testTimeout: 60_000 });

const DICOS: Record<string, Record<string, string>> = {
  de, en, es, fr, hu, vi: viLocale, el: elLocale, nb: nbLocale, pl: plLocale, it: it_, ja, ko, ro, sv, zh,
} as unknown as Record<string, Record<string, string>>;
const LANGUES = ['de', 'el', 'en', 'es', 'fr', 'hu', 'it', 'ja', 'ko', 'nb', 'pl', 'ro', 'sv', 'vi', 'zh'] as const;

class ResizeObserverInerte { observe() {} unobserve() {} disconnect() {} }
for (const [prop, valeur] of [['clientHeight', 2000], ['clientWidth', 1400]] as const) {
  Object.defineProperty(HTMLElement.prototype, prop, { configurable: true, get: () => valeur });
}

const LABELS = ['Blue Note', 'Factory', 'Rough Trade'];
const ALBUMS: Album[] = Array.from({ length: 24 }, (_, i) => ({
  id: i + 1,
  title: `Album ${String(i + 1).padStart(2, '0')}`,
  artist_name: `Artiste ${(i % 5) + 1}`,
  year: 1978 + (i % 6),
  label: LABELS[i % 3],
})) as unknown as Album[];
const CONDENSAT = 'ab'.repeat(32);
const LOGO = `/api/v1/library/artwork/${CONDENSAT}`;

/** `GET /system/background-tasks` : l'enrichissement en pause, ou non. */
function tachesDeFond(enrichissementEnPause: boolean) {
  return {
    tasks: [],
    pausable: [
      { id: 'artist_images', label: 'Images', state: 'idle', paused: false },
      { id: 'enrichment', label: 'Enrichissement', state: 'idle', paused: enrichissementEnPause },
    ],
    all_paused: false,
  };
}

let hote: HTMLDivElement | null = null;
let monte: Record<string, unknown> | null = null;
let routeLabels: () => unknown;
let routeTaches: () => unknown;
const respirer = () => new Promise((r) => setTimeout(r, 0));
async function laisserVivre(n = 14): Promise<void> {
  for (let i = 0; i < n; i++) await respirer();
  flushSync();
}

function reponse(status: number, corps: unknown): Response {
  return {
    ok: status >= 200 && status < 300, status, statusText: String(status),
    headers: new Map([['content-type', 'application/json']]),
    json: async () => corps,
    text: async () => JSON.stringify(corps),
  } as unknown as Response;
}

async function ongletLabels(): Promise<HTMLElement> {
  activeView.set('library');
  albumsStore.set([...ALBUMS]);
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(LibraryV2, { target: hote, props: {} as never });
  await laisserVivre();
  const onglet = hote.querySelector<HTMLButtonElement>('.tab[data-onglet="labels"]');
  expect(onglet, 'onglet Labels absent').not.toBeNull();
  onglet!.click();
  await laisserVivre();
  return hote;
}

function demonter() {
  if (monte) unmount(monte);
  monte = null;
  hote?.remove();
  hote = null;
}

beforeEach(() => {
  locale.set('fr');
  preferences.update((p) => ({ ...p, settingsLevel: 'intermediate' }));
  activeView.set('home');
  libraryFolderScope.set(null);
  albumsStore.set([]);
  localStorage.clear();
  vi.stubGlobal('ResizeObserver', ResizeObserverInerte);
  routeLabels = () => [
    { name: 'Blue Note', album_count: 8, image_url: LOGO },
    { name: 'Factory', album_count: 8 },
    { name: 'Rough Trade', album_count: 8 },
  ];
  routeTaches = () => tachesDeFond(true);
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    const u = String(url);
    if (u.endsWith('/library/labels')) return reponse(200, routeLabels());
    if (u.endsWith('/system/background-tasks')) return reponse(200, routeTaches());
    return reponse(200, []);
  }));
  vi.stubGlobal('WebSocket', class { close() {} addEventListener() {} removeEventListener() {} send() {} } as never);
});

afterEach(() => {
  demonter();
  albumsStore.set([]);
  activeView.set('home');
  localStorage.clear();
  vi.unstubAllGlobals();
});

describe('web#2790 — « Lancer la passe » des logos lit `forced`', () => {
  it('`forced: true` + `reason: enrichment_paused` ⇒ « lancée malgré la pause »', () => {
    expect(issueDe('accepted', { status: 'accepted', forced: true, reason: 'enrichment_paused' })).toBe('forcee');
    expect(CLE_ISSUE.forcee).toBe('v2.health.launchLabelLogosForced');
  });

  it('contre-épreuve : sans `forced`, toujours « lancée »', () => {
    expect(issueDe('accepted', { status: 'accepted' })).toBe('lance');
    expect(issueDe('accepted', { status: 'accepted', forced: false })).toBe('lance');
    expect(issueDe('accepted')).toBe('lance');
    // Les autres issues ne changent pas, `forced` ou non.
    expect(issueDe('already_running', { status: 'already_running', forced: true })).toBe('deja');
    expect(issueDe('nothing_to_do', { status: 'nothing_to_do', forced: true })).toBe('rien');
  });
});

describe('web#2790 — la règle « Logos en attente »', () => {
  const sansLogo = [{ name: 'Blue Note', album_count: 8, image_url: LOGO }, { name: 'Factory', album_count: 8 }];
  const tousAvecLogo = [{ name: 'Blue Note', album_count: 8, image_url: LOGO }, { name: 'Factory', album_count: 8, image_url: LOGO }];

  it('en pause ET un label sans logo ⇒ oui', () => {
    expect(logosEnAttente(sansLogo, tachesDeFond(true))).toBe(true);
  });

  it('enrichissement actif ⇒ non ; tous les logos connus ⇒ non', () => {
    expect(logosEnAttente(sansLogo, tachesDeFond(false))).toBe(false);
    expect(logosEnAttente(tousAvecLogo, tachesDeFond(true))).toBe(false);
  });

  it('serveur sans la pause, liste vide, ou rien du tout ⇒ non', () => {
    expect(logosEnAttente(sansLogo, { tasks: [] })).toBe(false);
    expect(logosEnAttente(sansLogo, null)).toBe(false);
    expect(logosEnAttente([], tachesDeFond(true))).toBe(false);
    expect(logosEnAttente(null, tachesDeFond(true))).toBe(false);
  });
});

describe('web#2790 — l’onglet Labels dit que les logos attendent', () => {
  it('enrichissement en pause + un label sans logo : la ligne est en tête, en liste comme en grille', async () => {
    const el = await ongletLabels();
    const ligne = el.querySelector<HTMLElement>('.fliste .lgpause');
    expect(ligne, 'la ligne « Logos en attente » manque').not.toBeNull();
    expect(ligne!.textContent?.trim()).toBe('Logos en attente : l’enrichissement est en pause');
    expect(ligne!.nextElementSibling?.classList.contains('fl'), 'la ligne précède la liste').toBe(true);

    el.querySelector<HTMLButtonElement>('.viewtog')!.click();
    await laisserVivre();
    const enGrille = el.querySelector<HTMLElement>('.fliste .lgpause');
    expect(enGrille, 'la ligne manque en grille').not.toBeNull();
    expect(enGrille!.nextElementSibling?.classList.contains('lgcase')).toBe(true);
  });

  it('enrichissement actif : pas de ligne', async () => {
    routeTaches = () => tachesDeFond(false);
    const el = await ongletLabels();
    expect(el.querySelectorAll('.fliste .fl').length).toBe(3);
    expect(el.querySelector('.fliste .lgpause')).toBeNull();
  });

  it('tous les labels ont un logo : pas de ligne, même en pause', async () => {
    routeLabels = () => LABELS.map((name) => ({ name, album_count: 8, image_url: LOGO }));
    const el = await ongletLabels();
    expect(el.querySelectorAll('.fliste .fl').length).toBe(3);
    expect(el.querySelector('.fliste .lgpause')).toBeNull();
  });

  it('en anglais', async () => {
    locale.set('en');
    const el = await ongletLabels();
    expect(el.querySelector('.fliste .lgpause')?.textContent?.trim()).toBe('Logos pending: enrichment is paused');
  });
});

describe('web#2790 — les deux textes dans les quinze langues', () => {
  it.each(LANGUES)('%s', (l) => {
    const dico = DICOS[l];
    for (const k of ['v2.labels.logosEnPause', 'v2.health.launchLabelLogosForced']) {
      expect(dico[k]?.trim(), `${l} : ${k}`).toBeTruthy();
    }
  });
  it('fr et en : le texte exact de l’issue', () => {
    expect(fr['v2.labels.logosEnPause']).toBe('Logos en attente : l’enrichissement est en pause');
    expect(en['v2.labels.logosEnPause']).toBe('Logos pending: enrichment is paused');
    expect(fr['v2.health.launchLabelLogosForced']).toBe('Passe lancée malgré la pause de l’enrichissement');
    expect(en['v2.health.launchLabelLogosForced']).toBe('Pass started despite enrichment being paused');
  });
});
