// @vitest-environment jsdom
//
// ══════════════════════════════════════════════════════════════════════════
// 🔴 Fil forum 1906 (FabienM, v0.9.163, Windows) — « ALLER À L'ALBUM » ABSENT.
//
// Capture : le menu « … » d'un titre Qobuz affiche Lire, Lire ensuite, Ajouter
// à la file, Ajouter à une playlist, Aller à l'artiste, Étiquettes — pas
// « Aller à l'album ». La capacité existe (`menuPiste.ts`, #3777) ; ce qui
// manquait, c'est l'album de la piste chez son service, que certains appelants
// ne savaient pas produire :
//
//   1. L'HISTORIQUE. `/library/history` sert `album_id` = `i64` de la table
//      `albums`, `null` pour toute piste de service. L'album n'est pourtant pas
//      perdu quand l'écoute a été lancée DEPUIS lui : `context_type = 'album'`,
//      `context_id` = son identifiant chez le service — la première règle du
//      serveur lui-même pour l'album en cours (`zones.rs`, `album_en_cours`).
//   2. `MenuPisteV1` (client actuel) tenait une COPIE de la règle, qui avait
//      déjà divergé : ni pochette (#1342), ni artiste (#1361 bis).
//
// La règle ne vit plus qu'une fois : `routageAlbum.albumDeServiceDe`. Cette
// garde l'appelle, puis MONTE chaque surface et ouvre son menu.
// ══════════════════════════════════════════════════════════════════════════
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import PisteActions from '../../components/v2/PisteActions.svelte';
import MenuPisteV1 from '../../components/partages/MenuPisteV1.svelte';
import { gestesNavigationService } from '../stores/navigation';
import { currentZoneId } from '../stores/zones';
import { albumDeServiceDe } from '../routageAlbum';
import { entreesDepuisServeur } from '../historiqueLecture';

vi.setConfig({ testTimeout: 30_000 });

const SID = 'atua1kxxk4tis';
const POCHETTE = `https://static.qobuz.com/images/covers/is/4t/${SID}_600.jpg`;
const QOBUZ_AVEC_ALBUM = {
  id: null, source_id: '441078583', title: 'Second Song', source: 'qobuz',
  artist_name: 'Neil Young', artist_id: '35865',
  album_title: 'Second Song', album_id: SID, cover_path: POCHETTE, duration_ms: 360000,
};
const QOBUZ_SANS_ALBUM = { ...QOBUZ_AVEC_ALBUM, album_id: null };

/** Une ligne de `/library/history`, telle que le serveur la sert. */
const ligneHistorique = (extra: Record<string, unknown> = {}) => ({
  id: 1, track_id: null, title: 'Second Song', artist_name: 'Neil Young',
  album_title: 'Second Song', source: 'qobuz', source_id: '441078583',
  album_id: null, duration_ms: 360000, listened_at: '2026-09-23T20:00:00Z',
  zone_id: 1, cover_url: POCHETTE, context_type: null, context_id: null,
  context_position: null, ...extra,
});

const ouvrirAlbum = vi.fn();
const ouvrirArtiste = vi.fn();
let hote: HTMLDivElement | null = null;
let monte: Record<string, any> | null = null;

function poser(composant: any, props: Record<string, unknown>): HTMLDivElement {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(composant, { target: hote, props: props as any });
  flushSync();
  return hote;
}

const estAllerAlbum = (b: Element) => {
  const s = b.textContent ?? '';
  return s.includes('Aller à l’album') || s.includes("Aller à l'album");
};

/** Ouvre le « … » de la barre v2 et rend l'entrée « Aller à l'album », ou `undefined`. */
function entreeV2(piste: Record<string, unknown>): HTMLButtonElement | undefined {
  const el = poser(PisteActions, { piste });
  const plus = Array.from(el.querySelectorAll<HTMLButtonElement>('button.pa'))
    .find((b) => b.getAttribute('aria-haspopup') === 'menu');
  expect(plus, 'la barre n’a pas de « … »').toBeTruthy();
  plus!.click();
  flushSync();
  return Array.from(document.querySelectorAll<HTMLButtonElement>('.menu button.item')).find(estAllerAlbum);
}

/** Même chose pour le « … » du client actuel (`MenuPisteV1` → `TrackContextMenu`). */
function entreeV1(piste: Record<string, unknown>): HTMLButtonElement | undefined {
  const el = poser(MenuPisteV1, { piste });
  el.querySelector<HTMLButtonElement>('button.track-more-btn')!.click();
  flushSync();
  return Array.from(document.querySelectorAll<HTMLButtonElement>('.track-menu-item')).find(estAllerAlbum);
}

beforeEach(() => {
  ouvrirAlbum.mockClear();
  ouvrirArtiste.mockClear();
  currentZoneId.set(1);
  gestesNavigationService.set({ ouvrirAlbum, ouvrirArtiste } as never);
});

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  if (hote) hote.remove();
  hote = null;
  document.body.innerHTML = '';
  gestesNavigationService.set(null);
  currentZoneId.set(null);
});

describe('fil 1906 — la règle, UNE fois : `albumDeServiceDe`', () => {
  it('une piste Qobuz qui porte son album le désigne chez Qobuz', () => {
    expect(albumDeServiceDe(QOBUZ_AVEC_ALBUM as any)).toEqual({
      service: 'qobuz', albumId: SID, titre: 'Second Song',
      pochette: POCHETTE, artiste: 'Neil Young', artisteId: '35865',
    });
  });

  it('sans album connu : rien, jamais une cible inventée', () => {
    expect(albumDeServiceDe(QOBUZ_SANS_ALBUM as any)).toBeNull();
    expect(albumDeServiceDe({ id: 3, source: 'local', album_id: 12 } as any)).toBeNull();
    expect(albumDeServiceDe(null)).toBeNull();
  });

  it('`album_id_service` prime sur la colonne entière de l’historique', () => {
    const c = albumDeServiceDe({ ...QOBUZ_SANS_ALBUM, album_id: 77, album_id_service: SID } as any);
    expect(c?.albumId).toBe(SID);
  });
});

describe('fil 1906 — l’Historique apprend l’album par le CONTEXTE d’écoute', () => {
  it('🔴 écoute Qobuz lancée depuis l’album → l’album est connu', () => {
    const [e] = entreesDepuisServeur([ligneHistorique({ context_type: 'album', context_id: SID })]);
    expect(e.track.album_id_service).toBe(SID);
    // La colonne entière n'est PAS détournée : la pochette locale et le rejeu
    // par `album_id` continuent de lire un entier ou rien.
    expect(e.track.album_id).toBeNull();
  });

  it('sans contexte d’album, l’album reste inconnu', () => {
    expect(entreesDepuisServeur([ligneHistorique()])[0].track.album_id_service).toBeNull();
    expect(entreesDepuisServeur([ligneHistorique({ context_type: 'playlist', context_id: '66898771' })])[0]
      .track.album_id_service).toBeNull();
  });

  it('une piste LOCALE ou un contexte d’une autre source n’en reçoit jamais', () => {
    expect(entreesDepuisServeur([ligneHistorique({ source: 'local', context_type: 'album', context_id: '7' })])[0]
      .track.album_id_service).toBeNull();
    expect(entreesDepuisServeur([ligneHistorique({ context_type: 'album', context_id: '7', context_source: 'local' })])[0]
      .track.album_id_service).toBeNull();
  });
});

describe('🔴 fil 1906 — « Aller à l’album » dans CHAQUE menu de piste', () => {
  it('barre v2 (Historique, recherche, playlists, file…) : Qobuz avec album → présente', () => {
    const entree = entreeV2(QOBUZ_AVEC_ALBUM);
    expect(entree, '« Aller à l’album » manque au menu d’un titre Qobuz').toBeTruthy();
    entree!.click();
    flushSync();
    expect(ouvrirAlbum).toHaveBeenCalledTimes(1);
    expect(ouvrirAlbum.mock.calls[0][0]).toMatchObject({ service: 'qobuz', albumId: SID });
  });

  it('barre v2 : Qobuz SANS album → absente', () => {
    expect(entreeV2(QOBUZ_SANS_ALBUM)).toBeUndefined();
  });

  it('🔴 barre v2, ligne d’HISTORIQUE lancée depuis l’album → présente (la capture de FabienM)', () => {
    const [e] = entreesDepuisServeur([ligneHistorique({ context_type: 'album', context_id: SID })]);
    const entree = entreeV2(e.track as any);
    expect(entree, 'l’Historique ne propose toujours pas « Aller à l’album »').toBeTruthy();
    entree!.click();
    flushSync();
    expect(ouvrirAlbum.mock.calls[0][0]).toMatchObject({ service: 'qobuz', albumId: SID, pochette: POCHETTE });
  });

  it('barre v2, ligne d’historique SANS contexte d’album → absente', () => {
    const [e] = entreesDepuisServeur([ligneHistorique()]);
    expect(entreeV2(e.track as any)).toBeUndefined();
  });

  it('menu du client actuel (`MenuPisteV1`) : Qobuz avec album → présente, pochette et artiste compris', () => {
    const entree = entreeV1(QOBUZ_AVEC_ALBUM);
    expect(entree, '« Aller à l’album » manque au menu du client actuel').toBeTruthy();
    entree!.click();
    flushSync();
    expect(ouvrirAlbum).toHaveBeenCalledTimes(1);
    // La copie d'avant perdait les deux : la fiche s'ouvrait sur un carré gris
    // et sans artiste (#1342, #1361 bis).
    expect(ouvrirAlbum.mock.calls[0][0]).toEqual({
      service: 'qobuz', albumId: SID, titre: 'Second Song',
      pochette: POCHETTE, artiste: 'Neil Young', artisteId: '35865',
    });
  });

  it('menu du client actuel : Qobuz SANS album → absente', () => {
    expect(entreeV1(QOBUZ_SANS_ALBUM)).toBeUndefined();
  });
});
