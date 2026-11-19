// @vitest-environment jsdom
//
// web#3255 (validé par Bertrand le 19/11) — après la croix « Retirer » (#3245),
// deux suppressions partaient encore au premier clic :
//
//  1. « Supprimer de cette playlist » dans le menu « … » d'un titre (chemin
//     `retirerDe`), dans la fiche playlist ET dans l'écran complet ;
//  2. la suppression d'une playlist ENTIÈRE : mode « Éditer » de la fiche,
//     corbeille de la carte de l'écran complet, et menu « … » d'une playlist
//     (`gestesObjet`, qui confirmait déjà, mais sans nombre de titres, avec
//     « OK » par défaut).
//
// On MONTE les vrais composants et la vraie boîte du client (`DialogContainer`)
// et on lit les requêtes réellement émises :
//   - le geste ouvre la boîte, qui nomme ce qu'on supprime, et RIEN ne part ;
//   - « Annuler » est le bouton par défaut ; Annuler, Échap, Entrée → rien ;
//   - Confirmer → le MÊME appel qu'avant part.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import { get } from 'svelte/store';
import PlaylistDetailV2 from '../../components/v2/PlaylistDetailV2.svelte';
import PlaylistManagerView from '../../components/v2-heritage/PlaylistManagerView.svelte';
import DialogContainer from '../../components/partages/DialogContainer.svelte';
import { dialogs } from '../stores/dialogs';
import { locale, tn } from '../i18n';
import { currentZoneId, zones } from '../stores/zones';
import {
  pendingPlaylistId,
  playlists,
  playlistsLoaded,
  streamingPlaylistsCache,
  streamingPlaylistsLoaded,
} from '../stores/playlists';
import { gestesObjet, objetPlaylist } from '../gestesObjet';
import { entreeDuMenu, MENU_PISTE, ouvrirMenu } from './aides/menuFiche';
import lFr from '../locales/fr';

const fr = lFr as unknown as Record<string, string>;

vi.setConfig({ testTimeout: 60_000 });

interface Requete { method: string; url: string; body: any }
let requetes: Requete[] = [];
let lignes: any[] = [];

const LIGNES = [
  { id: 501, title: 'Nightswimming', artist_name: 'R.E.M.', album_title: 'Automatic for the People', album_id: 41, source: 'local', duration_ms: 258000, entry_id: 344 },
  { id: 502, title: 'Losing My Religion', artist_name: 'R.E.M.', album_title: 'Out of Time', album_id: 42, source: 'local', duration_ms: 268000, entry_id: 345 },
  { id: 503, title: 'Drive', artist_name: 'R.E.M.', album_title: 'Automatic for the People', album_id: 41, source: 'local', duration_ms: 271000, entry_id: 346 },
];
const PL = { id: 12, name: 'Réveil', description: null, track_count: 3, created_at: '2026-11-01T00:00:00Z', updated_at: '2026-11-01T00:00:00Z' };

class ObservateurInerte { observe() {} unobserve() {} disconnect() {} }
async function attendreQue(condition: () => boolean, quoi: string) {
  await vi.waitFor(
    () => {
      flushSync();
      if (!condition()) throw new Error(`attente expirée : ${quoi}`);
    },
    { timeout: 25_000, interval: 10 },
  );
}
const souffler = async () => { for (let i = 0; i < 8; i++) await new Promise((r) => setTimeout(r, 0)); flushSync(); };

let hote: HTMLDivElement | null = null;
let monte: Record<string, unknown> | null = null;
let boite: Record<string, unknown> | null = null;

beforeEach(() => {
  requetes = [];
  lignes = LIGNES.map((l) => ({ ...l }));
  try { localStorage.clear(); } catch { /* sans stockage */ }
  locale.set('fr');
  vi.stubGlobal('ResizeObserver', ObservateurInerte);
  vi.stubGlobal('IntersectionObserver', ObservateurInerte);
  vi.stubGlobal('WebSocket', class { close() {} addEventListener() {} removeEventListener() {} send() {} } as unknown as typeof WebSocket);
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    const method = (init?.method ?? 'GET').toUpperCase();
    let body: any = null;
    if (typeof init?.body === 'string') { try { body = JSON.parse(init.body); } catch { body = init.body; } }
    requetes.push({ method, url, body });
    let charge: unknown = [];
    if (method === 'POST' && url.endsWith('/playlists/12/tracks/remove')) {
      lignes = lignes.filter((l) => l.entry_id !== body?.entry_id);
      charge = { removed: 1 };
    } else if (method === 'DELETE') charge = { deleted: 1 };
    else if (method === 'GET' && url.includes('/playlists/12/tracks')) charge = lignes;
    else if (url.includes('/playlist-manager/services') || url.includes('/streaming/services')) charge = {};
    else if (method === 'GET' && /\/api\/v1\/playlists(\?|$)/.test(url)) charge = [PL];
    return {
      ok: true, status: 200, statusText: 'OK',
      headers: new Headers({ 'Content-Type': 'application/json' }),
      text: async () => JSON.stringify(charge),
      json: async () => charge,
    } as unknown as Response;
  }));
  hote = document.createElement('div');
  document.body.appendChild(hote);
  boite = mount(DialogContainer, { target: document.body });
});

afterEach(() => {
  for (const d of get(dialogs)) dialogs.settle(d.id, false);
  if (monte) unmount(monte);
  if (boite) unmount(boite);
  monte = null; boite = null;
  hote?.remove();
  hote = null;
  document.body.innerHTML = '';
  pendingPlaylistId.set(null);
  playlists.set([]);
  playlistsLoaded.set(false);
  streamingPlaylistsCache.set({});
  streamingPlaylistsLoaded.set(false);
  zones.set([]);
  currentZoneId.set(null);
  vi.unstubAllGlobals();
});

const retraits = () => requetes.filter((r) => r.method === 'POST' && r.url.includes('/tracks/remove'));
const suppressions = () => requetes.filter((r) => r.method === 'DELETE');
const laBoite = () => document.body.querySelector<HTMLElement>('[role="alertdialog"]');
const annuler = () => laBoite()!.querySelector<HTMLButtonElement>('button[data-dialog-annuler]')!;
const valider = () => laBoite()!.querySelector<HTMLButtonElement>('button[data-dialog-valider]')!;
const touche = (key: string) => { window.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true })); flushSync(); };
const titres = (n: number) => get(tn)('v2.common.trackCountN', n);

/** Les trois façons de dire non : le bouton par défaut, Échap, Entrée. */
async function refuserDeTroisFacons(declencher: () => Promise<void>) {
  await declencher();
  expect(document.activeElement, '« Annuler » n’est pas le bouton par défaut').toBe(annuler());
  annuler().click();
  await attendreQue(() => !laBoite(), 'la boîte fermée par « Annuler »');
  await declencher();
  touche('Escape');
  await attendreQue(() => !laBoite(), 'la boîte fermée par Échap');
  await declencher();
  touche('Enter');
  await attendreQue(() => !laBoite(), 'la boîte fermée par Entrée');
  await souffler();
}

/* ─────────────── (1) « Supprimer de cette playlist » (menu « … » d'un titre) ─────────────── */

async function ouvrirFiche(onClose: () => void = () => {}) {
  monte = mount(PlaylistDetailV2, { target: hote!, props: { item: { kind: 'local', pl: { ...PL } } as any, onClose } });
  await attendreQue(() => (hote!.textContent ?? '').includes('Losing My Religion'), 'les titres affichés');
}
/** Le « … » de la ligne `rang`, puis « Supprimer de cette playlist ». */
async function retirerParLeMenu(racine: HTMLElement, rang: number) {
  const ligne = [...racine.querySelectorAll<HTMLElement>('.trow')].filter((r) => r.querySelector(MENU_PISTE))[rang];
  expect(ligne, `pas de ligne ${rang}`).toBeTruthy();
  const menu = ouvrirMenu(ligne, MENU_PISTE);
  expect(menu, 'pas de menu « … » sur la ligne').toBeTruthy();
  const entree = [...menu!.querySelectorAll<HTMLElement>('[role^="menuitem"]')]
    .find((e) => e.textContent?.trim() === fr['v2.pl.removeFromThisPlaylist']);
  expect(entree, 'entrée « Supprimer de cette playlist » absente').toBeTruthy();
  entree!.click();
  await attendreQue(() => !!laBoite(), 'la boîte de confirmation');
}

describe('web#3255 (1) — « Supprimer de cette playlist » demande confirmation', () => {
  it('🔴 fiche : la boîte nomme le titre et la playlist, AUCUN retrait ne part', async () => {
    await ouvrirFiche();
    await retirerParLeMenu(hote!, 1);
    await souffler();
    expect(retraits(), 'le retrait est parti sans confirmation').toEqual([]);
    const attendu = fr['v2.pl.confirmRemoveAlbum']
      .replace('{title}', 'Losing My Religion').replace('{album}', 'Out of Time').replace('{playlist}', 'Réveil');
    expect(laBoite()!.textContent).toContain(attendu);
    expect(valider().textContent?.trim()).toBe(fr['v2.pl.remove']);
    expect(valider().classList.contains('danger')).toBe(true);
  });

  it('🔴 fiche : Annuler, Échap, Entrée → rien n’est retiré', async () => {
    await ouvrirFiche();
    await refuserDeTroisFacons(() => retirerParLeMenu(hote!, 0));
    expect(retraits()).toEqual([]);
    expect(hote!.textContent).toContain('Nightswimming');
  });

  it('🔴 fiche : « Retirer » → le même retrait qu’avant (entry_id de CETTE ligne)', async () => {
    await ouvrirFiche();
    await retirerParLeMenu(hote!, 2);
    valider().click();
    await attendreQue(() => retraits().length === 1, 'le retrait');
    expect(retraits()[0].url).toMatch(/\/api\/v1\/playlists\/12\/tracks\/remove$/);
    expect(retraits()[0].body).toEqual({ entry_id: 346 });
    await attendreQue(() => !(hote!.textContent ?? '').includes('Drive'), 'la ligne retirée');
  });

  it('🔴 écran complet : même question ; Annuler → rien, Retirer → le retrait part', async () => {
    monte = mount(PlaylistManagerView, { target: hote!, props: { onAddToPlaylist: () => {} } as any });
    await attendreQue(() => !!hote!.querySelector('.pl-grille .pl-carte'), 'la carte de la playlist');
    hote!.querySelector<HTMLButtonElement>('.pl-carte .pl-vignette button.ouvrir')!.click();
    await attendreQue(() => (hote!.textContent ?? '').includes('Losing My Religion'), 'les titres de la playlist');
    await retirerParLeMenu(hote!, 1);
    expect(laBoite()!.textContent).toContain('« Réveil »');
    annuler().click();
    await attendreQue(() => !laBoite(), 'la boîte fermée');
    await souffler();
    expect(retraits()).toEqual([]);
    await retirerParLeMenu(hote!, 1);
    valider().click();
    await attendreQue(() => retraits().length === 1, 'le retrait');
    expect(retraits()[0].body).toEqual({ entry_id: 345 });
  });
});

/* ─────────────────────── (2) supprimer une playlist ENTIÈRE ─────────────────────── */

async function supprimerDepuisLaFiche() {
  // Mode « Éditer » puis « Supprimer », tous deux dans le « … » de la fiche.
  entreeDuMenu(hote!, '[data-editer-playlist]')!.click();
  flushSync();
  const e = entreeDuMenu(hote!, '[data-supprimer-playlist]');
  expect(e, 'entrée « Supprimer » absente du mode Éditer').toBeTruthy();
  e!.click();
  await attendreQue(() => !!laBoite(), 'la boîte de confirmation');
}

describe('web#3255 (2) — supprimer une playlist demande confirmation', () => {
  it('🔴 fiche (mode Éditer) : nom, nombre de titres, « définitivement » ; bouton « Supprimer » destructif ; rien ne part', async () => {
    const fermer = vi.fn();
    await ouvrirFiche(fermer);
    await supprimerDepuisLaFiche();
    await souffler();
    expect(suppressions(), 'la playlist est supprimée sans confirmation').toEqual([]);
    const texte = laBoite()!.textContent ?? '';
    expect(texte).toContain(fr['playlist.deleteConfirmAsk'].replace('{name}', 'Réveil').replace('{tracks}', titres(3)));
    expect(texte).toContain('définitivement');
    expect(valider().textContent?.trim()).toBe(fr['common.delete']);
    expect(valider().classList.contains('danger')).toBe(true);
    expect(document.activeElement).toBe(annuler());
    expect(fermer).not.toHaveBeenCalled();
  });

  it('🔴 fiche : Annuler, Échap, Entrée → rien n’est supprimé, la fiche reste ouverte', async () => {
    const fermer = vi.fn();
    await ouvrirFiche(fermer);
    entreeDuMenu(hote!, '[data-editer-playlist]')!.click();
    flushSync();
    await refuserDeTroisFacons(async () => {
      entreeDuMenu(hote!, '[data-supprimer-playlist]')!.click();
      await attendreQue(() => !!laBoite(), 'la boîte de confirmation');
    });
    expect(suppressions()).toEqual([]);
    expect(fermer).not.toHaveBeenCalled();
  });

  it('🔴 fiche : « Supprimer » → DELETE /playlists/12, puis la fiche se ferme (comme avant)', async () => {
    const fermer = vi.fn();
    await ouvrirFiche(fermer);
    await supprimerDepuisLaFiche();
    valider().click();
    await attendreQue(() => fermer.mock.calls.length > 0, 'la fiche fermée');
    expect(suppressions().map((r) => r.url)).toEqual([expect.stringMatching(/\/api\/v1\/playlists\/12$/)]);
  });

  it('🔴 écran complet, corbeille de la carte : Annuler → rien ; Supprimer → DELETE /playlists/12', async () => {
    monte = mount(PlaylistManagerView, { target: hote!, props: { onAddToPlaylist: () => {} } as any });
    await attendreQue(() => !!hote!.querySelector('.pl-carte .pl-actions button.danger'), 'la corbeille de la carte');
    const corbeille = () => hote!.querySelector<HTMLButtonElement>('.pl-carte .pl-actions button.danger')!;
    await refuserDeTroisFacons(async () => {
      corbeille().click();
      await attendreQue(() => !!laBoite(), 'la boîte de confirmation');
    });
    expect(suppressions()).toEqual([]);
    corbeille().click();
    await attendreQue(() => !!laBoite(), 'la boîte de confirmation');
    expect(laBoite()!.textContent).toContain(fr['playlist.deleteConfirmAsk'].replace('{name}', 'Réveil').replace('{tracks}', titres(3)));
    expect(valider().textContent?.trim()).toBe(fr['common.delete']);
    valider().click();
    await attendreQue(() => suppressions().length === 1, 'la suppression');
    expect(suppressions()[0].url).toMatch(/\/api\/v1\/playlists\/12$/);
  });

  it('🔴 menu « … » d’une playlist (gestesObjet) : même question ; Annuler → rien ; Supprimer → DELETE', async () => {
    const g = gestesObjet(objetPlaylist({ ...PL }));
    g.supprimer!();
    await attendreQue(() => !!laBoite(), 'la boîte de confirmation');
    expect(laBoite()!.textContent).toContain(fr['playlist.deleteConfirmAsk'].replace('{name}', 'Réveil').replace('{tracks}', titres(3)));
    expect(document.activeElement).toBe(annuler());
    touche('Enter');
    await attendreQue(() => !laBoite(), 'la boîte fermée par Entrée');
    await souffler();
    expect(suppressions()).toEqual([]);
    g.supprimer!();
    await attendreQue(() => !!laBoite(), 'la boîte de confirmation');
    valider().click();
    await attendreQue(() => suppressions().length === 1, 'la suppression');
    expect(suppressions()[0].url).toMatch(/\/api\/v1\/playlists\/12$/);
  });

  it('nombre de titres inconnu : la question sans nombre, mais toujours « définitivement »', async () => {
    const g = gestesObjet(objetPlaylist({ id: 12, name: 'Réveil' }));
    g.supprimer!();
    await attendreQue(() => !!laBoite(), 'la boîte de confirmation');
    expect(laBoite()!.textContent).toContain(fr['playlist.deleteConfirmAskNoCount'].replace('{name}', 'Réveil'));
    expect(laBoite()!.textContent).not.toContain('{');
  });
});
