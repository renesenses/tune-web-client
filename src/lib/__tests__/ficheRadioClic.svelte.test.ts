// @vitest-environment jsdom
//
// La fiche radio : un appui sur une station ouvre sa fiche au lieu de lancer la
// lecture ; Lecture est au centre du logo ; choisir un flux le lance ; le cœur
// bascule le favori ; Échap ferme et rend le focus.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import { clearViewContext } from '../stores/navigation';

const mocks = vi.hoisted(() => ({
  getRadios: vi.fn(), updateRadio: vi.fn(), playRadio: vi.fn(), deleteRadio: vi.fn(),
  importRadios: vi.fn(), exportRadiosUrl: vi.fn(() => '#'),
  getAnnuaireRadios: vi.fn(), ajouterDepuisAnnuaire: vi.fn(), jouerDepuisAnnuaire: vi.fn(),
  choisirFluxPrefere: vi.fn(),
}));
vi.mock('../api', async (importOriginal) => ({ ...(await importOriginal<object>()), getConfig: vi.fn(async () => ({ radios_country: '' })), ...mocks }));
vi.mock('../zoneRequise', () => ({ zoneRequise: () => 3 }));

import RadiosV2 from '../../components/v2/RadiosV2.svelte';
import RadioFicheModale from '../../components/partages/RadioFicheModale.svelte';
import { locale } from '../i18n';
import { zones, currentZoneId } from '../stores/zones';
import { estHls, joueCetteStation, titreEnCoursRadio } from '../ficheStation';

const HLS = 'https://x/fip/master.m3u8';
const AAC = 'https://x/fip-hifi.aac';
const MP3 = 'https://x/fip-midfi.mp3';
const FLUX = [
  { url: MP3, codec: 'MP3', bitrate: 128, primary: false },
  { url: AAC, codec: 'AAC', bitrate: 192, primary: true },
  { url: HLS, codec: 'AAC', bitrate: 96, hls: true },
];
const FIP = {
  id: 7, name: 'FIP', stream_url: AAC, favorite: false, genre: 'eclectic', country: 'France', country_code: 'FR',
  annuaire: { external_id: 'S1', rapproche_par: 'id', radio_metadata_key: 'fip', website_url: 'https://www.fip.fr', streams: FLUX },
};
const MAISON = { id: 8, name: 'Radio Maison', stream_url: 'https://a/maison.mp3', favorite: false, genre: 'Jazz' };

const respirer = async () => { for (let i = 0; i < 12; i++) await new Promise((r) => setTimeout(r, 0)); flushSync(); };
let hote: HTMLDivElement;
let instance: Record<string, unknown> | null = null;
async function monter(composant: any, props: Record<string, unknown> = {}) {
  hote = document.createElement('div');
  document.body.append(hote);
  instance = mount(composant, { target: hote, props: props as never });
  flushSync();
  await respirer();
}
const tuile = (nom: string) =>
  [...hote.querySelectorAll('.grid .st')].find((t) => t.querySelector('.nm')?.textContent === nom)!;
const dialogue = () => document.querySelector('[role=dialog]') as HTMLElement | null;

beforeEach(() => {
  clearViewContext('radios');
  for (const fn of Object.values(mocks)) fn.mockReset();
  mocks.getRadios.mockResolvedValue([FIP, MAISON]);
  mocks.exportRadiosUrl.mockReturnValue('#');
  mocks.getAnnuaireRadios.mockResolvedValue({ total: 0, offset: 0, limit: 120, count: 0, stations: 0, items: [], countries: [], genres: [] });
  mocks.playRadio.mockResolvedValue({});
  localStorage.clear();
  locale.set('fr');
  zones.set([]);
  currentZoneId.set(null);
});
afterEach(() => {
  if (instance) unmount(instance as any);
  instance = null;
  hote?.remove();
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

describe('fiche radio : ouverture', () => {
  it('🔴 un appui sur la vignette ouvre la fiche et ne lance PAS la lecture', async () => {
    await monter(RadiosV2);
    tuile('FIP').querySelector<HTMLButtonElement>('button.ouvrir')!.click();
    await respirer();
    expect(dialogue()?.querySelector('h2')?.textContent).toBe('FIP');
    expect(mocks.playRadio).not.toHaveBeenCalled();
  });

  it('CONTRE-ÉPREUVE : le bouton lecture de la vignette lance toujours directement', async () => {
    await monter(RadiosV2);
    tuile('FIP').querySelector<HTMLButtonElement>('button.centre')!.click();
    await respirer();
    expect(mocks.playRadio).toHaveBeenCalledWith(7, 3);
    expect(dialogue()).toBeNull();
  });

  it('une station saisie à la main a aussi sa fiche', async () => {
    await monter(RadiosV2);
    tuile('Radio Maison').querySelector<HTMLButtonElement>('button.ouvrir')!.click();
    await respirer();
    expect(dialogue()?.querySelector('h2')?.textContent).toBe('Radio Maison');
  });
});

describe('fiche radio : Lecture au centre du logo', () => {
  it('🔴 le bouton central lance la station (flux par défaut)', async () => {
    await monter(RadiosV2);
    tuile('FIP').querySelector<HTMLButtonElement>('button.ouvrir')!.click();
    await respirer();
    const b = dialogue()!.querySelector<HTMLButtonElement>('.logo button.lecture')!;
    expect(b).not.toBeNull();
    b.click();
    await respirer();
    expect(mocks.playRadio).toHaveBeenCalledWith(7, 3);
    expect(mocks.choisirFluxPrefere).not.toHaveBeenCalled();
  });
});

describe('fiche radio : flux', () => {
  it('🔴 classés par qualité, HLS ou direct, flux par défaut marqué', async () => {
    await monter(RadioFicheModale, { station: FIP, onClose: () => {} });
    const li = [...dialogue()!.querySelectorAll('.flux li')];
    expect(li.map((l) => l.querySelector('.url')?.textContent)).toEqual([AAC, MP3, HLS]);
    expect(li.map((l) => l.querySelector('.transport')?.textContent)).toEqual(['Direct', 'Direct', 'HLS']);
    expect(li.map((l) => !!l.querySelector('.prin'))).toEqual([true, false, false]);
  });

  it('🔴 choisir un flux le rend préféré puis le lance', async () => {
    mocks.choisirFluxPrefere.mockResolvedValue({ ...FIP, stream_url: MP3 });
    const lues = vi.fn();
    await monter(RadioFicheModale, { station: FIP, onClose: () => {}, onLue: lues });
    const mp3 = [...dialogue()!.querySelectorAll('.flux li')].find((l) => l.querySelector('.url')?.textContent === MP3)!;
    mp3.querySelector<HTMLButtonElement>('button.flux-lire')!.click();
    await respirer();
    expect(mocks.choisirFluxPrefere).toHaveBeenCalledWith(7, MP3);
    expect(mocks.playRadio).toHaveBeenCalledWith(7, 3);
    expect(lues).toHaveBeenCalledWith({ idMienne: 7, annuaireId: 'S1' });
  });

  it('une fiche hors Mes radios lit le flux choisi par la route de l’annuaire', async () => {
    mocks.jouerDepuisAnnuaire.mockResolvedValue({});
    const f = { external_id: 'S9', name: 'Ailleurs', my_radio_id: null, now_playing: false, streams: [{ url: MP3, codec: 'MP3', bitrate: 128 }, { url: AAC, codec: 'AAC', bitrate: 192 }] };
    await monter(RadioFicheModale, { annuaire: f, onClose: () => {} });
    const mp3 = [...dialogue()!.querySelectorAll('.flux li')].find((l) => l.querySelector('.url')?.textContent === MP3)!;
    mp3.querySelector<HTMLButtonElement>('button.flux-lire')!.click();
    await respirer();
    expect(mocks.jouerDepuisAnnuaire).toHaveBeenCalledWith('S9', 3, MP3);
    expect(mocks.choisirFluxPrefere).not.toHaveBeenCalled();
  });
});

describe('fiche radio : favori, titre, fermeture', () => {
  it('🔴 le cœur bascule le favori et prévient l’écran', async () => {
    mocks.updateRadio.mockResolvedValue({ ...FIP, favorite: true });
    const change = vi.fn();
    await monter(RadioFicheModale, { station: FIP, onClose: () => {}, onChange: change });
    const c = dialogue()!.querySelector<HTMLButtonElement>('button.coeur')!;
    expect(c.getAttribute('aria-pressed')).toBe('false');
    c.click();
    await respirer();
    expect(mocks.updateRadio).toHaveBeenCalledWith(7, { favorite: true });
    expect(dialogue()!.querySelector('button.coeur')!.getAttribute('aria-pressed')).toBe('true');
    expect(change).toHaveBeenCalled();
  });

  it('le titre en cours s’affiche quand la zone joue cette station', async () => {
    zones.set([{ id: 3, current_track: { source: 'radio', source_id: AAC, album_title: 'FIP', title: 'So What', artist_name: 'Miles Davis' } }] as any);
    currentZoneId.set(3);
    await monter(RadioFicheModale, { station: FIP, onClose: () => {} });
    expect(dialogue()!.querySelector('.titre-en-cours')?.textContent).toBe('Miles Davis — So What');
  });

  it('CONTRE-ÉPREUVE : une autre station joue, rien n’est affiché', async () => {
    zones.set([{ id: 3, current_track: { source: 'radio', source_id: 'https://autre', album_title: 'Autre', title: 'X', artist_name: 'Y' } }] as any);
    currentZoneId.set(3);
    await monter(RadioFicheModale, { station: FIP, onClose: () => {} });
    expect(dialogue()!.querySelector('.encours')).toBeNull();
  });

  it('Échap ferme la fiche et le focus revient à la vignette', async () => {
    await monter(RadiosV2);
    const ouvrir = tuile('FIP').querySelector<HTMLButtonElement>('button.ouvrir')!;
    ouvrir.focus();
    ouvrir.click();
    await respirer();
    expect(document.activeElement?.classList.contains('lecture')).toBe(true);
    dialogue()!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await respirer();
    expect(dialogue()).toBeNull();
    expect(document.activeElement).toBe(ouvrir);
  });
});

describe('fonctions pures', () => {
  it('estHls', () => {
    expect(estHls({ url: HLS })).toBe(true);
    expect(estHls({ url: AAC, hls: true })).toBe(true);
    expect(estHls({ url: AAC, codec: 'AAC' })).toBe(false);
  });
  it('joueCetteStation / titreEnCoursRadio', () => {
    const f = { nom: 'FIP', flux: FLUX, fluxActuel: AAC };
    expect(joueCetteStation(f, { source: 'radio', source_id: HLS })).toBe(true);
    expect(joueCetteStation(f, { source: 'radio', album_title: 'fip' })).toBe(true);
    expect(joueCetteStation(f, { source: 'local', source_id: AAC })).toBe(false);
    expect(titreEnCoursRadio({ source: 'radio', title: 'FIP', album_title: 'FIP' })).toBeNull();
    expect(titreEnCoursRadio({ source: 'radio', title: 'T', artist_name: 'Live Radio' })).toBe('T');
  });
});
