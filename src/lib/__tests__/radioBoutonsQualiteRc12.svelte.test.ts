// @vitest-environment jsdom
// Recette rc12 (14/11, retour de Rémi / radio-metadata.fr ; décision de
// Bertrand « deux boutons, termes justes ») — la ligne des filtres de la vue
// Radios :
//  - des BOUTONS (comme les genres), plus de cases à cocher ;
//  - l'ordre « Mes favoris », « Sans perte », « Haute qualité », « Hi-Res »,
//    « Pays », « Tous les formats », « Toute qualité », Metadata+ ;
//  - « Haute qualité » = sans perte OU ≥ 256 kbit/s, jugé au serveur
//    (`haute_qualite=true`) ;
//  - les pays dans l'ordre alphabétique de la LANGUE EN COURS ;
//  - « Tous les genres », et « Toute qualité » sans « même inconnue » ;
//  - BUG : en vue Annuaire, le nombre de « Tous les genres (n) » ne suivait
//    pas les filtres actifs quand un genre était choisi.
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
import RadioAnnuaire from '../../components/v2/RadioAnnuaire.svelte';
import { locale } from '../i18n';
import { preferences } from '../stores/preferences';
import { get } from 'svelte/store';
import fr from '../locales/fr';
import en from '../locales/en';
import { memoriserTous, compteTous } from '../totalTousLesGenres';
import { trierLesPays, parametresDesFiltres, FILTRES_RADIO_VIDES } from '../radioFiltres';

vi.setConfig({ testTimeout: 60_000 });

const station = (id: number, name: string, country_code: string) =>
  ({ id, name, stream_url: `https://t.invalid/${id}`, favorite: false, genre: null, country_code });
const annuaire = (over: Record<string, unknown> = {}) => ({
  total: 0, offset: 0, limit: 120, count: 0, stations: 0, origine: 'reseau', items: [],
  countries: [{ code: 'US', count: 9 }, { code: 'DE', count: 5 }, { code: 'GB', count: 4 }, { code: 'BE', count: 1 }],
  genres: [{ key: 'news', count: 3 }, { key: 'jazz', count: 2 }],
  attribution: { name: 'radio-metadata.fr', url: 'https://radio-metadata.fr', support_url: 'https://ko-fi.com/aleceiffel' },
  ...over,
});

const respirer = async () => { for (let i = 0; i < 8; i++) await new Promise((r) => setTimeout(r, 0)); flushSync(); };
let hote: HTMLDivElement;
let instance: Record<string, unknown> | null = null;

beforeEach(() => {
  clearViewContext('radios');
  HTMLCanvasElement.prototype.getContext = (() => null) as any;
  for (const fn of Object.values(mocks)) fn.mockReset();
  mocks.getRadios.mockResolvedValue([
    station(1, 'Un', 'US'), station(2, 'Deux', 'DE'), station(3, 'Trois', 'GB'), station(4, 'Quatre', 'BE'), station(5, 'Cinq', 'US'),
  ]);
  mocks.exportRadiosUrl.mockReturnValue('#');
  mocks.getAnnuaireRadios.mockResolvedValue(annuaire());
  mocks.rechercherRadiosParCriteres.mockResolvedValue({ count: 1, items: [station(1, 'Un', 'US')] });
  locale.set('fr');
  preferences.update((p) => ({ ...p, radioFiltres: null }));
});
afterEach(() => {
  if (instance) unmount(instance as any);
  instance = null;
  hote?.remove();
  document.body.innerHTML = '';
  locale.set('fr');
});

async function monter(Composant: any = RadiosV2, props: Record<string, unknown> = {}) {
  hote = document.createElement('div');
  document.body.append(hote);
  instance = mount(Composant, { target: hote, props });
  await respirer();
}
const ligne = () => hote.querySelector('.filtres.ligne, .annuaire .filtres')!;
/** Les champs de la ligne, dans l'ordre du document, chacun par son libellé. */
const ordre = () => [...ligne().querySelectorAll<HTMLElement>('button[aria-pressed], select')]
  .map((e) => e.tagName === 'SELECT'
    ? (e.getAttribute('aria-label') ?? '')
    : (e.dataset.testid === 'radio-filtres-mdp' ? 'Metadata+' : e.textContent?.trim() ?? ''));
const bouton = (testid: string) => hote.querySelector<HTMLButtonElement>(`[data-testid="${testid}"]`)!;
const optionsPays = () => [...hote.querySelector<HTMLSelectElement>('[data-testid="radio-pays"]')!.options]
  .slice(1).map((o) => o.textContent?.replace(/\s*\(\d+\)$/, '').trim());

describe('recette rc12 (14/11) — la ligne des filtres', () => {
  it.each([['Mes radios', RadiosV2], ['Annuaire', RadioAnnuaire]] as const)('%s : boutons, puis pays, puis listes, dans l’ordre de Rémi', async (_nom, C) => {
    await monter(C);
    expect(ordre()).toEqual([
      fr['v2.radio.filters.favorites'], fr['v2.radio.filters.lossless'], fr['v2.radio.filters.highQuality'],
      fr['v2.radio.filters.hires'], fr['v2.radio.country'], fr['v2.radio.filters.format'],
      fr['v2.radio.filters.qualityMin'], 'Metadata+',
    ]);
    // Des boutons, plus une seule case à cocher dans la ligne.
    expect(ligne().querySelector('input[type="checkbox"]')).toBeNull();
    // La recherche reste en tête de la ligne.
    expect(ligne().querySelector('.v2-rech')).not.toBeNull();
  });

  it('🔴 un bouton change de couleur, se retient et part au serveur ; un second clic l’éteint', async () => {
    await monter();
    const hq = bouton('radio-filtres-hq');
    expect(hq.tagName).toBe('BUTTON');
    expect(hq.getAttribute('aria-pressed')).toBe('false');
    expect(hq.classList.contains('active')).toBe(false);
    expect(hq.title).toBe(fr['v2.radio.filters.highQualityTip']);
    hq.click();
    await respirer();
    expect(hq.getAttribute('aria-pressed')).toBe('true');
    expect(hq.classList.contains('active')).toBe(true);
    expect(get(preferences).radioFiltres?.hauteQualite).toBe(true);
    expect(mocks.rechercherRadiosParCriteres).toHaveBeenLastCalledWith('', { haute_qualite: 'true' });
    // Contre-épreuve : « Haute qualité » n'allume pas « Sans perte ».
    expect(bouton('radio-filtres-lossless').getAttribute('aria-pressed')).toBe('false');
    hq.click();
    await respirer();
    expect(hq.classList.contains('active')).toBe(false);
    expect(get(preferences).radioFiltres?.hauteQualite).toBe(false);

    bouton('radio-filtres-lossless').click();
    await respirer();
    expect(mocks.rechercherRadiosParCriteres).toHaveBeenLastCalledWith('', { lossless: 'true' });
    bouton('radio-filtres-favoris').click();
    await respirer();
    expect(mocks.rechercherRadiosParCriteres).toHaveBeenLastCalledWith('', { lossless: 'true', favorites_only: 'true' });
  });

  it('🔴 l’annuaire reçoit haute_qualite=true', async () => {
    preferences.update((p) => ({ ...p, radioFiltres: { ...FILTRES_RADIO_VIDES, hauteQualite: true } }));
    await monter(RadioAnnuaire);
    expect(mocks.getAnnuaireRadios.mock.calls.at(-1)![0].criteres).toEqual({ haute_qualite: 'true' });
    expect(parametresDesFiltres({ ...FILTRES_RADIO_VIDES })).not.toHaveProperty('haute_qualite');
  });

  it('« Tous les genres » et « Toute qualité » (sans « même inconnue »)', async () => {
    await monter(RadioAnnuaire);
    const tous = hote.querySelector('.chips .chip')!.textContent!;
    expect(tous.startsWith('Tous les genres')).toBe(true);
    const qualite = hote.querySelector<HTMLSelectElement>('[data-testid="radio-filtres-qualite"]')!;
    expect(qualite.options[0].textContent?.trim()).toBe('Toute qualité');
    expect(fr['v2.radio.filters.anyQuality']).not.toMatch(/inconnu/);
    expect(en['v2.radio.filters.anyQuality']).not.toMatch(/unknown/);
    expect(en['v2.radio.allGenres']).toBe('All genres');
  });
});

describe('recette rc12 (14/11) — les pays dans l’ordre alphabétique de la langue', () => {
  it.each([['Mes radios', RadiosV2], ['Annuaire', RadioAnnuaire]] as const)('%s : en français puis en anglais', async (_nom, C) => {
    await monter(C);
    expect(optionsPays()).toEqual(['Allemagne', 'Belgique', 'États-Unis', 'Royaume-Uni']);
    locale.set('en');
    await respirer();
    expect(optionsPays()).toEqual(['Belgium', 'Germany', 'United Kingdom', 'United States']);
  });

  it('le tri suit la langue, accents compris (contre-épreuve : pas l’ordre des octets)', () => {
    const noms = ['Zambie', 'États-Unis', 'Espagne', 'Égypte'];
    expect(trierLesPays(noms, (n) => n, 'fr')).toEqual(['Égypte', 'Espagne', 'États-Unis', 'Zambie']);
    expect([...noms].sort()).not.toEqual(['Égypte', 'Espagne', 'États-Unis', 'Zambie']);
    // Suédois : « Ö » vient après « Z ».
    expect(trierLesPays(['Österrike', 'Zambia'], (n) => n, 'sv')).toEqual(['Zambia', 'Österrike']);
    expect(trierLesPays(['Österrike', 'Zambia'], (n) => n, 'de')).toEqual(['Österrike', 'Zambia']);
  });
});

describe('recette rc12 (14/11) — BUG : « Tous les genres (n) » suit les filtres en vue Annuaire', () => {
  it('🔴 genre choisi, un filtre change : le nombre est celui du serveur pour les nouveaux filtres', async () => {
    mocks.getAnnuaireRadios.mockImplementation(async (p: any) => {
      const hq = p.criteres?.haute_qualite === 'true';
      return annuaire({ total: hq ? 2 : 5, total_all_genres: hq ? 40 : 300 });
    });
    await monter(RadioAnnuaire, { genre: 'jazz' });
    const tous = () => hote.querySelector('.chips .chip')!.textContent!;
    expect(tous()).toMatch(/\(300\)/);
    bouton('radio-filtres-hq').click();
    await respirer();
    expect(mocks.getAnnuaireRadios.mock.calls.at(-1)![0].genre).toBe('jazz');
    expect(tous(), 'le compte de « Tous les genres » sous « Haute qualité »').toMatch(/\(40\)/);
  });

  it('contre-épreuve : un serveur sans total_all_genres garde le repli d’avant (réponse sans genre seulement)', () => {
    expect(memoriserTous(null, 'k', 'jazz', 5)).toBeNull();
    expect(memoriserTous(null, 'k', 'jazz', 5, undefined)).toBeNull();
    expect(memoriserTous(null, 'k', null, 5)).toEqual({ cle: 'k', n: 5 });
    expect(memoriserTous(null, 'k', 'jazz', 5, 40)).toEqual({ cle: 'k', n: 40 });
    expect(compteTous(memoriserTous(null, 'k', 'jazz', 5, 40), 'autre')).toBeNull();
  });
});
