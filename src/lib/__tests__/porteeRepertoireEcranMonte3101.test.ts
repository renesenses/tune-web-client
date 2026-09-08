// @vitest-environment jsdom
//
// renesenses/tune-server-rust#3101 — Sevy Tabroc, 0.9.129 macOS, forum 1637 :
//
//   « Lorsque je sélectionne un répertoire celui-ci apparait dans bibliothèque
//     mais c'est l'entièreté de la bibliothèque en cours qui s'affiche et non
//     pas celle du répertoire sélectionné. »
//
// ## Le correctif existe déjà
//
// `a3c80c75` (PR #747) a remplacé le dépôt `pendingLibraryFolder` — consommé
// UNE fois dans l'initialiseur d'un `$state` — par le magasin
// `libraryFolderScope`, et posé `lib/porteeBibliotheque` : sous quelle portée
// chaque liste partagée a été remplie, et donc si elle peut être montrée telle
// quelle. `porteeRepertoire3101.test.ts` verrouille ce module, et il le
// verrouille bien.
//
// ## Ce que ce fichier ajoute, et pourquoi
//
// 🔴 La moitié « câblage » de cette garde-là est TEXTUELLE : elle cherche
// `viderListesHorsPortee(portee)` et `listeARecharger('albums', portee, …)`
// dans le SOURCE de `LibraryView.svelte`. Elle resterait verte si la conduite
// était débranchée ailleurs — si l'effet cessait de tourner, si la pastille
// cessait d'être peinte, si la requête partait sans son `folder`.
//
// Ces témoins-ci MONTENT `LibraryView`, avec le magasin partagé `albums` DÉJÀ
// REMPLI — c'est le geste 1 du ticket, « la Bibliothèque a déjà été visitée »,
// et ce magasin survit au démontage de l'écran —, et lisent la REQUÊTE
// réellement émise et le DOM réellement rendu.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';
import { mount, unmount, flushSync } from 'svelte';
import LibraryView from '../../components/LibraryView.svelte';
import {
  albums,
  artists,
  tracks,
  libraryFolderScope,
  libraryTab,
  selectedAlbum,
  selectedArtist,
} from '../stores/library';
import { marquerListeChargee } from '../porteeBibliotheque';
import { notifications } from '../stores/notifications';
import type { Album } from '../types';
import lFr from '../locales/fr';

const fr = lFr as unknown as Record<string, string>;

/** Monter `LibraryView` compile un composant de 4 000 lignes. */
vi.setConfig({ testTimeout: 30_000 });

/** Une des quatre racines déclarées par Sevy Tabroc. */
const DOSSIER = '/Volumes/Music/CDThèque Yves';

class ResizeObserverInerte {
  observe() {}
  unobserve() {}
  disconnect() {}
}
// La grille est virtualisée sur une hauteur mesurée ; jsdom n'a pas de mise en
// page et rendrait zéro vignette, ce qui rendrait ces témoins verts pour rien.
for (const [prop, valeur] of [['clientHeight', 2000], ['clientWidth', 1400]] as const) {
  Object.defineProperty(HTMLElement.prototype, prop, { configurable: true, get: () => valeur });
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

/**
 * « Toute la bibliothèque », face aux deux albums du dossier. Sevy Tabroc en a
 * 4 701 ; quatre cents suffisent à trancher et n'affament pas les autres
 * travailleurs de la suite — un fichier de témoins trop lourd fait expirer les
 * voisins et produit des rouges qui ne disent rien du code.
 */
const bibliothequeEntiere = (): Album[] =>
  Array.from({ length: 400 }, (_, i) => ({
    id: i + 1,
    title: `Album hors portée ${i + 1}`,
    artist_name: 'Divers',
  })) as Album[];

/** Les pistes que `/library/tracks?folder=…` rend pour le dossier choisi. */
const PISTES_DU_DOSSIER = [
  { id: 1, title: 'A1', album_id: 9001, album_title: 'Frost', artist_id: 50, artist_name: 'Frost', album_artist: 'Frost' },
  { id: 2, title: 'A2', album_id: 9001, album_title: 'Frost', artist_id: 50, artist_name: 'Frost', album_artist: 'Frost' },
  { id: 3, title: 'B1', album_id: 9002, album_title: 'CDThèque vol. 2', artist_id: 51, artist_name: 'Yves', album_artist: 'Yves' },
];

/** Calculée une fois : la reconstruire à chaque requête coûterait le tas. */
const TOUTE_LA_BIBLIOTHEQUE = bibliothequeEntiere();

let hote: HTMLDivElement | null = null;
let monte: Record<string, any> | null = null;
let urls: string[] = [];

function serveur(opts: { porteeEchoue?: boolean } = {}) {
  urls = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: any) => {
      const u = String(url);
      urls.push(u);
      if (/\/library\/tracks\?/.test(u)) {
        if (opts.porteeEchoue) throw new Error('network');
        return reponse({ items: PISTES_DU_DOSSIER, total: PISTES_DU_DOSSIER.length });
      }
      // Toute la bibliothèque, celle qui ne doit PAS s'afficher sous la
      // pastille. ⚠️ `getAllAlbumsSeeded` PAGINE : un bouchon qui rendrait
      // toujours les 4 701 lignes ne verrait jamais `batch.length < pageSize`
      // et boucherait indéfiniment — le tas y passe.
      if (/\/library\/albums(\?|$)/.test(u)) {
        const p = new URL(u, 'http://x').searchParams;
        const limite = Number(p.get('limit') ?? 100);
        const rang = Number(p.get('offset') ?? 0);
        return reponse(TOUTE_LA_BIBLIOTHEQUE.slice(rang, rang + limite));
      }
      return reponse([]);
    }),
  );
}

async function reposer(tours = 8) {
  for (let i = 0; i < tours; i++) {
    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));
  }
  flushSync();
}

async function poser(): Promise<HTMLDivElement> {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(LibraryView, { target: hote, props: {} as any });
  flushSync();
  await reposer();
  return hote;
}

/** Les titres d'albums RENDUS par la grille. */
function titresRendus(el: HTMLElement): string[] {
  return [...el.querySelectorAll('.album-card-title')].map((n) => (n.textContent ?? '').trim());
}

/** Ce que la pastille de répertoire annonce, ou `null` si elle n'est pas là. */
function pastille(el: HTMLElement): string | null {
  return el.querySelector('.folder-scope-name')?.textContent?.trim() ?? null;
}

const requetesDeDossier = () => urls.filter((u) => /\/library\/tracks\?/.test(u));
const messages = () => get(notifications).map((n) => n.message);

/**
 * Le geste 1 du ticket : la Bibliothèque a DÉJÀ été visitée, donc le magasin
 * partagé `albums` est plein — et il survit au démontage de l'écran.
 */
function bibliothequeDejaVisitee() {
  albums.set([...TOUTE_LA_BIBLIOTHEQUE]);
  marquerListeChargee('albums', null);
}

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', ResizeObserverInerte);
  albums.set([]);
  artists.set([]);
  tracks.set([]);
  marquerListeChargee('albums', null);
  marquerListeChargee('artists', null);
  marquerListeChargee('tracks', null);
  libraryFolderScope.set(null);
  libraryTab.set('albums');
  selectedAlbum.set(null);
  selectedArtist.set(null);
  for (const n of get(notifications)) notifications.dismiss(n.id);
});

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  if (hote) hote.remove();
  hote = null;
  albums.set([]);
  libraryFolderScope.set(null);
  vi.unstubAllGlobals();
});

describe('geste 1 — Bibliothèque déjà visitée, puis « Voir en bibliothèque »', () => {
  it('l’écran DEMANDE le dossier au serveur', async () => {
    bibliothequeDejaVisitee();
    libraryFolderScope.set(DOSSIER);
    serveur();
    await poser();
    const demandes = requetesDeDossier();
    expect(demandes, 'aucune requête de portée émise').toHaveLength(1);
    // `URLSearchParams` encode l'espace en `+`, pas en `%20`.
    expect(demandes[0]).toContain(`folder=${new URLSearchParams({ f: DOSSIER }).toString().slice(2)}`);
    expect(demandes[0]).toContain('CDTh%C3%A8que');
  });

  it('🔴 il n’affiche PAS la bibliothèque entière sous la pastille', async () => {
    bibliothequeDejaVisitee();
    libraryFolderScope.set(DOSSIER);
    serveur();
    const el = await poser();

    // La pastille annonce bien le dossier — c'est ce que le testeur voyait.
    expect(pastille(el)).toBe('CDThèque Yves');

    // Et la grille ne porte QUE ce qu'il contient. C'est le défaut exact :
    // « c'est l'entièreté de la bibliothèque en cours qui s'affiche ».
    const titres = titresRendus(el);
    expect(titres).toEqual(['CDThèque vol. 2', 'Frost']);
    expect(titres.some((t) => t.startsWith('Album hors portée'))).toBe(false);
    expect(get(albums)).toHaveLength(2);
  });
});

describe('geste 2 — le chargement scopé échoue', () => {
  it('la bibliothèque entière ne reste PAS à l’écran, et l’échec est dit', async () => {
    bibliothequeDejaVisitee();
    libraryFolderScope.set(DOSSIER);
    serveur({ porteeEchoue: true });
    const el = await poser();

    expect(pastille(el)).toBe('CDThèque Yves');
    expect(titresRendus(el), 'la bibliothèque entière est restée sous la pastille').toHaveLength(0);
    expect(messages()).toContain(
      fr['library.scopeLoadError'].replace('{d}', 'CDThèque Yves'),
    );
  });
});

describe('la croix de la pastille rend toute la bibliothèque', () => {
  it('elle retire la portée, et la grille se remplit à nouveau', async () => {
    bibliothequeDejaVisitee();
    libraryFolderScope.set(DOSSIER);
    serveur();
    const el = await poser();
    expect(titresRendus(el)).toHaveLength(2);

    (el.querySelector('.folder-scope-chip') as HTMLButtonElement).click();
    flushSync();
    await reposer();

    expect(pastille(el), 'la pastille devait disparaître').toBeNull();
    expect(get(libraryFolderScope)).toBeNull();
    expect(titresRendus(el).length, 'la bibliothèque entière devait revenir').toBeGreaterThan(2);
    expect(titresRendus(el)[0]).toContain('Album hors portée');
  });
});
