// @vitest-environment jsdom
//
// renesenses/tune-server-rust#3178 — jfpaquet, Tune 0.9.130 Windows :
// « en ouvrant la fiche d'un album, la liste de pistes affichée est celle d'un
// AUTRE album », deux fois, pochette et titre corrects, et la LECTURE juste.
//
// Ce que les trois captures du ticket support 71 établissent :
//
//   err 03 : entête « Swingin' Young Scott » · 12 tracks — liste de 12 pistes
//            de Warren Vaché, cohérente avec son entête ;
//   err 02 : entête « Secret Love » · 12 tracks — EXACTEMENT la même liste
//            Warren Vaché ;
//   err 01 : entête « Secret Love » · 8 tracks — pistes de Harold Mabern.
//
// La liste est donc fausse mais PLEINE, cohérente, dans l'ordre ; et le
// compteur de l'entête la suit (12 puis 8 pour le même disque, dont le journal
// serveur donne le vrai compte : `set_queue_ok n=9`).
//
// Le serveur est écarté par la mesure : `album_tracks` lie l'identifiant en
// paramètre et rend `list_by_album_filtered(id, …).unwrap_or_default()` — une
// panne y rend une liste VIDE, jamais une liste fausse et pleine.
//
// La cause côté client, deux mécanismes sur le même magasin partagé
// `albumTracks`, qu'aucun écran ne vidait avant de charger :
//
//   1. `LibraryView.selectAlbumDetail`, `catch` : il posait le NOUVEL album
//      (`selectedAlbum.set(album)`) et ne touchait PAS aux pistes de l'ancien.
//      L'entête changeait, la liste restait. C'est err 02 et err 01.
//   2. Aucune clé de requête : deux ouvertures rapprochées laissaient gagner
//      la réponse la plus LENTE, c'est-à-dire l'album précédent.
//
// 🔴 CES TÉMOINS MONTENT `LibraryView` ET CLIQUENT dans la grille. Ils lisent
// le DOM rendu — les titres de pistes, le compteur de l'entête — et la requête
// réellement émise. Aucun ne cherche une chaîne dans un fichier source : une
// garde textuelle resterait verte si la conduite était débranchée ailleurs.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';
import { mount, unmount, flushSync } from 'svelte';
import { notifications } from '../stores/notifications';
import LibraryView from '../../components/LibraryView.svelte';
import {
  albums,
  albumTracks,
  albumTracksOwner,
  commencerFicheAlbum,
  poserPistesAlbum,
  selectedAlbum,
  selectedArtist,
  libraryLoading,
  libraryTab,
} from '../stores/library';
import type { Album, Track } from '../types';

// La grille d'albums est VIRTUALISÉE : elle ne rend que les lignes qui tiennent
// dans la fenêtre mesurée par `observeHeight` / `observeWidth`. jsdom n'a ni
// `ResizeObserver` ni mise en page — `clientHeight` y vaut 0, et l'action pose
// cette valeur telle quelle. La grille serait donc VIDE et les témoins
// n'auraient rien à cliquer. On donne à jsdom une fenêtre de taille plausible,
// et un observateur inerte.
class ResizeObserverInerte {
  observe() {}
  unobserve() {}
  disconnect() {}
}
for (const [prop, valeur] of [['clientHeight', 2000], ['clientWidth', 1400]] as const) {
  Object.defineProperty(HTMLElement.prototype, prop, { configurable: true, get: () => valeur });
}

/** Réponse `fetch` minimale, dans la forme que `fetchJSON` consomme. */
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

/** Les identifiants, en `number` nu : `Album.id` est `number | null`, et une
 *  clef d'objet doit être un nombre. */
const ID_VACHE = 101;
const ID_HERRING = 202;

const VACHE: Album = {
  id: ID_VACHE,
  title: 'Swingin’ Young Scott',
  artist_name: 'Warren Vaché',
  year: 2014,
} as Album;

const HERRING: Album = {
  id: ID_HERRING,
  title: 'Secret Love',
  artist_name: 'Vincent Herring',
  year: 1993,
} as Album;

/** Les douze pistes de Warren Vaché — celles qui se sont installées ailleurs. */
const PISTES_VACHE: Track[] = [
  'Thru the Night (Tk 2)',
  'Imagination (Remake)',
  'Warren’s Rush (Tk 1)',
  'Blues for Mastertone (Tk 3)',
  'Scott’s Idea (Tk 1)',
  'Autumn in New York',
  'Jubilation',
  'Struttin’ with Some Barbecue',
  'You’re My Everything',
  'Everything Happens to Me',
  'Rosetta',
  'Sweet Lorraine',
].map((title, i) => ({
  id: 1000 + i,
  title,
  track_number: i + 1,
  album_id: ID_VACHE,
  album_title: VACHE.title,
  artist_name: VACHE.artist_name,
  duration_ms: 240_000,
})) as Track[];

/** Les neuf pistes réelles de « Secret Love » — le compte du journal serveur. */
const PISTES_HERRING: Track[] = [
  'Have You Met Miss Jones',
  'Secret Love',
  'Scootin’',
  'Sails',
  'Dolphin Dance',
  'Mr. P.C.',
  'Blue Bossa',
  'Naima',
  'Freedom Jazz Dance',
].map((title, i) => ({
  id: 2000 + i,
  title,
  track_number: i + 1,
  album_id: ID_HERRING,
  album_title: HERRING.title,
  artist_name: HERRING.artist_name,
  duration_ms: 300_000,
})) as Track[];

let hote: HTMLDivElement | null = null;
let monte: Record<string, any> | null = null;

/**
 * Le `fetch` du serveur, avec deux réglages par album :
 *   - `pistes[id]` : ce que rend `GET /library/albums/{id}/tracks` ;
 *   - `echecs`     : les albums dont cette requête ÉCHOUE ;
 *   - `retards[id]`: la promesse qui doit se dénouer avant la réponse.
 */
function serveur(opts: {
  pistes: Record<number, Track[]>;
  echecs?: number[];
  retards?: Record<number, Promise<void>>;
}) {
  const urls: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: any) => {
      const u = String(url);
      urls.push(u);
      const m = u.match(/\/library\/albums\/(\d+)\/tracks/);
      if (m) {
        const id = Number(m[1]);
        if (opts.retards?.[id]) await opts.retards[id];
        if (opts.echecs?.includes(id)) throw new Error('network');
        return reponse(opts.pistes[id] ?? []);
      }
      const f = u.match(/\/library\/albums\/(\d+)(?:\?|$)/);
      if (f) {
        const id = Number(f[1]);
        return reponse(id === ID_VACHE ? VACHE : HERRING);
      }
      // La grille se recharge au montage : sans cette réponse, le magasin
      // partagé `albums` serait remis à vide et il n'y aurait rien à cliquer.
      if (/\/library\/albums(\?|$)/.test(u)) return reponse([VACHE, HERRING]);
      return reponse({});
    }),
  );
  return urls;
}

async function poser(): Promise<HTMLDivElement> {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(LibraryView, { target: hote, props: {} as any });
  flushSync();
  // La grille est masquée tant que `libraryLoading` est levé — le chargement
  // initial de la Bibliothèque doit être retombé avant qu'on puisse cliquer.
  await reposer();
  return hote;
}

/** Revient à la grille, comme le fait le bouton « Précédent » de la fiche. */
function retourGrille() {
  selectedAlbum.set(null);
  flushSync();
}

/** Laisse les promesses en vol se dénouer, puis le rendu se poser. */
async function reposer(tours = 6) {
  for (let i = 0; i < tours; i++) {
    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));
  }
  flushSync();
}

/** Clique la vignette de la grille qui porte ce titre. */
function cliquerVignette(el: HTMLElement, titre: string) {
  const carte = [...el.querySelectorAll('.album-card')].find((c) =>
    (c.querySelector('.album-card-title')?.textContent ?? '').includes(titre),
  );
  expect(carte, `aucune vignette « ${titre} » dans la grille`).toBeTruthy();
  (carte as HTMLElement).click();
  flushSync();
}

/** Les titres de pistes RENDUS par la fiche ouverte. */
function pistesAffichees(el: HTMLElement): string[] {
  return [...el.querySelectorAll('.album-detail .track-title')].map((n) =>
    (n.textContent ?? '').trim(),
  );
}

/** Ce que l'entête de la fiche annonce, texte brut. */
function entete(el: HTMLElement): string {
  return (el.querySelector('.album-detail-info')?.textContent ?? '').replace(/\s+/g, ' ');
}

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', ResizeObserverInerte);
  albums.set([VACHE, HERRING]);
  albumTracks.set([]);
  albumTracksOwner.set(null);
  selectedAlbum.set(null);
  selectedArtist.set(null);
  libraryTab.set('albums');
});

afterEach(() => {
  libraryLoading.set(false);
  if (monte) unmount(monte);
  monte = null;
  if (hote) hote.remove();
  hote = null;
  albums.set([]);
  albumTracks.set([]);
  albumTracksOwner.set(null);
  selectedAlbum.set(null);
  vi.unstubAllGlobals();
});

describe('err 02 / err 01 — le chargement échoue, la liste précédente reste', () => {
  it('la fiche de l’album suivant ne porte AUCUNE piste de l’album d’avant', async () => {
    serveur({
      pistes: { [ID_VACHE]: PISTES_VACHE, [ID_HERRING]: PISTES_HERRING },
      echecs: [ID_HERRING],
    });
    const el = await poser();

    // 1. Warren Vaché s'ouvre normalement : douze pistes, entête cohérente.
    cliquerVignette(el, 'Swingin');
    await reposer();
    expect(pistesAffichees(el)).toHaveLength(12);
    expect(pistesAffichees(el)[0]).toContain('Thru the Night');
    expect(entete(el)).toContain('12');

    // 2. Retour à la grille — ce que fait le bouton « Précédent ». Le magasin
    //    partagé `albumTracks`, lui, garde les douze pistes.
    retourGrille();

    // 3. « Secret Love », dont la requête de pistes échoue.
    cliquerVignette(el, 'Secret Love');
    await reposer();

    expect(entete(el), 'l’entête doit bien être celle de l’album demandé').toContain('Secret Love');
    // 🔴 LE défaut du ticket : une liste étrangère, pleine et cohérente.
    const affichees = pistesAffichees(el);
    for (const t of PISTES_VACHE) {
      expect(affichees, `« ${t.title} » ne doit pas apparaître sous « Secret Love »`).not.toContain(
        t.title,
      );
    }
    expect(affichees, 'la liste doit être VIDE, pas celle de l’album précédent').toHaveLength(0);
    // Et le compteur de l'entête, qui dérive de la liste, ne doit plus annoncer
    // les douze pistes de l'autre disque.
    expect(entete(el)).not.toMatch(/\b12\b/);
  });

  it('l’échec est DIT, au lieu de laisser un écran muet', async () => {
    serveur({ pistes: { [ID_HERRING]: PISTES_HERRING }, echecs: [ID_HERRING] });
    const el = await poser();
    cliquerVignette(el, 'Secret Love');
    await reposer();
    const fr = (await import('../locales/fr')).default as unknown as Record<string, string>;
    // Le bandeau est peint par `App.svelte`, hors de ce composant : on lit le
    // bus que la fiche a réellement alimenté.
    expect(get(notifications).map((n) => n.message)).toContain(
      fr['library.albumTracksLoadError'],
    );
  });
});

describe('une réponse EN RETARD ne repeint pas la fiche suivante', () => {
  /**
   * La Bibliothèque masque sa grille pendant un chargement, si bien qu'on ne
   * peut pas y cliquer deux albums coup sur coup. Mais `albumTracks` est
   * partagé : Lecture en cours, le Tableau de bord et la restauration
   * d'historique ouvrent une fiche pendant qu'une requête de la Bibliothèque
   * est encore en vol. C'est ce croisement-là qu'on rejoue — l'écran monté, la
   * fiche déjà passée à l'album suivant, et la réponse de l'album précédent qui
   * arrive après.
   */
  it('la fiche garde l’album ouvert quand la requête d’avant se dénoue', async () => {
    let libere: () => void = () => {};
    const lent = new Promise<void>((r) => (libere = r));
    serveur({
      pistes: { [ID_VACHE]: PISTES_VACHE, [ID_HERRING]: PISTES_HERRING },
      retards: { [ID_VACHE]: lent },
    });
    const el = await poser();

    // Warren Vaché part de la grille et traîne.
    cliquerVignette(el, 'Swingin');

    // Pendant ce temps, un autre écran ouvre « Secret Love » — exactement ce
    // que fait `NowPlaying.navigateToAlbum`.
    selectedAlbum.set(HERRING);
    const idHerring = commencerFicheAlbum(ID_HERRING);
    poserPistesAlbum(idHerring, PISTES_HERRING);
    libraryLoading.set(false);
    flushSync();
    expect(entete(el)).toContain('Secret Love');
    expect(pistesAffichees(el)[0]).toContain('Have You Met Miss Jones');

    // La réponse en retard arrive maintenant. Elle ne concerne plus l'écran.
    libere();
    await reposer();
    expect(entete(el), 'la fiche a changé d’album toute seule').toContain('Secret Love');
    expect(pistesAffichees(el)).toHaveLength(9);
    expect(pistesAffichees(el)).not.toContain('Thru the Night (Tk 2)');
  });
});

describe('le compteur de l’entête ne peut plus compter une liste étrangère', () => {
  it('une liste posée pour un AUTRE album n’est jamais rendue', async () => {
    serveur({ pistes: { [ID_HERRING]: PISTES_HERRING } });
    const el = await poser();
    cliquerVignette(el, 'Secret Love');
    await reposer();
    expect(pistesAffichees(el)).toHaveLength(9);
    expect(entete(el)).toMatch(/\b9\b/);

    // Un des sept écrivains du magasin partagé y pose les pistes d'un AUTRE
    // album — c'est la forme exacte du défaut. L'écran doit se taire, pas
    // mentir : la clé ne désigne plus la fiche affichée.
    albumTracksOwner.set(ID_VACHE);
    albumTracks.set(PISTES_VACHE);
    flushSync();
    expect(pistesAffichees(el)).toHaveLength(0);
    expect(entete(el)).not.toMatch(/\b12\b/);
  });
});
