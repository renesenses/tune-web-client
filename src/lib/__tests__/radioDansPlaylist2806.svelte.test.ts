// @vitest-environment jsdom
//
// web#2806 — « Playlists : ajouter une radio à une playlist et afficher les
// lignes radio » (serveur tune-server-rust#8135, PR #8412, fil 2703).
//
// Contrat serveur :
//   - ajout : `POST /playlists/{id}/tracks` `{ radio_ids: [12], position: null }` ;
//   - liste : une ligne `{ id: null, source: 'radio', source_id: '12',
//     title: 'FIP', duration_ms: 0, radio: true, radio_id: 12,
//     unavailable: false, entry_id: 345 }` ;
//   - retrait / déplacement : comme toute ligne (`entry_id`, `positions`) ;
//   - lecture : `POST /zones/{id}/play` `{ playlist_id, start_index }`.
//
// On MONTE les vrais composants et on lit les requêtes réellement émises.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import { get } from 'svelte/store';
import AjoutAlbumPlaylistV2 from '../../components/v2/AjoutAlbumPlaylistV2.svelte';
import PlaylistDetailV2 from '../../components/v2/PlaylistDetailV2.svelte';
import RadioFicheModale from '../../components/partages/RadioFicheModale.svelte';
import { entreesObjet, objetAUnMenu, objetRadio } from '../gestesObjet';
import { demandeAjoutPlaylist } from '../demandeAjoutPlaylist';
import { estLigneRadio, radioIndisponible, sansRadios } from '../lignePlaylistRadio';
import { locale } from '../i18n';
import { currentZoneId } from '../stores/zones';
import lFr from '../locales/fr';

vi.setConfig({ testTimeout: 30_000 });

const fr = lFr as unknown as Record<string, string>;

interface Requete { method: string; url: string; body: any }
let requetes: Requete[] = [];
let reponses: [string, unknown][] = [];

class ObservateurInerte { observe() {} unobserve() {} disconnect() {} }
async function souffler(n = 10) {
  for (let i = 0; i < n; i++) { await new Promise((r) => setTimeout(r, 0)); flushSync(); }
}
async function attendreQue(condition: () => boolean, quoi: string) {
  await vi.waitFor(
    () => {
      flushSync();
      if (!condition()) throw new Error(`attente expirée : ${quoi}`);
    },
    { timeout: 25_000, interval: 10 },
  );
}

const FIP = {
  id: null, source: 'radio', source_id: '12', title: 'FIP', cover_path: 'https://logo/fip.png',
  duration_ms: 0, radio: true, radio_id: 12, unavailable: false, entry_id: 345,
};
const PARTIE = {
  id: null, source: 'radio', source_id: '13', title: 'Radio Partie', cover_path: null,
  duration_ms: 0, radio: true, radio_id: 13, unavailable: true, entry_id: 346,
};
const LIGNES = [
  { id: 501, title: 'Nightswimming', artist_name: 'R.E.M.', source: 'local', duration_ms: 258000, entry_id: 344 },
  FIP,
  PARTIE,
];
const MES_RADIOS = [
  { id: 12, name: 'FIP', stream_url: 'https://fip/stream' },
  { id: 14, name: 'TSF Jazz', stream_url: 'https://tsf/stream' },
];

let hote: HTMLDivElement | null = null;
let monte: Record<string, unknown> | null = null;

beforeEach(() => {
  requetes = [];
  reponses = [
    ['/playlists/12/tracks', LIGNES],
    ['/zones/1/play', { id: 1, name: 'Salon' }],
    ['/radios', MES_RADIOS],
    ['/playlists', [{ id: 12, name: 'Réveil', track_count: 3 }]],
  ];
  locale.set('fr');
  currentZoneId.set(1);
  demandeAjoutPlaylist.set(null);
  vi.stubGlobal('ResizeObserver', ObservateurInerte);
  vi.stubGlobal('IntersectionObserver', ObservateurInerte);
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    const method = (init?.method ?? 'GET').toUpperCase();
    let body: any = null;
    if (typeof init?.body === 'string') { try { body = JSON.parse(init.body); } catch { body = init.body; } }
    requetes.push({ method, url, body });
    const trouve = method === 'GET' ? reponses.find(([motif]) => url.includes(motif)) : undefined;
    const charge = trouve ? trouve[1] : {};
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
  document.querySelectorAll('.fond, .modal-backdrop').forEach((e) => e.remove());
  currentZoneId.set(null);
  demandeAjoutPlaylist.set(null);
  vi.unstubAllGlobals();
});

describe('lignePlaylistRadio', () => {
  it('reconnaît une ligne radio, indisponible ou non', () => {
    expect(estLigneRadio(FIP as any)).toBe(true);
    expect(estLigneRadio({ source: 'radio' } as any)).toBe(true);
    expect(estLigneRadio(LIGNES[0] as any)).toBe(false);
    expect(radioIndisponible(FIP as any)).toBe(false);
    expect(radioIndisponible(PARTIE as any)).toBe(true);
    expect(sansRadios(LIGNES as any).map((l: any) => l.title)).toEqual(['Nightswimming']);
  });
});

describe('(a) « Ajouter à une playlist » sur une radio de « Mes radios »', () => {
  it('🔴 le menu de la vignette porte l’entrée, et seulement elle', () => {
    const o = objetRadio({ id: 12, name: 'FIP' });
    expect(objetAUnMenu(o), 'une radio de « Mes radios » n’a pas de bouton de menu').toBe(true);
    expect(entreesObjet(o, (k) => k).map((e) => e.cle)).toEqual(['playlist.addToPlaylist']);
    // Sans identifiant (station pas encore dans « Mes radios ») : aucun menu.
    expect(objetAUnMenu(objetRadio({ id: null, name: 'X' }))).toBe(false);
  });

  it('🔴 le geste part en `radio_ids` vers la playlist Tune choisie', async () => {
    entreesObjet(objetRadio({ id: 12, name: 'FIP' }), (k) => k).find((e) => e.cle === 'playlist.addToPlaylist')!.faire();
    const d = get(demandeAjoutPlaylist);
    expect(d?.radioIds).toEqual([12]);
    monte = mount(AjoutAlbumPlaylistV2, { target: hote!, props: { demande: d!, onClose: () => {} } });
    await attendreQue(() => !!document.querySelector('.modal .playlist-list .playlist-option'), 'la liste des playlists');
    // Une radio ne va que chez Tune : pas de groupe de service.
    expect(document.querySelector('.pl-groupe[data-groupe="service"]')).toBeNull();
    document.querySelector<HTMLButtonElement>('.playlist-option[data-ou="tune"]')!.click();
    await attendreQue(() => requetes.some((r) => r.method === 'POST'), 'l’écriture');
    const w = requetes.find((r) => r.method === 'POST')!;
    expect(w.url).toMatch(/\/playlists\/12\/tracks$/);
    expect(w.body).toEqual({ radio_ids: [12], position: null });
  });

  it('🔴 la fiche d’une station de « Mes radios » pose la même demande', async () => {
    let ferme = false;
    monte = mount(RadioFicheModale, {
      target: hote!,
      props: { station: { id: 12, name: 'FIP', stream_url: 'https://fip/stream' } as any, onClose: () => { ferme = true; } },
    });
    await attendreQue(() => !!document.querySelector('[data-ajout-playlist]'), 'le bouton « Ajouter à une playlist »');
    const b = document.querySelector<HTMLButtonElement>('[data-ajout-playlist]')!;
    expect(b.getAttribute('aria-label')).toBe(fr['playlist.addToPlaylist']);
    b.click();
    expect(get(demandeAjoutPlaylist)).toEqual({ nom: 'FIP', radioIds: [12] });
    expect(ferme).toBe(true);
  });
});

async function ouvrirPlaylist() {
  monte = mount(PlaylistDetailV2, {
    target: hote!, props: { item: { kind: 'local', pl: { id: 12, name: 'Réveil', track_count: 3 } } as any, onClose: () => {} },
  });
  await attendreQue(() => (hote!.textContent ?? '').includes('Radio Partie'), 'les lignes affichées');
}
const ligne = (titre: string) =>
  [...hote!.querySelectorAll<HTMLElement>('.trow')].find((r) => r.textContent?.includes(titre))!;
const lecture = () => requetes.find((r) => r.method === 'POST' && /\/zones\/1\/play(\?|$)/.test(r.url));

describe('(b) les lignes radio dans la playlist', () => {
  it('🔴 une ligne radio dit « En direct », sans barre d’actions de piste', async () => {
    await ouvrirPlaylist();
    const r = ligne('FIP');
    expect(r.dataset.ligneRadio).toBe('true');
    expect(r.textContent).toContain(fr['v2.pl.radioLive']);
    expect(r.querySelector('.radio-ic')).not.toBeNull();
    expect(r.classList.contains('indispo')).toBe(false);
    // La piste voisine garde ses actions, la radio n'en a pas.
    const actionsPiste = ligne('Nightswimming').querySelectorAll('.td.act button').length;
    expect(actionsPiste).toBeGreaterThan(0);
    expect(r.querySelectorAll('.td.act button').length).toBe(0);
  });

  it('🔴 une station retirée de « Mes radios » est grisée et ne se lance pas', async () => {
    await ouvrirPlaylist();
    const r = ligne('Radio Partie');
    expect(r.classList.contains('indispo')).toBe(true);
    expect(r.querySelector('[data-radio-indisponible]')?.textContent).toBe(fr['v2.pl.radioUnavailable']);
    const titre = r.querySelector<HTMLButtonElement>('button.titre')!;
    expect(titre.disabled).toBe(true);
    titre.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await souffler();
    expect(lecture(), 'une station indisponible a été lancée').toBeUndefined();
  });

  it('🔴 en liste TRIÉE, cliquer la radio la lit encore par la playlist, à son rang réel', async () => {
    await ouvrirPlaylist();
    const tri = hote!.querySelector<HTMLSelectElement>('.tricol select')!;
    tri.value = 'title';
    tri.dispatchEvent(new Event('change', { bubbles: true }));
    flushSync();
    ligne('FIP').querySelector<HTMLButtonElement>('button.titre')!.click();
    await attendreQue(() => !!lecture(), 'la lecture');
    expect(lecture()!.body).toMatchObject({ playlist_id: 12, start_index: 1 });
    expect(lecture()!.body.track_ids).toBeUndefined();
  });

  it('🔴 « Ajouter à la file » n’envoie pas les radios comme des pistes', async () => {
    await ouvrirPlaylist();
    hote!.querySelector<HTMLButtonElement>('[data-lecture-options]')!.click();
    await attendreQue(() => !!document.querySelector('[data-ajouter-file]'), 'l’entrée « Ajouter à la file »');
    document.querySelector<HTMLElement>('[data-ajouter-file]')!.click();
    await attendreQue(() => requetes.some((r) => r.method === 'POST' && /\/zones\/1\/queue\/add/.test(r.url)), 'la file');
    const corps = requetes.find((r) => /\/zones\/1\/queue\/add/.test(r.url))!.body;
    expect(JSON.stringify(corps)).not.toContain('"radio"');
    expect(corps.track_ids).toEqual([501]);
  });

  it('🔴 cliquer la radio la lit par la playlist, à son rang réel', async () => {
    await ouvrirPlaylist();
    ligne('FIP').querySelector<HTMLButtonElement>('button.titre')!.click();
    await attendreQue(() => !!lecture(), 'la lecture');
    expect(lecture()!.body).toMatchObject({ playlist_id: 12, start_index: 1 });
  });

  it('🔴 « Aléatoire » n’envoie pas les radios comme des pistes', async () => {
    await ouvrirPlaylist();
    [...hote!.querySelectorAll<HTMLButtonElement>('button')].find((x) => x.getAttribute('title') === fr['library.shuffle'])!.click();
    await attendreQue(() => !!lecture(), 'la lecture');
    const corps = JSON.stringify(lecture()!.body);
    expect(corps).not.toContain('"radio"');
    expect(lecture()!.body.track_ids).toEqual([501]);
  });

  it('🔴 retirer une station indisponible désigne son `entry_id`, hors mode édition', async () => {
    await ouvrirPlaylist();
    const rm = ligne('Radio Partie').querySelector<HTMLButtonElement>('button.rm')!;
    expect(rm, 'pas de bouton « Retirer » sur la station indisponible').toBeTruthy();
    rm.click();
    await attendreQue(() => requetes.some((r) => r.method === 'POST' && r.url.endsWith('/tracks/remove')), 'le retrait');
    expect(requetes.find((r) => r.url.endsWith('/tracks/remove'))!.body).toEqual({ entry_id: 346 });
  });
});

describe('(c) l’éditeur ajoute une radio de « Mes radios »', () => {
  it('🔴 « Ajouter une radio » liste « Mes radios » et poste `radio_ids`', async () => {
    await ouvrirPlaylist();
    // Entrer en édition par le menu « … ».
    hote!.querySelector<HTMLButtonElement>('[data-menu-playlist]')!.click();
    await attendreQue(() => !!document.querySelector('[data-editer-playlist]'), 'l’entrée « Modifier »');
    document.querySelector<HTMLElement>('[data-editer-playlist]')!.click();
    await attendreQue(() => !!hote!.querySelector('[data-bouton-ajouter-radio]'), 'le bouton « Ajouter une radio »');
    hote!.querySelector<HTMLButtonElement>('[data-bouton-ajouter-radio]')!.click();
    await attendreQue(() => document.querySelectorAll('[data-choix-radio] .station').length === 2, 'les stations');
    document.querySelector<HTMLButtonElement>('[data-choix-radio] .station[data-radio-id="14"]')!.click();
    await attendreQue(() => requetes.some((r) => r.method === 'POST' && /\/playlists\/12\/tracks$/.test(r.url)), 'l’ajout');
    const w = requetes.find((r) => r.method === 'POST' && /\/playlists\/12\/tracks$/.test(r.url))!;
    expect(w.body).toEqual({ radio_ids: [14], position: null });
    await souffler();
    expect(document.querySelector('[data-choix-radio]')).toBeNull();
  });
});
