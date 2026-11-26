// @vitest-environment jsdom
// Harmonisation de l'interface (rc14, maquette `radios.html` validée par
// Bertrand le 26/11) — écran Live Radio, « Mes radios » :
//  - une ligne d'outils : recherche, segment « Toutes les stations / Favoris »,
//    bouton « Filtres » avec pastille, compte ;
//  - le panneau « Filtres » regroupe pays, format, qualité, sans perte, haute
//    qualité et Metadata+ ; « Mes favoris » n'y est plus (doublon) ;
//  - genres sur une ligne qui défile ;
//  - Metadata+ réduit à une icône ; pochette générée pour les stations sans logo.
import { clearViewContext } from '../stores/navigation';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';

const mocks = vi.hoisted(() => ({
  getRadios: vi.fn(), updateRadio: vi.fn(), playRadio: vi.fn(),
  importRadios: vi.fn(), exportRadiosUrl: vi.fn(() => '#'),
  getAnnuaireRadios: vi.fn(), ajouterDepuisAnnuaire: vi.fn(), jouerDepuisAnnuaire: vi.fn(),
  rechercherRadiosParCriteres: vi.fn(),
}));
vi.mock('../api', async (importOriginal) => ({ ...(await importOriginal<object>()), getConfig: vi.fn(async () => ({ radios_country: '' })), ...mocks }));
vi.mock('../zoneRequise', () => ({ zoneRequise: () => 3 }));

import RadiosV2 from '../../components/v2/RadiosV2.svelte';
import { locale } from '../i18n';
import { preferences } from '../stores/preferences';
import { get } from 'svelte/store';
import fr from '../locales/fr';
import en from '../locales/en';
import { FILTRES_RADIO_VIDES, filtresMesRadios, nombreDeFiltresPanneau, parametresDesFiltres } from '../radioFiltres';
import { initialesStation, logoDeStation, stationsDuSegment } from '../mesRadios';

const station = (id: number, name: string, extra: Record<string, unknown> = {}) => ({
  id, name, stream_url: `https://t.invalid/${id}`, favorite: false, genre: null, country_code: 'FR',
  logo_url: `https://t.invalid/${id}.png`, ...extra,
});
const ANNUAIRE = {
  total: 0, offset: 0, limit: 120, count: 0, stations: 0, origine: 'reseau', items: [], countries: [], genres: [],
  attribution: { name: 'radio-metadata.fr', url: 'https://radio-metadata.fr', support_url: 'https://ko-fi.com/aleceiffel' },
};

const respirer = async () => { for (let i = 0; i < 8; i++) await new Promise((r) => setTimeout(r, 0)); flushSync(); };
let hote: HTMLDivElement;
let instance: Record<string, unknown> | null = null;

beforeEach(() => {
  clearViewContext('radios');
  HTMLCanvasElement.prototype.getContext = (() => null) as any;
  for (const fn of Object.values(mocks)) fn.mockReset();
  mocks.getRadios.mockResolvedValue([
    station(1, 'Jazz Sans Perte', { favorite: true, country_code: 'FR' }),
    station(2, 'Rock Compresse', { country_code: 'GB' }),
    station(3, 'Classic Oldies Mix', { logo_url: null, country_code: 'FR' }),
  ]);
  mocks.exportRadiosUrl.mockReturnValue('#');
  mocks.getAnnuaireRadios.mockResolvedValue(ANNUAIRE);
  mocks.rechercherRadiosParCriteres.mockResolvedValue({ count: 1, items: [station(1, 'Jazz Sans Perte')] });
  locale.set('fr');
  preferences.update((p) => ({ ...p, radioFiltres: null }));
});
afterEach(() => {
  if (instance) unmount(instance as any);
  instance = null;
  hote?.remove();
  document.body.innerHTML = '';
});

async function monter() {
  hote = document.createElement('div');
  document.body.append(hote);
  instance = mount(RadiosV2, { target: hote, props: {} });
  await respirer();
}
const q = <T extends Element = HTMLElement>(testid: string) => hote.querySelector<T & Element>(`[data-testid="${testid}"]`);
const noms = () => [...hote.querySelectorAll('.mesradios .nm')].map((n) => n.textContent?.trim());
async function ouvrirFiltres() {
  q<HTMLButtonElement>('radio-filtres-bouton')!.click();
  await respirer();
}

describe('fonctions pures', () => {
  it('le segment : toutes les stations, ou les favoris ; sans favori, retombe sur toutes (#863)', () => {
    const a = { id: 1, favorite: true }, b = { id: 2, favorite: false }, c = { id: 3 };
    expect(stationsDuSegment([a, b, c], false)).toEqual({ favoris: [a], liste: [a, b, c], surFavoris: false });
    expect(stationsDuSegment([a, b, c], true)).toEqual({ favoris: [a], liste: [a], surFavoris: true });
    expect(stationsDuSegment([b, c], true)).toEqual({ favoris: [], liste: [b, c], surFavoris: false });
  });

  it('la pastille compte les critères du panneau et le pays, jamais « Mes favoris »', () => {
    expect(nombreDeFiltresPanneau({ ...FILTRES_RADIO_VIDES })).toBe(0);
    expect(nombreDeFiltresPanneau({ ...FILTRES_RADIO_VIDES, favoris: true })).toBe(0);
    expect(nombreDeFiltresPanneau({ ...FILTRES_RADIO_VIDES, lossless: true, codec: 'flac' }, 1)).toBe(3);
    expect(nombreDeFiltresPanneau({
      codec: 'aac', qualiteMin: '128', lossless: true, hauteQualite: true, metadataPlus: true, favoris: true,
    })).toBe(5);
    expect(nombreDeFiltresPanneau({ ...FILTRES_RADIO_VIDES }, -3)).toBe(0);
  });

  it('« Mes radios » n’envoie plus favorites_only (préférence ancienne)', () => {
    const f = { ...FILTRES_RADIO_VIDES, favoris: true, lossless: true };
    expect(parametresDesFiltres(filtresMesRadios(f))).toEqual({ lossless: 'true' });
    // Contre-épreuve : l'annuaire, lui, garde le critère.
    expect(parametresDesFiltres(f)).toEqual({ lossless: 'true', favorites_only: 'true' });
  });

  it('initiales de la pochette générée', () => {
    expect(initialesStation('Classic Oldies Mix')).toBe('CO');
    expect(initialesStation('Radio Paradise Mellow')).toBe('RP');
    expect(initialesStation('Nostalgie')).toBe('N');
    expect(initialesStation('1.FM: Amsterdam Trance')).toBe('1F');
    expect(initialesStation('  élan  vital ')).toBe('ÉV');
    expect(initialesStation('')).toBe('');
    expect(initialesStation(null)).toBe('');
  });

  it('logo : le sien, sinon celui de la fiche d’annuaire, sinon rien', () => {
    expect(logoDeStation({ logo_url: 'a.png' })).toBe('a.png');
    expect(logoDeStation({ logo_url: '', annuaire: { logo_url: 'b.png' } as any })).toBe('b.png');
    expect(logoDeStation({ logo_url: '  ', annuaire: null as any })).toBeNull();
    expect(logoDeStation({ logo_url: null })).toBeNull();
  });
});

describe('écran « Mes radios »', () => {
  it('une seule ligne : recherche, segment, « Filtres », compte — et plus de doublon des favoris', async () => {
    await monter();
    const ligne = hote.querySelector('.filtres.ligne')!;
    // `.rfa` est en `display: contents` : ses enfants sont des éléments de la ligne.
    const elements = [...ligne.children].flatMap((e) => (e.classList.contains('rfa') ? [...e.children] : [e]));
    const ordre = elements.map((e) =>
      e.classList.contains('v2-rech') ? 'recherche'
        : (e as HTMLElement).dataset.testid === 'radio-segment' ? 'segment'
        : e.classList.contains('ancre') ? 'filtres'
        : (e as HTMLElement).dataset.testid === 'radio-filtres-total' ? 'compte' : e.className);
    expect(ordre).toEqual(['recherche', 'segment', 'filtres', 'compte']);
    // Ni le bouton « Mes favoris », ni les anciens onglets.
    expect(q('radio-filtres-favoris')).toBeNull();
    expect(hote.querySelector('.ronglets')).toBeNull();
    expect(hote.textContent).not.toContain(fr['v2.radio.filters.favorites']);
    // Le panneau est fermé tant qu'on ne l'ouvre pas.
    expect(q('radio-filtres-panneau')).toBeNull();
    expect(q('radio-filtres-bouton')!.getAttribute('aria-expanded')).toBe('false');
  });

  it('le segment bascule entre toutes les stations et les favoris, avec leurs comptes', async () => {
    await monter();
    const toutes = q<HTMLButtonElement>('radio-segment-all')!;
    const favoris = q<HTMLButtonElement>('radio-segment-favoris')!;
    expect(toutes.querySelector('.rn')!.textContent).toBe('3');
    expect(favoris.querySelector('.rn')!.textContent).toBe('1');
    expect(toutes.getAttribute('aria-selected')).toBe('true');
    expect(q('radio-filtres-total')!.textContent).toBe('3 stations');
    favoris.click();
    await respirer();
    expect(favoris.getAttribute('aria-selected')).toBe('true');
    expect(noms()).toEqual(['Jazz Sans Perte']);
    expect(q('radio-filtres-total')!.textContent).toBe('1 stations');
    // Aucune requête de critères pour autant : le segment est local.
    expect(mocks.rechercherRadiosParCriteres).not.toHaveBeenCalled();
  });

  it('sans aucun favori, le segment « Favoris » est inactif', async () => {
    mocks.getRadios.mockResolvedValue([station(2, 'Rock Compresse')]);
    await monter();
    expect(q<HTMLButtonElement>('radio-segment-favoris')!.disabled).toBe(true);
  });

  it('le panneau regroupe pays, format, qualité, sans perte, haute qualité et Metadata+', async () => {
    await monter();
    await ouvrirFiltres();
    const p = q('radio-filtres-panneau')!;
    expect(p).not.toBeNull();
    expect(p.querySelector('[data-testid="radio-pays"]')).not.toBeNull();
    expect(p.querySelector('[data-testid="radio-filtres-format-any"]')).not.toBeNull();
    expect(p.querySelector('[data-testid="radio-filtres-format-flac"]')).not.toBeNull();
    expect(p.querySelector('[data-testid="radio-filtres-qualite"]')).not.toBeNull();
    expect(p.querySelector('[data-testid="radio-filtres-lossless"]')).not.toBeNull();
    expect(p.querySelector('[data-testid="radio-filtres-hq"]')).not.toBeNull();
    expect(p.querySelector('[data-testid="radio-filtres-mdp"]')!.getAttribute('role')).toBe('switch');
    expect(p.querySelector('[data-testid="radio-filtres-favoris"]')).toBeNull();
    expect(p.textContent).toContain(fr['v2.radio.metadataOnly']);
    expect(p.textContent).toContain(fr['v2.radio.metadataOnlyHint']);
  });

  it('un critère part au serveur, allume la pastille ; « Réinitialiser » efface aussi le pays', async () => {
    await monter();
    expect(q('radio-filtres-pastille')).toBeNull();
    await ouvrirFiltres();
    q<HTMLButtonElement>('radio-filtres-format-flac')!.click();
    await respirer();
    expect(get(preferences).radioFiltres?.codec).toBe('flac');
    expect(mocks.rechercherRadiosParCriteres).toHaveBeenLastCalledWith('', { codec: 'flac' });
    expect(q('radio-filtres-pastille')!.textContent).toBe('1');
    expect(noms()).toEqual(['Jazz Sans Perte']);

    const pays = q<HTMLSelectElement>('radio-pays')!;
    pays.value = 'GB';
    pays.dispatchEvent(new Event('change'));
    await respirer();
    expect(q('radio-filtres-pastille')!.textContent).toBe('2');

    q<HTMLButtonElement>('radio-filtres-effacer')!.click();
    await respirer();
    expect(get(preferences).radioFiltres?.codec).toBeNull();
    expect(q('radio-filtres-pastille')).toBeNull();
    expect(noms()).toEqual(['Jazz Sans Perte', 'Rock Compresse', 'Classic Oldies Mix']);
  });

  it('« Afficher N stations » donne le compte et referme le panneau', async () => {
    await monter();
    await ouvrirFiltres();
    const montrer = q<HTMLButtonElement>('radio-filtres-montrer')!;
    expect(montrer.textContent?.trim()).toBe(fr['v2.radio.filtersShowN'].replace('{n}', '3'));
    montrer.click();
    await respirer();
    expect(q('radio-filtres-panneau')).toBeNull();
  });

  it('Échap et le clic ailleurs referment le panneau', async () => {
    await monter();
    await ouvrirFiltres();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await respirer();
    expect(q('radio-filtres-panneau')).toBeNull();
    await ouvrirFiltres();
    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    await respirer();
    expect(q('radio-filtres-panneau')).toBeNull();
  });

  it('une préférence ancienne « Mes favoris » ne filtre plus « Mes radios » en silence', async () => {
    preferences.update((p) => ({ ...p, radioFiltres: { ...FILTRES_RADIO_VIDES, favoris: true } }));
    await monter();
    expect(mocks.rechercherRadiosParCriteres).not.toHaveBeenCalled();
    expect(noms()).toHaveLength(3);
    expect(q('radio-filtres-pastille')).toBeNull();
  });

  it('Metadata+ : une petite icône avec infobulle, plus le mot', async () => {
    mocks.getRadios.mockResolvedValue([station(1, 'FIP', { radio_metadata_key: 'fip' })]);
    await monter();
    const icone = q('radio-mdp-icone')!;
    expect(icone).not.toBeNull();
    expect(icone.getAttribute('title')).toBe(fr['v2.radio.metadataPlusTip']);
    expect(icone.getAttribute('aria-label')).toBe(fr['v2.radio.metadataPlus']);
    expect(icone.textContent?.trim()).toBe('');
    expect(hote.querySelector('.mesradios .nm-ligne')!.textContent).not.toContain('Metadata+');
  });

  it('pochette générée pour une station sans logo, image pour les autres', async () => {
    await monter();
    const gen = [...hote.querySelectorAll('[data-testid="radio-pochette-generee"]')];
    expect(gen).toHaveLength(1);
    expect(gen[0].getAttribute('aria-label')).toBe('Classic Oldies Mix');
    expect(gen[0].querySelector('.ini')!.textContent).toBe('CO');
  });

  it('genres : une ligne qui défile, compte à part (plus de « (n) »)', async () => {
    mocks.getRadios.mockResolvedValue([
      station(1, 'A', { genre: 'Jazz' }), station(2, 'B', { genre: 'Rock' }),
    ]);
    await monter();
    const tous = hote.querySelector('.genres .chip')!;
    expect(tous.textContent).toContain(fr['v2.radio.allGenres']);
    expect(tous.textContent).not.toMatch(/\(\d+\)/);
    expect(tous.querySelector('.n')!.textContent).toBe('2');
  });

  it('les nouvelles chaînes existent en anglais et en français', () => {
    for (const k of ['v2.radio.filters', 'v2.radio.filtersQuality', 'v2.radio.filtersReset', 'v2.radio.filtersShowN',
      'v2.radio.metadataOnly', 'v2.radio.metadataOnlyHint', 'v2.radio.moreGenres'] as const) {
      expect((fr as Record<string, string>)[k], k).toBeTruthy();
      expect((en as Record<string, string>)[k], k).toBeTruthy();
    }
    expect((en as Record<string, string>)['v2.radio.filtersShowN']).toContain('{n}');
  });
});
