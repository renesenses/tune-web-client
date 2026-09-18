// @vitest-environment jsdom
//
// #1142 — LE PRÉCÉDENT DU NAVIGATEUR DEPUIS UNE FICHE D'ALBUM DE LA RECHERCHE.
//
// FabienM, forum fil 1774, point 1 (v0.9.147) :
//
//   « Menu recherche, après une recherche et page de résultat, quand on clique
//     sur un album -> page album, le bouton "BACK" du navigateur retourne à la
//     page d'accueil et non à la page de résultats »
//
// ## Pourquoi un témoin de PLUS, alors que #980 existe
//
// `retourRechercheAlbum980.test.ts` est une GARDE DE TEXTE : il lit le source
// de `SearchV2.svelte` et y cherche `ouvrirDetail(`. Un appel posé dans une
// branche jamais prise la satisferait. Elle n'a jamais monté l'écran, jamais
// cliqué, jamais appuyé sur le Précédent — et le symptôme a survécu à trois
// versions (.144, .145, .147, .148, .152).
//
// Ce fichier fait l'inverse : il monte la VRAIE Recherche, joue une requête,
// CLIQUE une vignette de résultat, puis appuie sur le Précédent du navigateur.
// Il n'appelle jamais `pushState` lui-même.
//
// ⚠️ On ne mesure PAS `history.length` pour juger un retour : ni jsdom ni
// Chrome ne le décrémentent sur un `back()`. La POSITION du curseur se lit
// dans `history.state`, et c'est elle qui dit où l'on est.
//
// ⚠️ Aucun délai calibré : les vignettes arrivent par deux appels réseau
// simulés derrière un anti-rebond de 240 ms. On attend une CONDITION, bornée
// en temps, jamais une constante choisie à la main.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import { get } from 'svelte/store';
import SearchV2 from '../../components/v2/SearchV2.svelte';
import { activeView } from '../stores/navigation';
import { setSearchCriteria } from '../stores/shortcuts';
import { preferences } from '../stores/preferences';
import { brancherHistoriqueCoquille, detailOuvert } from '../historiqueCoquille';

/** Monter cet écran compile un composant de plus de mille lignes. */
vi.setConfig({ testTimeout: 30_000 });

const REQUETE = 'Wish You Were Here';

const vide = { artists: [], albums: [], tracks: [], playlists: [], labels: [] };

/** Un album de la BIBLIOTHÈQUE et un album de SERVICE : la capture du fil en a des deux. */
const ALBUM_LOCAL = {
  id: 60,
  title: 'Wish You Were Here',
  artist_name: 'Pink Floyd',
  artist_id: 42,
  year: 1975,
  cover_path: '/c/a.jpg',
};
const ALBUM_QOBUZ = {
  id: null,
  source: 'qobuz',
  source_id: 'q-1',
  title: 'Wish You Were Here (Remaster)',
  artist_name: 'Pink Floyd',
  year: 2011,
  cover_path: null,
};

const CLE_LOCAL = 'album:60';
const CLE_QOBUZ = 'album:qobuz:q-1';

const LOCAL = { ...vide, albums: [ALBUM_LOCAL] };
const SERVICES = { qobuz: { ...vide, albums: [ALBUM_QOBUZ] } };

class ResizeObserverInerte {
  observe() {}
  unobserve() {}
  disconnect() {}
}

function reponse(corps: unknown) {
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    headers: new Map([['content-type', 'application/json']]),
    json: async () => corps,
    text: async () => JSON.stringify(corps),
  } as unknown as Response;
}

const respirer = () => new Promise((r) => setTimeout(r, 0));

/**
 * Attendre une CONDITION, bornée — jamais un délai calibré.
 *
 * Un import dynamique sous quatre cent soixante fichiers en parallèle dépasse
 * n'importe quelle constante ; et une constante trop généreuse ralentit tout
 * le monde. On repasse la main à la boucle d'événements jusqu'à ce que la
 * condition tienne, ou jusqu'à la borne — auquel cas l'assertion qui suit dira
 * ce qui manquait.
 */
async function jusqua(condition: () => boolean, borne = 5000): Promise<void> {
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

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', ResizeObserverInerte);
  for (const [prop, valeur] of [['clientHeight', 2000], ['clientWidth', 1400]] as const) {
    Object.defineProperty(HTMLElement.prototype, prop, { configurable: true, get: () => valeur });
  }
  try { localStorage.clear(); } catch { /* jsdom sans stockage */ }
  vi.stubGlobal('fetch', vi.fn(async (url: any) => {
    const u = String(url);
    if (/\/library\/search/.test(u)) return reponse(LOCAL);
    if (/\/search\?/.test(u)) return reponse({ local: LOCAL, services: SERVICES, radios: [] });
    return reponse([]);
  }));
  vi.stubGlobal('WebSocket', class {
    close() {} addEventListener() {} removeEventListener() {} send() {}
  } as unknown as typeof WebSocket);
  preferences.update((p) => ({ ...p, settingsLevel: 'expert' }));
  activeView.set('home');
  detailOuvert.set(null);
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
  setSearchCriteria(null);
  vi.unstubAllGlobals();
});

/**
 * Le décor du signalement : on vient de l'Accueil, la coquille est branchée
 * sur l'historique (c'est `ShellV2` qui la branche en production), et le clic
 * sur « Recherche » de la barre latérale empile `#search` par-dessus `#home`.
 */
async function poserRecherche(): Promise<HTMLDivElement> {
  activeView.set('home');
  debrancher = brancherHistoriqueCoquille();
  setSearchCriteria({ q: REQUETE });
  activeView.set('search');
  flushSync();
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(SearchV2, { target: hote, props: {} as any });
  await jusqua(() => cartes(hote!).length >= 2);
  return hote;
}

/** Les vignettes de la section « Albums » des résultats. */
const cartes = (el: HTMLElement) => [...el.querySelectorAll<HTMLElement>('.grid .card')];
/** Le bouton de la vignette dont le titre commence par… */
function carte(el: HTMLElement, titre: string): HTMLButtonElement {
  const trouvee = cartes(el).find((c) => (c.querySelector('.ct')?.textContent ?? '').trim() === titre);
  if (!trouvee) throw new Error(`aucune vignette « ${titre} » dans les résultats`);
  const bouton = trouvee.querySelector<HTMLButtonElement>('button.meta');
  if (!bouton) throw new Error(`la vignette « ${titre} » n’ouvre rien`);
  return bouton;
}

const fiche = (el: HTMLElement) => el.querySelector('.v2-detail');

/** Le Précédent du navigateur, et le temps que la coquille repose son état. */
async function precedent(attendu: () => boolean): Promise<void> {
  history.back();
  await jusqua(attendu);
}

describe('#1142 — le décor', () => {
  it('les résultats sont bien à l’écran, l’Accueil est l’entrée d’avant', async () => {
    const el = await poserRecherche();
    expect(cartes(el).length, 'la recherche n’a rendu aucune vignette : le témoin ne mesure rien').toBeGreaterThanOrEqual(2);
    expect(fiche(el), 'une fiche est déjà ouverte : le témoin ne prouverait rien').toBeNull();
    expect(history.state, 'la Recherche n’est pas l’entrée courante').toMatchObject({
      tune: 'v2', vue: 'search', detail: null,
    });
  });
});

describe('#1142 — ouvrir un album des résultats, puis le Précédent', () => {
  it('🔴 cliquer un album LOCAL empile une entrée', async () => {
    const el = await poserRecherche();
    const hauteur = history.length;

    carte(el, ALBUM_LOCAL.title).click();
    await jusqua(() => fiche(el) !== null);

    expect(fiche(el), 'la fiche d’album ne s’est pas ouverte').not.toBeNull();
    expect(history.length, 'ouvrir un album des résultats n’empile AUCUNE entrée').toBe(hauteur + 1);
    expect(history.state).toMatchObject({ tune: 'v2', vue: 'search', detail: CLE_LOCAL });
  });

  it('🔴 le Précédent ramène à la PAGE DE RÉSULTATS, pas à l’accueil', async () => {
    const el = await poserRecherche();
    carte(el, ALBUM_LOCAL.title).click();
    await jusqua(() => fiche(el) !== null);
    expect(fiche(el), 'la fiche ne s’est pas ouverte').not.toBeNull();

    await precedent(() => fiche(el) === null);

    expect(fiche(el), 'le Précédent laisse la fiche d’album ouverte').toBeNull();
    expect(
      get(activeView),
      'le Précédent quitte la Recherche et retombe sur l’accueil — c’est le signalement',
    ).toBe('search');
    expect(cartes(el).length, 'la page de résultats n’est pas revenue').toBeGreaterThanOrEqual(2);
    expect(history.state).toMatchObject({ tune: 'v2', vue: 'search', detail: null });
  });

  it('🔴 un album de SERVICE se comporte comme un album local', async () => {
    // La capture du fil 1774 montre « Bandcamp 53 · Qobuz 205 » : la moitié des
    // vignettes de ses résultats sont des albums de service.
    const el = await poserRecherche();
    const hauteur = history.length;

    carte(el, ALBUM_QOBUZ.title).click();
    await jusqua(() => fiche(el) !== null);

    expect(fiche(el), 'la fiche d’un album de service ne s’ouvre pas').not.toBeNull();
    expect(history.length, 'un album de service n’empile rien').toBe(hauteur + 1);
    expect(history.state).toMatchObject({ tune: 'v2', vue: 'search', detail: CLE_QOBUZ });

    await precedent(() => fiche(el) === null);
    expect(get(activeView), 'le Précédent quitte la Recherche').toBe('search');
    expect(cartes(el).length, 'la page de résultats n’est pas revenue').toBeGreaterThanOrEqual(2);
  });

  it('🔴 un SECOND Précédent rend l’accueil : la pile suit le chemin parcouru', async () => {
    const el = await poserRecherche();
    carte(el, ALBUM_LOCAL.title).click();
    await jusqua(() => fiche(el) !== null);

    await precedent(() => fiche(el) === null);
    await precedent(() => get(activeView) === 'home');

    expect(
      get(activeView),
      'deux retours ne ramènent pas à l’accueil : la pile a un cran de trop, ou de moins',
    ).toBe('home');
  });
});

describe('#1142 — les autres gestes qui ouvrent une fiche depuis les résultats', () => {
  it('🔴 le « Meilleur résultat » empile lui aussi — c’est la plus grosse cible de l’écran', async () => {
    const el = await poserRecherche();
    const hauteur = history.length;
    const bcard = el.querySelector<HTMLButtonElement>('.bcard');
    expect(bcard, 'aucune carte « Meilleur résultat »').not.toBeNull();

    bcard!.click();
    await jusqua(() => fiche(el) !== null);

    expect(fiche(el), 'le Meilleur résultat n’ouvre pas de fiche').not.toBeNull();
    expect(history.length, 'le Meilleur résultat ouvre SANS empiler').toBe(hauteur + 1);

    await precedent(() => fiche(el) === null);
    expect(get(activeView), 'le Précédent quitte la Recherche').toBe('search');
  });

  it('🔴 ouvrir, revenir, ROUVRIR : le second aller-retour se comporte comme le premier', async () => {
    const el = await poserRecherche();
    // ⚠️ Pas `history.length` : après un `back()`, l'entrée quittée reste
    // atteignable par « suivant », et le `pushState` suivant la REMPLACE — la
    // hauteur ne bouge pas alors que le curseur, lui, a bien avancé. C'est la
    // POSITION qu'on lit, ici comme partout ailleurs dans ce fichier.
    for (const tour of [1, 2, 3]) {
      carte(el, ALBUM_LOCAL.title).click();
      await jusqua(() => fiche(el) !== null);
      expect(fiche(el), `tour ${tour} : la fiche ne s’ouvre plus`).not.toBeNull();
      expect(history.state, `tour ${tour} : l’ouverture n’empile plus l’album`)
        .toMatchObject({ tune: 'v2', vue: 'search', detail: CLE_LOCAL });

      await precedent(() => fiche(el) === null);
      expect(get(activeView), `tour ${tour} : le Précédent quitte la Recherche`).toBe('search');
      expect(history.state, `tour ${tour} : l’entrée courante n’est pas la page de résultats`)
        .toMatchObject({ tune: 'v2', vue: 'search', detail: null });
    }
  });
});

describe('#1142 — les deux écueils', () => {
  it('le Retour INTERNE de la fiche referme ET dépile — il reste intact', async () => {
    const el = await poserRecherche();
    carte(el, ALBUM_LOCAL.title).click();
    await jusqua(() => fiche(el) !== null);

    const retour = el.querySelector<HTMLButtonElement>('.v2-detail button.close');
    expect(retour, 'le bouton Retour de la fiche a disparu').not.toBeNull();
    retour!.click();
    // Le `history.back()` du Retour est ASYNCHRONE : le calque se referme tout
    // de suite, le `popstate` arrive après. On attend la CONDITION, bornée.
    await jusqua(() => fiche(el) === null && (history.state as any)?.detail === null);

    expect(fiche(el), 'le Retour interne ne referme plus la fiche').toBeNull();
    expect(get(activeView), 'le Retour interne quitte la Recherche').toBe('search');
    expect(
      history.state,
      'le Retour interne n’a pas dépilé : le curseur est resté sur la fiche',
    ).toMatchObject({ tune: 'v2', vue: 'search', detail: null });

    await precedent(() => get(activeView) === 'home');
    expect(
      get(activeView),
      'le Retour interne referme sans dépiler : le Précédent suivant ne fait « rien » une fois de trop',
    ).toBe('home');
  });

  it('AUCUNE boucle : la fiche ouverte n’empile qu’une entrée, même après des dizaines de passes', async () => {
    const el = await poserRecherche();
    const hauteur = history.length;

    carte(el, ALBUM_LOCAL.title).click();
    await jusqua(() => fiche(el) !== null);
    const apresOuverture = history.length;
    expect(apresOuverture, 'l’ouverture n’a pas empilé une entrée et une seule').toBe(hauteur + 1);

    // Un `pushState` posé dans un effet qui se redéclenche remplirait la pile
    // et rendrait le Précédent inutilisable. C'est LE mode de panne de ce
    // correctif : on force les passes réactives et on recompte.
    for (let i = 0; i < 40; i++) {
      flushSync();
      await respirer();
    }
    expect(
      history.length,
      'la fiche empile une entrée à chaque rendu : le Précédent est noyé',
    ).toBe(apresOuverture);
    expect(get(detailOuvert), 'la clé ouverte a bougé toute seule').toBe(CLE_LOCAL);
  });
});
