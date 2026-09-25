// @vitest-environment jsdom
//
// renesenses/tune-web-client#992 — FabienM, fil 1774 « v0.9.147 : v1 divers
// bugs », 13/09/2026, point 14 :
//
//   « Menu lecture en cours : quand je clique sur l'artiste, erreur 502. »
//
// La cause de ce jour-là était côté serveur — `extra=biography`, refusé par
// Qobuz, rendait 502 sur TOUTE fiche artiste Qobuz ; corrigé en 0.9.149
// (tune-server-rust#4049). Mesuré sur la .18 en 0.9.164 le 24/09/2026 :
// `GET /streaming/qobuz/artists/610403` → 200. Ce geste-là ne rend plus 502.
//
// Ce qui restait vrai sur `main` (web 91954d65 + serveur 0.9.164), mesuré le
// même jour :
//
//   GET /streaming/qobuz/artists/999999999999 → 502
//       qobuz /artist/get: 404 {"status":"error","code":404,…}
//   GET /streaming/youtube/artists/UCxxxx992  → 502
//       Not found: youtube artist UCxxxx992 not found
//   GET /streaming/spotify/artists/x          → 502  not authenticated
//   GET /streaming/upnp/artists/1             → 404  unknown service: upnp
//
// Et le client peignait chacun de ces 502 en bandeau rouge « Server error: »
// suivi du texte BRUT du service — trois fois, une par route de la fiche —
// pendant que la page, elle, ne disait rien.
//
// 🔴 CE TÉMOIN MONTE LA VRAIE COQUILLE ET PASSE PAR LE GESTE DE LA LECTURE EN
// COURS (`ouvrirArtisteDeServiceParNom`, que `NowPlaying` appelle par
// `gestesNavigationService`) ; il lit les notifications réellement poussées et
// le DOM réellement rendu. Il ne lit aucun source.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import { get } from 'svelte/store';
import ShellV2 from '../../components/v2/ShellV2.svelte';
import { activeView, vueDeRetour } from '../stores/navigation';
import { ficheArtisteService } from '../stores/streaming';
import { notifications } from '../stores/notifications';
import { ouvrirArtisteDeServiceParNom } from '../ouvrirArtisteDepuis';
import { destinationArtiste } from '../routageArtiste';
import { messageEchecFiche, motifEchecFiche } from '../echecFicheArtiste';
import { t } from '../i18n';

vi.setConfig({ testTimeout: 30_000 });

// ── 1. Où mène le clic, source par source ──────────────────────────────────

describe('#992 — le clic artiste de la Lecture en cours, par source', () => {
  it('locale : la page commune, par identifiant de bibliothèque', () => {
    expect(destinationArtiste({ source: 'local', artist_id: 994, artist_name: 'Pink Floyd' }))
      .toEqual({ type: 'artiste', artistId: 994 });
  });

  it('service (Qobuz, Tidal, Deezer, Bandcamp) : la fiche du SERVICE', () => {
    expect(destinationArtiste({ source: 'qobuz', artist_id: '610403', artist_name: 'Leprous' }))
      .toEqual({ type: 'artiste-service', service: 'qobuz', id: '610403', nom: 'Leprous' });
    expect(destinationArtiste({ source: 'deezer', artist_id: 27, artist_name: 'Daft Punk' }))
      .toEqual({ type: 'artiste-service', service: 'deezer', id: '27', nom: 'Daft Punk' });
  });

  it('radio : la recherche, sans restreindre le périmètre', () => {
    expect(destinationArtiste({ source: 'radio', artist_name: 'Nina Simone' }))
      .toEqual({ type: 'recherche', requete: 'Nina Simone', source: null });
  });

  it('UPnP rangé en bibliothèque : la BIBLIOTHÈQUE, jamais le « service » upnp', () => {
    // `/streaming/upnp/artists/1` → 404 « unknown service: upnp » (.18, 24/09).
    expect(destinationArtiste({ source: 'upnp', artist_id: 7, artist_name: 'Arvo Pärt' }))
      .toEqual({ type: 'artiste', artistId: 7 });
    expect(destinationArtiste({ source: 'upnp:uuid-sonos', artist_id: 7, artist_name: 'Arvo Pärt' }))
      .toEqual({ type: 'artiste', artistId: 7 });
    // Sans identifiant : le nom, résolu dans la bibliothèque — pas une
    // recherche fédérée restreinte à un service qui n'existe pas.
    expect(destinationArtiste({ source: 'upnp', artist_id: null, artist_name: 'Arvo Pärt' }))
      .toEqual({ type: 'artiste-par-nom', nom: 'Arvo Pärt' });
  });
});

describe('#992 — le motif se lit sur le STATUT, jamais sur le texte', () => {
  it('404 : introuvable ; tout le reste : indisponible', () => {
    expect(motifEchecFiche({ status: 404 })).toBe('introuvable');
    // Le texte d'un 502 Qobuz contient « 404 » : il ne décide de rien.
    expect(motifEchecFiche(Object.assign(new Error('qobuz /artist/get: 404 {…}'), { status: 502 })))
      .toBe('indisponible');
    expect(motifEchecFiche(new Error('réseau'))).toBe('indisponible');
    expect(motifEchecFiche(null)).toBe('indisponible');
  });
});

// ── 2. La page, montée, face à un service qui échoue ───────────────────────

const BRUT_QOBUZ = 'qobuz /artist/get: 404 {"status":"error","code":404,"message":"No result matching given argument"}';

const COLLECTIONS =
  /\/(profiles|zones|playlists|devices|shortcuts|collections|tags|favorites|history|radios|podcasts|artists|albums|tracks|top-artists|recent|genres)(\?|\/|$)/;

/** Statut et corps rendus par les TROIS routes de la fiche artiste. */
let echecArtiste: { status: number; corps: string } = { status: 502, corps: BRUT_QOBUZ };

function reponse(status: number, corps: string, type = 'application/json') {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 502 ? 'Bad Gateway' : status === 404 ? 'Not Found' : 'OK',
    headers: new Map([['content-type', type]]),
    json: async () => JSON.parse(corps),
    text: async () => corps,
  } as unknown as Response;
}

function reponsePour(url: string) {
  if (/\/streaming\/[^/]+\/artists\/[^/?]+/.test(url)) {
    return reponse(echecArtiste.status, echecArtiste.corps, 'text/plain; charset=utf-8');
  }
  return reponse(200, JSON.stringify(COLLECTIONS.test(url) ? [] : {}));
}

let hote: HTMLDivElement | null = null;
let monte: Record<string, any> | null = null;
let vus: string[] = [];
let desabonner: (() => void) | null = null;

const respirer = (ms = 80) => new Promise((r) => setTimeout(r, ms));

beforeEach(() => {
  echecArtiste = { status: 502, corps: BRUT_QOBUZ };
  vi.stubGlobal('fetch', vi.fn(async (url: string) => reponsePour(String(url))));
  vi.stubGlobal('WebSocket', class {
    close() {} addEventListener() {} removeEventListener() {} send() {}
  } as unknown as typeof WebSocket);
  // L'écran de départ importe peu : le geste porte `depuis = 'nowplaying'`.
  // (Monter la Lecture en cours elle-même exigerait `ResizeObserver`.)
  activeView.set('home');
  vueDeRetour.set(null);
  ficheArtisteService.set(null);
  vus = [];
  // Chaque message POUSSÉ PENDANT CE TEST, même s'il disparaît ensuite —
  // pas ceux qu'un essai précédent a laissés à l'écran.
  const deja = new Set(get(notifications).map((n) => n.id));
  desabonner = notifications.subscribe((liste) => {
    for (const n of liste) if (!deja.has(n.id) && !vus.includes(n.message)) vus.push(n.message);
  });
});

afterEach(() => {
  desabonner?.();
  desabonner = null;
  if (monte) unmount(monte);
  monte = null;
  if (hote) hote.remove();
  hote = null;
  vi.unstubAllGlobals();
});

/** Le clic artiste de la Lecture en cours, sur une piste de service. */
async function cliquerArtisteDepuisLaLecture(service: string, id: string, nom: string) {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(ShellV2, { target: hote });
  flushSync();
  await ouvrirArtisteDeServiceParNom({ service, nom, id }, 'nowplaying');
  flushSync();
  await respirer();
  flushSync();
  await respirer();
  flushSync();
  return hote;
}

describe('#992 — la page artiste ouverte depuis la Lecture en cours, service en échec', () => {
  it('502 du service : ni bandeau « Server error », ni texte brut ; un message clair et « Réessayer »', async () => {
    const page = await cliquerArtisteDepuisLaLecture('qobuz', '999999999999', 'Leprous');

    expect(get(activeView)).toBe('streamingartist');
    expect(get(vueDeRetour)).toBe('nowplaying');
    // Aucun bandeau d'erreur ne relaie la panne.
    expect(vus.filter((m) => /Server error|502|\/artist\/get/.test(m))).toEqual([]);
    // Rien de brut dans la page non plus.
    expect(page.textContent).not.toMatch(/502|Bad Gateway|\/artist\/get|"status":"error"/);

    const echec = page.querySelector('[data-echec-fiche]');
    expect(echec, 'la page dit elle-même que la fiche a échoué').toBeTruthy();
    expect(echec!.getAttribute('data-echec-fiche')).toBe('indisponible');
    expect(echec!.textContent).toContain(messageEchecFiche('indisponible', 'qobuz', get(t)));
    expect(echec!.textContent).toContain('Qobuz');
    expect(echec!.querySelector('button'), 'réessayer a un sens : le bouton est là').toBeTruthy();
  });

  it('404 (artiste inconnu du service) : « introuvable », sans bouton inutile', async () => {
    echecArtiste = { status: 404, corps: 'Not found: youtube artist UCxxxx992 not found' };
    const page = await cliquerArtisteDepuisLaLecture('youtube', 'UCxxxx992', 'Personne');

    expect(vus.filter((m) => /Server error|404|not found/i.test(m))).toEqual([]);
    const echec = page.querySelector('[data-echec-fiche]');
    expect(echec).toBeTruthy();
    expect(echec!.getAttribute('data-echec-fiche')).toBe('introuvable');
    expect(echec!.textContent).toContain(messageEchecFiche('introuvable', 'youtube', get(t)));
    expect(echec!.querySelector('button')).toBeNull();
  });
});
