// @vitest-environment jsdom
//
// #1367 — « Ajouts récents ». Jean Valjean, fil 1856, 20/09/2026 11 h 25, après le
// correctif de défilement (#1323 / PR #1330) :
//
//   « Je n'avais pas remarqué mais le fait de cocher ajouts récents bloque
//     tout. La seule partie qui se met à jour. Il n'est pas possible de
//     choisir liste ou grille. Il n'y a pas de barre latérale gauche. »
//
// ## CE QUI EST EN CAUSE — et ce qui ne l'est PAS
//
// Ce n'est PAS le défilement : #1330 pose bien l'ascenseur sur `.recents`, et
// le témoin `ajoutsRecentsDefile1323` le mesure. C'est un second défaut, sur
// le même onglet : `LibraryV2` garde au-dessus du corps TOUT son bandeau de
// commandes — puces de filtre, compteur « Tout (n) », champ de recherche,
// menu de tri, bascule grille/liste, A–Z / Années, « ANNÉE RETENUE », frise —
// alors que `<AjoutsRecentsV2 onOuvrir=… />` ne reçoit AUCUNE de ces valeurs
// et ne peut donc obéir à aucune. L'écran n'est pas figé : il est couvert de
// commandes mortes, et « la seule partie qui se met à jour » est la vue.
//
// La doctrine existait déjà dans ce fichier — « Les filtres d'ALBUM ne
// s'affichent pas là où ils n'agissent pas » — mais n'avait été appliquée
// qu'à `artists` et `tracks` ; l'onglet `recent`, ajouté depuis (#3039), n'y
// avait jamais été versé.
//
// ## CE QUE CE TÉMOIN REFUSE DE FAIRE
//
// Il ne lit pas le source. Une garde de texte serait satisfaite par une
// condition posée n'importe où. Il MONTE le vrai écran, CLIQUE l'onglet comme
// le testeur, et mesure le DOM rendu : quelles commandes restent, et ce que
// produit un clic sur la bascule.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import LibraryV2 from '../../components/v2/LibraryV2.svelte';
import { activeView } from '../stores/navigation';
import { albums as albumsStore, libraryFolderScope } from '../stores/library';
import { locale } from '../i18n';
import type { Album } from '../types';

vi.setConfig({ testTimeout: 60_000 });

class ResizeObserverInerte { observe() {} unobserve() {} disconnect() {} }
for (const [prop, valeur] of [['clientHeight', 2000], ['clientWidth', 1400]] as const) {
  Object.defineProperty(HTMLElement.prototype, prop, { configurable: true, get: () => valeur });
}

const ALBUMS: Album[] = Array.from({ length: 40 }, (_, i) => ({
  id: i + 1,
  title: `Album ${String(i + 1).padStart(2, '0')}`,
  artist_name: `Artiste ${(i % 7) + 1}`,
  year: 1970 + (i % 6),
})) as unknown as Album[];

/** Ce que rend `/home/recently-added` : 23 albums, la fenêtre 15 jours du testeur. */
const RECENTS = Array.from({ length: 23 }, (_, i) => ({
  id: 500 + i,
  title: `Récent ${String(i + 1).padStart(2, '0')}`,
  artist_name: `Artiste ${(i % 5) + 1}`,
  cover_path: null,
}));

const RESUME = { days: 15, album_count: 23, track_count: 231, duration_ms: 21_300_000, duration_seconds: 21_300 };

const PISTES = Array.from({ length: 30 }, (_, i) => ({
  id: 900 + i, title: `Piste ${i + 1}`, artist_name: 'Artiste 1',
  album_name: 'Album 01', album_id: 1, duration: 200,
}));

const ARTISTES = Array.from({ length: 12 }, (_, i) => ({ id: i + 1, name: `Artiste ${i + 1}` }));

function corpsPour(url: string): unknown {
  if (url.includes('/home/recently-added/summary')) return RESUME;
  if (url.includes('/home/recently-added')) return RECENTS;
  if (/\/library\/artists(\?|$)/.test(url)) return ARTISTES;
  if (/\/library\/tracks(\?|$)/.test(url)) return PISTES;
  if (url.includes('/tracks')) return PISTES;
  if (url.includes('/stats')) return { track_count: PISTES.length, album_count: ALBUMS.length };
  return [];
}

let hote: HTMLDivElement | null = null;
let monte: Record<string, unknown> | null = null;
const respirer = () => new Promise((r) => setTimeout(r, 0));

async function poserEcran(): Promise<HTMLElement> {
  activeView.set('library');
  albumsStore.set([...ALBUMS]);
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(LibraryV2, { target: hote, props: {} as never });
  for (let i = 0; i < 14; i++) await respirer();
  flushSync();
  return hote;
}

/** Le GESTE : cliquer l'onglet par son libellé, comme le testeur. */
async function cliquerOnglet(el: HTMLElement, libelle: string): Promise<void> {
  const bouton = [...el.querySelectorAll<HTMLButtonElement>('nav.tabs button.tab')]
    .find((b) => (b.textContent ?? '').trim() === libelle);
  if (!bouton) {
    const vus = [...el.querySelectorAll('nav.tabs button.tab')].map((b) => (b.textContent ?? '').trim());
    throw new Error(`onglet « ${libelle} » absent — présents : ${vus.join(' | ')}`);
  }
  bouton.click();
  for (let i = 0; i < 14; i++) await respirer();
  flushSync();
}

async function cliquer(b: HTMLElement): Promise<void> {
  b.click();
  for (let i = 0; i < 8; i++) await respirer();
  flushSync();
}

/** La bascule grille/liste, telle qu'elle est rendue dans la barre d'outils. */
function bascule(el: HTMLElement): HTMLButtonElement | null {
  return [...el.querySelectorAll<HTMLButtonElement>('.filters button.viewtog')]
    .find((b) => /vue|view|liste|grille|list|grid/i.test(b.getAttribute('aria-label') ?? '')) ?? null;
}

beforeEach(() => {
  locale.set('fr');
  activeView.set('home');
  libraryFolderScope.set(null);
  albumsStore.set([]);
  localStorage.clear();
  vi.stubGlobal('ResizeObserver', ResizeObserverInerte);
  vi.stubGlobal('fetch', vi.fn(async (entree: unknown) => {
    const url = String(typeof entree === 'string' ? entree : (entree as Request)?.url ?? entree);
    const corps = corpsPour(url);
    return {
      ok: true, status: 200, statusText: 'OK',
      headers: new Map([['content-type', 'application/json']]),
      json: async () => corps,
      text: async () => JSON.stringify(corps),
    } as unknown as Response;
  }));
  vi.stubGlobal('WebSocket', class { close() {} addEventListener() {} removeEventListener() {} send() {} } as never);
});

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  hote?.remove();
  hote = null;
  albumsStore.set([]);
  activeView.set('home');
  localStorage.clear();
  vi.unstubAllGlobals();
});

describe('Ajouts récents — « il n’est pas possible de choisir liste ou grille »', () => {
  it('🔴 la bascule est OFFERTE sur cet onglet', async () => {
    const el = await poserEcran();
    await cliquerOnglet(el, 'Ajouts récents');
    expect(
      bascule(el),
      'aucune bascule grille/liste sur « Ajouts récents » — le testeur en demande une',
    ).not.toBeNull();
  });

  it('🔴 et elle AGIT : le clic change ce qui est rendu', async () => {
    const el = await poserEcran();
    await cliquerOnglet(el, 'Ajouts récents');

    // Contre-épreuve du montage : la vue est bien celle du ticket, peuplée.
    expect(el.querySelectorAll('.body .recents .grille .carte').length).toBe(RECENTS.length);

    const b = bascule(el)!;
    await cliquer(b);

    // Après la bascule, le MÊME contenu est rendu en lignes, pas en grille.
    const lignes = el.querySelectorAll('.body .recents .liste .ligne');
    const grille = el.querySelectorAll('.body .recents .grille .carte');
    expect(
      lignes.length,
      `la bascule n'a rien changé : ${grille.length} cartes en grille, 0 ligne`,
    ).toBe(RECENTS.length);
    expect(grille.length).toBe(0);

    // Et le retour en arrière fonctionne : une bascule qui ne revient pas est
    // un aller simple, pas une bascule.
    await cliquer(bascule(el)!);
    expect(el.querySelectorAll('.body .recents .grille .carte').length).toBe(RECENTS.length);
    expect(el.querySelectorAll('.body .recents .liste .ligne').length).toBe(0);
  });

  it('🔴 la vue défile toujours, dans les DEUX modes (#1323 ne doit pas régresser)', async () => {
    const el = await poserEcran();
    await cliquerOnglet(el, 'Ajouts récents');
    const vue = () => el.querySelector<HTMLElement>('.body .recents')!;
    expect(vue()).not.toBeNull();
    await cliquer(bascule(el)!);
    // La vue reste la même boîte : c'est elle qui porte l'ascenseur.
    expect(vue()).not.toBeNull();
    expect(el.querySelectorAll('.body .recents').length).toBe(1);
  });
});

describe('Ajouts récents — « bloque tout / la seule partie qui se met à jour »', () => {
  // Chacune de ces commandes est câblée aux ALBUMS de `LibraryV2` et n'est
  // transmise à AUCUN moment à `AjoutsRecentsV2`. Rendue sur cet onglet, elle
  // ne peut rien faire : c'est le « tout est bloqué » du testeur.
  const MORTES: Array<[string, string]> = [
    ['le compteur « Tout (n) » et les puces de filtre', '.filters button.chip.count'],
    ['le menu déroulant Qualité / Fréquence / Format', '.filters .drop'],
    ['le champ de recherche', '.filters .v2-rech'],
    ['les boutons A–Z / Années', '.navmode button'],
    ['la barre « ANNÉE RETENUE »', '.anbar'],
    ['la frise chronologique', '.frise'],
  ];

  for (const [quoi, selecteur] of MORTES) {
    it(`🔴 ${quoi} n'est pas affiché sur « Ajouts récents »`, async () => {
      const el = await poserEcran();
      await cliquerOnglet(el, 'Ajouts récents');
      const n = el.querySelectorAll(selecteur).length;
      expect(n, `${n} commande(s) inerte(s) laissée(s) à l'écran (${selecteur})`).toBe(0);
    });
  }

  // LA RECETTE DU TESTEUR, mot pour mot : « ouvrir l'onglet Bibliothèque et
  // mettre en vert, Ajouts récents, Tout, Années, Origine sinon édition, 15
  // jours ou 30 jours ». C'est en passant par « Années » que la barre
  // « ANNÉE RETENUE » et la frise s'allument — et qu'elles RESTAIENT allumées,
  // inertes, une fois l'onglet changé, en mangeant la hauteur du corps.
  it('🔴 sa recette : « Années » AVANT l’onglet ⇒ frise et « ANNÉE RETENUE » ne suivent pas', async () => {
    const el = await poserEcran();
    await cliquerOnglet(el, 'Albums');

    const ans = [...el.querySelectorAll<HTMLButtonElement>('.navmode button')]
      .find((b) => (b.textContent ?? '').trim() === 'Années');
    expect(ans, 'le bouton « Années » de sa recette est introuvable').toBeTruthy();
    await cliquer(ans!);
    // Contre-épreuve : sur Albums, sa recette allume bien les deux bandeaux.
    expect(el.querySelectorAll('.anbar').length, 'sa recette n’allume pas « ANNÉE RETENUE »').toBe(1);
    expect(el.querySelectorAll('.frise').length, 'sa recette n’allume pas la frise').toBe(1);

    await cliquerOnglet(el, 'Ajouts récents');
    expect(el.querySelectorAll('.anbar').length, '« ANNÉE RETENUE » suit sur un onglet qu’elle ne pilote pas').toBe(0);
    expect(el.querySelectorAll('.frise').length, 'la frise suit sur un onglet qu’elle ne pilote pas').toBe(0);
    expect(el.querySelectorAll('.navmode button').length, 'A–Z / Années suivent aussi').toBe(0);
    // Et la vue est bien montée dessous, peuplée : on n'a pas vidé l'écran.
    expect(el.querySelectorAll('.body .recents .grille .carte').length).toBe(RECENTS.length);
  });

  it('🟢 CONTRE-ÉPREUVE : sur « Albums », ces mêmes commandes sont bien là', async () => {
    const el = await poserEcran();
    await cliquerOnglet(el, 'Albums');
    for (const [quoi, selecteur] of MORTES) {
      // La frise et « ANNÉE RETENUE » demandent le mode Années : on les exclut
      // de la contre-épreuve par défaut, les quatre autres suffisent à établir
      // que le correctif n'a pas vidé la barre partout.
      if (selecteur === '.frise' || selecteur === '.anbar') continue;
      expect(
        el.querySelectorAll(selecteur).length,
        `${quoi} a disparu de l'onglet Albums — le correctif a débordé`,
      ).toBeGreaterThan(0);
    }
  });

  it('🟢 CONTRE-ÉPREUVE : la navigation par onglets, elle, reste entière', async () => {
    const el = await poserEcran();
    await cliquerOnglet(el, 'Ajouts récents');
    expect(el.querySelectorAll('nav.tabs button.tab').length).toBe(7);
    const actif = el.querySelector('nav.tabs button.tab.active');
    expect((actif?.textContent ?? '').trim()).toBe('Ajouts récents');
  });
});
