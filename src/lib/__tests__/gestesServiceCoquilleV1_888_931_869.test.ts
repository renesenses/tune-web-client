// @vitest-environment jsdom
//
// 🔴 #888 (P1), #931, #869 — LA COQUILLE QUI MANQUAIT.
//
// FabienM, fil 1716, 08/09/2026 : « Menu lecture en cours : les hyperliens de
// l'artiste et l'album renvoient vers la page d'accueil. »
// Cyrille Moutia, #931 : « aucun moyen de revenir à l'album en cours ».
// FabienM, fil 1739, point 2 : sur un titre Qobuz, « 3 entrées contre 9 ».
//
// ## Le mécanisme, et pourquoi UN SEUL côté l'avait
//
// `NowPlaying` et `MenuPisteV1` sont montés par la coquille ACTUELLE ; ils ne
// routent pas en dur vers la fiche d'un album de service : ils lisent
// `stores/navigation.gestesNavigationService`, que la COQUILLE arme au montage.
// `null` = « je ne sais pas faire », et le lien garde son geste d'avant.
//
// Seule `ShellV2.svelte:368` armait ce magasin. Sous `App.svelte`, il restait
// `null` : l'artiste et l'album d'un titre Qobuz retombaient sur la recherche,
// et les deux entrées « Aller à… » disparaissaient du menu « … ».
//
// ## 🔴 CE QUE CE TÉMOIN REFUSE DE FAIRE
//
// `albumEnCours1361.test.ts` — le garde existant de ce lien — POSE lui-même le
// magasin (`gestesNavigationService.set({…})` dans son `beforeEach`). Il est
// donc vert sous les deux coquilles et ne dit rien de celle qui arme, ou pas.
// C'est exactement le piège de ce lot : un témoin qui monte le composant
// PARTAGÉ prouve la moitié partagée, jamais la coquille.
//
// Ici on MONTE `App.svelte` — la coquille actuelle, celle que `main.ts` monte
// quand `futureInterface()` est faux — et on ne touche JAMAIS au magasin. Tout
// ce qui suit part de ce que la coquille arme d'elle-même.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import { get } from 'svelte/store';

// Le transport temps réel n'a rien à voir avec ce qu'on mesure, et il ouvrirait
// une vraie connexion. Un mandataire rend une fonction inerte pour n'importe
// quel membre : la coquille en appelle plusieurs, et en oublier un ferait
// échouer le montage pour une raison étrangère au ticket.
vi.mock('../websocket', () => ({
  tuneWS: new Proxy({} as any, { get: () => vi.fn(() => () => {}) }),
}));

import App from '../../App.svelte';
import MenuPisteV1 from '../../components/MenuPisteV1.svelte';
import { zones, currentZoneId } from '../stores/zones';
import {
  activeView,
  gestesNavigationService,
  pendingSearchQuery,
} from '../stores/navigation';
import {
  activeStreamingService,
  pendingStreamingAlbum,
  pendingStreamingArtist,
  streamingAlbumOrigin,
} from '../stores/streaming';
import lFr from '../locales/fr';

const fr = lFr as unknown as Record<string, string>;

/** L'exemple de FabienM : un titre dont l'album a plusieurs éditions. */
const PISTE_QOBUZ = {
  track_id: null,
  // 🔴 Nuls tous les deux sur une piste de service : c'est ce qui faisait
  // disparaître les deux entrées et retomber les liens sur la recherche.
  album_id: null,
  artist_id: null,
  title: 'Avec simplicité',
  artist_name: 'Serge Lama',
  album_title: 'Au Palais des Congrès',
  source: 'qobuz',
  source_id: 'q-piste-1',
  duration_ms: 210000,
};

const ZONE = {
  id: 1, name: 'Salon', state: 'playing', current_track: PISTE_QOBUZ, position_ms: 1000,
};

/**
 * La MÊME piste telle qu'une LISTE la porte (résultats de recherche, onglet
 * Qobuz, favoris) : `StreamTrack.album_id` est alors la CHAÎNE du service.
 *
 * ⚠️ La distinction n'est pas cosmétique. Sur ce qui joue, `album_id` est nul
 * et l'identifiant vient du serveur (`/zones/{id}/album-en-cours`, #1361) ;
 * dans une liste, il voyage avec la piste. Nourrir le menu de la charge utile
 * de la lecture en cours rendrait le témoin vert sur une entrée ABSENTE.
 */
const PISTE_QOBUZ_EN_LISTE = { ...PISTE_QOBUZ, album_id: 'q-album-7' };

/** L'album que le SERVEUR désigne pour ce qui joue (`/zones/{id}/album-en-cours`). */
const ALBUM_EN_COURS = {
  zone_id: 1, kind: 'streaming', service: 'qobuz',
  album_id: 'q-album-7', artist_id: null,
  path: '/api/v1/streaming/qobuz/albums/q-album-7', origin: 'service_lookup',
};

let urls: string[] = [];
/** Ce que la recherche fédérée rend pour « Serge Lama » chez Qobuz. */
let artistesQobuz: unknown[] = [];
/** `true` : le service ne répond pas — on éprouve le repli. */
let rechercheMuette = false;

let hote: HTMLDivElement | null = null;
let monte: Record<string, any> | null = null;
let hoteMenu: HTMLDivElement | null = null;
let menu: Record<string, any> | null = null;

/**
 * Les magasins `pendingStreaming*` sont CONSOMMÉS par `StreamingView` à son
 * montage, qui les remet aussitôt à `null`. Les relire après coup rendrait
 * `null` et ferait passer un portage réussi pour un échec — ou l'inverse. On
 * enregistre donc tout ce qui y PASSE.
 */
function mouchard<T>(magasin: { subscribe: (f: (v: T) => void) => () => void }) {
  const vus: T[] = [];
  const stop = magasin.subscribe((v) => { if (v != null) vus.push(v); });
  return { vus, stop };
}

/** Un profil valide : sans lui la coquille en CRÉE un et se peint avec `{}`. */
const PROFIL = { id: 1, name: 'Default', avatar_color: '#6366f1' };

function corpsPour(url: string): { corps: unknown; ok: boolean } {
  if (url.includes('/album-en-cours')) return { corps: ALBUM_EN_COURS, ok: true };
  if (url.includes('/search?')) {
    if (rechercheMuette) return { corps: null, ok: false };
    return { corps: { local: null, services: { qobuz: { artists: artistesQobuz } } }, ok: true };
  }
  if (url.includes('/queue')) return { corps: { tracks: [], position: 0 }, ok: true };
  // 🔴 La coquille RELIT les zones à son montage. Sans cette réponse, elle
  // écrasait la zone posée par le témoin et « Lecture en cours » ne rendait
  // plus aucun lien : le témoin serait tombé sur une absence, pas sur un défaut.
  if (/\/zones(\?|$)/.test(url)) return { corps: [ZONE], ok: true };
  if (/\/zones\/1(\?|$)/.test(url)) return { corps: ZONE, ok: true };
  if (/\/profiles(\?|$)/.test(url)) return { corps: [PROFIL], ok: true };
  if (/\/(zones|profiles|devices|playlists|shortcuts)/.test(url)) return { corps: [], ok: true };
  return { corps: {}, ok: true };
}

function reponse(url: string) {
  const { corps, ok } = corpsPour(url);
  return {
    ok, status: ok ? 200 : 503, statusText: ok ? 'OK' : 'Service Unavailable',
    headers: new Map([['content-type', 'application/json']]),
    json: async () => corps,
    text: async () => JSON.stringify(corps),
  } as unknown as Response;
}

const respirer = (ms = 80) => new Promise((r) => setTimeout(r, ms));

/** Monte la COQUILLE ACTUELLE, et la laisse s'installer. */
async function monterCoquilleV1(): Promise<HTMLDivElement> {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(App, { target: hote, props: {} as any });
  flushSync();
  // La coquille applique sa vue de démarrage : on redemande la nôtre après.
  activeView.set('nowplaying');
  flushSync();
  await respirer();
  zones.set([ZONE] as any);
  currentZoneId.set(1);
  activeView.set('nowplaying');
  flushSync();
  await respirer();
  flushSync();
  return hote;
}

beforeEach(() => {
  urls = [];
  rechercheMuette = false;
  artistesQobuz = [{ id: 'q-artiste-9', name: 'Serge Lama' }];
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    urls.push(String(url));
    return reponse(String(url));
  }));
  vi.stubGlobal('WebSocket', class { close(){} addEventListener(){} removeEventListener(){} send(){} } as any);
  vi.stubGlobal('ResizeObserver', class { observe(){} unobserve(){} disconnect(){} } as any);
  zones.set([ZONE] as any);
  currentZoneId.set(1);
  activeView.set('nowplaying');
  activeStreamingService.set(null);
  pendingStreamingAlbum.set(null);
  pendingStreamingArtist.set(null);
  streamingAlbumOrigin.set(null);
  pendingSearchQuery.set('');
  // 🔴 JAMAIS posé à la main : c'est tout l'objet du témoin.
  gestesNavigationService.set(null);
});

afterEach(() => {
  if (menu) unmount(menu);
  menu = null;
  if (hoteMenu) hoteMenu.remove();
  hoteMenu = null;
  if (monte) unmount(monte);
  monte = null;
  if (hote) hote.remove();
  hote = null;
  gestesNavigationService.set(null);
  vi.unstubAllGlobals();
});

describe('#888 / #931 — la coquille actuelle sait ouvrir un album et un artiste de service', () => {
  it('elle ARME les gestes à son montage — le magasin ne reste plus null', async () => {
    expect(
      get(gestesNavigationService),
      'le témoin part d’un magasin déjà armé : il ne prouverait rien.',
    ).toBeNull();
    await monterCoquilleV1();
    expect(
      get(gestesNavigationService),
      'la coquille actuelle n’arme pas les gestes : sous elle, tout titre de ' +
        'service retombe sur la recherche, quelle que soit la qualité du composant partagé.',
    ).not.toBeNull();
  });

  it('🔴 le lien ALBUM ouvre la fiche Qobuz, et non la recherche', async () => {
    const h = await monterCoquilleV1();
    const albums = mouchard(pendingStreamingAlbum);
    // `StreamingView` efface la provenance en s'installant : on enregistre ce
    // qui y PASSE, comme pour l'album lui-même.
    const provenances = mouchard(streamingAlbumOrigin);

    const lien = h.querySelector<HTMLElement>('.track-album');
    expect(lien, 'le titre d’album n’est pas rendu — témoin sans objet').not.toBeNull();
    lien!.click();
    await respirer(150);
    flushSync();

    expect(
      albums.vus.length,
      'aucun album de service n’a été armé : le lien est retombé sur la recherche, ' +
        'exactement ce que FabienM décrit.',
    ).toBe(1);
    const arme = albums.vus[0] as any;
    expect(
      String(arme.source_id ?? arme.id),
      'ce n’est pas l’identifiant que le serveur a désigné pour ce qui joue : ' +
        'la fiche s’ouvrira sur un autre album, ou sur « Chargement… » pour toujours.',
    ).toBe('q-album-7');
    expect(
      get(activeStreamingService),
      'le service n’est pas choisi : `StreamingView` ne consomme rien et l’écran reste vide.',
    ).toBe('qobuz');
    expect(get(activeView), 'la vue n’a pas changé').toBe('streaming');
    // #931, second volet : le Retour de la fiche doit ramener à la Lecture en
    // cours, pas à la grille du service (`lib/streamingRetour.actionRetour`).
    expect(
      provenances.vus,
      'sans provenance, le Retour enferme l’auditeur dans le service au lieu de ' +
        'le ramener à ce qui joue (`lib/streamingRetour.actionRetour`).',
    ).toContain('nowplaying');
    albums.stop();
    provenances.stop();
  });

  it('🔴 le lien ARTISTE résout le NOM chez le service, puis ouvre sa fiche', async () => {
    const h = await monterCoquilleV1();
    const artistes = mouchard(pendingStreamingArtist);

    const lien = h.querySelector<HTMLElement>('.track-artist');
    expect(lien, 'le nom d’artiste n’est pas rendu — témoin sans objet').not.toBeNull();
    urls = [];
    lien!.click();
    await respirer(150);
    flushSync();

    expect(
      urls.some((u) => u.includes('/search?') && u.includes('sources=qobuz')),
      `le nom n’a pas été résolu chez le service. URL vues : ${urls.join(' | ')}`,
    ).toBe(true);
    expect(
      artistes.vus.length,
      'aucune fiche artiste de service n’a été armée : le lien est retombé sur la recherche.',
    ).toBe(1);
    const arme = artistes.vus[0] as any;
    expect(
      String(arme.source_id ?? arme.id),
      'l’identifiant retenu n’est pas celui que le service a rendu pour ce nom.',
    ).toBe('q-artiste-9');
    expect(get(activeView)).toBe('streaming');
    artistes.stop();
  });

  it('repli EXPLICITE : service muet, on revient à la recherche — le geste d’avant', async () => {
    rechercheMuette = true;
    const h = await monterCoquilleV1();
    const artistes = mouchard(pendingStreamingArtist);
    // L'écran de recherche CONSOMME la requête à son montage.
    const requetes = mouchard(pendingSearchQuery);

    h.querySelector<HTMLElement>('.track-artist')!.click();
    await respirer(150);
    flushSync();

    expect(
      artistes.vus.length,
      'on ouvre une fiche alors que le service ne connaît pas ce nom : elle sera VIDE, ' +
        'ce qui est pire que la recherche qu’elle remplace.',
    ).toBe(0);
    expect(get(activeView), 'le repli ne mène plus à la recherche').toBe('search');
    expect(
      requetes.vus,
      'la recherche part à VIDE : le repli existe mais ne dit pas ce qu’on cherchait.',
    ).toContain('Serge Lama');
    artistes.stop();
    requetes.stop();
  });
});

describe('#869 — le menu « … » d’une piste Qobuz retrouve « Aller à l’album / à l’artiste »', () => {
  /** Ouvre le menu d'une piste et rend les libellés qu'il propose. */
  function entreesDuMenu(): string[] {
    hoteMenu = document.createElement('div');
    document.body.appendChild(hoteMenu);
    menu = mount(MenuPisteV1, { target: hoteMenu, props: { piste: PISTE_QOBUZ_EN_LISTE as any } });
    flushSync();
    const bouton = hoteMenu.querySelector<HTMLButtonElement>('.track-more-btn');
    expect(bouton, 'le bouton « … » n’est pas rendu — témoin sans objet').not.toBeNull();
    bouton!.click();
    flushSync();
    // Le panneau est PORTÉ à la racine du document (#872) : il n'est pas sous
    // l'hôte. Le chercher là serait un témoin toujours vide, donc toujours vert
    // sur une absence.
    return [...document.querySelectorAll('[role="menuitem"]')]
      .map((b) => (b.textContent ?? '').trim())
      .filter(Boolean);
  }

  it('contrôle : coquille NON armée, les deux entrées sont ABSENTES', async () => {
    // C'est l'état d'avant ce portage, et il doit rester celui d'une coquille
    // qui n'a pas d'écran où aller : absent, pas grisé, pas mort.
    const entrees = entreesDuMenu();
    expect(entrees.length, 'le menu ne s’est pas ouvert').toBeGreaterThan(0);
    expect(entrees).not.toContain(fr['library.goToAlbum']);
    expect(entrees).not.toContain(fr['library.goToArtist']);
  });

  it('🔴 coquille actuelle MONTÉE : les deux entrées apparaissent', async () => {
    await monterCoquilleV1();
    const entrees = entreesDuMenu();
    expect(
      entrees,
      '« Aller à l’album » manque encore sur une piste de service : c’est une des six ' +
        'absences de FabienM, et celle-là est réalisable.',
    ).toContain(fr['library.goToAlbum']);
    expect(
      entrees,
      '« Aller à l’artiste » manque encore sur une piste de service.',
    ).toContain(fr['library.goToArtist']);
  });

  it('🔴 « Aller à l’album » du menu ouvre bien l’album QOBUZ de la piste', async () => {
    await monterCoquilleV1();
    const albums = mouchard(pendingStreamingAlbum);
    const entrees = [...document.querySelectorAll('[role="menuitem"]')];
    expect(entrees.length, 'des entrées traînent d’un cas précédent').toBe(0);

    entreesDuMenu();
    const cible = [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')]
      .find((b) => (b.textContent ?? '').trim() === fr['library.goToAlbum']);
    expect(cible, 'l’entrée « Aller à l’album » est absente').toBeDefined();
    cible!.click();
    await respirer(120);
    flushSync();

    expect(
      albums.vus.length,
      'l’entrée est là mais ne mène nulle part : un geste MUET est pire qu’une entrée absente.',
    ).toBe(1);
    const arme = albums.vus[0] as any;
    expect(
      String(arme.source_id ?? arme.id),
      'le menu ouvre un autre album que celui de la piste.',
    ).toBe('q-album-7');
    expect(get(activeStreamingService)).toBe('qobuz');
    albums.stop();
  });
});
