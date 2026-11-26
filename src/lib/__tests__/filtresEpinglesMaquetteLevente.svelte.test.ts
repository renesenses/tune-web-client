// @vitest-environment jsdom
//
// Bibliothèque — maquette de Levente (Figma 616:5813 / 616:5816 / 617:5820 /
// 619:5826, note 616:5818, exports biblio-1 et biblio-3 du 15/11/2026) :
// « All, Recently added, Source..etc. — treat it as a filtering option, where
// by default we don't show them all, just the ones the user is interested in,
// so the user interface is not so busy. »
//
// Ces témoins MONTENT la vraie Bibliothèque : par défaut « Tout (n) »,
// « Source » et « Qualité » ; le bouton « Filtres » épingle les autres et le
// choix tient d'une visite à l'autre ; un filtre actif ne se cache jamais ;
// le compte de « Tout » ne bouge pas quand on épingle (#8625).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import LibraryV2 from '../../components/v2/LibraryV2.svelte';
import { albums, libraryFolderScope, libraryLoading } from '../stores/library';
import { activeView, pendingLibraryFiltre } from '../stores/navigation';
import {
  CLE_FILTRES_EPINGLES, FILTRES_EPINGLABLES, FILTRES_PAR_DEFAUT, LIBELLE_FILTRE,
  basculerEpingle, ecrireFiltresEpingles, estParDefaut, lireFiltresEpingles,
} from '../filtresEpinglesBibliotheque';
import { ONZE_LANGUES, dictionnaire } from './onzeDictionnaires';

function reponse(corps: unknown): Response {
  const texte = JSON.stringify(corps);
  return {
    ok: true, status: 200, statusText: 'OK',
    headers: new Map([['content-type', 'application/json']]),
    json: async () => JSON.parse(texte), text: async () => texte,
  } as unknown as Response;
}

const ALBUMS = [
  { id: 1, title: 'Alpha', artist_name: 'A', format: 'FLAC', added_at: 1790000001 },
  { id: 2, title: 'Beta', artist_name: 'B', format: 'FLAC', added_at: 1790000002 },
  { id: 3, title: 'Gamma', artist_name: 'C', format: 'MP3', added_at: 1790000003 },
];

let hote: HTMLDivElement | null = null;
let monte: Record<string, any> | null = null;

async function attendreQue(predicat: () => boolean, limite = 8000): Promise<void> {
  const fin = Date.now() + limite;
  while (Date.now() < fin) {
    flushSync();
    if (predicat()) return;
    await new Promise((r) => setTimeout(r, 25));
  }
  flushSync();
}
async function monter() {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(LibraryV2, { target: hote, props: {} });
  await attendreQue(() => !!tout() && nombre() === 3);
}
function demonter() {
  if (monte) unmount(monte);
  monte = null;
  hote?.remove();
  hote = null;
}

const tout = () => hote!.querySelector<HTMLButtonElement>('[data-albums-tout]');
const nombre = () => Number((tout()?.textContent ?? '').replace(/\D/g, ''));
// Harmonisation rc14 — une puce de la RANGÉE est un enfant direct de `.filters` ;
// Source, Qualité, Favoris… vivent dans le panneau « Filtres » (`.panneau`).
const puce = (id: string) => hote!.querySelector(`.filters > [data-puce="${id}"]`);
const panneau = () => hote!.querySelector('[data-panneau-filtres] .panneau');
const bouton = () => hote!.querySelector<HTMLButtonElement>('[data-filtres-ouvrir]');
const choix = (id: string) => hote!.querySelector<HTMLButtonElement>(`[data-epingle-filtre="${id}"]`);

beforeEach(() => {
  try { localStorage.clear(); } catch { /* stockage indisponible */ }
  vi.stubGlobal('fetch', vi.fn(async () => reponse([])));
  vi.stubGlobal('WebSocket', class {
    close() {} addEventListener() {} removeEventListener() {} send() {}
  } as unknown as typeof WebSocket);
  vi.stubGlobal('ResizeObserver', class {
    observe() {} unobserve() {} disconnect() {}
  } as unknown as typeof ResizeObserver);
  activeView.set('library');
  pendingLibraryFiltre.set(null);
  libraryLoading.set(false);
  libraryFolderScope.set(null as any);
  albums.set(ALBUMS as any);
});
afterEach(() => {
  demonter();
  vi.unstubAllGlobals();
});

describe('filtres épinglés — le magasin', () => {
  it('défaut : Source et Qualité ; une liste vide est un choix ; l’illisible est ignoré', () => {
    expect(lireFiltresEpingles()).toEqual([...FILTRES_PAR_DEFAUT]);
    ecrireFiltresEpingles([]);
    expect(lireFiltresEpingles()).toEqual([]);
    localStorage.setItem('tune_v2_ecran_' + CLE_FILTRES_EPINGLES, 'format,inconnu,quality');
    expect(lireFiltresEpingles()).toEqual(['format', 'quality']);
  });

  it('basculer garde l’ordre de la rangée', () => {
    expect(basculerEpingle(['quality'], 'recent')).toEqual(['recent', 'quality']);
    expect(basculerEpingle(['recent', 'quality'], 'recent')).toEqual(['quality']);
    expect(estParDefaut(['quality', 'provenance'])).toBe(true);
  });

  it('chaque puce a son libellé, et les textes du bouton existent dans les 15 langues', () => {
    expect(Object.keys(LIBELLE_FILTRE).sort()).toEqual([...FILTRES_EPINGLABLES].sort());
    for (const lg of ONZE_LANGUES) {
      const d = dictionnaire(lg);
      for (const k of ['v2.lib.filtres.bouton', 'v2.lib.filtres.titre', 'v2.lib.filtres.aide', 'v2.lib.filtres.defaut', 'v2.lib.filtres.actif',
        ...Object.values(LIBELLE_FILTRE)]) expect(d[k], `${lg} : ${k}`).toBeTruthy();
    }
  });
});

describe('filtres épinglés — la Bibliothèque montée', { timeout: 30_000 }, () => {
  it('par défaut : « Tout (3) » et le bouton Filtres ; Source et Qualité sont DANS le panneau', async () => {
    await monter();
    expect(nombre()).toBe(3);
    expect(puce('provenance'), 'Source est restée dans la rangée').toBeNull();
    expect(puce('quality'), 'Qualité est restée dans la rangée').toBeNull();
    expect(puce('format')).toBeNull();
    expect(puce('recent')).toBeNull();
    expect(bouton(), 'pas de bouton « Filtres »').not.toBeNull();
    bouton()!.click();
    flushSync();
    expect(panneau()?.querySelector('[data-puce="provenance"]'), 'Source absente du panneau').not.toBeNull();
    expect(panneau()?.querySelector('[data-puce="quality"]'), 'Qualité absente du panneau').not.toBeNull();
  });

  it('« Filtres » propose d’épingler les AUTRES puces, et le choix est retenu d’une visite à l’autre', async () => {
    await monter();
    bouton()!.click();
    flushSync();
    for (const id of ['recent', 'rate', 'format']) {
      expect(choix(id), `« ${id} » absent du choix des filtres`).not.toBeNull();
    }
    for (const id of ['provenance', 'quality']) {
      expect(choix(id), `« ${id} » est déjà dans le panneau : rien à épingler`).toBeNull();
    }
    expect(choix('format')!.getAttribute('aria-checked')).toBe('false');
    choix('format')!.click();
    flushSync();
    expect(puce('format'), 'Format épinglé mais absent de la rangée').not.toBeNull();
    expect(nombre(), '#8625 : épingler ne change pas le compte de « Tout »').toBe(3);

    demonter();
    await monter();
    expect(puce('format'), 'le choix n’a pas été retenu').not.toBeNull();
  });

  it('« Revenir aux filtres par défaut » retire les puces épinglées', async () => {
    await monter();
    bouton()!.click();
    flushSync();
    choix('format')!.click();
    flushSync();
    expect(puce('format')).not.toBeNull();
    hote!.querySelector<HTMLButtonElement>('[data-filtres-defaut]')!.click();
    flushSync();
    expect(puce('format')).toBeNull();
    expect(nombre()).toBe(3);
  });

  it('🔴 un filtre ACTIF reste dans la rangée même désépinglé, et « Tout » garde son compte', async () => {
    await monter();
    bouton()!.click();
    flushSync();
    choix('recent')!.click();
    flushSync();
    // « Derniers ajouts » allumé, puis désépinglé : il ne disparaît pas.
    hote!.querySelector<HTMLButtonElement>('.filters [data-puce="recent"]')!.click();
    flushSync();
    // Cliquer la puce, hors du menu, l'a refermé : on le rouvre.
    if (!choix('recent')) { bouton()!.click(); flushSync(); }
    choix('recent')!.click();
    flushSync();
    expect(puce('recent'), 'un filtre actif a disparu de la rangée').not.toBeNull();
    expect(choix('recent')!.querySelector('em'), 'le choix ne dit pas que le filtre est actif').not.toBeNull();
    expect(nombre()).toBe(3);
  });

  it('feuille mobile : voile présent menu ouvert, la poignée referme, le voile part avec', async () => {
    await monter();
    expect(hote!.querySelector('[data-fond-filtres]')).toBeNull();
    bouton()!.click();
    flushSync();
    expect(hote!.querySelector('[data-fond-filtres]'), 'pas de voile sous la feuille').not.toBeNull();
    hote!.querySelector<HTMLButtonElement>('[data-filtres-fermer]')!.click();
    flushSync();
    expect(panneau(), 'la poignée n’a pas refermé le panneau').toBeNull();
    expect(hote!.querySelector('[data-fond-filtres]')).toBeNull();
  });
});
