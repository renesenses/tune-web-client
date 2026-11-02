// @vitest-environment jsdom
import { clearViewContext } from '../stores/navigation';
//
// web#2400 — la carte des radios, troisième onglet de la page Radio.
// Les données viennent de l'annuaire du serveur (`/radios/directory`), les
// réseaux des mots-clés de chaque fiche (tune-server-rust#7194), l'écoute et
// l'ajout passent par les gestes de l'onglet Annuaire.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';

const mocks = vi.hoisted(() => ({
  getRadios: vi.fn(), updateRadio: vi.fn(), playRadio: vi.fn(),
  importRadios: vi.fn(), exportRadiosUrl: vi.fn(() => '#'),
  getAnnuaireRadios: vi.fn(), ajouterDepuisAnnuaire: vi.fn(), jouerDepuisAnnuaire: vi.fn(),
}));
vi.mock('../api', async (importOriginal) => ({ ...(await importOriginal<object>()), getConfig: vi.fn(async () => ({ radios_country: '' })), ...mocks }));
vi.mock('../zoneRequise', () => ({ zoneRequise: () => 3 }));

import RadiosV2 from '../../components/v2/RadiosV2.svelte';
import { locale } from '../i18n';
import fr from '../locales/fr';

const fiche = (o: Record<string, unknown>) => ({
  external_id: 'S000973', name: 'FIP', logo_url: 'https://mozaiklabs.fr/storage/radio-logos/fip.png',
  country_code: 'FR', genre: 'eclectic', categories: ['eclectic'], keywords: ['Radio France'],
  stream_url: 'https://icecast.radiofrance.fr/fip-hifi.aac', now_playing: true,
  my_radio_id: null, my_radio_favorite: null, ...o,
});
const ANNUAIRE = {
  total: 4, offset: 0, limit: 1000, count: 4, stations: 4, origine: 'reseau',
  items: [
    fiche({ my_radio_id: 7 }),
    fiche({ external_id: 'S000974', name: 'FIP Jazz', genre: 'jazz', categories: ['jazz'] }),
    fiche({ external_id: 'S002479', name: 'Radio Paradise: Main Mix', country_code: 'US', keywords: [], logo_url: null }),
    fiche({ external_id: 'S003000', name: 'WBGO', country_code: 'US', genre: 'jazz', categories: ['jazz'], keywords: ['NPR'] }),
  ],
  countries: [], genres: [],
  attribution: { name: 'radio-metadata.fr', url: 'https://radio-metadata.fr', support_url: 'https://ko-fi.com/aleceiffel' },
};

const respirer = async () => { for (let i = 0; i < 8; i++) await new Promise((r) => setTimeout(r, 0)); flushSync(); };
let hote: HTMLDivElement;
let instance: Record<string, unknown> | null = null;

beforeEach(() => {
  clearViewContext('radios');
  // jsdom n'a pas de canevas : le décor se tait, les nœuds (des boutons) restent.
  HTMLCanvasElement.prototype.getContext = (() => null) as any;
  for (const fn of Object.values(mocks)) fn.mockReset();
  mocks.getRadios.mockResolvedValue([]);
  mocks.exportRadiosUrl.mockReturnValue('#');
  mocks.getAnnuaireRadios.mockResolvedValue(ANNUAIRE);
  mocks.playRadio.mockResolvedValue({});
  mocks.jouerDepuisAnnuaire.mockResolvedValue({});
  locale.set('fr');
});
afterEach(() => {
  if (instance) unmount(instance as any);
  instance = null;
  hote?.remove();
  document.body.innerHTML = '';
});

async function ouvrirCarte() {
  hote = document.createElement('div');
  document.body.append(hote);
  instance = mount(RadiosV2, { target: hote, props: {} });
  await respirer();
  const onglet = [...hote.querySelectorAll<HTMLButtonElement>('.sections button')]
    .find((b) => b.textContent?.trim() === fr['v2.radio.tabMap']);
  expect(onglet, 'l’onglet « Carte » manque').toBeTruthy();
  onglet!.click();
  await respirer();
}
const bouton = (texte: string) => [...hote.querySelectorAll<HTMLButtonElement>('button')]
  .find((b) => b.textContent?.trim() === texte);
const groupes = () => [...hote.querySelectorAll<HTMLButtonElement>('.noeuds .groupe')].map((b) => b.getAttribute('aria-label'));

describe('web#2400 — la carte des radios', () => {
  it('lit l’annuaire entier en une page et montre les genres, traduits', async () => {
    await ouvrirCarte();
    expect(mocks.getAnnuaireRadios).toHaveBeenCalledWith({ limit: 1000 });
    expect(groupes()).toEqual(['Éclectique, 2 stations', 'Jazz, 2 stations']);
  });

  it('🔴 le mode Réseaux range les stations par le diffuseur de leurs mots-clés', async () => {
    await ouvrirCarte();
    bouton(fr['v2.carte.radio.networks'])!.click();
    await respirer();
    expect(groupes()).toEqual([
      'Radio France, 2 stations', 'NPR, 1 station', `${fr['v2.carte.radio.noNetwork']}, 1 station`,
    ]);
  });

  it('entrer dans un groupe, puis remonter au clavier', async () => {
    await ouvrirCarte();
    hote.querySelector<HTMLButtonElement>('.noeuds .groupe')!.click();
    await respirer();
    // Éclectique → ses pays.
    expect(groupes()).toEqual(['France, 1 station', 'États-Unis, 1 station']);
    const scene = hote.querySelector<HTMLElement>('.noeuds')!;
    scene.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await respirer();
    expect(groupes()).toEqual(['Éclectique, 2 stations', 'Jazz, 2 stations']);
  });

  it('un seul nœud tabulable à la fois ; les flèches déplacent le focus', async () => {
    await ouvrirCarte();
    const tab = () => [...hote.querySelectorAll<HTMLButtonElement>('.noeuds button')].map((b) => b.tabIndex);
    expect(tab()).toEqual([0, -1]);
    hote.querySelector<HTMLElement>('.noeuds')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    await respirer();
    hote.querySelector<HTMLElement>('.noeuds')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    await respirer();
    expect(tab()).toEqual([-1, 0]);
  });

  it('🔴 la vue Liste donne les mêmes stations, et « Écouter » passe par le geste de l’annuaire', async () => {
    await ouvrirCarte();
    bouton(fr['v2.carte.viewList'])!.click();
    await respirer();
    const noms = [...hote.querySelectorAll('.liste li .t b')].map((b) => b.textContent);
    expect(noms.sort()).toEqual(['FIP', 'FIP Jazz', 'Radio Paradise: Main Mix', 'WBGO']);
    // Une station déjà dans « Mes radios » se joue comme sa station…
    [...hote.querySelectorAll<HTMLButtonElement>('.liste li button')].find((b) => b.textContent?.includes('FIP') && !b.textContent.includes('Jazz'))!.click();
    await respirer();
    expect(hote.querySelector('.volet h2')?.textContent).toBe('FIP');
    bouton(fr['v2.carte.radio.play'])!.click();
    await respirer();
    expect(mocks.playRadio).toHaveBeenCalledWith(7, 3);
    // … les autres par l'annuaire, sans rien ajouter.
    [...hote.querySelectorAll<HTMLButtonElement>('.liste li button')].find((b) => b.textContent?.includes('WBGO'))!.click();
    await respirer();
    bouton(fr['v2.carte.radio.play'])!.click();
    await respirer();
    expect(mocks.jouerDepuisAnnuaire).toHaveBeenCalledWith('S003000', 3);
    expect(mocks.ajouterDepuisAnnuaire).not.toHaveBeenCalled();
  });

  it('les stations proches partagent le réseau ou le genre', async () => {
    await ouvrirCarte();
    bouton(fr['v2.carte.viewList'])!.click();
    await respirer();
    [...hote.querySelectorAll<HTMLButtonElement>('.liste li button')].find((b) => b.textContent?.includes('WBGO'))!.click();
    await respirer();
    const proches = [...hote.querySelectorAll('.volet .proches b')].map((b) => b.textContent);
    expect(proches).toEqual(['FIP Jazz']);
    expect(hote.querySelector('.volet .proches small')?.textContent).toBe(fr['v2.carte.radio.sameGenre']);
  });

  it('les logos passent par le serveur Tune, jamais en direct', async () => {
    await ouvrirCarte();
    hote.querySelector<HTMLButtonElement>('.noeuds .groupe')!.click();
    await respirer();
    hote.querySelector<HTMLButtonElement>('.noeuds .groupe')!.click();
    await respirer();
    const img = hote.querySelector<HTMLImageElement>('.noeuds .element img')!;
    expect(img.getAttribute('src')).toContain('/library/artwork/proxy?url=');
    expect(img.getAttribute('src')).not.toMatch(/^https:\/\/mozaiklabs/);
  });
});
