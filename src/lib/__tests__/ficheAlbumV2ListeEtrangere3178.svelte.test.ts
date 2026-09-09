// @vitest-environment jsdom
//
// renesenses/tune-server-rust#3178 — jfpaquet, Tune 0.9.130 Windows :
// « en ouvrant la fiche d'un album, la liste de pistes affichée est celle d'un
// AUTRE album ». Titre et pochette corrects, LECTURE correcte, et le compteur
// de l'entête qui suit la liste étrangère : 12 puis 8 pour « Secret Love »,
// dont le journal serveur donne le vrai compte (`set_queue_ok n=9`).
//
// Le serveur est écarté par la mesure, faite à l'ouverture du ticket :
// `album_tracks` lie l'identifiant du chemin et rend
// `list_by_album_filtered(id, …).unwrap_or_default()` — une panne y rend une
// liste VIDE, jamais une liste fausse et pleine.
//
// L'ANCIEN client a reçu sa clé le 07/09 (`albumTracksOwner`, PR #781, témoins
// dans `ficheAlbumListeEtrangere3178.test.ts`). Le NOUVEAU — `AlbumDetailV2`,
// la fiche que voient les testeurs du .18 — ne l'avait pas :
//
//   1. `{#if opened}<AlbumDetailV2 album={opened}/>{/if}` : passer de l'album A
//      à l'album B ne REMONTE pas le composant, il change la propriété.
//      `tracks` gardait donc les pistes de A, et l'entête — qui compte
//      `tracks.length` HORS du garde-fou `{#if loading}` — annonçait le compte
//      de A sous le titre de B. `LibraryV2` a exactement ce chemin : l'effet
//      `$pendingLibraryAlbum` écrit `opened = <autre album>` alors qu'une fiche
//      est ouverte (« aller à l'album » du menu d'une piste).
//   2. Aucun jeton de fraîcheur : deux ouvertures rapprochées laissaient gagner
//      la réponse la plus LENTE — celle de l'album précédent venait se poser,
//      PLEINE et cohérente, sous l'entête du suivant.
//
// 🔴 CES TÉMOINS MONTENT LA FICHE et lisent le DOM rendu : les titres de pistes
// réellement affichés et le compteur de l'entête. Aucun ne cherche une chaîne
// dans un fichier source — une garde textuelle resterait verte si la conduite
// était débranchée ailleurs.
//
// Fichier `.svelte.test.ts` : il faut une propriété RÉACTIVE (`$state`) pour
// rejouer le changement d'album sans remontage, et les runes ne se compilent
// que là.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import type { Album, Track } from '../types';

class ResizeObserverInerte {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal('ResizeObserver', ResizeObserverInerte);

const getAlbumTracks = vi.fn<(id: number) => Promise<Track[]>>();
const getAlbum = vi.fn<(id: number) => Promise<Album>>();
// Mock PARTIEL : la fiche tire aussi `artworkUrl` (via `AlbumArt`) et bien
// d'autres entrées du module. Ne remplacer que les deux appels du chemin
// mesuré garde le reste réel.
vi.mock('../api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../api')>()),
  getAlbumTracks: (id: number) => getAlbumTracks(id),
  getAlbum: (id: number) => getAlbum(id),
}));
import AlbumDetailV2 from '../../components/v2/AlbumDetailV2.svelte';

const ID_VACHE = 101;
const ID_HERRING = 202;

const VACHE = {
  id: ID_VACHE, title: 'Swingin’ Young Scott', artist_name: 'Warren Vaché', year: 2014,
} as Album;
const HERRING = {
  id: ID_HERRING, title: 'Secret Love', artist_name: 'Vincent Herring', year: 1993,
} as Album;

/** Les douze pistes de Warren Vaché — celles qui se sont installées ailleurs. */
const PISTES_VACHE: Track[] = [
  'Thru the Night (Tk 2)', 'Imagination (Remake)', 'Warren’s Rush (Tk 1)',
  'Blues for Mastertone (Tk 3)', 'Scott’s Idea (Tk 1)', 'Autumn in New York',
  'Jubilation', 'Struttin’ with Some Barbecue', 'You’re My Everything',
  'Everything Happens to Me', 'Rosetta', 'Sweet Lorraine',
].map((title, i) => ({
  id: 1000 + i, title, track_number: i + 1, album_id: ID_VACHE,
  album_title: VACHE.title, artist_name: VACHE.artist_name, duration_ms: 240_000,
})) as Track[];

/** Les neuf pistes réelles de « Secret Love » — le compte du journal serveur. */
const PISTES_HERRING: Track[] = [
  'Have You Met Miss Jones', 'Secret Love', 'Scootin’', 'Sails', 'Dolphin Dance',
  'Mr. P.C.', 'Blue Bossa', 'Naima', 'Freedom Jazz Dance',
].map((title, i) => ({
  id: 2000 + i, title, track_number: i + 1, album_id: ID_HERRING,
  album_title: HERRING.title, artist_name: HERRING.artist_name, duration_ms: 300_000,
})) as Track[];

let hote: HTMLDivElement | null = null;
let monte: Record<string, any> | null = null;

/** Une réponse qu'on dénoue à la main : c'est la course du ticket. */
function differee<T>() {
  let livrer: (v: T) => void = () => {};
  const promesse = new Promise<T>((r) => (livrer = r));
  return { promesse, livrer };
}

/** Monte la fiche et rend de quoi CHANGER d'album sans la remonter. */
function poser(album: Album) {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  const props = $state<{ album: Album; onClose: () => void }>({ album, onClose: () => {} });
  monte = mount(AlbumDetailV2, { target: hote, props });
  flushSync();
  return (suivant: Album) => {
    props.album = suivant;
    flushSync();
  };
}

async function reposer(tours = 6) {
  for (let i = 0; i < tours; i++) {
    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));
  }
  flushSync();
}

/** Tout ce que la zone des pistes affiche, espaces normalisés. */
function listeAffichee(): string {
  return (hote?.querySelector('.tracks')?.textContent ?? '').replace(/\s+/g, ' ');
}

/** Le compteur de l'entête — « N titre(s) », posé HORS du garde-fou de
 *  chargement, donc visible pendant tout le chargement du suivant. */
function compteurEntete(): number | null {
  const txt = (hote?.querySelector('.facts')?.textContent ?? '').replace(/\s+/g, ' ');
  const m = txt.match(/(\d+)\s+titres?/);
  return m ? Number(m[1]) : null;
}

beforeEach(() => {
  getAlbumTracks.mockReset();
  getAlbum.mockReset();
  getAlbum.mockImplementation(() => new Promise<Album>(() => {}));
});

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  if (hote) hote.remove();
  hote = null;
});

describe('err 02 / err 01 — la fiche change d’album sans être remontée', () => {
  it('le compteur de l’entête ne compte plus les pistes de l’album d’avant', async () => {
    const lent = differee<Track[]>();
    getAlbumTracks.mockImplementation((id) =>
      id === ID_VACHE ? Promise.resolve(PISTES_VACHE) : lent.promesse,
    );
    const changerAlbum = poser(VACHE);
    await reposer();

    // 1. Warren Vaché s'ouvre normalement : douze pistes, entête cohérente.
    expect(listeAffichee()).toContain('Thru the Night');
    expect(compteurEntete()).toBe(12);

    // 2. « Aller à l'album » ouvre « Secret Love » PAR-DESSUS la fiche
    //    ouverte : même instance, propriété changée.
    changerAlbum(HERRING);

    // 🔴 LE défaut du ticket : l'entête annonce « Secret Love · 12 tracks »,
    //    le compte de l'album précédent.
    expect(compteurEntete(), 'l’entête compte encore les pistes de l’album d’avant').toBe(0);
    for (const p of PISTES_VACHE) {
      expect(listeAffichee(), `« ${p.title} » ne doit pas rester sous « Secret Love »`)
        .not.toContain(p.title);
    }

    // 3. Et quand la vraie liste arrive, c'est la sienne — neuf pistes.
    lent.livrer(PISTES_HERRING);
    await reposer();
    expect(compteurEntete()).toBe(9);
    expect(listeAffichee()).toContain('Have You Met Miss Jones');
  });
});

describe('une réponse EN RETARD ne repeint pas la fiche suivante', () => {
  it('la liste reste celle de l’album ouvert quand la requête d’avant se dénoue', async () => {
    const lent = differee<Track[]>();
    getAlbumTracks.mockImplementation((id) =>
      id === ID_VACHE ? lent.promesse : Promise.resolve(PISTES_HERRING),
    );
    const changerAlbum = poser(VACHE);
    await reposer();

    // Warren Vaché traîne ; « Secret Love » s'ouvre par-dessus et répond, lui.
    changerAlbum(HERRING);
    await reposer();
    expect(listeAffichee()).toContain('Have You Met Miss Jones');
    expect(compteurEntete()).toBe(9);

    // La réponse en retard arrive maintenant. Elle ne concerne plus l'écran.
    lent.livrer(PISTES_VACHE);
    await reposer();
    expect(compteurEntete(), 'la réponse en retard a repeint la fiche').toBe(9);
    expect(listeAffichee(), 'la liste de l’album d’avant s’est posée sous le suivant')
      .not.toContain('Thru the Night');
    expect(listeAffichee()).toContain('Have You Met Miss Jones');
  });
});
