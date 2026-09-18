// @vitest-environment jsdom
//
// #1134 — « Retour / Sortie plein écran », schmitt (Alain), fil forum 1758.
//
// « Lors d'une lecture d'un album et la mise en place de la vue pleine écran,
// le fait de cliquer sur l'écran nous fait bien sortir du mode plein écran mais
// la touche "retour" en haut à gauche nous remet le plein écran a la place de
// nous faire revenir en arrière. »
//
// ## Le mécanisme, relu sur `main` (les numéros du ticket sont ceux du testeur)
//
// Le ticket annonce `NowPlaying.svelte:1474` ; sur `main` au 18/09/2026 le
// bouton est **ligne 1584**. La lecture, elle, est exacte :
//
//   1. `stores/navigation.ts:17-25` — `previousView` suit TOUT changement de
//      vue, sans exception.
//   2. `TvView.svelte:141-145` — `exitTv()` (clic sur `.tv-root`, ou Échap)
//      ramène à « Lecture en cours ». Cette navigation `tv → nowplaying` pose
//      donc `previousView = 'tv'`.
//   3. `NowPlaying.svelte:1584` — le bouton Retour exclut `'nowplaying'` et
//      RIEN d'autre : il repart donc vers `'tv'`.
//
// La vidéo d'Alain (lue image par image au tri) montre exactement cela :
// l'adresse passe à `#tv`, la vue TV revient DANS la fenêtre, sans bandeau de
// plein écran natif — `activeView.set('tv')` sans repasser par
// `requestFullscreen()`.
//
// ## Ce que ce témoin fait
//
// Il joue le geste, il ne lit pas le source : il monte le VRAI `NowPlaying`,
// CLIQUE le bouton Grand écran, monte le VRAI `TvView`, CLIQUE l'écran pour en
// sortir, puis CLIQUE le bouton Retour. Aucune assertion sur `previousView` :
// ce qu'on exige est la vue où l'on ATTERRIT.
//
// ## Ce qu'il ne fait pas
//
// - Il ne monte pas de coquille : c'est le témoin qui démonte `TvView` quand
//   `activeView` quitte `'tv'`, comme `ShellV2`/`App.svelte` le feraient.
//   Le contrat éprouvé est celui des deux composants, qui sont les mêmes sous
//   les deux coquilles.
// - Il ne dit rien du plein écran NATIF : jsdom n'en a pas (`requestFullscreen`
//   est appelé en `?.()`, `document.fullscreenElement` reste `undefined`).
// - Il ne mesure pas la sortie par Échap : elle passe par le même `exitTv()`,
//   mais elle n'est pas observée ici.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import { get } from 'svelte/store';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { APTITUDES, estDestinationDeRetour } from '../destinationDeRetour';
import NowPlaying from '../../components/partages/NowPlaying.svelte';
import TvView from '../../components/v2-heritage/TvView.svelte';
import { zones, currentZoneId } from '../stores/zones';
import { activeView, previousView } from '../stores/navigation';
import { ficheAlbumService, ficheArtisteService } from '../stores/streaming';

/** Monter ces deux écrans compile plusieurs milliers de lignes de Svelte. */
vi.setConfig({ testTimeout: 60_000 });

const PISTE = {
  track_id: 12,
  album_id: 55,
  artist_id: 994,
  title: 'The Price',
  artist_name: 'Leprous',
  album_title: 'Malina',
  source: 'library',
  duration_ms: 321000,
};
const ZONE = { id: 1, name: 'Salon', state: 'playing', current_track: PISTE, position_ms: 1000 };

function reponse(url: string) {
  const corps = /\/(zones|profiles|devices|playlists|shortcuts|search|library)/.test(url) ? [] : {};
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    headers: new Map([['content-type', 'application/json']]),
    json: async () => corps,
    text: async () => JSON.stringify(corps),
  } as unknown as Response;
}

const respirer = (ms = 60) => new Promise((r) => setTimeout(r, ms));

let hoteNp: HTMLDivElement | null = null;
let npMonte: Record<string, unknown> | null = null;
let hoteTv: HTMLDivElement | null = null;
let tvMonte: Record<string, unknown> | null = null;

/** « Lecture en cours » telle que les DEUX coquilles la montent. */
function poserLectureEnCours(): HTMLDivElement {
  hoteNp = document.createElement('div');
  document.body.appendChild(hoteNp);
  npMonte = mount(NowPlaying, { target: hoteNp, props: {} as never });
  flushSync();
  return hoteNp;
}

/** Ce que la coquille fait quand `activeView` passe à `'tv'`. */
function poserGrandEcran(): HTMLDivElement {
  hoteTv = document.createElement('div');
  document.body.appendChild(hoteTv);
  tvMonte = mount(TvView, { target: hoteTv, props: {} as never });
  flushSync();
  return hoteTv;
}

/** Ce que la coquille fait quand `activeView` quitte `'tv'`. */
function retirerGrandEcran() {
  if (tvMonte) unmount(tvMonte);
  tvMonte = null;
  if (hoteTv) hoteTv.remove();
  hoteTv = null;
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => reponse(String(url))));
  vi.stubGlobal(
    'WebSocket',
    class {
      close() {}
      addEventListener() {}
      removeEventListener() {}
      send() {}
    } as never,
  );
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as never,
  );
  zones.set([ZONE] as never);
  currentZoneId.set(1);
  ficheAlbumService.set(null);
  ficheArtisteService.set(null);
  // La vue d'où l'utilisateur vient VRAIMENT : sa bibliothèque.
  activeView.set('library');
  activeView.set('nowplaying');
});

afterEach(() => {
  retirerGrandEcran();
  if (npMonte) unmount(npMonte);
  npMonte = null;
  if (hoteNp) hoteNp.remove();
  hoteNp = null;
  ficheAlbumService.set(null);
  ficheArtisteService.set(null);
  vi.unstubAllGlobals();
});

describe('#1134 — sortir du Grand écran par un clic ne doit pas armer le Retour sur la vue TV', () => {
  it('🔴 le parcours d’Alain : Bibliothèque → Grand écran → clic → Retour ramène à la BIBLIOTHÈQUE', async () => {
    const np = poserLectureEnCours();
    await respirer();

    // 1. Le bouton Grand écran de « Lecture en cours ».
    const boutonTv = np.querySelector<HTMLElement>('.np-tv-btn');
    expect(boutonTv, 'le bouton Grand écran n’est pas rendu — témoin sans objet').not.toBeNull();
    boutonTv!.click();
    await respirer();
    expect(get(activeView), 'le bouton Grand écran n’a pas ouvert la vue TV').toBe('tv');

    // 2. La coquille monte la vue TV ; on en SORT par un clic sur l'écran.
    const tv = poserGrandEcran();
    await respirer();
    const racineTv = tv.querySelector<HTMLElement>('.tv-root');
    expect(racineTv, 'la vue TV n’a pas de racine cliquable — témoin sans objet').not.toBeNull();
    racineTv!.click();
    await respirer();
    expect(get(activeView), 'le clic n’a pas fait sortir du Grand écran').toBe('nowplaying');
    retirerGrandEcran();

    // 3. Le bouton Retour, en haut à gauche de « Lecture en cours ».
    const retour = np.querySelector<HTMLElement>('.np-back-btn');
    expect(retour, 'le bouton Retour n’est pas rendu — témoin sans objet').not.toBeNull();
    retour!.click();
    await respirer();

    expect(
      get(activeView),
      'le Retour a REMONTÉ la vue TV au lieu de revenir en arrière (#1134)',
    ).toBe('library');
  });

  it('la sortie du Grand écran ramène à « Lecture en cours », et ce chemin-là ne change pas', async () => {
    poserLectureEnCours();
    await respirer();
    activeView.set('tv');
    const tv = poserGrandEcran();
    await respirer();
    tv.querySelector<HTMLElement>('.tv-root')!.click();
    await respirer();
    expect(get(activeView)).toBe('nowplaying');
  });

  it('le Retour ordinaire n’est pas touché : depuis la Recherche, il ramène à la RECHERCHE', async () => {
    const np = poserLectureEnCours();
    await respirer();
    activeView.set('search');
    activeView.set('nowplaying');
    np.querySelector<HTMLElement>('.np-back-btn')!.click();
    await respirer();
    expect(get(activeView)).toBe('search');
  });

  it('sans vue précédente, le Retour garde son repli sur la Bibliothèque', async () => {
    const np = poserLectureEnCours();
    await respirer();
    previousView.set(null);
    np.querySelector<HTMLElement>('.np-back-btn')!.click();
    await respirer();
    expect(get(activeView)).toBe('library');
  });

  // ── Le RECENSEMENT, éprouvé au clic ──────────────────────────────────────
  //
  // `tv` n'est pas la seule vue qui ne soit pas une destination de retour.
  // Les deux fiches de STREAMING tiennent leur contenu dans un magasin que leur
  // propre bouton de fermeture VIDE avant de changer de vue
  // (`ShellV2.fermerAlbumService`, `ArtisteServiceV2.retour`) : y revenir par le
  // Retour de « Lecture en cours » affiche le repli « À venir » de `ShellV2`
  // (`{:else if $activeView === 'streamingalbum' && $ficheAlbumService}`).
  describe('les fiches de streaming dont le magasin est VIDE ne sont pas des destinations', () => {
    it('🔴 magasin d’album vidé : le Retour ne renvoie pas sur un écran « À venir »', async () => {
      const np = poserLectureEnCours();
      await respirer();
      // Le geste réel : ouvrir la fiche d'album du service depuis l'écran de
      // lecture, la refermer (le magasin est vidé), puis appuyer sur Retour.
      activeView.set('streamingalbum');
      ficheAlbumService.set(null);
      activeView.set('nowplaying');
      np.querySelector<HTMLElement>('.np-back-btn')!.click();
      await respirer();
      expect(get(activeView), 'le Retour ouvre une fiche d’album de service SANS album').not.toBe(
        'streamingalbum',
      );
    });

    it('🔴 magasin d’artiste vidé : même règle', async () => {
      const np = poserLectureEnCours();
      await respirer();
      activeView.set('streamingartist');
      ficheArtisteService.set(null);
      activeView.set('nowplaying');
      np.querySelector<HTMLElement>('.np-back-btn')!.click();
      await respirer();
      expect(get(activeView), 'le Retour ouvre une fiche d’artiste de service SANS artiste').not.toBe(
        'streamingartist',
      );
    });

    it('magasin GARNI : la fiche reste une destination légitime — pas d’exclusion en bloc', async () => {
      const np = poserLectureEnCours();
      await respirer();
      ficheAlbumService.set({ service: 'qobuz', id: 'q-album-7', titre: 'Malina' } as never);
      activeView.set('streamingalbum');
      activeView.set('nowplaying');
      np.querySelector<HTMLElement>('.np-back-btn')!.click();
      await respirer();
      expect(get(activeView), 'une fiche encore garnie a été exclue à tort').toBe('streamingalbum');
    });
  });
});

// ── La TABLE elle-même ────────────────────────────────────────────────────
//
// Le recensement demandé par le ticket : `tv` n'est pas un cas isolé, et la
// table doit rester complète. Le compilateur tient la complétude
// (`Record<View, …>`) ; ce qui suit tient le CONTENU, que le compilateur ne
// regarde pas.
describe('#1134 — le recensement des vues qui ne sont pas des destinations de retour', () => {
  it('la table couvre exactement l’union `View` — aucune vue oubliée, aucune inventée', () => {
    const declarees = new Set(
      (readFileSync(resolve(process.cwd(), 'src/lib/stores/navigation.ts'), 'utf-8')
        .match(/export type View =([^;]+);/)?.[1] ?? '')
        .split('|')
        .map((s) => s.trim().replace(/^'|'$/g, ''))
        .filter(Boolean),
    );
    expect(declarees.size, 'l’union `View` n’a pas pu être relue').toBeGreaterThan(40);
    expect([...declarees].filter((v) => !(v in APTITUDES)), 'vues non classées').toEqual([]);
    expect(Object.keys(APTITUDES).filter((v) => !declarees.has(v)), 'vues fantômes').toEqual([]);
  });

  it('les quatre « jamais » sont ceux-là, et pas d’autres', () => {
    const jamais = Object.entries(APTITUDES)
      .filter(([, a]) => a === 'jamais')
      .map(([v]) => v)
      .sort();
    // `tv` : un MODE, pas un écran (le défaut d'Alain).
    // `login` / `offline` / `onboarding` : des ÉTATS que l'application constate
    // elle-même — les mêmes trois que `routeAuChargement` refuse de reposer.
    expect(jamais).toEqual(['login', 'offline', 'onboarding', 'tv']);
  });

  it('`tv` n’est une destination pour AUCUN bouton, d’où qu’il soit porté', () => {
    for (const depuis of ['nowplaying', 'library', 'home', 'search'] as const) {
      expect(estDestinationDeRetour('tv', depuis), `depuis ${depuis}`).toBe(false);
    }
  });

  it('un bouton ne se renvoie jamais sur son propre écran', () => {
    expect(estDestinationDeRetour('nowplaying', 'nowplaying')).toBe(false);
    expect(estDestinationDeRetour('tv', 'tv')).toBe(false);
    // …mais « Lecture en cours » reste une destination pour les AUTRES écrans :
    // c'est le repli de la sortie du Grand écran.
    expect(estDestinationDeRetour('nowplaying', 'tv')).toBe(true);
  });

  it('les deux seuls cas conditionnels sont les fiches de streaming', () => {
    const conditionnelles = Object.entries(APTITUDES)
      .filter(([, a]) => a === 'siSaFicheEstGarnie')
      .map(([v]) => v)
      .sort();
    expect(conditionnelles).toEqual(['streamingalbum', 'streamingartist']);
  });
});
