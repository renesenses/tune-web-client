// @vitest-environment jsdom
//
// Les liens de l'écran de lecture vers la Bibliothèque — les DEUX qui
// restaient morts sur le nouveau client.
//
// Fabien, v0.9.140, 07/09/2026 : « les hyperliens de l'album et de l'artiste
// renvoient vers la page d'accueil ». Le correctif du 07/09 a posé
// `pendingLibraryAlbum` / `pendingLibraryArtist` — mais sur DEUX des quatre
// sorties de l'écran seulement.
//
// Relevé le 09/09/2026 sur `components/NowPlaying.svelte` : quatre
// `activeView.set('library')`, deux qui alimentaient le contrat du nouveau
// client, deux qui ne l'alimentaient pas.
//
//   1. `ouvrirFicheArtiste`         → `pendingLibraryArtist`   ✔ déjà branché
//   2. `navigateToAlbum` par ID     → `pendingLibraryAlbum`    ✔ déjà branché
//   3. `navigateToAlbum` par TITRE  → rien                     ✘ grille nue
//   4. `navigateToYear`             → `yearFilter`             ✘ rien filtré
//
// Le 3 est le chemin des pistes SANS `album_id` — radio et streaming, les
// seules qui en manquent (mesure sur le .18 : les trois zones en lecture
// locale portent toutes `album_id`). L'album était bien retrouvé par son
// titre, `selectedAlbum` posé pour l'ancien client, et le nouveau atterrissait
// sur la grille, fiche fermée.
//
// Le 4 est pire, parce qu'il touche TOUTES les pistes : `yearFilter`
// (`stores/library`) n'est lu que par `components/LibraryView.svelte`, l'écran
// de l'ANCIEN client. Aucun composant `v2/` ne le lit. Cliquer « (2003) » à
// côté du titre d'album changeait d'écran sans rien filtrer.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import { readFileSync } from 'fs';
import { get } from 'svelte/store';
import LibraryV2 from '../../components/v2/LibraryV2.svelte';
import { activeView, pendingLibraryAlbum, pendingLibraryArtist, pendingLibraryYear } from '../stores/navigation';
import { albums as albumsStore } from '../stores/library';
import { preferences } from '../stores/preferences';
import type { Album } from '../types';

/** Monter cet écran compile un composant de plusieurs milliers de lignes. */
vi.setConfig({ testTimeout: 60_000 });

const A_1989: Album = { id: 55, title: '101', artist_id: 994, artist_name: 'Depeche Mode', year: 1989 } as Album;
const A_2003: Album = { id: 56, title: 'Dark Side', artist_id: 994, artist_name: 'Pink Floyd', year: 2003 } as Album;
const A_2011: Album = { id: 57, title: 'Ceremonials', artist_id: 995, artist_name: 'Florence', year: 2011 } as Album;
const TOUS = [A_1989, A_2003, A_2011];

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

function corpsPour(url: string): unknown {
  if (/\/library\/albums\/5\d\/tracks/.test(url)) return [];
  if (/\/library\/artists/.test(url)) return [];
  if (/\/library\/albums/.test(url)) return TOUS;
  if (/\/library\/tracks/.test(url)) return [];
  if (/\/zones/.test(url)) return [];
  if (/\/playlists/.test(url)) return [];
  return {};
}

const respirer = () => new Promise((r) => setTimeout(r, 0));

let hote: HTMLDivElement | null = null;
let monte: Record<string, unknown> | null = null;
let niveauInitial: unknown = null;

beforeEach(() => {
  niveauInitial = get(preferences).settingsLevel;
  activeView.set('home');
  pendingLibraryYear.set(null);
  pendingLibraryAlbum.set(null);
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
  pendingLibraryYear.set(null);
  pendingLibraryAlbum.set(null);
  albumsStore.set([]);
  preferences.update((p) => ({ ...p, settingsLevel: niveauInitial as never }));
  vi.unstubAllGlobals();
});

async function poserBibliotheque(niveau: 'essential' | 'expert'): Promise<HTMLDivElement> {
  preferences.update((p) => ({ ...p, settingsLevel: niveau as never }));
  activeView.set('library');
  albumsStore.set(TOUS);
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(LibraryV2, { target: hote, props: {} as any });
  for (let i = 0; i < 8; i++) await respirer();
  flushSync();
  return hote;
}

/** La pastille qui ANNONCE le filtre d'année et permet de le retirer. */
const pastille = (el: HTMLElement) => el.querySelector('.navmode .yearpill') as HTMLElement | null;

// ── LE CONSOMMATEUR : la Bibliothèque honore l'année demandée ─────────────
describe('l’année posée depuis l’écran de lecture FILTRE la Bibliothèque', () => {
  it('🔴 la grille se restreint à l’année, et la pastille l’annonce', async () => {
    const el = await poserBibliotheque('expert');

    // Contre-épreuve : sans année posée, rien n'est filtré. Sans cette
    // vérification, un écran qui ne montrerait JAMAIS les trois albums
    // rendrait le témoin vert pour la mauvaise raison.
    expect(pastille(el), 'un filtre d’année est déjà actif au montage').toBeNull();
    expect(el.textContent).toContain('Ceremonials');

    pendingLibraryYear.set(2003);
    for (let i = 0; i < 10; i++) await respirer();
    flushSync();

    // 🔴 L'ASSERTION QUI COMPTE : l'écran a bougé. Vérifier que le magasin est
    // retombé à `null` ne prouverait rien — c'est l'effet lui-même qui le
    // vide, et il pourrait le vider sans rien filtrer.
    const p = pastille(el);
    expect(
      p,
      'aucune pastille d’année : le magasin a été posé et l’écran n’a pas ' +
        'bougé — cliquer l’année à côté du titre d’album ne fait rien',
    ).not.toBeNull();
    expect(p!.textContent).toContain('2003');

    expect(el.textContent, 'l’album de 2003 a disparu de la grille').toContain('Dark Side');
    expect(el.textContent, 'la grille n’est pas filtrée : 2011 est encore là').not.toContain('Ceremonials');
  });

  it('le dépôt est vidé, pour qu’un second clic sur la même année rejoue', async () => {
    const el = await poserBibliotheque('expert');
    pendingLibraryYear.set(2003);
    for (let i = 0; i < 10; i++) await respirer();
    flushSync();
    expect(pastille(el)).not.toBeNull();
    expect(
      get(pendingLibraryYear),
      'la cible dort encore dans le magasin : personne ne l’a consommée',
    ).toBeNull();
  });

  /**
   * 🔴 En ESSENTIEL, la pastille était le seul rescapé d'un bloc entier.
   *
   * Le bloc `.navmode` est gardé par `showTimeline`, qui demande le niveau
   * Intermédiaire. Poser une année de l'extérieur en Essentiel aurait donc
   * réduit la grille SANS cause visible et SANS moyen de revenir : un filtre
   * qu'on ne peut ni lire ni annuler est pire que le clic mort qu'on corrige.
   */
  it('🔴 en Essentiel, le filtre reste VISIBLE et ANNULABLE', async () => {
    const el = await poserBibliotheque('essential');

    // Contre-épreuve du niveau : la frise, elle, reste bien réservée.
    expect(
      el.querySelector('.navmode button'),
      'les boutons A–Z / Années paraissent en Essentiel : la frise n’est ' +
        'plus une option avancée, le témoin ne mesure plus le bon niveau',
    ).toBeNull();

    pendingLibraryYear.set(2003);
    for (let i = 0; i < 10; i++) await respirer();
    flushSync();

    const p = pastille(el);
    expect(
      p,
      'la grille est filtrée sans que rien ne le dise : en Essentiel ' +
        'l’utilisateur voit sa bibliothèque fondre sans cause ni sortie',
    ).not.toBeNull();

    p!.click();
    flushSync();
    expect(el.textContent, 'la pastille n’annule pas le filtre').toContain('Ceremonials');
  });
});

// ── L'ÉMETTEUR : la règle, pas la ligne ──────────────────────────────────
//
// 🔴 Ce témoin lit du SOURCE. Il ne remplace pas ceux du dessus : il existe
// parce que le défaut n'était pas une ligne fausse mais une ligne MANQUANTE,
// oubliée sur deux sorties d'une fonction quand on l'avait posée sur les deux
// autres. Compter les lignes attendues une par une ne garderait que les
// quatre d'aujourd'hui ; c'est la RÈGLE qu'on écrit — toute route de cet
// écran vers la Bibliothèque alimente le contrat du nouveau client — pour
// qu'une CINQUIÈME sortie ne rejoue pas le même oubli.
describe('toute sortie de l’écran de lecture vers la Bibliothèque nourrit le contrat v2', () => {
  const CONTRATS_V2 = ['pendingLibraryAlbum', 'pendingLibraryArtist', 'pendingLibraryYear', 'pendingLibraryFolder'];

  const releve = (() => {
    const src = readFileSync('src/components/NowPlaying.svelte', 'utf8');
    // Retirer les commentaires : ils CITENT ces magasins pour les expliquer.
    const nu = src
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:])\/\/.*$/gm, '$1');

    const sorties: { ligne: number; fonction: string; branche: boolean }[] = [];
    for (const m of nu.matchAll(/activeView\.set\('library'\)/g)) {
      const avant = nu.slice(0, m.index!);
      const decl = [...avant.matchAll(/^\s*(?:async\s+)?function\s+(\w+)/gm)].pop();

      // 🔴 LA BRANCHE, PAS LA FONCTION.
      //
      // Première version de cette garde : le corps depuis la déclaration de la
      // fonction. Contre-épreuve du 09/09/2026 — en retirant
      // `pendingLibraryAlbum.set(match.id)` de la branche PAR TITRE, elle
      // restait VERTE : la branche par identifiant, plus haut dans la même
      // fonction, portait déjà la ligne attendue. Elle serait donc restée
      // verte contre le défaut qu'elle prétend garder.
      //
      // On remonte au `{` ouvrant le plus PROCHE encore ouvert : c'est la
      // branche qui mène à cette sortie-là, et chaque branche doit poser sa
      // propre cible.
      let profondeur = 0;
      let debut = 0;
      for (let j = avant.length - 1; j >= 0; j--) {
        const c = avant[j];
        if (c === '}') profondeur++;
        else if (c === '{') {
          if (profondeur === 0) { debut = j; break; }
          profondeur--;
        }
      }
      const corps = avant.slice(debut);
      sorties.push({
        ligne: avant.split('\n').length,
        fonction: decl?.[1] ?? '(hors fonction)',
        branche: CONTRATS_V2.some((c) => new RegExp(`${c}\\.set\\(`).test(corps)),
      });
    }
    return sorties;
  })();

  it('la garde voit bien les sorties — sinon elle est verte pour rien', () => {
    // Elles étaient QUATRE au 09/09/2026. La borne basse suffit : ce qui
    // compte est qu'aucune ne soit muette, pas leur nombre exact.
    expect(
      releve.length,
      'aucun `activeView.set(\'library\')` trouvé : fichier déplacé, ou ' +
        'la navigation a changé de forme et cette garde ne mesure plus rien',
    ).toBeGreaterThanOrEqual(4);
  });

  it('🔴 aucune n’oublie de poser sa cible', () => {
    const muettes = releve.filter((s) => !s.branche).map((s) => `${s.fonction} (ligne ${s.ligne})`);
    expect(
      muettes,
      'une route mène à la Bibliothèque du nouveau client sans rien lui ' +
        'donner à ouvrir : l’écran changera, et rien ne s’ouvrira. C’est le ' +
        'défaut signalé par Fabien sur la v0.9.140, corrigé sur deux sorties ' +
        'et laissé sur les autres.',
    ).toEqual([]);
  });
});
