// @vitest-environment jsdom
//
// #1357 — la fiche d'album n'avait AUCUNE action « Étiquettes ».
//
// Cinq gestes dans sa barre — Lire, Aléatoire, Lire ensuite, Ajouter à la
// file, Favori — et pas un pour ranger le disque qu'on regarde. La LIGNE de
// piste avait le sien (`PisteActions`), la VIGNETTE aussi
// (`PochetteActions`), le serveur sait étiqueter un objet de streaming depuis
// la v0.9.144 (`POST /tags/{id}/streaming-items`, la paire `source` +
// `source_id`), et web#1238 avait branché tout cela dans la .158. Seule la
// fiche restait dehors.
//
// 🔴 CES TÉMOINS MONTENT LA VRAIE FICHE et lisent la requête RÉELLEMENT
// PARTIE — `fetch` bouchonné au plus bas niveau, jamais un espion posé sur
// `lib/api`. Un espion sur `api` prouverait qu'une fonction a été appelée ;
// il ne dirait pas quelle ROUTE part, et c'est tout l'enjeu ici : un album
// Qobuz n'a pas d'entier, la route à entier le rejetterait.
//
// CONTRE-ÉPREUVE MESURÉE (20/09/2026), deux fois :
//   • le bloc `{#if cibleEtiquettes}` retiré de `AlbumDetailV2.svelte`
//     → 4 échecs / 4 succès, exactement les quatre témoins de la fiche album ;
//   • le même bloc retiré de `PlaylistDetailV2.svelte`
//     → 2 échecs / 6 succès, exactement les deux témoins de la fiche playlist.
// Les deux blocs remis : 8 succès.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import AlbumDetailV2 from '../../components/v2/AlbumDetailV2.svelte';
import PlaylistDetailV2 from '../../components/v2/PlaylistDetailV2.svelte';
import { locale } from '../i18n';
import lFr from '../locales/fr';
import type { Album } from '../types';
// Le panneau est monté par `AlbumDetailV2` à travers un `{#await import(...)}`.
// L'importer ICI, statiquement, fait payer sa transformation Vite à la
// COLLECTE — hors du budget d'un cas, et sans chargement paresseux dans un
// banc, que la garde #1333 interdit à juste titre. Sur une passe complète à
// douze processus, cette transformation-là se comptait en dizaines de
// secondes, et le premier cas attendait un panneau pas encore né.
import '../../components/v2/EtiquettesPanneau.svelte';

vi.setConfig({ testTimeout: 30_000 });



const fr = lFr as unknown as Record<string, string>;
const ETIQUETTES = fr['v2.cover.tags'];

interface Requete { method: string; url: string; body: any }
let requetes: Requete[] = [];
/** Réponse par motif d'URL — le premier motif contenu dans l'URL gagne. */
let reponses: [string, unknown][] = [];

class ObservateurInerte { observe() {} unobserve() {} disconnect() {} }

const respirer = () => new Promise((r) => setTimeout(r, 0));
async function souffler(n = 10) {
  for (let i = 0; i < n; i++) { await respirer(); flushSync(); }
}

/**
 * Attend qu'une condition soit vraie, bornée PAR LE TEMPS.
 *
 * 🔴 Un nombre fixe de tours ne suffit PAS ici : le panneau est chargé par un
 * `import()` paresseux, et la TOUTE PREMIÈRE résolution passe par la
 * transformation Vite du module — largement plus longue que les suivantes,
 * déjà en cache. Un `souffler(14)` rendait donc le premier témoin du fichier
 * rouge et les suivants verts : un faux rouge d'ordonnancement.
 *
 * 🔴 Et un nombre de TOURS n'est pas une durée : 400 tours de `setTimeout(0)`
 * valent une fraction de seconde sur une machine au repos, et bien plus sous
 * une passe complète à douze processus. La borne est donc une DURÉE, très en
 * deçà du `testTimeout` : une machine chargée attend plus longtemps au lieu
 * d'abandonner plus tôt. C'est ce qui rendait ce banc rouge par intermittence
 * sur des branches qui n'y touchaient pas.
 */
async function attendreQue(condition: () => boolean, limiteMs = 20_000) {
  const fin = Date.now() + limiteMs;
  while (!condition() && Date.now() < fin) { await respirer(); flushSync(); }
  flushSync();
  return condition();
}
/** La requête de lecture du panneau est partie : il est ouvert et chargé. */
const panneauInterroge = () => requetes.some((r) => r.url.includes('/tags/for'));

let hote: HTMLDivElement | null = null;
let monte: Record<string, unknown> | null = null;

beforeEach(() => {
  requetes = [];
  reponses = [['/tags/for', []], ['/tags', []]];
  locale.set('fr');
  vi.stubGlobal('ResizeObserver', ObservateurInerte);
  vi.stubGlobal('IntersectionObserver', ObservateurInerte);
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    const method = (init?.method ?? 'GET').toUpperCase();
    let body: any = null;
    if (typeof init?.body === 'string') { try { body = JSON.parse(init.body); } catch { body = init.body; } }
    requetes.push({ method, url, body });
    const trouve = reponses.find(([motif]) => url.includes(motif));
    const charge = trouve ? trouve[1] : [];
    return {
      ok: true, status: 200,
      headers: new Headers({ 'Content-Type': 'application/json' }),
      text: async () => JSON.stringify(charge),
      json: async () => charge,
    } as unknown as Response;
  }));
  hote = document.createElement('div');
  document.body.appendChild(hote);
});

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  hote?.remove();
  hote = null;
  // Le panneau se pose par `use:portail`, hors de l'hôte : il faut le balayer
  // à la main, sinon le témoin suivant retrouverait celui d'avant.
  document.querySelectorAll('.fond').forEach((e) => e.remove());
  vi.unstubAllGlobals();
});

/** Le bouton de la barre d'actions, cherché par son LIBELLÉ traduit. */
function boutonEtiquettes(): HTMLButtonElement | undefined {
  return [...hote!.querySelectorAll('button')].find(
    (b) => b.textContent?.trim() === ETIQUETTES,
  ) as HTMLButtonElement | undefined;
}

const ALBUM_LOCAL = {
  id: 4221, title: 'Menagerie', artist_name: 'Bill Withers', year: 1977,
} as Album;

const ALBUM_QOBUZ = {
  id: null, title: 'Menagerie', artist_name: 'Bill Withers',
  cover_path: 'https://static.qobuz.com/x.jpg',
  source: 'qobuz', source_id: 'kxend2k5wdg06',
} as unknown as Album;

describe('#1357 — la fiche album étiquette un album de la BIBLIOTHÈQUE', () => {
  it('🔴 le bouton existe, et il demande les étiquettes par l’IDENTIFIANT', async () => {
    monte = mount(AlbumDetailV2, {
      target: hote!, props: { album: ALBUM_LOCAL, onClose: () => {} },
    });
    await souffler();

    const b = boutonEtiquettes();
    expect(b, 'la fiche d’album n’a pas de bouton Étiquettes').toBeTruthy();
    b!.click();
    await attendreQue(panneauInterroge);

    const lecture = requetes.find((r) => r.url.includes('/tags/for'));
    expect(lecture?.url, 'le panneau n’a pas demandé les étiquettes de CET album')
      .toMatch(/\/tags\/for\/album\/4221$/);
    // Et surtout : PAS la route de streaming — un album indexé n'a pas de paire.
    expect(requetes.some((r) => r.url.includes('/tags/for-streaming'))).toBe(false);
  });

  it('poser une étiquette part sur la route à ENTIER', async () => {
    reponses = [
      ['/tags/for', []],
      ['/tags', [{ id: 9, name: 'À écouter', color: '#808080' }]],
    ];
    monte = mount(AlbumDetailV2, {
      target: hote!, props: { album: ALBUM_LOCAL, onClose: () => {} },
    });
    await souffler();
    boutonEtiquettes()!.click();
    await attendreQue(() => !!document.querySelector('button.ajoutable'));

    const ajout = [...document.querySelectorAll('button.ajoutable')].find(
      (b) => b.textContent?.includes('À écouter'),
    ) as HTMLButtonElement;
    expect(ajout, 'l’étiquette « À écouter » n’est pas proposée').toBeTruthy();
    ajout.click();
    await souffler();

    const pose = requetes.find((r) => r.method === 'POST' && r.url.includes('/tags/9/'));
    expect(pose, 'aucune pose partie').toBeTruthy();
    expect(pose!.url).toMatch(/\/tags\/9\/items$/);
    expect(pose!.body).toEqual({ item_type: 'album', item_id: 4221 });
  });
});

describe('#1357 — la fiche album étiquette un album de SERVICE', () => {
  it('🔴 le bouton existe, et la pose part avec la PAIRE source + source_id', async () => {
    reponses = [
      ['/tags/for', []],
      ['/albums/kxend2k5wdg06/tracks', []],
      ['/tags', [{ id: 9, name: 'À écouter', color: '#808080' }]],
    ];
    monte = mount(AlbumDetailV2, {
      target: hote!,
      props: { album: ALBUM_QOBUZ, service: 'qobuz', onClose: () => {} },
    });
    await souffler();

    const b = boutonEtiquettes();
    expect(b, 'un album Qobuz n’a pas de bouton Étiquettes sur sa fiche').toBeTruthy();
    b!.click();
    await attendreQue(() => !!document.querySelector('button.ajoutable'));

    // La LECTURE passe par la jumelle streaming, avec la paire en paramètres.
    const lecture = requetes.find((r) => r.url.includes('/tags/for-streaming'));
    expect(lecture?.url, 'le panneau a interrogé la route à entier pour un album Qobuz')
      .toMatch(/\/tags\/for-streaming\?item_type=album&source=qobuz&source_id=kxend2k5wdg06$/);

    const ajout = [...document.querySelectorAll('button.ajoutable')].find(
      (x) => x.textContent?.includes('À écouter'),
    ) as HTMLButtonElement;
    expect(ajout, 'l’étiquette n’est pas proposée sur un album de service').toBeTruthy();
    ajout.click();
    await souffler();

    const pose = requetes.find((r) => r.method === 'POST' && r.url.includes('/tags/9/'));
    expect(pose, 'aucune pose partie').toBeTruthy();
    expect(pose!.url, 'la pose part vers la route à ENTIER, qu’un album Qobuz ne peut pas honorer')
      .toMatch(/\/tags\/9\/streaming-items$/);
    expect(pose!.body).toEqual({
      item_type: 'album', source: 'qobuz', source_id: 'kxend2k5wdg06',
      title: 'Menagerie', artist: 'Bill Withers', album: null,
      cover_url: 'https://static.qobuz.com/x.jpg',
    });
  });

  it('un album BANDCAMP est désigné par son URL, et il a le bouton', async () => {
    // `StreamingV2` donne à la fiche Bandcamp `source: 'bandcamp'` et
    // `source_id: <url>`. Le serveur ne valide QUE l'`item_type` : la source
    // est une chaîne libre, et `tags.rs` cite Bandcamp en exemple.
    const URL_BC = 'https://artiste.bandcamp.com/album/le-disque';
    reponses = [['/tags/for', []], ['/ext/bandcamp/album', { tracks: [] }], ['/tags', []]];
    monte = mount(AlbumDetailV2, {
      target: hote!,
      props: {
        album: { id: null, title: 'Le disque', artist_name: 'Artiste',
                 source: 'bandcamp', source_id: URL_BC } as unknown as Album,
        bandcamp: URL_BC, onClose: () => {},
      },
    });
    await souffler();

    const b = boutonEtiquettes();
    expect(b, 'un album Bandcamp n’a pas de bouton Étiquettes').toBeTruthy();
    b!.click();
    await attendreQue(panneauInterroge);

    const lecture = requetes.find((r) => r.url.includes('/tags/for-streaming'));
    expect(lecture?.url).toContain('item_type=album&source=bandcamp');
    expect(lecture?.url).toContain(encodeURIComponent(URL_BC));
  });
});

describe('#1357 — ce qui n’est PAS étiquetable n’affiche pas l’action', () => {
  it('un album de DÉPÔT DISTANT : son identifiant est celui d’un AUTRE serveur', async () => {
    // Posé sur `/tags/{id}/items`, il étiquetterait l'album de la bibliothèque
    // locale qui porte ce numéro — un inconnu. Même garde que `LibraryV2`.
    monte = mount(AlbumDetailV2, {
      target: hote!,
      props: {
        album: ALBUM_LOCAL,
        depot: { id: 'srv-2', name: 'Salon', baseUrl: 'http://192.168.1.20:8888' } as any,
        onClose: () => {},
      },
    });
    await souffler();
    expect(boutonEtiquettes(), 'la fiche d’un dépôt distant propose d’étiquetter un inconnu')
      .toBeUndefined();
  });

  it('un album sans identifiant NI paire n’a rien à désigner', async () => {
    monte = mount(AlbumDetailV2, {
      target: hote!,
      props: { album: { id: null, title: 'Orphelin' } as unknown as Album, onClose: () => {} },
    });
    await souffler();
    expect(boutonEtiquettes()).toBeUndefined();
  });
});

describe('#1357 — la fiche PLAYLIST avait le même trou', () => {
  it('une playlist LOCALE part par son identifiant', async () => {
    monte = mount(PlaylistDetailV2, {
      target: hote!,
      props: {
        item: { kind: 'local', pl: { id: 77, name: 'Dimanche' } } as any,
        onClose: () => {},
      },
    });
    await souffler();
    const b = boutonEtiquettes();
    expect(b, 'la fiche de playlist n’a pas de bouton Étiquettes').toBeTruthy();
    b!.click();
    await attendreQue(panneauInterroge);
    expect(requetes.find((r) => r.url.includes('/tags/for'))?.url)
      .toMatch(/\/tags\/for\/playlist\/77$/);
  });

  it('une playlist de SERVICE part par sa paire', async () => {
    monte = mount(PlaylistDetailV2, {
      target: hote!,
      props: {
        item: { kind: 'streaming', service: 'tidal',
                pl: { source_id: 'pl-991', name: 'Mix', source: 'tidal' } } as any,
        onClose: () => {},
      },
    });
    await souffler();
    const b = boutonEtiquettes();
    expect(b, 'une playlist Tidal n’a pas de bouton Étiquettes').toBeTruthy();
    b!.click();
    await attendreQue(panneauInterroge);
    expect(requetes.find((r) => r.url.includes('/tags/for-streaming'))?.url)
      .toMatch(/\/tags\/for-streaming\?item_type=playlist&source=tidal&source_id=pl-991$/);
  });
});
