// @vitest-environment jsdom
//
// web#1922 — FabienM, fil 2143, point 2 (v1.0.0-rc2) : « Les raccourcis sont
// limités à l'accueil d'un menu. Il est impossible par exemple de définir un
// raccourci sur un sous menu, sur une playlist ouverte, un album ouvert, une
// page artiste... »
//
// La fiche ouverte se déclare comme cible depuis #1918, et le signet de la
// coquille la fige. Ce lot ajoute l'entrée « Ajouter aux raccourcis » au menu
// « … » des objets, avec le MÊME formulaire et la MÊME cible :
//   1. la proposition, objet par objet : même clé et même vue que la fiche ;
//   2. l'entrée existe quand l'objet se désigne, et seulement alors ;
//   3. l'entrée ouvre le formulaire du signet, prérempli, et le raccourci posé
//      retient l'OBJET, pas l'écran d'où vient le menu ;
//   4. ce raccourci se rouvre par le chemin de la fiche.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import { get } from 'svelte/store';
import ShellV2 from '../../components/v2/ShellV2.svelte';
import {
  addShortcut, navigateToShortcut, raccourciPropose, shortcuts, proposerRaccourci, type Shortcut,
} from '../stores/shortcuts';
import { activeView, pendingLibraryAlbum, vueDeRetour } from '../stores/navigation';
import { ficheAlbumService } from '../stores/streaming';
import { propositionRaccourciObjet } from '../raccourciObjet';
import { cibleRaccourciAlbum } from '../raccourciAlbum';
import { cibleRaccourciArtiste } from '../raccourciArtiste';
import {
  entreesObjet, objetAlbum, objetArtiste, objetCollection, objetLabel, objetPlaylist, objetPlaylistIntelligente,
} from '../gestesObjet';
import { locale } from '../i18n';

vi.setConfig({ testTimeout: 30_000 });

const ALBUM_LOCAL = { id: 55, title: '101 (CD1)', artist_id: 994, artist_name: 'Depeche Mode', source: 'local' };
const ALBUM_QOBUZ = { source: 'qobuz', source_id: 'p0d55tt7gv3lc', title: 'Chris Craft', artist_name: 'Chris Connor', artist_id: '12', cover_path: 'https://x/c.jpg' };

const identite = (k: string) => k;
const cles = (o: any) => entreesObjet(o, identite).map((e) => e.cle);

let configEnvoyee: any[] = [];

function reponse(corps: unknown) {
  return {
    ok: true, status: 200, statusText: 'OK',
    headers: new Map([['content-type', 'application/json']]),
    json: async () => corps, text: async () => JSON.stringify(corps),
  } as unknown as Response;
}

const LISTES = /\/(profiles|zones|playlists|devices|shortcuts|collections|tags|favorites|history|radios|podcasts|artists|albums|tracks|top-artists|recent|genres)(\?|\/|$)/;

beforeEach(() => {
  locale.set('fr');
  configEnvoyee = [];
  vi.stubGlobal('fetch', vi.fn(async (url: any, init?: any) => {
    const u = String(typeof url === 'string' ? url : url?.url ?? '');
    if (u.includes('/system/config') && init?.method === 'PATCH') {
      configEnvoyee.push(JSON.parse(init.body));
      return reponse({});
    }
    return reponse(LISTES.test(u) ? [] : {});
  }));
  vi.stubGlobal('WebSocket', class { close() {} addEventListener() {} removeEventListener() {} send() {} } as any);
  activeView.set('home');
  shortcuts.set([]);
  raccourciPropose.set(null);
  pendingLibraryAlbum.set(null);
  ficheAlbumService.set(null);
  vueDeRetour.set(null);
});

let hote: HTMLDivElement | null = null;
let monte: Record<string, any> | null = null;

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  hote?.remove();
  hote = null;
  vi.unstubAllGlobals();
});

const respirer = async () => {
  for (let i = 0; i < 4; i++) { await new Promise((r) => setTimeout(r, 0)); flushSync(); }
};

describe('web#1922 — la proposition, objet par objet', () => {
  it('🔴 un album : la clé et la vue que la fiche publierait (bibliothèque et service)', () => {
    const local = propositionRaccourciObjet(objetAlbum(ALBUM_LOCAL));
    const fiche = cibleRaccourciAlbum({ album: ALBUM_LOCAL });
    expect(local).toMatchObject({ view: 'library', state: { target: { key: fiche!.key } }, label: '101 (CD1)' });
    expect(local!.state.target.restore).toEqual(fiche!.restore);

    const qobuz = propositionRaccourciObjet(objetAlbum(ALBUM_QOBUZ));
    const ficheQ = cibleRaccourciAlbum({ album: ALBUM_QOBUZ, service: 'qobuz' });
    expect(qobuz).toMatchObject({ view: 'streamingalbum', state: { target: { key: 'album:qobuz:p0d55tt7gv3lc' } } });
    expect(qobuz!.state.target.key).toBe(ficheQ!.key);
    expect(qobuz!.state.target.restore.fiche).toMatchObject({ service: 'qobuz', id: 'p0d55tt7gv3lc', titre: 'Chris Craft' });
  });

  it('un artiste : la page commune (#1501), même clé que la page', () => {
    const local = propositionRaccourciObjet(objetArtiste({ id: 994, name: 'Depeche Mode', source: 'local' }));
    expect(local).toMatchObject({ view: 'streamingartist', state: { target: { key: 'artiste:local:994' } } });
    const svc = propositionRaccourciObjet(objetArtiste({ source: 'qobuz', source_id: '12', name: 'Chris Connor' }));
    expect(svc!.state.target.key).toBe(cibleRaccourciArtiste({ service: 'qobuz', id: '12' })!.key);
    expect(svc!.state.target.restore).toMatchObject({ source: 'qobuz', source_id: '12' });
  });

  it('playlists, playlist intelligente, collections : les clés des écrans qui les rouvrent', () => {
    expect(propositionRaccourciObjet(objetPlaylist({ id: 42, name: 'Nocturnes' })))
      .toMatchObject({ view: 'playlistmanager', state: { target: { key: 'playlists:42', restore: { id: 42 } } } });
    const q = propositionRaccourciObjet(objetPlaylist({ source: 'qobuz', source_id: '777', name: 'Cosy Jazz' }));
    expect(q).toMatchObject({ view: 'playlistmanager', state: { target: { key: 'streamingplaylists:qobuz:777' } } });
    expect(q!.state.target.restore).toMatchObject({ kind: 'streaming', service: 'qobuz', pl: { source_id: '777', name: 'Cosy Jazz' } });
    expect(propositionRaccourciObjet(objetPlaylistIntelligente({ id: 3, name: 'X' })))
      .toMatchObject({ view: 'smartplaylists', state: { target: { key: 'smartplaylists:3' } } });
    expect(propositionRaccourciObjet(objetCollection({ id: 1, name: 'favorites' }, false))!.state.target.key).toBe('collections:1');
    expect(propositionRaccourciObjet(objetCollection({ id: 1, name: 'Audiophile' }, true))!.state.target.key).toBe('smartcollections:1');
  });

  it('ce qui ne se désigne pas n’a pas de proposition', () => {
    expect(propositionRaccourciObjet(objetLabel('ECM'))).toBeNull();
    expect(propositionRaccourciObjet(objetArtiste({ name: 'Inconnu' }))).toBeNull();
    expect(propositionRaccourciObjet(objetAlbum({ source: 'bandcamp', url: 'https://x.bandcamp.com/album/y', title: 'Y' }))).toBeNull();
    expect(propositionRaccourciObjet(objetAlbum({ title: 'Sans désignation' }))).toBeNull();
  });
});

describe('web#1922 — l’entrée du menu « … »', () => {
  it('🔴 présente sur un album, un artiste, une playlist, une collection ; absente sur un label', () => {
    expect(cles(objetAlbum(ALBUM_LOCAL))).toContain('menuObjet.addShortcut');
    expect(cles(objetAlbum(ALBUM_QOBUZ))).toContain('menuObjet.addShortcut');
    expect(cles(objetArtiste({ id: 994, name: 'DM', source: 'local' }))).toContain('menuObjet.addShortcut');
    expect(cles(objetPlaylist({ id: 42, name: 'N' }))).toContain('menuObjet.addShortcut');
    expect(cles(objetPlaylistIntelligente({ id: 3, name: 'X' }))).toContain('menuObjet.addShortcut');
    expect(cles(objetCollection({ id: 1, name: 'C' }, false))).toContain('menuObjet.addShortcut');
    expect(cles(objetLabel('ECM'))).not.toContain('menuObjet.addShortcut');
  });

  it('le geste propose le raccourci à la coquille, sans rien poser lui-même', () => {
    const e = entreesObjet(objetAlbum(ALBUM_LOCAL), identite).find((x) => x.cle === 'menuObjet.addShortcut');
    e!.faire();
    expect(get(raccourciPropose)).toMatchObject({ view: 'library', state: { target: { key: 'album:local:55' } } });
    expect(get(shortcuts)).toEqual([]);
  });
});

describe('web#1922 — le formulaire du signet, ouvert par le menu', () => {
  it('🔴 prérempli du nom ; le raccourci posé retient l’OBJET, pas l’écran courant', async () => {
    activeView.set('search');
    hote = document.createElement('div');
    document.body.appendChild(hote);
    monte = mount(ShellV2, { target: hote });
    flushSync();
    await respirer();

    proposerRaccourci(propositionRaccourciObjet(objetAlbum(ALBUM_QOBUZ)));
    await respirer();
    const champ = hote.querySelector<HTMLInputElement>('#rc-nom');
    expect(champ, 'l’entrée du menu n’ouvre pas le formulaire du signet').not.toBeNull();
    expect(champ!.value).toBe('Chris Craft');
    expect(hote.querySelector('.rc-cible')?.textContent).toContain('Chris Craft');

    hote.querySelector<HTMLFormElement>('form.rc')!.requestSubmit();
    await respirer();
    const poses = get(shortcuts);
    expect(poses).toHaveLength(1);
    expect(poses[0]).toMatchObject({ name: 'Chris Craft', view: 'streamingalbum', state: { target: { key: 'album:qobuz:p0d55tt7gv3lc' } } });
    expect(configEnvoyee.length).toBeGreaterThan(0);
    expect(hote.querySelector('#rc-nom'), 'le formulaire reste ouvert').toBeNull();
  });

  it('refermé sans poser, le signet suivant revient à l’écran courant', async () => {
    activeView.set('search');
    hote = document.createElement('div');
    document.body.appendChild(hote);
    monte = mount(ShellV2, { target: hote });
    flushSync();
    await respirer();
    proposerRaccourci(propositionRaccourciObjet(objetAlbum(ALBUM_LOCAL)));
    await respirer();
    hote.querySelector<HTMLElement>('.rc-fond')!.click();
    await respirer();
    hote.querySelector<HTMLButtonElement>('button.raccourci')!.click();
    await respirer();
    expect(hote.querySelector<HTMLInputElement>('#rc-nom')!.value).toBe('');
    expect(hote.querySelector('.rc-cible')).toBeNull();
  });
});

describe('web#1922 — le raccourci posé depuis le menu se rouvre comme celui de la fiche', () => {
  it('un album de la bibliothèque rouvre sa fiche ; un second dépôt ne fait pas doublon', async () => {
    const p = propositionRaccourciObjet(objetAlbum(ALBUM_LOCAL))!;
    const sc = (await addShortcut('101', '⭐', { view: p.view, state: p.state })) as Shortcut;
    await addShortcut('101 bis', '⭐', { view: p.view, state: p.state });
    expect(get(shortcuts)).toHaveLength(1);
    activeView.set('home');
    navigateToShortcut(sc);
    expect(get(pendingLibraryAlbum)).toBe(55);
    expect(get(activeView)).toBe('library');
  });

  it('un album Qobuz rouvre la fiche de service', async () => {
    const p = propositionRaccourciObjet(objetAlbum(ALBUM_QOBUZ))!;
    const sc = (await addShortcut('CC', '⭐', { view: p.view, state: p.state })) as Shortcut;
    activeView.set('home');
    navigateToShortcut(sc);
    expect(get(activeView)).toBe('streamingalbum');
    expect(get(ficheAlbumService)).toMatchObject({ service: 'qobuz', id: 'p0d55tt7gv3lc' });
  });
});
