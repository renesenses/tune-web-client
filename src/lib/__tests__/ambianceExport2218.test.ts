// @vitest-environment jsdom
//
// web#2218 — Ambiance : « Exporter vers… » une playlist locale OU un service
// de streaming connecté (go de Bertrand, 19/10/2026, rc7).
//
// Trois étages :
//  1. `exporterAmbiance` : le chemin local inchangé, le chemin service
//     (temporaire → transfert → suppression) et chacun de ses refus ;
//  2. le composant monté : menu, services grisés, résultat, titres non
//     retrouvés, messages Premium / greffon absent / service non connecté ;
//  3. la page Ambiance monte bien le composant (et plus l'ancien bouton).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import { get } from 'svelte/store';
import { readFileSync } from 'node:fs';

const mocks = vi.hoisted(() => ({
  getPlaylistManagerServices: vi.fn(),
  createPlaylist: vi.fn(),
  addPlaylistTracks: vi.fn(),
  deletePlaylist: vi.fn(),
  transferPlaylistV2: vi.fn(),
}));

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return { ...actual, ...mocks };
});

import { ciblesServices, exporterAmbiance } from '../ambianceExport';
import AmbianceExport from '../../components/v2-heritage/AmbianceExport.svelte';
import { t } from '../i18n';

const tr = (cle: string) => get(t)(cle);

const CAPS = {
  local: { authenticated: true, supports_write: true },
  tidal: { authenticated: false, supports_write: true },
  qobuz: { authenticated: true, supports_write: true },
  youtube: { authenticated: true, supports_write: false },
  spotify: { authenticated: true, supports_write: true },
};

/** La réponse de `POST /playlist-manager/transfer` (forme `reponse_historique`). */
const TRANSFERT_OK = {
  lot_id: 'lot-1',
  source_service: 'local',
  target_service: 'qobuz',
  target_playlist_name: 'Ambiance · warm jazz',
  target_playlist_id: 'q-987',
  remote_playlist_id: 'q-987',
  total_tracks: 3,
  matched: 2,
  not_found: 1,
  status: 'completed',
  etat: 'termine',
  tracks: [
    { title: 'Riverside', artist_name: 'Agnes Obel', status: 'matched' },
    { title: 'Dorian', artist_name: 'Agnes Obel', status: 'matched' },
    { title: 'Bootleg 1971', artist_name: 'Inconnu', status: 'not_found', raison: 'aucun_resultat' },
  ],
};

function erreur(message: string, extra: Record<string, unknown>): Error {
  return Object.assign(new Error(message), extra);
}

beforeEach(() => {
  for (const m of Object.values(mocks)) m.mockReset();
  mocks.getPlaylistManagerServices.mockResolvedValue(CAPS);
  mocks.createPlaylist.mockResolvedValue({ id: 77, name: 'tmp' });
  mocks.addPlaylistTracks.mockResolvedValue({ id: 77 });
  mocks.deletePlaylist.mockResolvedValue(undefined);
  mocks.transferPlaylistV2.mockResolvedValue(TRANSFERT_OK);
});

describe('ciblesServices', () => {
  it('garde les services qui savent écrire, connectés ou non, dans l’ordre Qobuz, TIDAL, Deezer, Spotify', () => {
    expect(ciblesServices(CAPS)).toEqual([
      { service: 'qobuz', connecte: true },
      { service: 'tidal', connecte: false },
      { service: 'spotify', connecte: true },
    ]);
  });
  it('rend une liste vide sans capacités', () => {
    expect(ciblesServices(null)).toEqual([]);
  });
});

describe('exporterAmbiance — playlist locale', () => {
  it('fait exactement ce que faisait « Sauvegarder » : création puis ajout, rien d’autre', async () => {
    const r = await exporterAmbiance({ service: 'local', nom: 'Ambiance · warm jazz', ids: [11, 12, 13] });
    expect(r).toEqual({ genre: 'local', nom: 'Ambiance · warm jazz', total: 3 });
    expect(mocks.createPlaylist).toHaveBeenCalledWith('Ambiance · warm jazz');
    expect(mocks.addPlaylistTracks).toHaveBeenCalledWith(77, [11, 12, 13]);
    expect(mocks.transferPlaylistV2).not.toHaveBeenCalled();
    expect(mocks.deletePlaylist).not.toHaveBeenCalled();
    expect(mocks.getPlaylistManagerServices).not.toHaveBeenCalled();
  });
});

describe('exporterAmbiance — service', () => {
  it('crée une temporaire, la transfère sous le nom choisi, puis la supprime', async () => {
    const r = await exporterAmbiance({ service: 'qobuz', nom: '  Mon jazz  ', ids: [11, 12, 13] });
    expect(mocks.createPlaylist).toHaveBeenCalledWith('Mon jazz');
    expect(mocks.addPlaylistTracks).toHaveBeenCalledWith(77, [11, 12, 13]);
    expect(mocks.transferPlaylistV2).toHaveBeenCalledWith({
      source_service: 'local',
      source_playlist_id: '77',
      target_service: 'qobuz',
      target_name: 'Mon jazz',
    });
    expect(mocks.deletePlaylist).toHaveBeenCalledWith(77);
    // La suppression vient APRÈS le transfert : le greffon a lu la source.
    expect(mocks.deletePlaylist.mock.invocationCallOrder[0]).toBeGreaterThan(
      mocks.transferPlaylistV2.mock.invocationCallOrder[0],
    );
    expect(r).toEqual({
      genre: 'service',
      service: 'qobuz',
      nom: 'Ambiance · warm jazz',
      retrouves: 2,
      total: 3,
      nonRetrouves: [{ titre: 'Bootleg 1971', artiste: 'Inconnu', raison: 'aucun_resultat' }],
      temporaireRestante: null,
    });
  });

  it('service non connecté : ne crée RIEN', async () => {
    const r = await exporterAmbiance({ service: 'tidal', nom: 'x', ids: [1] });
    expect(r).toEqual({ genre: 'non_connecte', service: 'tidal' });
    expect(mocks.createPlaylist).not.toHaveBeenCalled();
    expect(mocks.transferPlaylistV2).not.toHaveBeenCalled();
  });

  it('refus Premium (402) : rendu comme tel, la temporaire est supprimée', async () => {
    mocks.transferPlaylistV2.mockRejectedValue(
      erreur('premium_required', { status: 402, code: 'playlist_transfer', corps: { upgrade_url: 'https://mozaiklabs.fr/pricing' } }),
    );
    const r = await exporterAmbiance({ service: 'qobuz', nom: 'x', ids: [1] });
    expect(r).toEqual({ genre: 'premium', service: 'qobuz', url: 'https://mozaiklabs.fr/pricing', temporaireRestante: null });
    expect(mocks.deletePlaylist).toHaveBeenCalledWith(77);
  });

  it('greffon absent (503 greffon_requis) : rendu comme tel, la temporaire est supprimée', async () => {
    mocks.transferPlaylistV2.mockRejectedValue(erreur('Le transfert…', { status: 503, code: 'greffon_requis' }));
    const r = await exporterAmbiance({ service: 'qobuz', nom: 'x', ids: [1] });
    expect(r).toEqual({ genre: 'greffon_absent', service: 'qobuz', temporaireRestante: null });
    expect(mocks.deletePlaylist).toHaveBeenCalledWith(77);
  });

  it('lot interrompu (200, status interrupted) : un échec avec la raison du greffon', async () => {
    mocks.transferPlaylistV2.mockResolvedValue({ ...TRANSFERT_OK, status: 'interrupted', etat: 'interrompu', erreur: 'qobuz : 401' });
    const r = await exporterAmbiance({ service: 'qobuz', nom: 'x', ids: [1] });
    expect(r).toMatchObject({ genre: 'echec', message: 'qobuz : 401' });
  });

  it('aucun titre retrouvé : le dit, avec la liste', async () => {
    mocks.transferPlaylistV2.mockResolvedValue({
      ...TRANSFERT_OK, matched: 0, etat: 'rien_a_transferer',
      tracks: [{ title: 'A', artist_name: 'B', status: 'not_found', raison: 'duree_hors_tolerance' }],
    });
    const r = await exporterAmbiance({ service: 'qobuz', nom: 'x', ids: [1] });
    expect(r).toMatchObject({ genre: 'aucun', nonRetrouves: [{ titre: 'A', artiste: 'B', raison: 'duree_hors_tolerance' }] });
  });

  it('suppression de la temporaire impossible : on le dit au lieu de la laisser orpheline en silence', async () => {
    mocks.deletePlaylist.mockRejectedValue(new Error('500'));
    const r = await exporterAmbiance({ service: 'qobuz', nom: 'Mon jazz', ids: [1] });
    expect(r).toMatchObject({ genre: 'service', temporaireRestante: 'Mon jazz' });
  });
});

// ── Le composant monté ────────────────────────────────────────────────────

let hote: HTMLDivElement | null = null;
let monte: Record<string, unknown> | null = null;
const respirer = () => new Promise((r) => setTimeout(r, 0));
async function laisser() { for (let i = 0; i < 8; i++) await respirer(); flushSync(); }

async function poser(): Promise<HTMLDivElement> {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(AmbianceExport, { target: hote, props: { ids: [11, 12, 13], nomPropose: 'Ambiance · warm jazz' } });
  flushSync();
  return hote;
}

async function ouvrirLeMenu(el: HTMLElement) {
  el.querySelector<HTMLButtonElement>('.export-btn')!.click();
  await laisser();
}
const option = (el: HTMLElement, s: string) => el.querySelector<HTMLButtonElement>(`.export-option[data-service="${s}"]`);

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  hote?.remove();
  hote = null;
});

describe('le menu « Exporter vers… »', () => {
  it('propose la playlist locale et les services qui savent écrire ; grise ceux qui ne sont pas connectés', async () => {
    const el = await poser();
    expect(el.querySelector('.export-btn')!.textContent).toContain(tr('ambiance.export.button'));
    await ouvrirLeMenu(el);
    expect(option(el, 'local')!.textContent).toContain(tr('ambiance.export.local'));
    expect(option(el, 'qobuz')!.disabled).toBe(false);
    expect(option(el, 'spotify')!.disabled).toBe(false);
    expect(option(el, 'tidal')!.disabled).toBe(true);
    expect(option(el, 'tidal')!.textContent).toContain(tr('ambiance.export.notConnected'));
    expect(option(el, 'youtube')).toBeNull();
    expect(el.querySelector<HTMLInputElement>('.export-name')!.value).toBe('Ambiance · warm jazz');
  });

  it('chemin local inchangé : crée la playlist sous le nom proposé', async () => {
    const el = await poser();
    await ouvrirLeMenu(el);
    option(el, 'local')!.click();
    await laisser();
    expect(mocks.createPlaylist).toHaveBeenCalledWith('Ambiance · warm jazz');
    expect(mocks.addPlaylistTracks).toHaveBeenCalledWith(77, [11, 12, 13]);
    expect(mocks.transferPlaylistV2).not.toHaveBeenCalled();
  });

  it('chemin service : nom modifié, playlist créée, compte et titres non retrouvés affichés', async () => {
    const el = await poser();
    await ouvrirLeMenu(el);
    const champ = el.querySelector<HTMLInputElement>('.export-name')!;
    champ.value = 'Mon jazz';
    champ.dispatchEvent(new Event('input', { bubbles: true }));
    flushSync();
    option(el, 'qobuz')!.click();
    await laisser();
    expect(mocks.transferPlaylistV2).toHaveBeenCalledWith(expect.objectContaining({ target_service: 'qobuz', target_name: 'Mon jazz' }));
    const res = el.querySelector('.export-result')!;
    expect(res.textContent).toContain(
      tr('ambiance.export.serviceDone').replace('{name}', 'Ambiance · warm jazz').replace('{service}', 'Qobuz'),
    );
    expect(res.textContent).toContain(tr('ambiance.export.matched').replace('{found}', '2').replace('{total}', '3'));
    const manquants = Array.from(res.querySelectorAll('.export-missing li')).map((li) => li.textContent);
    expect(manquants).toHaveLength(1);
    expect(manquants[0]).toContain('Bootleg 1971');
    expect(manquants[0]).toContain(tr('plconv.raison.aucun_resultat'));
  });

  it('Premium manquant : message clair', async () => {
    mocks.transferPlaylistV2.mockRejectedValue(erreur('premium_required', { status: 402 }));
    const el = await poser();
    await ouvrirLeMenu(el);
    option(el, 'qobuz')!.click();
    await laisser();
    expect(el.querySelector('.export-result')!.textContent).toContain(tr('ambiance.export.premium'));
  });

  it('greffon absent : message clair', async () => {
    mocks.transferPlaylistV2.mockRejectedValue(erreur('x', { status: 503, code: 'greffon_requis' }));
    const el = await poser();
    await ouvrirLeMenu(el);
    option(el, 'qobuz')!.click();
    await laisser();
    expect(el.querySelector('.export-result')!.textContent).toContain(tr('ambiance.export.pluginMissing'));
  });

  it('service déconnecté entre l’ouverture du menu et le clic : message clair, rien de créé', async () => {
    const el = await poser();
    await ouvrirLeMenu(el);
    mocks.getPlaylistManagerServices.mockResolvedValue({ ...CAPS, qobuz: { authenticated: false, supports_write: true } });
    option(el, 'qobuz')!.click();
    await laisser();
    expect(el.querySelector('.export-result')!.textContent).toContain(
      tr('ambiance.export.notConnectedError').replace('{service}', 'Qobuz'),
    );
    expect(mocks.createPlaylist).not.toHaveBeenCalled();
  });
});

describe('la page Ambiance', () => {
  it('monte « Exporter vers… » à la place de l’ancien « Sauvegarder »', () => {
    const s = readFileSync('src/components/v2-heritage/AmbianceView.svelte', 'utf8');
    expect(s).toContain('<AmbianceExport ids={trackIds()} nomPropose={`Ambiance · ${lastQuery}`} />');
    expect(s).not.toContain('saveAsPlaylist');
  });
});
