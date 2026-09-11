// @vitest-environment jsdom
//
// « Retrouver l'album Qobuz en cours de lecture » — #1361 (promesse du 03/07
// non tenue), et la moitié « album » de #3626.
//
// FabienM, fil forum 1739, point 5 : « quand on clique sur l'hyperlien de
// l'album cela renvoie au menu bibliothèque locale mais c'est vide si on a pas
// l'album dans sa bibliothèque locale. Il faut une page album pour les albums
// provenant du streaming ».
//
// `NowPlaying.navigateToAlbum` interrogeait `searchLibrary` dès qu'il manquait
// un `album_id` LOCAL — c'est-à-dire pour toute piste de service. Pour un album
// qu'on ne possède pas, il ne pouvait rien trouver.
//
// 🔴 La piste portait déjà la réponse : `StreamTrack.album_id`
// (`tune-core/src/streaming/traits.rs:14`). Elle était masquée par un type —
// `Track.album_id` est déclaré `number | null`, alors que le fil envoie une
// CHAÎNE pour une piste de service.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import { get } from 'svelte/store';
import { destinationAlbum } from '../routageAlbum';
import ShellV2 from '../../components/v2/ShellV2.svelte';
import { activeView, vueDeRetour } from '../stores/navigation';
import { ficheAlbumService } from '../stores/streaming';

// ⚠️ Ces six témoins restent JUSTES, mais leur portée a changé.
// `destinationAlbum` sert les LISTES de pistes — recherche, file d'attente,
// menu « … » — où une piste de service est un `StreamTrack` et porte bien
// `album_id: Option<String>`. Il ne sert PLUS « Lecture en cours », dont la
// piste est un `NowPlaying` au `album_id: i64`.
describe('#1361 — la décision, appelée et non lue (listes de pistes)', () => {
  it("une piste de SERVICE mène à l'album du service, sans passer par la bibliothèque", () => {
    expect(destinationAlbum({ source: 'qobuz', album_id: 'q-alb-7', album_title: 'Malina' }))
      .toEqual({ type: 'album-service', service: 'qobuz', albumId: 'q-alb-7', titre: 'Malina' });
  });

  it("un identifiant distant NUMÉRIQUE reste un identifiant distant", () => {
    // Deezer numérote ses albums. Le lire comme une clé locale enverrait vers
    // un album de la bibliothèque portant ce numéro — pire qu'un lien mort.
    expect(destinationAlbum({ source: 'deezer', album_id: 12345, album_title: 'X' }))
      .toEqual({ type: 'album-service', service: 'deezer', albumId: '12345', titre: 'X' });
  });

  it("une piste LOCALE garde son chemin d'avant", () => {
    expect(destinationAlbum({ source: 'local', album_id: 42, album_title: 'Homogenic' }))
      .toEqual({ type: 'album', albumId: 42 });
    expect(destinationAlbum({ source: 'local', album_id: null, album_title: 'Homogenic' }))
      .toEqual({ type: 'album-par-titre', titre: 'Homogenic' });
  });

  it("une RADIO n'a aucun identifiant et ne restreint pas le périmètre", () => {
    // L'album peut être en bibliothèque comme chez un service : un périmètre
    // posé ici masquerait un album qu'on possède.
    expect(destinationAlbum({ source: 'radio', album_id: null, album_title: 'Kind of Blue' }))
      .toEqual({ type: 'recherche', requete: 'Kind of Blue', source: null });
  });

  it('un service SANS identifiant d\'album retombe sur la recherche, périmètre ouvert sur lui', () => {
    expect(destinationAlbum({ source: 'qobuz', album_id: null, album_title: 'Pitfalls' }))
      .toEqual({ type: 'recherche', requete: 'Pitfalls', source: 'qobuz' });
  });

  it('sans rien à montrer, aucun geste plutôt qu\'un geste mort', () => {
    expect(destinationAlbum({ source: 'qobuz', album_id: null, album_title: '' })).toBeNull();
    expect(destinationAlbum(null)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Le branchement : la coquille monte bien la vue et consomme le dépôt.
// ---------------------------------------------------------------------------
const COLLECTIONS =
  /\/(profiles|zones|playlists|devices|shortcuts|collections|tags|favorites|history|radios|podcasts|artists|albums|tracks|top-artists|recent|genres)(\?|\/|$)/;

let urls: string[] = [];
let hote: HTMLDivElement | null = null;
let monte: Record<string, any> | null = null;

beforeEach(() => {
  urls = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    urls.push(String(url));
    const corps = COLLECTIONS.test(String(url)) ? [] : {};
    return {
      ok: true, status: 200, statusText: 'OK',
      headers: new Map([['content-type', 'application/json']]),
      json: async () => corps, text: async () => JSON.stringify(corps),
    } as unknown as Response;
  }));
  vi.stubGlobal('WebSocket', class {
    close() {} addEventListener() {} removeEventListener() {} send() {}
  } as unknown as typeof WebSocket);
  activeView.set('home');
  vueDeRetour.set(null);
  ficheAlbumService.set(null);
});

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  if (hote) hote.remove();
  hote = null;
  vi.unstubAllGlobals();
});

describe('#1361 — la coquille v2 porte la fiche album de service', () => {
  it('la vue est MONTÉE et interroge le service, pas la bibliothèque', async () => {
    hote = document.createElement('div');
    document.body.appendChild(hote);
    monte = mount(ShellV2, { target: hote });
    flushSync();

    ficheAlbumService.set({ service: 'qobuz', id: 'q-alb-7', titre: 'Malina' });
    activeView.set('streamingalbum');
    flushSync();
    await new Promise((r) => setTimeout(r, 60));
    flushSync();

    // Le repli « À venir » signerait une vue non montée.
    expect(hote.textContent).not.toMatch(/À venir/i);
    // Et surtout : on ne va PAS chercher l'album dans la bibliothèque locale.
    expect(urls.some((u) => /\/library\/search|searchLibrary/.test(u))).toBe(false);
    expect(get(ficheAlbumService)?.id).toBe('q-alb-7');
  });
});

// ---------------------------------------------------------------------------
// La moitié « aller », dans le composant PARTAGÉ par les deux coquilles.
// ---------------------------------------------------------------------------
describe('#1361 — ce que ce fichier NE garde PLUS, et pourquoi', () => {
  it("🔴 la moitié « aller » est passée à un témoin qui regarde le RÉSEAU", async () => {
    /*
     * CE TÉMOIN A DONNÉ UN FAUX VERT, ET C'EST SA LEÇON.
     *
     * Il cherchait la chaîne `if (!albumId && onOuvrirAlbumService) {` dans le
     * source de `NowPlaying`. Elle y était. Le détournement, lui, ne se
     * produisait JAMAIS : il lisait `displayTrack.album_id` en espérant
     * l'identifiant de l'album chez le service, alors que ce champ est un
     * `i64` de la table `albums` — `null` sur toute piste de service.
     *
     * Un texte présent ne prouve pas qu'il s'exécute, et les six témoins
     * ci-dessus nourrissaient `destinationAlbum` d'une chaîne qu'ils
     * fournissaient eux-mêmes : ils éprouvaient la décision, jamais ce que
     * l'appelant lui passe.
     *
     * `albumEnCours1361.test.ts` monte l'écran, clique le titre d'album et
     * regarde l'URL demandée. Contre-épreuve faite : avec l'ancien code, il
     * rend « aucune fiche ouverte : expected +0 to be 1 ».
     */
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const garde = readFileSync(resolve(process.cwd(), 'src/lib/__tests__/albumEnCours1361.test.ts'), 'utf-8');
    expect(garde).toContain("/zones/1/album-en-cours");
    // Et `NowPlaying` ne lit plus le champ qui mentait.
    const np = readFileSync(resolve(process.cwd(), 'src/components/NowPlaying.svelte'), 'utf-8');
    expect(np).not.toContain('destinationAlbum({');
    expect(np).toContain('api.getZoneCurrentAlbum(zid)');
  });
});
