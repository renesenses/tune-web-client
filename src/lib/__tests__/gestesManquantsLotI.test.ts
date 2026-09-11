// @vitest-environment jsdom
//
// Deux surfaces qui devaient porter un geste partagé et ne le portaient pas.
//
// 🔴 CES TÉMOINS REGARDENT LE DOM ET LES APPELS, PAS LE TEXTE DU SOURCE.
// C'est la leçon de la PR #832 du 11/09 : une garde qui cherche une chaîne
// dans un composant reste verte quand le code ne s'exécute pas.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import QueueV2 from '../../components/v2/QueueV2.svelte';
import AlbumDetailV2 from '../../components/v2/AlbumDetailV2.svelte';
import { gestesNavigationService } from '../stores/navigation';
import { currentZoneId, zones } from '../stores/zones';
// 🔴 `QueueV2` ne lit PAS `fetch` pour sa file : elle vient des magasins
// `queueTracks` / `queuePosition`. Bouchonner le réseau ne suffisait pas — le
// bloc « En cours » ne se rendait pas, et le témoin le disait lui-même
// (« témoin sans objet ») au lieu de passer à côté en silence.
import { queueTracks, queuePosition } from '../stores/queue';

const PISTE = {
  id: 7, title: 'Bohemian Rhapsody', artist_name: 'Queen',
  album_title: 'A Night at the Opera', duration_ms: 312000, source: 'local',
};

let hote: HTMLDivElement | null = null;
let monte: Record<string, any> | null = null;
let ouvertures: any[] = [];

function corps(url: string) {
  if (url.includes('/queue')) {
    // 🔴 `reload()` lit `qs.tracks`, pas `qs.items` : le premier bouchon
    // rendait une file VIDE et l'écran affichait son état « vide ». Le témoin
    // l'a dit (« témoin sans objet ») au lieu de passer à côté en silence.
    return { tracks: [PISTE, { ...PISTE, id: 8, title: 'Love of My Life' }], position: 0 };
  }
  return /\/(zones|profiles|devices|playlists|shortcuts|tracks|albums)/.test(url) ? [] : {};
}

beforeEach(() => {
  ouvertures = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string) => ({
    ok: true, status: 200, statusText: 'OK',
    headers: new Map([['content-type', 'application/json']]),
    json: async () => corps(String(url)), text: async () => JSON.stringify(corps(String(url))),
  } as unknown as Response)));
  vi.stubGlobal('WebSocket', class { close(){} addEventListener(){} removeEventListener(){} send(){} } as any);
  vi.stubGlobal('ResizeObserver', class { observe(){} unobserve(){} disconnect(){} } as any);
  zones.set([{ id: 1, name: 'Salon', state: 'playing', current_track: PISTE }] as any);
  currentZoneId.set(1);
  queueTracks.set([PISTE, { ...PISTE, id: 8, title: 'Love of My Life' }] as any);
  queuePosition.set(0);
  gestesNavigationService.set({ ouvrirAlbum: () => {}, ouvrirArtiste: (c) => ouvertures.push(c) });
});

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  if (hote) hote.remove();
  hote = null;
  gestesNavigationService.set(null);
  vi.unstubAllGlobals();
});

const poser = (C: any, props: any = {}) => {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(C, { target: hote, props });
  flushSync();
  return hote;
};
const respirer = (ms = 200) => new Promise((r) => setTimeout(r, ms));

describe('#3780 — la piste EN COURS porte les mêmes gestes que les suivantes', () => {
  it('le bloc « En cours » monte la barre d’actions', async () => {
    const h = poser(QueueV2);
    await respirer();
    flushSync();
    const bloc = h.querySelector('.now');
    expect(bloc, 'le bloc « En cours » n’est pas rendu — témoin sans objet').not.toBeNull();
    /*
     * FabienM, fil 1739 point 6 : « Menu file d'attente : il manque les
     * actions comme sur l'interface actuelle. » Chaque ligne « à suivre »
     * portait la barre ; la seule ligne qu'on regarde à coup sûr ne la portait
     * PAS. On compte les boutons, on ne lit pas le source.
     */
    const boutons = bloc!.querySelectorAll('button');
    expect(boutons.length, 'aucune action sur la piste en cours').toBeGreaterThan(0);
  });
});

describe("#3708 — le nom d'artiste d'un album de SERVICE mène à sa fiche", () => {
  const ALBUM_QOBUZ = {
    id: null, title: 'Malina', artist_name: 'Leprous', artist_id: null,
    source: 'qobuz', source_id: 'q-alb-7', cover_path: null,
  };

  it('le nom est un LIEN, et il ouvre la fiche artiste du service', async () => {
    const h = poser(AlbumDetailV2, { album: ALBUM_QOBUZ, service: 'qobuz', onClose: () => {} });
    await respirer();
    flushSync();
    const lien = h.querySelector<HTMLButtonElement>('button.artist.lien');
    expect(lien, 'le nom d’artiste est resté du texte inerte').not.toBeNull();
    lien!.click();
    await respirer();
    expect(ouvertures, 'aucune fiche artiste demandée').toHaveLength(1);
    expect(ouvertures[0]).toMatchObject({ service: 'qobuz', nom: 'Leprous' });
  });

  it("🔴 sans geste armé par la coquille, le nom RESTE du texte — un lien mort serait pire", async () => {
    // C'est l'arbitrage d'origine, et il tient toujours : l'ancienne coquille
    // n'a pas cet écran, elle n'arme rien, le nom ne doit pas devenir cliquable.
    gestesNavigationService.set(null);
    const h = poser(AlbumDetailV2, { album: ALBUM_QOBUZ, service: 'qobuz', onClose: () => {} });
    await respirer();
    flushSync();
    expect(h.querySelector('button.artist.lien')).toBeNull();
    expect(h.querySelector('.artist')).not.toBeNull();
  });
});
