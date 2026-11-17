// @vitest-environment jsdom
//
// web#3157 (demande ASR, go de Bertrand le 17/11) — filtrer par INSTRUMENT :
// retrouver un même musicien selon son rôle, et le combiner avec l'artiste
// (« Martha Argerich au piano »).
//
// Le serveur sert la facette `instrument` (crédits des pistes, CRD-6) et le
// paramètre `instrument=` sur `/library/facets`, `/library/tracks` et
// `/library/albums-detailed` dès la rc12. Ces témoins MONTENT le vrai rail
// d'Oxygen et la vraie Bibliothèque :
//  - Collection : une facette « Instruments » à côté de Chefs / Ensembles /
//    Œuvres, « Et » proposé, combinée avec la facette Artistes ;
//  - Bibliothèque : une puce « Instrument » épinglable par le bouton
//    « Filtres », liste avec comptes et recherche, choix multiple, combinée
//    avec la recherche et les autres puces ;
//  - serveur qui ne sert pas la facette : rien ne s'affiche, aucune erreur.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import { get } from 'svelte/store';
import OxygenFacetRail from '../../components/v2-heritage/OxygenFacetRail.svelte';
import LibraryV2 from '../../components/v2/LibraryV2.svelte';
import { getFilteredTracks, type FacetValue } from '../api';
import { t, locale } from '../i18n';
import { OXYGEN_FACETS_ALL } from '../stores/preferences';
import { FACETTES_COMBINABLES_EN_ET } from '../facettesEtOu';
import { FILTRES_EPINGLABLES, FILTRES_PAR_DEFAUT, LIBELLE_FILTRE, ecrireFiltresEpingles } from '../filtresEpinglesBibliotheque';
import { basculerInstrument, filtrerInstruments, lireFacetteInstrument } from '../filtreInstrument';
import { albums, libraryFolderScope, libraryLoading } from '../stores/library';
import { activeView, pendingLibraryFiltre } from '../stores/navigation';
import { notifications } from '../stores/notifications';
import { ONZE_LANGUES, dictionnaire } from './onzeDictionnaires';

const json = (corps: unknown) => new Response(JSON.stringify(corps), {
  status: 200, headers: { 'Content-Type': 'application/json' },
});

describe('filtreInstrument — la lecture de la facette', () => {
  it('lit `{ instrument: [...] }`, ignore les valeurs vides ou mal formées', () => {
    expect(lireFacetteInstrument({ instrument: [
      { value: 'piano', count: 12 }, { value: '', count: 3 }, { value: 'violon' }, null, { count: 2 },
    ] })).toEqual([{ value: 'piano', count: 12 }, { value: 'violon', count: 0 }]);
  });

  it('serveur qui ne sert pas la facette (clé absente, réponse illisible) : null', () => {
    expect(lireFacetteInstrument({ genre: [{ value: 'Jazz', count: 1 }] })).toBeNull();
    expect(lireFacetteInstrument([])).toBeNull();
    expect(lireFacetteInstrument(null)).toBeNull();
    expect(lireFacetteInstrument({ instrument: 'piano' })).toBeNull();
  });

  it('la recherche ignore casse et accents, et garde les instruments choisis', () => {
    const l: FacetValue[] = [
      { value: 'piano', count: 5 }, { value: 'violoncelle', count: 3 },
      { value: 'Violon', count: 2 }, { value: 'clavecin', count: 1 },
    ];
    expect(filtrerInstruments(l, '  ').map((x) => x.value)).toEqual(['piano', 'violoncelle', 'Violon', 'clavecin']);
    expect(filtrerInstruments(l, 'VIOL').map((x) => x.value)).toEqual(['violoncelle', 'Violon']);
    expect(filtrerInstruments(l, 'cél').map((x) => x.value)).toEqual(['violoncelle']);
    expect(filtrerInstruments(l, 'viol', ['piano']).map((x) => x.value)).toEqual(['piano', 'violoncelle', 'Violon']);
  });

  it('choix multiple : cocher puis décocher', () => {
    expect(basculerInstrument([], 'piano')).toEqual(['piano']);
    expect(basculerInstrument(['piano'], 'violon')).toEqual(['piano', 'violon']);
    expect(basculerInstrument(['piano', 'violon'], 'piano')).toEqual(['violon']);
  });
});

// ── Collection (Oxygen) ────────────────────────────────────────────────────

describe('Collection : facette Instruments (#3157)', () => {
  let monte: Record<string, unknown> | null = null;
  let hote: HTMLDivElement | null = null;
  function poserRail(serverFacets: Record<string, FacetValue[]>, selected: Record<string, string[]> = {}) {
    hote = document.createElement('div');
    document.body.appendChild(hote);
    monte = mount(OxygenFacetRail as never, {
      target: hote,
      props: {
        tracks: [], serverFacets, facets: ['artist', 'conductor', 'ensemble', 'work', 'instrument'],
        limit: 200, selected, onSelect: () => {},
      } as never,
    });
    return hote;
  }
  afterEach(() => {
    if (monte) unmount(monte);
    monte = null;
    hote?.remove();
    hote = null;
  });
  const titres = (el: HTMLElement) =>
    [...el.querySelectorAll('.ghtitle .ghlabel')].map((s) => s.textContent?.trim() ?? '');

  const SERVEUR_RC12: Record<string, FacetValue[]> = {
    artist: [{ value: 'Martha Argerich', count: 4 }],
    conductor: [{ value: 'Claudio Abbado', count: 2 }],
    instrument: [{ value: 'piano', count: 9 }, { value: 'violon', count: 3 }],
  };

  it('livrée dans Réglages, juste après Chefs / Ensembles / Œuvres', () => {
    const i = OXYGEN_FACETS_ALL.indexOf('instrument' as never);
    expect(i).toBeGreaterThan(-1);
    expect(OXYGEN_FACETS_ALL[i - 1]).toBe('work');
  });

  it('servie par le serveur, elle s’affiche avec son libellé et ses comptes, noms d’instruments tels quels', () => {
    const el = poserRail(SERVEUR_RC12);
    const tr = get(t);
    expect(tr('oxygen.facet.instrument')).not.toBe('oxygen.facet.instrument');
    expect(titres(el)).toContain(tr('oxygen.facet.instrument'));
    const valeurs = [...el.querySelectorAll('.val .vl')].map((s) => s.textContent);
    expect(valeurs).toContain('piano');
    expect(valeurs).toContain('violon');
  });

  it('face à un serveur qui ne la sert pas : absente, sans erreur', () => {
    const el = poserRail({ artist: SERVEUR_RC12.artist });
    expect(el.querySelector('.rail')).not.toBeNull();
    expect(titres(el)).not.toContain(get(t)('oxygen.facet.instrument'));
  });

  it('accepte « Et » (piano ET violon sur la même piste)', () => {
    expect(FACETTES_COMBINABLES_EN_ET.has('instrument')).toBe(true);
    const el = poserRail(SERVEUR_RC12, { instrument: ['piano', 'violon'] });
    expect(el.querySelector('.opbtn')).not.toBeNull();
  });

  it('« Martha Argerich au piano » : artiste et instrument partent ensemble vers /library/tracks', async () => {
    const urls: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (u: string) => { urls.push(String(u)); return json({ items: [], total: 0 }); }));
    try {
      await getFilteredTracks({ artist: ['Martha Argerich'], instrument: ['piano'] });
    } finally {
      vi.unstubAllGlobals();
    }
    const q = new URL(urls[0], 'http://x').searchParams;
    expect(q.getAll('artist')).toEqual(['Martha Argerich']);
    expect(q.getAll('instrument')).toEqual(['piano']);
  });
});

// ── Bibliothèque ───────────────────────────────────────────────────────────

describe('Bibliothèque : puce Instrument (#3157)', { timeout: 30_000 }, () => {
  let hote: HTMLDivElement;
  let monte: Record<string, any> | null = null;
  let appels: string[];
  let facettes: unknown;
  let erreurs: number;

  // Albums 1 et 3 : une piste au piano ; 2 : au violon ; 4 : rien.
  const ALBUMS = [
    { id: 1, title: 'Chopin-Un', artist_name: 'Martha Argerich', year: 1965, cover_path: null, source: 'local', format: 'FLAC' },
    { id: 2, title: 'Franck-Deux', artist_name: 'Gidon Kremer', year: 1980, cover_path: null, source: 'local', format: 'FLAC' },
    { id: 3, title: 'Liszt-Trois', artist_name: 'Alfred Brendel', year: 1970, cover_path: null, source: 'local', format: 'FLAC' },
    { id: 4, title: 'Mahler-Quatre', artist_name: 'Claudio Abbado', year: 1990, cover_path: null, source: 'local', format: 'FLAC' },
  ];
  function route(url: string): unknown {
    const u = new URL(url, 'http://localhost');
    if (u.pathname.endsWith('/library/facets')) return facettes;
    if (u.pathname.endsWith('/library/albums-detailed')) {
      const instr = u.searchParams.getAll('instrument').map((x) => x.toLowerCase());
      const ids = new Set<number>();
      if (instr.includes('piano')) { ids.add(1); ids.add(3); }
      if (instr.includes('violon')) ids.add(2);
      const offset = Number(u.searchParams.get('offset') ?? 0);
      return { items: offset ? [] : [...ids].map((album_id) => ({ album_id })), total: ids.size };
    }
    return [];
  }
  async function stabiliser() {
    for (let i = 0; i < 12; i++) { await new Promise((r) => setTimeout(r, 0)); flushSync(); }
  }
  async function monter() {
    monte = mount(LibraryV2, { target: hote, props: {} });
    await stabiliser();
  }
  const titres = () => [...hote.querySelectorAll('.grid .card')].map((c) => c.textContent ?? '');
  const puce = () => hote.querySelector<HTMLButtonElement>('[data-instrument-puce]');
  const ouvrirFiltres = () => { hote.querySelector<HTMLButtonElement>('[data-filtres-ouvrir]')!.click(); flushSync(); };
  const choix = () => hote.querySelector<HTMLButtonElement>('[data-epingle-filtre="instrument"]');
  const valeurs = () => [...hote.querySelectorAll<HTMLButtonElement>('[data-instrument]')].map((b) => b.dataset.instrument);

  beforeEach(() => {
    try { localStorage.clear(); } catch { /* mode privé */ }
    locale.set('fr');
    appels = [];
    erreurs = 0;
    facettes = { instrument: [{ value: 'piano', count: 7 }, { value: 'violon', count: 3 }, { value: 'violoncelle', count: 1 }] };
    vi.stubGlobal('fetch', vi.fn(async (url: string) => { appels.push(String(url)); return json(route(String(url))); }));
    vi.stubGlobal('requestAnimationFrame', () => 1);
    vi.stubGlobal('cancelAnimationFrame', () => {});
    vi.stubGlobal('WebSocket', class { close() {} addEventListener() {} removeEventListener() {} send() {} } as any);
    vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} } as any);
    vi.spyOn(notifications, 'error').mockImplementation(() => { erreurs++; return undefined as never; });
    activeView.set('library');
    pendingLibraryFiltre.set(null);
    libraryFolderScope.set(null as any);
    libraryLoading.set(false);
    albums.set(ALBUMS as any);
    hote = document.createElement('div');
    document.body.appendChild(hote);
  });
  afterEach(() => {
    if (monte) { try { unmount(monte); } catch { /* déjà démonté */ } }
    monte = null;
    hote.remove();
    albums.set([] as any);
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('pas épinglée par défaut ; « Filtres » la propose et l’épingle', async () => {
    expect(FILTRES_EPINGLABLES).toContain('instrument');
    expect(FILTRES_PAR_DEFAUT).not.toContain('instrument');
    await monter();
    expect(appels.some((u) => u.includes('/library/facets') && u.includes('fields=instrument'))).toBe(true);
    expect(puce(), 'la puce ne doit pas être là sans être épinglée').toBeNull();
    ouvrirFiltres();
    expect(choix(), '« Instrument » absent du choix des filtres').not.toBeNull();
    expect(choix()!.getAttribute('aria-checked')).toBe('false');
    choix()!.click();
    flushSync();
    expect(puce(), 'épinglée mais absente de la rangée').not.toBeNull();
  });

  it('liste avec comptes et recherche ; choix multiple ; « Tous les instruments » remet à zéro', async () => {
    ecrireFiltresEpingles(['instrument']);
    await monter();
    expect(titres().length).toBe(4);
    puce()!.click();
    flushSync();
    expect(valeurs()).toEqual(['piano', 'violon', 'violoncelle']);
    expect(hote.querySelector('[data-instrument="piano"] em')!.textContent).toBe('7');

    const champ = hote.querySelector<HTMLInputElement>('[data-instrument-recherche]')!;
    champ.value = 'VIOL';
    champ.dispatchEvent(new Event('input', { bubbles: true }));
    flushSync();
    expect(valeurs()).toEqual(['violon', 'violoncelle']);
    champ.value = 'zzz';
    champ.dispatchEvent(new Event('input', { bubbles: true }));
    flushSync();
    expect(hote.querySelector('[data-instrument-aucun]')).not.toBeNull();
    champ.value = '';
    champ.dispatchEvent(new Event('input', { bubbles: true }));
    flushSync();

    hote.querySelector<HTMLButtonElement>('[data-instrument="piano"]')!.click();
    await stabiliser();
    const req = appels.find((u) => u.includes('/library/albums-detailed') && u.includes('instrument='));
    expect(req, 'aucun appel albums-detailed avec l’instrument').toBeDefined();
    expect(new URL(req!, 'http://localhost').searchParams.getAll('instrument')).toEqual(['piano']);
    expect(titres().length).toBe(2);
    expect(titres().some((x) => x.includes('Chopin-Un'))).toBe(true);
    expect(titres().some((x) => x.includes('Liszt-Trois'))).toBe(true);
    expect(puce()!.textContent).toContain('piano');
    expect(hote.querySelector('[data-instrument="piano"]')!.getAttribute('aria-checked')).toBe('true');

    // Choix multiple : piano OU violon.
    hote.querySelector<HTMLButtonElement>('[data-instrument="violon"]')!.click();
    await stabiliser();
    expect(titres().length).toBe(3);
    expect(titres().some((x) => x.includes('Mahler-Quatre'))).toBe(false);

    hote.querySelector<HTMLButtonElement>('[data-instrument-tous]')!.click();
    await stabiliser();
    expect(titres().length).toBe(4);
    expect(erreurs).toBe(0);
  });

  it('« Martha Argerich au piano » : la recherche et l’instrument se combinent', async () => {
    ecrireFiltresEpingles(['instrument']);
    await monter();
    puce()!.click();
    flushSync();
    hote.querySelector<HTMLButtonElement>('[data-instrument="piano"]')!.click();
    await stabiliser();
    expect(titres().length).toBe(2);
    const recherche = hote.querySelector<HTMLInputElement>('[data-champ-recherche] input')!;
    expect(recherche, 'champ de recherche introuvable').not.toBeNull();
    recherche.value = 'Argerich';
    recherche.dispatchEvent(new Event('input', { bubbles: true }));
    await stabiliser();
    await new Promise((r) => setTimeout(r, 400));
    await stabiliser();
    const restants = titres();
    expect(restants.length).toBe(1);
    expect(restants[0]).toContain('Chopin-Un');
  });

  it('serveur qui ne sert pas la facette : ni puce ni entrée dans « Filtres », aucune erreur', async () => {
    facettes = { genre: [] };
    ecrireFiltresEpingles(['instrument', ...FILTRES_PAR_DEFAUT]);
    await monter();
    expect(puce()).toBeNull();
    ouvrirFiltres();
    expect(choix()).toBeNull();
    expect(erreurs).toBe(0);
    expect(titres().length).toBe(4);
  });

  it('serveur en erreur sur la facette : masquée aussi, sans bandeau', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (String(url).includes('/library/facets')) return new Response('boom', { status: 404 });
      return json(route(String(url)));
    }));
    ecrireFiltresEpingles(['instrument']);
    await monter();
    expect(puce()).toBeNull();
    expect(erreurs).toBe(0);
  });
});

describe('#3157 — libellés dans les 15 langues', () => {
  it('chaque clé existe et n’est pas vide', () => {
    expect(LIBELLE_FILTRE.instrument).toBe('v2.lib.instrument');
    const cles = ['oxygen.facet.instrument', 'v2.lib.instrument', 'v2.lib.instrumentSearch', 'v2.lib.instrumentAll',
      'v2.lib.instrumentNone', 'v2.lib.instrumentHint', 'v2.lib.instrumentError'];
    expect(ONZE_LANGUES.length).toBe(15);
    for (const lg of ONZE_LANGUES) {
      const d = dictionnaire(lg);
      for (const c of cles) expect(d[c], `${lg} : ${c}`).toBeTruthy();
    }
  });
});
