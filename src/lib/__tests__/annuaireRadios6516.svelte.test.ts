// @vitest-environment jsdom
//
// tune-server-rust#6516 — l'annuaire radio-metadata.fr complet dans « Radio en
// direct ». Le serveur garde l'annuaire en cache et le rend filtré ; l'écran
// l'affiche, l'écoute d'un clic, l'ajoute à « Mes radios » sans doublon, et
// porte la mention de radio-metadata.fr avec son lien Ko-fi (décision du
// 13/10 avec Rémi).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import { get } from 'svelte/store';

const mocks = vi.hoisted(() => ({
  getRadios: vi.fn(), updateRadio: vi.fn(), playRadio: vi.fn(),
  importRadios: vi.fn(), exportRadiosUrl: vi.fn(() => '#'),
  getAnnuaireRadios: vi.fn(), ajouterDepuisAnnuaire: vi.fn(), jouerDepuisAnnuaire: vi.fn(),
  mettreAJourLeFluxDepuisAnnuaire: vi.fn(),
}));
vi.mock('../api', async (importOriginal) => ({ ...(await importOriginal<object>()), getConfig: vi.fn(async () => ({ radios_country: '' })), ...mocks }));
vi.mock('../zoneRequise', () => ({ zoneRequise: () => 3 }));

import RadiosV2 from '../../components/v2/RadiosV2.svelte';
import { notifications } from '../stores/notifications';
import { locale } from '../i18n';

const FIP_LOCALE = { id: 7, name: 'FIP', stream_url: 'https://icecast.radiofrance.fr/fip-hifi.aac', favorite: false };

const fiche = (o: Record<string, unknown>) => ({
  external_id: 'S000973', name: 'FIP', logo_url: 'https://mozaiklabs.fr/storage/radio-logos/fip.png',
  country_code: 'FR', genre: 'eclectic', stream_url: 'https://icecast.radiofrance.fr/fip-hifi.aac',
  radio_metadata_key: 'fip', now_playing: true, my_radio_id: null, my_radio_favorite: null, ...o,
});

const ANNUAIRE = (origine = 'reseau') => ({
  total: 2, offset: 0, limit: 120, count: 2, stations: 836, origine,
  items: [
    fiche({ my_radio_id: 7, my_radio_favorite: false }),
    fiche({ external_id: 'S002479', name: 'Radio Paradise: Main Mix', country_code: 'US',
      stream_url: 'http://stream.radioparadise.com/flacm', radio_metadata_key: 'radioparadise' }),
  ],
  countries: [{ code: 'FR', count: 286 }, { code: 'US', count: 235 }],
  genres: [{ key: 'news', count: 178 }, { key: 'eclectic', count: 136 }],
  attribution: { name: 'radio-metadata.fr', url: 'https://radio-metadata.fr', support_url: 'https://ko-fi.com/aleceiffel' },
});

const attendre = () => new Promise((r) => setTimeout(r, 0));
const respirer = async () => { for (let i = 0; i < 8; i++) await attendre(); flushSync(); };
let hote: HTMLDivElement;
let instance: Record<string, unknown> | null = null;

beforeEach(() => {
  for (const fn of Object.values(mocks)) fn.mockReset();
  mocks.getRadios.mockResolvedValue([FIP_LOCALE]);
  mocks.exportRadiosUrl.mockReturnValue('#');
  mocks.getAnnuaireRadios.mockResolvedValue(ANNUAIRE());
  for (const n of get(notifications)) notifications.dismiss(n.id);
  locale.set('fr');
});
afterEach(() => {
  if (instance) unmount(instance as any);
  instance = null;
  hote?.remove();
  document.body.innerHTML = '';
});

async function ouvrirAnnuaire() {
  hote = document.createElement('div');
  document.body.append(hote);
  instance = mount(RadiosV2, { target: hote, props: {} });
  flushSync();
  await respirer();
  const onglets = hote.querySelectorAll<HTMLButtonElement>('.sections button');
  // Trois depuis web#2400 : « Carte » rejoint Mes radios et Annuaire.
  expect(onglets.length, 'les onglets Mes radios / Annuaire / Carte manquent').toBe(3);
  onglets[1].click();
  await respirer();
  await new Promise((r) => setTimeout(r, 10));
  await respirer();
}

describe('#6516 — l’annuaire dans « Radio en direct »', () => {
  it('🔴 l’onglet Annuaire affiche les fiches du serveur, sans quitter « Mes radios »', async () => {
    await ouvrirAnnuaire();
    expect(mocks.getAnnuaireRadios).toHaveBeenCalled();
    const noms = [...hote.querySelectorAll('.fiche .nm')].map((n) => n.textContent);
    expect(noms).toEqual(['FIP', 'Radio Paradise: Main Mix']);
    // FIP est déjà dans « Mes radios » : pas de bouton d'ajout, une mention.
    const fiches = hote.querySelectorAll('.fiche');
    expect(fiches[0].querySelector('.dedans')).not.toBeNull();
    expect(fiches[0].querySelector('.tl2')).toBeNull();
    expect(fiches[1].querySelector('.tl2')).not.toBeNull();
  });

  it('🔴 la mention radio-metadata.fr porte le lien Ko-fi', async () => {
    await ouvrirAnnuaire();
    const liens = [...hote.querySelectorAll<HTMLAnchorElement>('.source a')].map((a) => a.href);
    expect(liens).toContain('https://ko-fi.com/aleceiffel');
    expect(liens.some((h) => h.startsWith('https://radio-metadata.fr'))).toBe(true);
  });

  it('les filtres pays et genre viennent des facettes du serveur', async () => {
    await ouvrirAnnuaire();
    // #2397 : le pays reste une liste, le genre passe en BOUTONS.
    const choix = hote.querySelectorAll<HTMLSelectElement>('.annuaire select');
    expect(choix.length).toBe(1);
    expect(choix[0].options.length).toBe(3); // tous + FR + US
    const puces = [...hote.querySelectorAll('.annuaire .chip')].map((c) => c.textContent ?? '');
    expect(puces.length).toBe(3); // tous + news + eclectic
    // `news` a sa traduction : la puce n'est plus le mot anglais brut.
    expect(puces[1]).toContain('Info');
  });

  it('🔴 « Ajouter à mes radios » passe par le serveur, et la station rejoint la liste', async () => {
    mocks.ajouterDepuisAnnuaire.mockResolvedValue({
      id: 42, name: 'Radio Paradise: Main Mix', stream_url: 'http://stream.radioparadise.com/flacm', favorite: false,
    });
    await ouvrirAnnuaire();
    // Le serveur, relu au retour sur « Mes radios », rend la station ajoutée.
    mocks.getRadios.mockResolvedValue([FIP_LOCALE, {
      id: 42, name: 'Radio Paradise: Main Mix', stream_url: 'http://stream.radioparadise.com/flacm', favorite: false,
    }]);
    hote.querySelectorAll('.fiche')[1].querySelector<HTMLButtonElement>('.tl2')!.click();
    await respirer();
    expect(mocks.ajouterDepuisAnnuaire).toHaveBeenCalledWith('S002479', false);
    expect(hote.querySelectorAll('.fiche')[1].querySelector('.dedans')).not.toBeNull();
    // Retour à « Mes radios » : la station y est, sans rechargement.
    hote.querySelectorAll<HTMLButtonElement>('.sections button')[0].click();
    await respirer();
    const noms = [...hote.querySelectorAll('.st .nm')].map((n) => n.textContent);
    expect(noms).toContain('Radio Paradise: Main Mix');
  });

  it('🔴 un clic écoute : la fiche hors de « Mes radios » passe par l’annuaire, l’autre par sa station', async () => {
    mocks.jouerDepuisAnnuaire.mockResolvedValue({ zone_id: 3, radio: 'x', output_sent: true });
    mocks.playRadio.mockResolvedValue({ zone_id: 3, radio: 'FIP', output_sent: true });
    await ouvrirAnnuaire();
    const fiches = hote.querySelectorAll('.fiche');
    fiches[1].querySelector<HTMLButtonElement>('.ouvrir')!.click();
    await respirer();
    expect(mocks.jouerDepuisAnnuaire).toHaveBeenCalledWith('S002479', 3);
    expect(mocks.ajouterDepuisAnnuaire).not.toHaveBeenCalled();
    fiches[0].querySelector<HTMLButtonElement>('.ouvrir')!.click();
    await respirer();
    expect(mocks.playRadio).toHaveBeenCalledWith(7, 3);
  });

  it('hors ligne, l’écran dit qu’il sert la copie locale', async () => {
    mocks.getAnnuaireRadios.mockResolvedValue(ANNUAIRE('cache'));
    await ouvrirAnnuaire();
    expect(hote.querySelector('.source .horsligne')).not.toBeNull();
  });

  it('CONTRE-ÉPREUVE : en ligne, pas de mention de copie locale', async () => {
    await ouvrirAnnuaire();
    expect(hote.querySelector('.source .horsligne')).toBeNull();
  });
});

describe('#2397 — plus de proposition « mettre à jour le flux »', () => {
  it('🔴 même quand l’annuaire publie une autre adresse, l’écran n’offre aucun bouton', async () => {
    mocks.getRadios.mockResolvedValue([{
      ...FIP_LOCALE,
      annuaire: { external_id: 'S000973', rapproche_par: 'id', flux_change: true,
        stream_url_annuaire: 'https://nouveau.example/fip.aac' },
    }]);
    hote = document.createElement('div');
    document.body.append(hote);
    instance = mount(RadiosV2, { target: hote, props: {} });
    flushSync();
    await respirer();
    expect(hote.querySelector('.st'), 'la station manque').not.toBeNull();
    expect(hote.querySelector('.st .majflux')).toBeNull();
    expect(mocks.mettreAJourLeFluxDepuisAnnuaire).not.toHaveBeenCalled();
  });
});
