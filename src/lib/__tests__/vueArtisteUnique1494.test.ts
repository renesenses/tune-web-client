// @vitest-environment jsdom
//
// renesenses/tune-web-client#1494 — UNE SEULE VUE ARTISTE.
//
// Bertrand, 23/09/2026 : « Écran Search : quand je clique sur l'artiste, je
// veux ouvrir la vue artiste !! » Pour lui, AUCUN des deux clics — artiste de
// la bibliothèque, artiste d'un service — n'ouvrait de vue artiste. Et à
// « laquelle ? » : la page artiste COMMUNE.
//
// ## L'état des lieux, mesuré
//
// Depuis #4330 la DISCOGRAPHIE est commune (`DiscographieCommune`) ; les ÉCRANS
// ne l'étaient pas. La Recherche envoyait un artiste local vers la fiche de la
// Bibliothèque (`#library/artiste:<id>`, entrée composée de #1142) et un
// artiste de service vers `streamingartist`. Depuis #1485 (#1232, étapes 1 et
// 2), `ArtisteServiceV2` sait montrer un artiste local — `service: null` —
// avec les cinq blocs de la fiche de bibliothèque. Mais aucun clic n'y menait.
//
// Et la bifurcation local / service, qui ne vit qu'à UN endroit
// (`ouvrirArtisteDepuis`), était RECOPIÉE à la main par cinq écrans —
// `SearchV2`, `AlbumDetailV2`, `PisteActions`, `MenuPisteV1`, `NowPlaying`.
// La faire pointer vers la page commune n'aurait donc changé que les Favoris,
// « Vos tops » et la colonne Artiste : quatre écrans auraient continué
// d'ouvrir l'ancienne fiche.
//
// ## Ce que ces témoins font
//
// 🔴 ILS MONTENT LA VRAIE RECHERCHE ET CLIQUENT. Un artiste local, puis un
// artiste de service, et ils lisent la vue atteinte, la cible posée, le retour
// promis (`vueDeRetour`) et l'entrée d'historique écrite — puis ils montent
// l'écran d'arrivée comme `ShellV2` le fait et appuient sur le Précédent. Une
// garde de texte resterait verte sur un `if` mort ; celles-ci ne lisent le
// source que pour une chose : interdire toute NOUVELLE recopie de la
// bifurcation hors de `ouvrirArtisteDepuis`.
//
// Contre-épreuve : `SearchV2.svelte` remis à `origin/main` (avant ce lot) fait
// rougir les deux premiers témoins — le clic local part sur `library`.
//
// ⚠️ Aucun délai calibré : attentes BORNÉES sur condition.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import { get } from 'svelte/store';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import SearchV2 from '../../components/v2/SearchV2.svelte';
import ArtisteServiceV2 from '../../components/v2/ArtisteServiceV2.svelte';
import { activeView, pendingLibraryArtist, vueDeRetour } from '../stores/navigation';
import { ficheArtisteService } from '../stores/streaming';
import { setSearchCriteria } from '../stores/shortcuts';
import { preferences } from '../stores/preferences';
import { brancherHistoriqueCoquille, detailOuvert } from '../historiqueCoquille';

/** Deux écrans de plus de mille lignes chacun se compilent ici. */
vi.setConfig({ testTimeout: 60_000 });

const REQUETE = 'Pink Floyd';
const vide = { artists: [], albums: [], tracks: [], playlists: [], labels: [] };
/** Un artiste de la BIBLIOTHÈQUE : un identifiant de la table `artists`. */
const LOCAL_ARTISTE = { id: 42, name: 'Pink Floyd', image_path: null, bio: null };
const LOCAL_ALBUM = { id: 60, title: 'Wish You Were Here', artist_name: 'Pink Floyd', artist_id: 42, year: 1975 };
const LOCAL = { ...vide, artists: [LOCAL_ARTISTE], albums: [LOCAL_ALBUM] };
/** Un artiste de SERVICE, tel que la recherche fédérée le rend (#1135). */
const SERVICE_ARTISTE = { id: null, source_id: 'q-7', name: 'Leprous', image_path: null };
const SERVICES = { qobuz: { artists: [SERVICE_ARTISTE], albums: [], tracks: [], playlists: [] } };

class ResizeObserverInerte {
  observe() {} unobserve() {} disconnect() {}
}

const reponse = (corps: unknown) => ({
  ok: true, status: 200, statusText: 'OK',
  headers: new Map([['content-type', 'application/json']]),
  json: async () => corps,
  text: async () => JSON.stringify(corps),
} as unknown as Response);

const respirer = () => new Promise((r) => setTimeout(r, 0));

/** Attendre une CONDITION, bornée — jamais une constante calibrée à la main. */
async function jusqua(condition: () => boolean, borne = 8000): Promise<void> {
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
let debrancher: (() => void) | null = null;
let urls: string[] = [];

beforeEach(() => {
  urls = [];
  vi.stubGlobal('ResizeObserver', ResizeObserverInerte);
  for (const [prop, valeur] of [['clientHeight', 2000], ['clientWidth', 1400]] as const) {
    Object.defineProperty(HTMLElement.prototype, prop, { configurable: true, get: () => valeur });
  }
  try { localStorage.clear(); } catch { /* jsdom sans stockage */ }
  vi.stubGlobal('fetch', vi.fn(async (url: any) => {
    const u = String(url);
    urls.push(u);
    if (/\/library\/search/.test(u)) return reponse(LOCAL);
    if (/\/search\?/.test(u)) return reponse({ local: LOCAL, services: SERVICES, radios: [] });
    // 🔴 Du plus précis au plus large : `/library/artists/42/albums` contient
    // `/library/artists/42`.
    if (/\/library\/artists\/42\/albums/.test(u)) return reponse([LOCAL_ALBUM]);
    if (/\/library\/artists\/42\/bio/.test(u)) return reponse({ bio: null });
    if (/\/library\/artists\/42\/(metadata|credits|tracks)/.test(u)) return reponse(/metadata/.test(u) ? {} : []);
    if (/\/library\/artists\/42(\?|$)/.test(u)) return reponse(LOCAL_ARTISTE);
    if (/\/library\/artists/.test(u)) return reponse([LOCAL_ARTISTE]);
    if (/\/library\/albums/.test(u)) return reponse([LOCAL_ALBUM]);
    if (/\/streaming\/qobuz\/artists\/q-7\/(albums|top-tracks)/.test(u)) return reponse([]);
    if (/\/streaming\/qobuz\/artists\/q-7/.test(u)) return reponse({ id: 'q-7', name: 'Leprous' });
    return reponse([]);
  }));
  vi.stubGlobal('WebSocket', class {
    close() {} addEventListener() {} removeEventListener() {} send() {}
  } as unknown as typeof WebSocket);
  preferences.update((p) => ({ ...p, settingsLevel: 'expert' }));
  activeView.set('home');
  detailOuvert.set(null);
  vueDeRetour.set(null);
  pendingLibraryArtist.set(null);
  ficheArtisteService.set(null);
  setSearchCriteria(null);
  history.replaceState(null, '', '/');
});

afterEach(() => {
  if (debrancher) debrancher();
  debrancher = null;
  if (monte) unmount(monte);
  monte = null;
  if (hote) hote.remove();
  hote = null;
  activeView.set('home');
  detailOuvert.set(null);
  vueDeRetour.set(null);
  ficheArtisteService.set(null);
  setSearchCriteria(null);
  vi.unstubAllGlobals();
});

/** Accueil → Recherche → résultats, coquille branchée : le décor du signalement. */
async function poserResultats(): Promise<HTMLDivElement> {
  activeView.set('home');
  debrancher = brancherHistoriqueCoquille();
  setSearchCriteria({ q: REQUETE });
  activeView.set('search');
  flushSync();
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(SearchV2, { target: hote, props: {} as any });
  await jusqua(() => tuiles(hote!).length >= 2);
  return hote;
}

/** Les vignettes d'artiste des résultats — la rangée fusionnée de #1135. */
const tuiles = (el: HTMLElement) => [...el.querySelectorAll<HTMLElement>('.basartistes .artile')];
/** La vignette qui porte ce nom, ou `null`. */
const tuileDe = (el: HTMLElement, nom: string) =>
  tuiles(el).find((t) => t.querySelector('.an')?.textContent?.trim() === nom) ?? null;

/**
 * Ce que fait `ShellV2` quand la vue change : il DÉMONTE l'écran quitté et
 * MONTE celui d'arrivée (`{#if $activeView === 'streamingartist'}`).
 */
async function monterLaPageCommune(el: HTMLDivElement): Promise<void> {
  unmount(monte!);
  monte = null;
  monte = mount(ArtisteServiceV2, { target: el, props: {} as any });
  await jusqua(() => urls.some((u) => /\/library\/artists\/42(\?|$)/.test(u)));
  await jusqua(() => (el.textContent ?? '').includes(LOCAL_ALBUM.title));
}

describe('#1494 — le décor', () => {
  it('les résultats portent une vignette LOCALE et une vignette de SERVICE', async () => {
    const el = await poserResultats();
    expect(tuileDe(el, 'Pink Floyd'), 'aucune vignette locale : le témoin ne mesure rien').not.toBeNull();
    expect(tuileDe(el, 'Leprous'), 'aucune vignette de service : le témoin ne mesure rien').not.toBeNull();
    expect(history.state).toMatchObject({ tune: 'v2', vue: 'search', detail: null });
  });
});

describe('#1494 — la Recherche ouvre la PAGE COMMUNE, local comme service', () => {
  it('🔴 un artiste LOCAL ouvre la page commune, pas la fiche de la Bibliothèque', async () => {
    const el = await poserResultats();
    tuileDe(el, 'Pink Floyd')!.querySelector<HTMLButtonElement>('button.meta')!.click();
    await jusqua(() => get(activeView) !== 'search');

    expect(get(activeView), 'le clic sur un artiste local mène encore à la Bibliothèque').toBe('streamingartist');
    // La forme posée par #1485 : `service: null`, l'identifiant de bibliothèque en texte.
    expect(get(ficheArtisteService)).toEqual({ service: null, id: '42', nom: 'Pink Floyd' });
    expect(get(pendingLibraryArtist), 'la cible de l’ANCIENNE fiche est encore posée').toBeNull();
    // Le Retour de la page ramène aux résultats (#3824).
    expect(get(vueDeRetour)).toBe('search');
    // UNE entrée d'historique pour UN geste (#1142) : celle de la page, sans détail.
    expect(history.state).toMatchObject({ tune: 'v2', vue: 'streamingartist', detail: null });
    expect(location.hash).toBe('#streamingartist');
  });

  it('🔴 un artiste de SERVICE ouvre la MÊME page', async () => {
    const el = await poserResultats();
    tuileDe(el, 'Leprous')!.querySelector<HTMLButtonElement>('button.meta')!.click();
    await jusqua(() => get(activeView) !== 'search');

    expect(get(activeView)).toBe('streamingartist');
    expect(get(ficheArtisteService)).toEqual({ service: 'qobuz', id: 'q-7', nom: 'Leprous' });
    expect(get(vueDeRetour)).toBe('search');
    expect(history.state).toMatchObject({ tune: 'v2', vue: 'streamingartist', detail: null });
  });

  it('la PASTILLE DE PROVENANCE d’un artiste local mène au même endroit — #1135', async () => {
    const el = await poserResultats();
    const badge = tuileDe(el, 'Pink Floyd')!.querySelector<HTMLButtonElement>('.asrc .asrcb');
    expect(badge, 'la pastille de provenance a disparu de la vignette').not.toBeNull();
    badge!.click();
    await jusqua(() => get(activeView) !== 'search');
    expect(get(activeView)).toBe('streamingartist');
    expect(get(ficheArtisteService)).toEqual({ service: null, id: '42', nom: 'Pink Floyd' });
  });

  it('🔴 la page d’arrivée montre l’artiste LOCAL par les routes de la bibliothèque', async () => {
    const el = await poserResultats();
    tuileDe(el, 'Pink Floyd')!.querySelector<HTMLButtonElement>('button.meta')!.click();
    await jusqua(() => get(activeView) === 'streamingartist');
    const curseur = history.state;

    await monterLaPageCommune(el);

    expect(el.textContent).toContain('Pink Floyd');
    expect(el.textContent, 'la discographie locale n’est pas rendue').toContain('Wish You Were Here');
    // Jamais une route de service fabriquée sur `null` (#1232, étape 1).
    expect(urls.filter((u) => u.includes('/streaming/') && u.includes('/artists/42'))).toEqual([]);
    // Et l'écran d'arrivée n'a rien empilé de plus.
    expect(history.state, 'la page d’arrivée a empilé une seconde entrée').toEqual(curseur);
  });

  it('🔴 le Précédent du navigateur rend la PAGE DE RÉSULTATS', async () => {
    const el = await poserResultats();
    tuileDe(el, 'Pink Floyd')!.querySelector<HTMLButtonElement>('button.meta')!.click();
    await jusqua(() => get(activeView) === 'streamingartist');
    await monterLaPageCommune(el);

    history.back();
    await jusqua(() => get(activeView) === 'search');

    expect(get(activeView), 'le Précédent ne ramène pas aux résultats').toBe('search');
    expect(history.state).toMatchObject({ tune: 'v2', vue: 'search', detail: null });
  });
});

// ── LA RÈGLE : la bifurcation ne se recopie pas ───────────────────────────
//
// 🔴 Ce témoin lit du SOURCE, et il est le seul à le faire ici. Il existe
// parce que le défaut n'était pas une ligne fausse mais une ligne RECOPIÉE :
// cinq écrans portaient chacun leur `pendingLibraryArtist.set(...) +
// activeView.set('library')`, et corriger le chemin de référence n'en
// corrigeait qu'une partie. La règle est donc écrite pour qu'une SIXIÈME copie
// ne rejoue pas le même défaut.
describe('#1494 — la bifurcation local / service ne vit que dans `ouvrirArtisteDepuis`', () => {
  const RACINES = ['src/components', 'src/lib'];
  /** Le seul endroit autorisé à poser la cible d'une fiche artiste. */
  const REFERENCE = 'src/lib/ouvrirArtisteDepuis.ts';
  const GESTES: { nom: string; motif: RegExp }[] = [
    // La cible de l'ANCIENNE fiche — `.set(null)` est le consommateur qui vide.
    { nom: 'pendingLibraryArtist.set(<cible>)', motif: /pendingLibraryArtist\.set\((?!null\))/g },
    { nom: 'ficheArtisteService.set({…})', motif: /ficheArtisteService\.set\(\{/g },
    { nom: "activeView.set('streamingartist')", motif: /activeView\.set\('streamingartist'\)/g },
  ];
  /**
   * Ce qui est TOLÉRÉ, nommément, et pourquoi — jamais plus que le compte
   * d'aujourd'hui, pour qu'une copie de plus rougisse quand même.
   *
   * - `ArtisteServiceV2` : la page elle-même, qui se RECIBLE sur un artiste
   *   similaire local sans changer de vue. Elle est la destination, pas un
   *   point d'entrée.
   *
   * `AlbumDetailV2` et `ShellV2` en sont sortis avec #1489 (fusionnée le
   * 23/09/2026) ; `ArtistesV2` — le dernier écran à ouvrir SA fiche — avec
   * #1501. Il ne reste qu'une tolérance, et elle n'est pas un point d'entrée.
   */
  const TOLERANCES: Record<string, Record<string, number>> = {
    'src/components/v2/ArtisteServiceV2.svelte': { 'ficheArtisteService.set({…})': 1 },
  };

  const sansCommentaires = (s: string) =>
    s.replace(/<!--[\s\S]*?-->/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

  function fichiers(dossier: string): string[] {
    const sortie: string[] = [];
    for (const nom of readdirSync(dossier)) {
      const chemin = join(dossier, nom);
      if (statSync(chemin).isDirectory()) {
        if (nom === '__tests__') continue;
        sortie.push(...fichiers(chemin));
      } else if (/\.(svelte|ts)$/.test(nom) && !/\.test\.ts$/.test(nom)) {
        sortie.push(chemin);
      }
    }
    return sortie;
  }

  const releve = (() => {
    const copies: string[] = [];
    for (const racine of RACINES) {
      for (const chemin of fichiers(join(process.cwd(), racine))) {
        const rel = relative(process.cwd(), chemin).split('\\').join('/');
        if (rel === REFERENCE) continue;
        const src = sansCommentaires(readFileSync(chemin, 'utf-8'));
        for (const g of GESTES) {
          const n = (src.match(g.motif) ?? []).length;
          const tolere = TOLERANCES[rel]?.[g.nom] ?? 0;
          if (n > tolere) copies.push(`${rel} : ${g.nom} ×${n}${tolere ? ` (toléré ${tolere})` : ''}`);
        }
      }
    }
    return copies;
  })();

  it('la garde voit bien le chemin de référence — sinon elle est verte pour rien', () => {
    const src = sansCommentaires(readFileSync(join(process.cwd(), REFERENCE), 'utf-8'));
    for (const g of [GESTES[1], GESTES[2]]) {
      expect((src.match(g.motif) ?? []).length, `${g.nom} a quitté ${REFERENCE}`).toBeGreaterThan(0);
    }
  });

  it('🔴 aucun écran ne recopie la bifurcation', () => {
    expect(
      releve,
      'un écran pose lui-même la cible d’une fiche artiste au lieu de passer ' +
        'par `ouvrirArtisteDepuis` : il ouvrira une autre page que les autres.',
    ).toEqual([]);
  });

  it('les écrans du relevé passent par le chemin de référence', () => {
    for (const f of [
      'src/components/v2/SearchV2.svelte',
      // #1501 — la grille de la Bibliothèque, dernier point d'entrée converti.
      'src/components/v2/ArtistesV2.svelte',
      // #1489 — la fiche d'album.
      'src/components/v2/AlbumDetailV2.svelte',
      'src/components/v2/PisteActions.svelte',
      'src/components/partages/MenuPisteV1.svelte',
      'src/components/partages/NowPlaying.svelte',
    ]) {
      const src = sansCommentaires(readFileSync(join(process.cwd(), f), 'utf-8'));
      expect(src, `${f} n’appelle plus ouvrirArtisteDepuis`).toMatch(/ouvrirArtisteDepuis\(/);
    }
  });
});
