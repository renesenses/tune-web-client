// @vitest-environment jsdom
import { clearViewContext } from '../stores/navigation';
//
// web#2443 — la fiche « Voir » des stations de l'annuaire (demande de Rémi du
// 27/10/2026) : l'œil à la place du crayon, le badge « Metadata+ », les flux
// disponibles et le choix du flux préféré (tune-server-rust#7177). Chaque
// comportement a sa contre-épreuve.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

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
import {
  aMetadataPlus, ficheDeAnnuaire, ficheDeStation, libelleFlux, metadataPlusDeLecture, oublierBadgesDeLecture,
} from '../ficheStation';

const AAC = 'https://icecast.radiofrance.fr/fip-hifi.aac';
const MP3 = 'https://icecast.radiofrance.fr/fip-midfi.mp3?id=radiofrance';
const FLUX = [
  { url: AAC, codec: 'AAC', bitrate: 192, primary: true, hls: false },
  { url: MP3, codec: 'MP3', bitrate: 128, sample_rate: 48000, primary: false, hls: false },
];
const FIP = {
  id: 7, name: 'FIP', stream_url: AAC, favorite: false, genre: 'eclectic', country: 'FR', country_code: 'FR',
  annuaire: {
    external_id: 'S000973', rapproche_par: 'id', radio_metadata_key: 'fip',
    description: 'La radio musicale la plus éclectique.', website_url: 'https://www.fip.fr',
    categories: ['eclectic', 'jazz'], streams: FLUX,
  },
};
const MAISON = { id: 8, name: 'Radio Maison', stream_url: 'https://a/maison.mp3', favorite: false, genre: 'Jazz' };
const ANNUAIRE = {
  total: 2, offset: 0, limit: 120, count: 2, stations: 836, origine: 'reseau',
  items: [
    { external_id: 'S000973', name: 'FIP', country_code: 'FR', genre: 'eclectic', stream_url: AAC,
      radio_metadata_key: 'fip', now_playing: true, my_radio_id: 7, streams: FLUX },
    { external_id: 'S002479', name: 'Radio Sans Cle', country_code: 'US', genre: 'news', stream_url: 'y',
      now_playing: false, my_radio_id: null },
  ],
  countries: [], genres: [],
  attribution: { name: 'radio-metadata.fr', url: 'https://radio-metadata.fr', support_url: 'https://ko-fi.com/aleceiffel' },
};

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
const tuile = (nom: string, sel = '.grid .st') =>
  [...hote.querySelectorAll(sel)].find((t) => t.querySelector('.nm')?.textContent === nom)!;
const titres = (e: Element) => [...e.querySelectorAll('button.coin')].map((b) => b.getAttribute('title'));
const dialogue = () => document.querySelector('[role=dialog]') as HTMLElement | null;

beforeEach(() => {
  clearViewContext('radios');
  for (const fn of Object.values(mocks)) fn.mockReset();
  mocks.getRadios.mockResolvedValue([FIP, MAISON]);
  mocks.exportRadiosUrl.mockReturnValue('#');
  mocks.getAnnuaireRadios.mockResolvedValue(ANNUAIRE);
  localStorage.clear();
  locale.set('fr');
  oublierBadgesDeLecture();
});
afterEach(() => {
  if (instance) unmount(instance as any);
  instance = null;
  hote?.remove();
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

describe('Mes radios : « Voir » pour l’annuaire, « Modifier » pour la saisie manuelle', () => {
  // web#2795 (décision du 11/11) : « Modifier » revient sur une station de
  // l'annuaire, en surcharge locale ; l'œil garde son coin.
  it('🔴 FIP (annuaire) : Voir et Retirer, et Modifier (surcharge locale, web#2795)', async () => {
    await monter(RadiosV2);
    const t = titres(tuile('FIP'));
    expect(t).toContain('Voir');
    expect(t).toContain('Retirer de Mes radios');
    expect(t).toContain('Modifier');
    expect(tuile('FIP').querySelector('button.coin.tr')?.getAttribute('title')).toBe('Voir');
  });

  it('CONTRE-ÉPREUVE : la station saisie à la main garde Modifier, sans Voir', async () => {
    await monter(RadiosV2);
    const t = titres(tuile('Radio Maison'));
    expect(t).toContain('Modifier');
    expect(t).not.toContain('Voir');
  });

  it('🔴 badge Metadata+ sur la station qui a une clé, pas sur l’autre', async () => {
    await monter(RadiosV2);
    expect(tuile('FIP').querySelector('.mdp')?.textContent).toBe('Metadata+');
    expect(tuile('Radio Maison').querySelector('.mdp')).toBeNull();
  });

  it('🔴 l’œil ouvre la fiche : description, genres, pays, site, flux disponibles', async () => {
    await monter(RadiosV2);
    (tuile('FIP').querySelector('button.coin.tr') as HTMLButtonElement).click();
    await respirer();
    const d = dialogue()!;
    expect(d).not.toBeNull();
    expect(d.textContent).toContain('La radio musicale la plus éclectique.');
    expect(d.querySelector('.mdp')).not.toBeNull();
    expect([...d.querySelectorAll('.genres li')].length).toBe(2);
    expect(d.querySelector<HTMLAnchorElement>('a.site')!.href).toBe('https://www.fip.fr/');
    expect(d.querySelector<HTMLAnchorElement>('a.site')!.rel).toContain('noopener');
    // Flux classés par qualité (AAC 192 avant MP3 128), le flux par défaut marqué.
    const flux = [...d.querySelectorAll('.flux li')];
    expect(flux.map((l) => l.querySelector('.url')?.textContent)).toEqual([AAC, MP3]);
    expect(flux[0].classList.contains('actuel')).toBe(true);
    expect(flux[0].querySelector('.prin')?.textContent).toBe('par défaut');
  });

  it('🔴 choisir un autre flux l’enregistre et met la tuile à jour', async () => {
    mocks.choisirFluxPrefere.mockResolvedValue({ ...FIP, stream_url: MP3, codec: 'mp3' });
    await monter(RadiosV2);
    (tuile('FIP').querySelector('button.coin.tr') as HTMLButtonElement).click();
    await respirer();
    mocks.playRadio.mockResolvedValue({});
    const mp3 = [...dialogue()!.querySelectorAll<HTMLButtonElement>('.flux li')]
      .find((l) => l.querySelector('.url')?.textContent === MP3)!;
    mp3.querySelector<HTMLButtonElement>('button.flux-lire')!.click();
    await respirer();
    expect(mocks.choisirFluxPrefere).toHaveBeenCalledWith(7, MP3);
    expect(mocks.playRadio).toHaveBeenCalledWith(7, 3);
    const apres = [...dialogue()!.querySelectorAll('.flux li')]
      .find((l) => l.querySelector('.url')?.textContent === MP3)!;
    expect(apres.classList.contains('actuel')).toBe(true);
    expect(tuile('FIP').querySelector('.tk')?.textContent).toContain('MP3');
  });
});

describe('Annuaire : l’œil et le badge', () => {
  it('🔴 la fiche s’ouvre depuis l’annuaire ; badge sur la fiche à clé seulement', async () => {
    await monter(RadiosV2);
    (hote.querySelectorAll<HTMLButtonElement>('.sections button')[1]).click();
    await respirer();
    const fip = tuile('FIP', '.grille .fiche');
    const autre = tuile('Radio Sans Cle', '.grille .fiche');
    expect(fip.querySelector('.mdp')).not.toBeNull();
    expect(autre.querySelector('.mdp')).toBeNull();
    expect(titres(autre)).toContain('Voir');
    (autre.querySelector('button.coin.tr') as HTMLButtonElement).click();
    await respirer();
    const d = dialogue()!;
    expect(d.querySelector('h2')?.textContent).toBe('Radio Sans Cle');
    // Pas dans « Mes radios » : un seul flux, lisible par la route de l'annuaire.
    expect(d.querySelectorAll('.flux li').length).toBe(1);
  });

  it('une fiche déjà dans Mes radios se relit là pour choisir son flux', async () => {
    await monter(RadioFicheModale, { annuaire: ANNUAIRE.items[0], onClose: () => {} });
    expect(mocks.getRadios).toHaveBeenCalled();
    expect(dialogue()!.querySelectorAll('.flux li').length).toBe(2);
  });
});

describe('fonctions de la fiche', () => {
  it('aMetadataPlus : la clé, sur la station comme sur la fiche', () => {
    expect(aMetadataPlus(FIP as any)).toBe(true);
    expect(aMetadataPlus(MAISON as any)).toBe(false);
    expect(aMetadataPlus(ANNUAIRE.items[0] as any)).toBe(true);
    expect(aMetadataPlus(ANNUAIRE.items[1] as any)).toBe(false);
  });

  it('ficheDeStation : le choix n’est offert qu’à une station liée par son lien enregistré', () => {
    expect(ficheDeStation(FIP as any).radioId).toBe(7);
    const parFlux = { ...FIP, annuaire: { ...FIP.annuaire, rapproche_par: 'flux' } };
    expect(ficheDeStation(parFlux as any).radioId).toBeNull();
    expect(ficheDeStation(MAISON as any).radioId).toBeNull();
  });

  it('ficheDeAnnuaire : sans `streams` (serveur antérieur), le flux principal seul', () => {
    const f = ficheDeAnnuaire({ external_id: 'X', name: 'X', stream_url: 'https://x/s', codec: 'AAC', bitrate: 96, now_playing: false } as any);
    expect(f.flux).toEqual([{ url: 'https://x/s', codec: 'AAC', bitrate: 96, primary: true }]);
  });

  it('libelleFlux', () => {
    expect(libelleFlux(FLUX[1])).toBe('MP3 · 128 kbit/s · 48 kHz');
    expect(libelleFlux({ url: 'u' })).toBe('');
    // HLS est un protocole, pas un format : jamais affiché
    expect(libelleFlux({ url: 'u', codec: 'AAC', bitrate: 96, hls: true })).toBe('AAC · 96 kbit/s');
    expect(libelleFlux({ url: 'u', codec: 'HLS', hls: true })).toBe('');
  });

  it('🔴 metadataPlusDeLecture : vrai pour la station à clé, retenu pour la session', async () => {
    expect(await metadataPlusDeLecture({ source_id: AAC, album_title: 'FIP' })).toBe(true);
    expect(await metadataPlusDeLecture({ source_id: AAC, album_title: 'FIP' })).toBe(true);
    expect(mocks.getRadios).toHaveBeenCalledTimes(1);
  });

  it('CONTRE-ÉPREUVE : station sans clé, ni dans Mes radios ni dans l’annuaire', async () => {
    mocks.getAnnuaireRadios.mockResolvedValue({ ...ANNUAIRE, items: [] });
    expect(await metadataPlusDeLecture({ source_id: 'https://a/maison.mp3', album_title: 'Radio Maison' })).toBe(false);
    expect(await metadataPlusDeLecture({ source_id: 'z', album_title: 'Inconnue' })).toBe(false);
  });
});

describe('En cours de lecture', () => {
  it('🔴 le nom de la station ouvre la fiche, avec le badge Metadata+ à côté', () => {
    const s = readFileSync(resolve(__dirname, '../../components/partages/NowPlaying.svelte'), 'utf8');
    expect(s).toMatch(/radio-station-lien[\s\S]{0,200}ficheStationOuverte = true[\s\S]{0,200}stationMetadataPlus[\s\S]{0,40}BadgeMetadataPlus/);
    // web#2550/#2551 : le badge, le logo et le bouton « Mes radios » lisent la
    // MÊME station retenue ; le badge en dérive.
    expect(s).toMatch(/stationDeLectureRetenue\(np\)[\s\S]{0,200}stationMetadataPlus = !!s\.fiche\?\.metadataPlus/);
  });
});
