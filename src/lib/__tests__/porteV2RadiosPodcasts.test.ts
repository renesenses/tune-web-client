// @vitest-environment jsdom
//
// Phase 5 — « aucune perte d'accès » (Bertrand, 19/09/2026).
//
// Sept fonctions d'`api.ts` n'étaient atteignables QUE par l'ancienne
// interface (`RadiosView`, `PodcastsView`) : supprimer une station, lui
// téléverser une pochette, importer/exporter une liste M3U, et les émissions
// Radio France par antenne, par recherche, et leurs épisodes. Elles ont
// désormais un chemin dans le nouveau client.
//
// 🔴 Les témoins MONTENT l'écran et FONT le geste ; ils ne lisent pas le
// source. Contre-épreuve : retirer l'appel dans l'écran ⇒ rouge.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import { get } from 'svelte/store';

const getRadios = vi.fn();
const deleteRadio = vi.fn();
const uploadRadioCover = vi.fn();
const importRadios = vi.fn();
const getConfig = vi.fn();
const getRadioFranceShows = vi.fn();
const searchRadioFranceShows = vi.fn();
const getRadioFranceEpisodes = vi.fn();

vi.mock('../api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../api')>()),
  getRadios: (...a: any[]) => getRadios(...a),
  deleteRadio: (...a: any[]) => deleteRadio(...a),
  uploadRadioCover: (...a: any[]) => uploadRadioCover(...a),
  importRadios: (...a: any[]) => importRadios(...a),
  getConfig: (...a: any[]) => getConfig(...a),
  getRadioFranceShows: (...a: any[]) => getRadioFranceShows(...a),
  searchRadioFranceShows: (...a: any[]) => searchRadioFranceShows(...a),
  getRadioFranceEpisodes: (...a: any[]) => getRadioFranceEpisodes(...a),
  getRadioFrancePodcasts: async () => [],
  getPodcastSubscriptions: async () => [],
  getDiscoverPodcasts: async () => ({ curated: [], top: [] }),
  getTopPodcasts: async () => [],
  podcastCountry: () => 'fr',
}));

import RadiosV2 from '../../components/v2/RadiosV2.svelte';
import RadioEditModale from '../../components/v2/RadioEditModale.svelte';
import PodcastsV2 from '../../components/v2/PodcastsV2.svelte';
import { dialogs } from '../stores/dialogs';
import { preferences } from '../stores/preferences';
import lFr from '../locales/fr';

const fr = lFr as unknown as Record<string, string>;
const FIP = { id: 3, name: 'FIP', stream_url: 'https://fip.example/live', logo_url: '', genre: 'Éclectique', country: 'FR', homepage_url: '', favorite: false };

let hote: HTMLDivElement | null = null;
let monte: Record<string, any> | null = null;
let fetchAppels: string[] = [];

function poser(C: any, props: any = {}) {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(C, { target: hote, props });
  flushSync();
  return hote;
}
const respirer = async (n = 6) => { for (let i = 0; i < n; i++) await Promise.resolve(); flushSync(); };
const boutonParTexte = (racine: ParentNode, texte: string) =>
  [...racine.querySelectorAll('button')].find((b) => (b.textContent ?? '').trim().includes(texte)) ?? null;
function deposerFichier(input: HTMLInputElement, f: File) {
  Object.defineProperty(input, 'files', { value: [f], configurable: true });
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

beforeEach(() => {
  for (const f of [getRadios, deleteRadio, uploadRadioCover, importRadios, getConfig, getRadioFranceShows, searchRadioFranceShows, getRadioFranceEpisodes]) f.mockReset();
  getRadios.mockResolvedValue([FIP]);
  fetchAppels = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    fetchAppels.push(String(url));
    return new Response('#EXTM3U\n', { status: 200 });
  }));
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  (URL as any).createObjectURL = vi.fn(() => 'blob:x');
  (URL as any).revokeObjectURL = vi.fn();
});

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  hote?.remove();
  hote = null;
  document.body.innerHTML = '';
  vi.unstubAllGlobals();
});

describe('Radios — import, export, suppression, pochette', () => {
  it('importRadios : le fichier choisi part au serveur, puis la liste est relue', async () => {
    importRadios.mockResolvedValue({ imported: 4, skipped: 1, errors: [] });
    const h = poser(RadiosV2);
    await respirer();
    const champ = h.querySelector<HTMLInputElement>('input[type=file][accept*="m3u"]');
    expect(champ, 'aucun champ d’import M3U dans l’en-tête').not.toBeNull();
    const avant = getRadios.mock.calls.length;
    deposerFichier(champ!, new File(['#EXTM3U'], 'radios.m3u'));
    await respirer(10);
    expect(importRadios).toHaveBeenCalledTimes(1);
    expect((importRadios.mock.calls[0][0] as File).name).toBe('radios.m3u');
    expect(getRadios.mock.calls.length).toBeGreaterThan(avant);
  });

  it('exportRadiosUrl : « Exporter » télécharge /radios/export.m3u', async () => {
    const h = poser(RadiosV2);
    await respirer();
    const b = boutonParTexte(h, fr['radio.export']);
    expect(b, 'aucun bouton « Exporter M3U »').not.toBeNull();
    b!.click();
    await respirer(10);
    expect(fetchAppels.some((u) => u.endsWith('/radios/export.m3u'))).toBe(true);
  });

  it('deleteRadio : après CONFIRMATION v2, la station est supprimée', async () => {
    const supprimee = vi.fn();
    const h = poser(RadioEditModale, { radio: FIP, onClose: () => {}, onDeleted: supprimee });
    deleteRadio.mockResolvedValue(undefined);
    const b = boutonParTexte(document.body, fr['common.delete']);
    expect(b, 'aucun bouton « Supprimer » dans la modale').not.toBeNull();
    b!.click();
    await respirer();
    const demande = get(dialogs)[0];
    expect(demande?.kind).toBe('confirm');
    expect(deleteRadio, 'supprimé AVANT la confirmation').not.toHaveBeenCalled();
    dialogs.settle(demande.id, true);
    await respirer(10);
    expect(deleteRadio).toHaveBeenCalledWith(3);
    expect(supprimee).toHaveBeenCalledWith(3);
    void h;
  });

  it('deleteRadio : annuler la confirmation ne supprime rien', async () => {
    poser(RadioEditModale, { radio: FIP, onClose: () => {} });
    boutonParTexte(document.body, fr['common.delete'])!.click();
    await respirer();
    const demande = get(dialogs)[0];
    dialogs.settle(demande.id, false);
    await respirer(10);
    expect(deleteRadio).not.toHaveBeenCalled();
  });

  it('uploadRadioCover : le fichier image part comme pochette de la station', async () => {
    uploadRadioCover.mockResolvedValue({ ...FIP, logo_url: '/artwork/radio-3.jpg' });
    const change = vi.fn();
    poser(RadioEditModale, { radio: FIP, onClose: () => {}, onCoverChanged: change });
    const champ = document.body.querySelector<HTMLInputElement>('input[type=file][accept="image/*"]');
    expect(champ, 'aucun champ de pochette dans la modale').not.toBeNull();
    deposerFichier(champ!, new File(['x'], 'logo.png', { type: 'image/png' }));
    await respirer(10);
    expect(uploadRadioCover).toHaveBeenCalledWith(3, expect.any(File));
    expect(change).toHaveBeenCalledWith(expect.objectContaining({ logo_url: '/artwork/radio-3.jpg' }));
  });
});

describe('Podcasts — émissions Radio France (clé déclarée)', () => {
  beforeEach(() => {
    preferences.update((p: any) => ({ ...p, settingsLevel: 'expert' }));
    getConfig.mockResolvedValue({ radiofrance_api_key_set: true });
    getRadioFranceShows.mockResolvedValue({ shows: [{ title: 'Le Masque et la Plume', station: 'France Inter', url: 'https://rf/masque', cover_url: '' }] });
    searchRadioFranceShows.mockResolvedValue({ shows: [{ title: 'La Méthode scientifique', station: 'France Culture', url: 'https://rf/methode', cover_url: '' }] });
    getRadioFranceEpisodes.mockResolvedValue({ episodes: [{ title: 'Épisode 1', audio_url: 'https://rf/ep1.mp3', duration_secs: 60 }] });
  });

  async function ouvrirOngletRf() {
    const h = poser(PodcastsV2);
    await respirer(12);
    const onglet = boutonParTexte(h, 'Radio France');
    expect(onglet, 'onglet Radio France absent malgré la clé').not.toBeNull();
    onglet!.click();
    await respirer(6);
    return h;
  }

  it('getRadioFranceShows : les émissions de l’antenne, et changer d’antenne relance', async () => {
    const h = await ouvrirOngletRf();
    expect(getRadioFranceShows).toHaveBeenCalledWith('FRANCEINTER');
    expect(h.textContent).toContain('Le Masque et la Plume');
    boutonParTexte(h, 'France Culture')!.click();
    await respirer(6);
    expect(getRadioFranceShows).toHaveBeenLastCalledWith('FRANCECULTURE');
  });

  it('searchRadioFranceShows : la recherche rend ses émissions', async () => {
    const h = await ouvrirOngletRf();
    const champ = h.querySelector<HTMLInputElement>(`input[placeholder="${fr['v2.pod.rfSearchPlaceholder']}"]`);
    expect(champ).not.toBeNull();
    champ!.value = 'méthode';
    champ!.dispatchEvent(new Event('input', { bubbles: true }));
    flushSync();
    champ!.closest('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await respirer(6);
    expect(searchRadioFranceShows).toHaveBeenCalledWith('méthode');
    expect(h.textContent).toContain('La Méthode scientifique');
  });

  it('getRadioFranceEpisodes : ouvrir une émission montre ses épisodes', async () => {
    const h = await ouvrirOngletRf();
    const tuile = [...h.querySelectorAll('.rf-emissions .pc')].find((e) => e.textContent?.includes('Le Masque'));
    expect(tuile).toBeTruthy();
    const ouvrir = tuile!.querySelector<HTMLElement>('button.ouvrir');
    ouvrir!.click();
    await respirer(8);
    expect(getRadioFranceEpisodes).toHaveBeenCalledWith('https://rf/masque', 30);
    expect(h.textContent).toContain('Épisode 1');
  });
});
