// @vitest-environment jsdom
//
// tune-server-rust#7089 — Bertrand, 26/10 : chaque logo de label porte sa
// source et ce qu'on sait de sa licence, affichés discrètement au survol, dans
// toutes les langues : libre (auteur, licence, Commons), non libre en usage
// d'identification (Wikipédia), inconnue (site officiel, Discogs, Qobuz). Un
// logo douteux (« œuvre personnelle » déclarée par un tiers) le dit.
//
// Ce témoin MONTE la Bibliothèque, ouvre l'onglet Labels en grille, et lit le
// `title` du logo.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import LibraryV2 from '../../components/v2/LibraryV2.svelte';
import { activeView } from '../stores/navigation';
import { albums as albumsStore, libraryFolderScope } from '../stores/library';
import { locale } from '../i18n';
import type { Album } from '../types';
import { preferences } from '../stores/preferences';
import { carteDesCredits, creditDuLabel, texteDuCredit } from '../logosLabels';
import { ONZE_LANGUES, dictionnaire } from './onzeDictionnaires';

vi.setConfig({ testTimeout: 60_000 });

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
const CREDIT_BLUE_NOTE = {
  source: 'commons', provider: 'Wikimedia Commons', license_status: 'free', license: 'Public domain',
  author: 'Blue Note Records', source_url: 'https://commons.wikimedia.org/wiki/File:Blue_Note_Records.svg',
  file: 'Blue Note Records.svg',
} as const;
const CREDIT_DOUTEUX = {
  source: 'commons', provider: 'Wikimedia Commons', license_status: 'free', license: 'CC BY-SA 4.0',
  source_url: 'https://commons.wikimedia.org/wiki/File:X.svg', file: 'X.svg', doubtful: true,
} as const;
const CREDIT_QOBUZ = { source: 'qobuz', provider: 'Qobuz', license_status: 'unknown' } as const;
const CREDIT_WIKIPEDIA = {
  source: 'wikipedia', provider: 'Wikipedia', license_status: 'non_free_identification', license: 'Fair use',
  source_url: 'https://en.wikipedia.org/wiki/File:ECM.png', file: 'ECM.png',
} as const;

let hote: HTMLDivElement | null = null;
let monte: Record<string, unknown> | null = null;
let routeLabels: () => { status: number; corps: unknown };
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
  routeLabels = () => ({ status: 200, corps: [
    { name: 'Blue Note', album_count: 8, image_url: `/api/v1/library/artwork/${CONDENSAT}`,
      image_credit: CREDIT_BLUE_NOTE },
    { name: 'Factory', album_count: 8, image_url: `/api/v1/library/artwork/${'cd'.repeat(32)}`, qobuz_label_id: '7',
      image_credit: CREDIT_QOBUZ },
    { name: 'Rough Trade', album_count: 8, image_url: `/api/v1/library/artwork/${'ef'.repeat(32)}`,
      image_credit: CREDIT_DOUTEUX },
  ] });
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if (String(url).endsWith('/library/labels')) {
      const r = routeLabels();
      return reponse(r.status, r.corps);
    }
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

async function grille(): Promise<HTMLElement> {
  const el = await ongletLabels();
  el.querySelector<HTMLButtonElement>('.viewtog')!.click();
  await laisserVivre();
  return el;
}

describe('tune-server-rust#7089 — l’attribution des logos libres', () => {
  it('au survol : la source et la licence connue ; « à vérifier » pour un douteux', async () => {
    const el = await grille();
    const logo = (nom: string) => el.querySelector<HTMLElement>(`.lgcase[data-label="${nom}"] .lglogo`)!;
    expect(logo('Blue Note').getAttribute('title')).toBe('Logo : Blue Note Records · Public domain · Wikimedia Commons');
    expect(logo('Factory').querySelector('img'), 'le logo Qobuz reste affiché').not.toBeNull();
    expect(logo('Factory').getAttribute('title')).toBe('Logo : Qobuz · licence inconnue');
    expect(logo('Rough Trade').getAttribute('title')).toBe('Logo : CC BY-SA 4.0 · Wikimedia Commons · licence à vérifier');
  });

  it('un logo non libre de Wikipédia se dit « usage d’identification » ; celui d’un site, « licence inconnue »', () => {
    const fr = dictionnaire('fr');
    const tr = (k: string) => fr[k];
    expect(texteDuCredit(CREDIT_WIKIPEDIA, tr)).toBe("Logo : Wikipedia · non libre, usage d'identification");
    expect(texteDuCredit({ source: 'official_site', provider: 'bluenote.com', license_status: 'unknown' }, tr))
      .toBe('Logo : bluenote.com · licence inconnue');
    expect(texteDuCredit({ source: 'discogs', provider: 'Discogs', license_status: 'unknown' }, tr))
      .toBe('Logo : Discogs · licence inconnue');
  });

  it('l’attribution suit la langue', async () => {
    locale.set('de');
    const el = await grille();
    expect(el.querySelector<HTMLElement>('.lgcase[data-label="Blue Note"] .lglogo')!.getAttribute('title'))
      .toBe('Logo: Blue Note Records · Public domain · Wikimedia Commons');
  });

  it('une attribution incomplète, ou sans logo, ne s’affiche pas', () => {
    const carte = carteDesCredits([
      { name: 'A', album_count: 1, image_url: '/x', image_credit: { ...CREDIT_BLUE_NOTE, license: '' } },
      { name: 'E', album_count: 1, image_url: '/x', image_credit: { ...CREDIT_QOBUZ, provider: '' } },
      { name: 'F', album_count: 1, image_url: '/x', image_credit: { ...CREDIT_QOBUZ, license_status: 'peut-être' as never } },
      { name: 'G', album_count: 1, image_url: '/x', image_credit: CREDIT_QOBUZ },
      { name: 'B', album_count: 1, image_credit: CREDIT_BLUE_NOTE },
      { name: 'C  D', album_count: 1, image_url: '/y', image_credit: CREDIT_BLUE_NOTE },
    ]);
    expect(creditDuLabel(carte, 'A'), 'libre sans licence').toBeNull();
    expect(creditDuLabel(carte, 'E'), 'sans fournisseur').toBeNull();
    expect(creditDuLabel(carte, 'F'), 'statut inconnu du client').toBeNull();
    expect(creditDuLabel(carte, 'G')?.provider).toBe('Qobuz');
    expect(creditDuLabel(carte, 'B')).toBeNull();
    expect(creditDuLabel(carte, 'c d')?.file).toBe('Blue Note Records.svg');
    expect(carteDesCredits(null).size).toBe(0);
  });

  it('les cinq textes existent dans chacune des langues, avec leurs marques', () => {
    for (const code of ONZE_LANGUES) {
      const d = dictionnaire(code);
      for (const [cle, marques] of [
        ['v2.labels.logoCredit', ['{auteur}', '{licence}', '{source}']],
        ['v2.labels.logoCreditSansAuteur', ['{licence}', '{source}']],
        ['v2.labels.logoNonLibre', ['{source}']],
        ['v2.labels.logoLicenceInconnue', ['{source}']],
        ['v2.labels.logoLicenceDouteuse', []],
      ] as const) {
        expect(d[cle], `${code} : ${cle} manque`).toBeTruthy();
        for (const m of marques) expect(d[cle], `${code} : ${cle} sans ${m}`).toContain(m);
      }
      const t = texteDuCredit(CREDIT_BLUE_NOTE, (k) => d[k]);
      expect(t, code).toContain('Blue Note Records');
      expect(t, code).toContain('Public domain');
      expect(t, code).not.toMatch(/\{(auteur|licence|source)\}/);
      for (const c of [CREDIT_WIKIPEDIA, CREDIT_QOBUZ]) {
        const u = texteDuCredit(c, (k) => d[k]);
        expect(u, code).toContain(c.provider);
        expect(u, code).not.toMatch(/\{(auteur|licence|source)\}/);
      }
    }
  });
});
