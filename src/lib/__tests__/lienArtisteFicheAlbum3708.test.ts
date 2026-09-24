// @vitest-environment jsdom
//
// renesenses/tune-server-rust#3708 — FabienM, fil forum 1726 (08/09/2026),
// v0.9.143 :
//
//   « Dans menu bibliothèque, l'hyperlien sur l'artiste est absent, ex ici:
//     Artiste Depeche Mode n'a pas de lien actif pour rediriger vers la page
//     de l'artiste. »
//
// `AlbumDetailV2.svelte:360` était `<div class="artist">{album.artist_name}</div>` —
// du texte. Et la plomberie existait déjà, branchée ailleurs :
// `PisteActions:229` et `NowPlaying:515` POSENT `pendingLibraryArtist` puis
// `activeView`, `LibraryV2:867` le consomme. « Écrit mais pas branché », du
// côté de l'ÉMETTEUR.
//
// 🟢 Depuis #1489 et #1501, la cible n'est plus `pendingLibraryArtist` mais la
// PAGE COMMUNE : le clic passe par `ouvrirArtisteDepuis` (#1494), qui pose
// `ficheArtisteService` (`service: null`, l'identifiant en texte) et la vue
// `streamingartist`. Le contrat gardé ici est le même — le nom est un lien, il
// MÈNE quelque part, et sans identifiant il reste du texte — la destination a
// changé.
//
// 🔴 CES TÉMOINS CLIQUENT, ILS NE LISENT PAS. Un test qui chercherait
// « ouvrirArtisteDepuis » dans le source de la fiche resterait vert si le
// nom redevenait un `<div>` — et vert aussi si le magasin était posé sans que
// personne le consomme, ce qui est exactement le défaut d'à côté.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import { get } from 'svelte/store';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import AlbumDetailV2 from '../../components/v2/AlbumDetailV2.svelte';
import { activeView, pendingLibraryArtist } from '../stores/navigation';
import { ficheArtisteService } from '../stores/streaming';
import { albums as albumsStore } from '../stores/library';
import type { Album } from '../types';

/** Monter ces deux écrans compile des composants de plusieurs milliers de lignes. */
vi.setConfig({ testTimeout: 30_000 });

/** L'album de sa capture : `101 (CD1)`, Depeche Mode, 1989. */
const ALBUM: Album = {
  id: 55,
  title: '101 (CD1)',
  artist_id: 994,
  artist_name: 'Depeche Mode',
  year: 1989,
} as Album;

/** Le même album SANS identifiant d'artiste — un album de service, ou une base
 *  ancienne. Le point 3 du ticket : « on ne sait pas si `albums.artist_id` est
 *  non nul pour SON album ». */
const ALBUM_SANS_ID: Album = { ...ALBUM, artist_id: null } as Album;

const ARTISTE = { id: 994, name: 'Depeche Mode' };
const PISTES = [{ id: 1, title: 'Pimpf', source: 'local', artist_id: 994 }];

class ResizeObserverInerte {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal('ResizeObserver', ResizeObserverInerte);

// La grille de la Bibliothèque est virtualisée sur une hauteur mesurée ; jsdom
// n'a pas de mise en page et rendrait zéro vignette.
for (const [prop, valeur] of [['clientHeight', 2000], ['clientWidth', 1400]] as const) {
  Object.defineProperty(HTMLElement.prototype, prop, { configurable: true, get: () => valeur });
}

function corpsPour(url: string): unknown {
  if (/\/library\/albums\/55\/tracks/.test(url)) return PISTES;
  if (/\/library\/albums\/55(\?|$)/.test(url)) return ALBUM;
  if (/\/library\/artists\/994\/albums/.test(url)) return [ALBUM];
  if (/\/library\/artists/.test(url)) return [ARTISTE];
  if (/\/library\/albums/.test(url)) return [ALBUM];
  if (/\/library\/tracks/.test(url)) return [];
  if (/\/zones/.test(url)) return [];
  return {};
}

const respirer = () => new Promise((r) => setTimeout(r, 0));

let hote: HTMLDivElement | null = null;
let monte: Record<string, unknown> | null = null;

beforeEach(() => {
  activeView.set('home');
  pendingLibraryArtist.set(null);
  ficheArtisteService.set(null);
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
  pendingLibraryArtist.set(null);
  ficheArtisteService.set(null);
  albumsStore.set([]);
  vi.unstubAllGlobals();
});

async function poserFiche(album: Album, onClose: () => void = () => {}): Promise<HTMLDivElement> {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(AlbumDetailV2, { target: hote, props: { album, onClose } });
  for (let i = 0; i < 6; i++) await respirer();
  flushSync();
  return hote;
}

const nomArtiste = (el: HTMLElement) => el.querySelector('.head .meta .artist') as HTMLElement | null;

describe('#3708 — le nom de l’artiste MÈNE à sa fiche', () => {
  it('c’est un élément INTERACTIF, atteignable au clavier', async () => {
    const el = await poserFiche(ALBUM);
    const nom = nomArtiste(el);
    expect(nom, 'le nom de l’artiste a disparu de la fiche').not.toBeNull();
    expect(nom!.textContent).toBe('Depeche Mode');

    // 🔴 Le défaut d'origine ET le défaut qu'on ne veut pas mettre à la place :
    // un `<div onclick>` n'est atteint par aucune tabulation.
    expect(
      nom!.tagName,
      `le nom d’artiste est un <${nom!.tagName.toLowerCase()}> : ` +
        'un élément non interactif que la tabulation ne visite pas',
    ).toBe('BUTTON');
    expect(nom!.tabIndex, 'le nom d’artiste est hors du parcours de tabulation').toBeGreaterThanOrEqual(0);
  });

  it('le clic POSE la cible et change de vue — la page commune, comme PisteActions (#1494)', async () => {
    const el = await poserFiche(ALBUM);
    (nomArtiste(el) as HTMLElement).click();
    flushSync();

    // #1494 — UNE seule vue artiste : le clic ouvre la page commune, pour un
    // artiste local comme de service. La cible est donc `ficheArtisteService`
    // avec `service: null` (l'objet EST local), l'identifiant en texte — la
    // forme de #1485, celle que `ShellV2` monte sous `streamingartist`.
    const cible = get(ficheArtisteService);
    expect(cible, 'la cible n’a pas été posée : la page commune n’a rien à ouvrir').not.toBeNull();
    expect(String(cible!.id)).toBe('994');
    expect(cible!.service, 'un artiste LOCAL ne porte aucun service').toBeNull();
    expect(get(activeView), 'on ne va pas à la page commune').toBe('streamingartist');
    // Et JAMAIS la cible de l'ancienne fiche (#1501) : deux écrans se
    // disputeraient le clic.
    expect(get(pendingLibraryArtist), 'la bifurcation est recopiée vers la Bibliothèque').toBeNull();
  });

  it('il REFERME la fiche — sinon l’onglet Artistes s’ouvre derrière un calque', async () => {
    let ferme = 0;
    const el = await poserFiche(ALBUM, () => (ferme += 1));
    (nomArtiste(el) as HTMLElement).click();
    flushSync();
    expect(ferme, 'la fiche d’album reste au premier plan : le clic paraît sans effet').toBe(1);
  });

  it('sans identifiant d’artiste, le nom reste du TEXTE — pas un lien mort', async () => {
    const el = await poserFiche(ALBUM_SANS_ID);
    const nom = nomArtiste(el);
    expect(nom, 'le nom de l’artiste a disparu').not.toBeNull();
    expect(nom!.textContent).toBe('Depeche Mode');
    expect(nom!.tagName, 'un bouton sans cible : le clic ne mènerait nulle part').toBe('DIV');

    (nom as HTMLElement).click();
    flushSync();
    expect(get(pendingLibraryArtist), 'une cible a été posée sans identifiant').toBeNull();
    expect(get(activeView), 'on a changé de vue pour rien').toBe('home');
  });
});

// ── L'autre moitié : le CONSOMMATEUR ───────────────────────────────────────
//
// 🔴 Poser le magasin ne suffit pas. `LibraryV2` consommait
// `pendingLibraryArtist` dans un `$effect` qui lisait `get(store)` — et `get()`
// se désabonne aussitôt, l'effet ne tournait qu'AU MONTAGE (#3708). Ce
// consommateur N'EXISTE PLUS : depuis #1501 la fiche d'artiste de la
// Bibliothèque est retirée, et c'est `ShellV2` qui monte la page commune sous
// `streamingartist` — éprouvé EN CLIQUANT par `vueArtisteUnique1494.test.ts`
// et `artistesGrillePageCommune1501.test.ts`.
//
// Ce qui reste à garder ici, c'est qu'il n'y ait pas DEUX consommateurs : une
// Bibliothèque qui relirait le dépôt ouvrirait une seconde page pour le même
// clic. Un témoin de comportement ne peut pas prouver une absence de lecteur ;
// celui-ci lit donc le source, et c'est le seul du fichier à le faire.
describe('#3708 → #1501 — la Bibliothèque n’a plus de consommateur à offrir', () => {
  const lire = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf-8');
  const sansCommentaires = (s: string) =>
    s.replace(/<!--[\s\S]*?-->/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

  it('`LibraryV2` ne lit plus `pendingLibraryArtist`', () => {
    const bib = sansCommentaires(lire('src/components/v2/LibraryV2.svelte'));
    expect(bib, 'la Bibliothèque relit le dépôt de l’ancienne fiche').not.toContain('pendingLibraryArtist');
  });

  it('la coquille monte bien la page d’arrivée sous la vue que le clic pose', () => {
    const coquille = sansCommentaires(lire('src/components/v2/ShellV2.svelte'));
    expect(coquille).toMatch(/\$activeView === 'streamingartist'/);
  });
});
