// @vitest-environment jsdom
//
// renesenses/tune-server-rust#3717 — deux défauts relevés en instruisant
// #3708 et #3707, laissés intacts alors.
//
// ── 1. « Aller à l'album » depuis l'INTÉRIEUR de la Bibliothèque ───────────
//
// `LibraryV2` consommait `pendingLibraryAlbum` par `get(...)` dans un
// `$effect`. Sous les runes, `get()` lit et se désabonne aussitôt : il
// n'inscrit AUCUNE dépendance, et l'effet ne tournait donc qu'au montage.
//
// Le piège, et la raison pour laquelle il a survécu à une release : ça
// PARAISSAIT marcher. `ShellV2` monte `{#if $activeView === 'library'}
// <LibraryV2/>`, donc tout émetteur situé HORS de la Bibliothèque
// (`NowPlaying`, `MenuPisteV1`) provoquait un remontage, et l'effet rejouait.
// Les émetteurs INTERNES — `v2/PisteActions.allerAlbum`,
// `v2/VersionsPistePanneau.ouvrirAlbum` — sont atteints alors qu'on est DÉJÀ
// dans la Bibliothèque : rien n'est remonté, et la fiche ne s'ouvrait pas.
//
// 🔴 CE TÉMOIN EXIGE QUE L'ÉCRAN AIT BOUGÉ.
//
// Vérifier que le magasin est retombé à `null` ne suffirait PAS : c'est
// l'effet lui-même qui le vide, et un consommateur pourrait le vider sans
// rien afficher. On exige donc la FICHE D'ALBUM dans le DOM — `{#if opened}
// <AlbumDetailV2/>`. C'est toute la différence entre « le magasin a été posé »
// et « l'écran a bougé ».
//
// ── 2. La vignette d'artiste de la recherche ──────────────────────────────
//
// `SearchV2` faisait `q = ar.name` sur ses TROIS tuiles d'artiste : cliquer
// un artiste relançait une recherche sur son nom au lieu d'ouvrir sa fiche.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import { readFileSync } from 'fs';
import { get } from 'svelte/store';
import LibraryV2 from '../../components/v2/LibraryV2.svelte';
import SearchV2 from '../../components/v2/SearchV2.svelte';
import { activeView, pendingLibraryAlbum, pendingLibraryArtist } from '../stores/navigation';
import { albums as albumsStore } from '../stores/library';
import type { Album } from '../types';

/** Monter ces écrans compile des composants de plusieurs milliers de lignes. */
vi.setConfig({ testTimeout: 30_000 });

const ALBUM: Album = {
  id: 55,
  title: '101 (CD1)',
  artist_id: 994,
  artist_name: 'Depeche Mode',
  year: 1989,
} as Album;

/** Un artiste LOCAL : il a une fiche, donc un identifiant de bibliothèque. */
const ARTISTE_LOCAL = { id: 994, name: 'Depeche Mode', source: 'local', image_path: null };
/** Un artiste de SERVICE : aucun identifiant de bibliothèque, aucune fiche. */
const ARTISTE_SERVICE = { id: null, name: 'Depeche Mode', source: 'qobuz', image_path: null };

class ResizeObserverInerte {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal('ResizeObserver', ResizeObserverInerte);

// Les grilles sont virtualisées sur une hauteur mesurée ; jsdom n'a pas de
// mise en page et rendrait zéro vignette.
for (const [prop, valeur] of [['clientHeight', 2000], ['clientWidth', 1400]] as const) {
  Object.defineProperty(HTMLElement.prototype, prop, { configurable: true, get: () => valeur });
}

/** Résultats de recherche renvoyés par le serveur simulé. */
let artistesTrouves: unknown[] = [];

function corpsPour(url: string): unknown {
  if (/\/search/.test(url)) {
    return { artists: artistesTrouves, albums: [], tracks: [], playlists: [] };
  }
  if (/\/library\/albums\/55\/tracks/.test(url)) return [];
  if (/\/library\/albums\/55(\?|$)/.test(url)) return ALBUM;
  if (/\/library\/artists\/994\/albums/.test(url)) return [ALBUM];
  if (/\/library\/artists/.test(url)) return [ARTISTE_LOCAL];
  if (/\/library\/albums/.test(url)) return [ALBUM];
  if (/\/library\/tracks/.test(url)) return [];
  if (/\/zones/.test(url)) return [];
  // L'écran de DÉCOUVERTE de `SearchV2` (ce qu'il montre avant la première
  // frappe) appelle ces trois routes au montage et itère leur réponse sans
  // filet. Leur rendre `{}` levait des rejets non capturés qui polluaient la
  // sortie de toute la suite — ils ne faisaient pas rougir ces témoins, mais
  // un bruit d'erreur permanent finit par masquer une vraie panne.
  if (/\/library\/history\/top-artists/.test(url)) return [];
  if (/\/playlists/.test(url)) return [];
  return {};
}

const respirer = () => new Promise((r) => setTimeout(r, 0));

let hote: HTMLDivElement | null = null;
let monte: Record<string, unknown> | null = null;

beforeEach(() => {
  activeView.set('home');
  pendingLibraryAlbum.set(null);
  pendingLibraryArtist.set(null);
  artistesTrouves = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      const corps = corpsPour(String(url));
      return {
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: new Map([['content-type', 'application/json']]),
        json: async () => corps,
        text: async () => JSON.stringify(corps),
      } as unknown as Response;
    }),
  );
  vi.stubGlobal('WebSocket', class {
    close() {}
    addEventListener() {}
    removeEventListener() {}
    send() {}
  } as unknown as typeof WebSocket);
});

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  if (hote) hote.remove();
  hote = null;
  activeView.set('home');
  pendingLibraryAlbum.set(null);
  pendingLibraryArtist.set(null);
  albumsStore.set([]);
  vi.unstubAllGlobals();
});

// ── 1. Le CONSOMMATEUR : la Bibliothèque déjà montée honore l'album ────────
describe('#3717 — la Bibliothèque DÉJÀ montée ouvre l’album demandé', () => {
  async function poserBibliotheque(): Promise<HTMLDivElement> {
    activeView.set('library');
    albumsStore.set([ALBUM]);
    hote = document.createElement('div');
    document.body.appendChild(hote);
    monte = mount(LibraryV2, { target: hote, props: {} as any });
    for (let i = 0; i < 8; i++) await respirer();
    flushSync();
    return hote;
  }

  it('la fiche d’album S’OUVRE quand la cible est posée APRÈS le montage', async () => {
    const el = await poserBibliotheque();

    // Aucun remontage ne viendra sauver l'effet : c'est bien le geste d'après
    // qui compte, exactement comme depuis `PisteActions` ou le panneau des
    // versions, tous deux atteints depuis l'intérieur de la Bibliothèque.
    expect(get(pendingLibraryAlbum)).toBeNull();
    expect(
      el.querySelector('.v2-detail'),
      'une fiche d’album est déjà ouverte : le témoin ne prouverait rien',
    ).toBeNull();

    pendingLibraryAlbum.set(55);
    for (let i = 0; i < 10; i++) await respirer();
    flushSync();

    // 🔴 L'ASSERTION QUI COMPTE : l'écran a bougé.
    const fiche = el.querySelector('.v2-detail');
    expect(
      fiche,
      'la fiche d’album ne s’est pas ouverte : le magasin a été posé et ' +
        'l’écran n’a pas bougé — « Aller à l’album » depuis l’intérieur de ' +
        'la Bibliothèque ne fait rien',
    ).not.toBeNull();
    expect(fiche!.textContent, 'ce n’est pas l’album demandé').toContain('101 (CD1)');
  });

  it('et le dépôt est vidé, pour qu’un second clic sur le même album rejoue', async () => {
    await poserBibliotheque();
    pendingLibraryAlbum.set(55);
    for (let i = 0; i < 10; i++) await respirer();
    flushSync();
    expect(
      get(pendingLibraryAlbum),
      'la cible dort encore dans le magasin : personne ne l’a consommée',
    ).toBeNull();
  });
});

// ── 2. L'ÉMETTEUR : la vignette d'artiste de la recherche ─────────────────
describe('#3717 — une vignette d’artiste OUVRE sa fiche', () => {
  async function poserRecherche(artistes: unknown[]): Promise<HTMLDivElement> {
    artistesTrouves = artistes;
    activeView.set('search');
    hote = document.createElement('div');
    document.body.appendChild(hote);
    monte = mount(SearchV2, { target: hote, props: {} as any });
    flushSync();
    const champ = hote.querySelector('input') as HTMLInputElement | null;
    expect(champ, 'le champ de recherche est introuvable').not.toBeNull();
    champ!.value = 'depeche';
    champ!.dispatchEvent(new Event('input', { bubbles: true }));
    // 🔴 La recherche est débouncée de 240 ms (`SearchV2` : `setTimeout(…, 240)`).
    // Une boucle de `setTimeout(0)` ne franchit pas ce seuil de façon fiable :
    // il faut laisser passer le délai en temps réel, sinon aucun résultat
    // n'arrive et le témoin échouerait pour la mauvaise raison.
    await new Promise((r) => setTimeout(r, 400));
    for (let i = 0; i < 10; i++) await respirer();
    flushSync();
    return hote;
  }

  /** Le nom sous la vignette, dans la rangée d'artistes du bandeau de tête. */
  const tuileNom = (el: HTMLElement) =>
    el.querySelector('.basartistes .artile button.meta') as HTMLElement | null;

  it('le clic POSE la cible et va à la Bibliothèque — il ne relance PAS la recherche', async () => {
    const el = await poserRecherche([ARTISTE_LOCAL]);
    const nom = tuileNom(el);
    expect(nom, 'aucune vignette d’artiste dans les résultats').not.toBeNull();

    const champ = el.querySelector('input') as HTMLInputElement;
    const avant = champ.value;

    nom!.click();
    flushSync();

    expect(
      get(pendingLibraryArtist),
      'la cible n’a pas été posée : la Bibliothèque n’a rien à ouvrir',
    ).toBe(994);
    expect(get(activeView), 'on ne va pas à la Bibliothèque').toBe('library');

    // Le symptôme exact du ticket : le champ se remplissait du nom cherché.
    expect(
      champ.value,
      'le champ de recherche a été réécrit : le clic a relancé une ' +
        'recherche sur le nom au lieu d’ouvrir la fiche',
    ).toBe(avant);
  });

  it('la POCHETTE mène au même endroit que le nom — c’est la même vignette', async () => {
    const el = await poserRecherche([ARTISTE_LOCAL]);
    const pochette = el.querySelector('.basartistes .artile button.ouvrir') as HTMLElement | null;
    expect(pochette, 'la pochette d’artiste n’est pas un bouton atteignable').not.toBeNull();

    pochette!.click();
    flushSync();

    expect(get(pendingLibraryArtist), 'la pochette n’ouvre pas la fiche').toBe(994);
    expect(get(activeView)).toBe('library');
  });

  it('un artiste de SERVICE n’a pas de fiche : on affine la recherche, on ne va nulle part', async () => {
    const el = await poserRecherche([ARTISTE_SERVICE]);
    const nom = tuileNom(el);
    expect(nom, 'aucune vignette d’artiste dans les résultats').not.toBeNull();

    nom!.click();
    flushSync();

    // `pendingLibraryArtist` est un identifiant de la table `artists` : poser
    // celui d'un artiste de service ouvrirait une fiche vide, ou la mauvaise.
    expect(
      get(pendingLibraryArtist),
      'une cible de bibliothèque a été posée pour un artiste de service',
    ).toBeNull();
    expect(get(activeView), 'on a quitté la recherche pour rien').toBe('search');

    const champ = el.querySelector('input') as HTMLInputElement;
    expect(champ.value, 'le repli par le nom a disparu aussi').toBe('Depeche Mode');
  });
});

// ── 3. La garde de forme : plus AUCUN `get()` dans un `$effect` ───────────
//
// 🔴 Ce témoin lit du SOURCE, il ne clique pas — il ne remplace donc aucun
// des précédents. Il existe pour empêcher la RÉCIDIVE ailleurs : le défaut
// est invisible à la relecture (le code se lit bien), il ne se voit qu'au
// comportement, et il vient de se produire deux fois de suite sur deux
// magasins jumeaux.
//
// Il ne condamne pas `get()` en général : dans un rappel d'événement ou
// d'abonnement (`App.svelte`, `PlaylistsView`, `SettingsView`), lire la
// valeur courante sans s'abonner est le geste JUSTE. C'est la lecture
// SYNCHRONE dans le corps d'un effet, celle qui prétend créer une
// dépendance, que l'on interdit ici — et on la cerne aux deux écrans où le
// défaut a mordu.
describe('#3717 — la forme, pour empêcher la récidive', () => {
  const SOUS_GARDE = [
    'src/components/v2/LibraryV2.svelte',
    'src/components/v2/SearchV2.svelte',
  ];

  /**
   * Balayage fait UNE fois, à la charge du module : les deux témoins
   * ci-dessous jugent le même relevé, et l'ordre d'exécution ne peut pas
   * rendre l'un vert aux dépens de l'autre.
   *
   * Chemins relatifs à la racine du dépôt : c'est la convention des autres
   * gardes de source (`imageSansSource201`), et `import.meta.url` n'est pas
   * une URL `file:` sous l'environnement jsdom de vitest.
   */
  const releve = (() => {
    const fautes: string[] = [];
    let effets = 0;
    for (const rel of SOUS_GARDE) {
      const src = readFileSync(rel, 'utf8');
      // Retirer les commentaires : ils CITENT `get(...)` pour l'expliquer.
      const nu = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
      for (const m of nu.matchAll(/\$effect(?:\.pre)?\s*\(/g)) {
        const i = m.index! + m[0].length - 1;
        let profondeur = 0;
        let fin = -1;
        for (let j = i; j < nu.length; j++) {
          if (nu[j] === '(') profondeur++;
          else if (nu[j] === ')') { profondeur--; if (profondeur === 0) { fin = j; break; } }
        }
        if (fin < 0) continue;
        effets++;
        const corps = nu.slice(i, fin + 1);
        if (/(^|[^\w.$])get\s*\(/.test(corps)) {
          const ligne = nu.slice(0, m.index!).split('\n').length;
          fautes.push(`${rel} ($effect vers la ligne ${ligne})`);
        }
      }
    }
    return { fautes, effets };
  })();

  it('la garde voit bien des $effect — sinon elle est verte pour rien', () => {
    expect(
      releve.effets,
      'le balayage n’a trouvé aucun `$effect` : chemins faux, ou fichiers déplacés',
    ).toBeGreaterThan(5);
  });

  it('LibraryV2 et SearchV2 ne lisent aucun magasin par get() dans un $effect', () => {
    expect(
      releve.fautes,
      'un `$effect` lit un magasin par `get()` : sous les runes cela ' +
        'n’inscrit aucune dépendance, l’effet ne tournera qu’au montage et ' +
        'l’écran ne bougera pas. Employer `$monMagasin`.',
    ).toEqual([]);
  });
});
