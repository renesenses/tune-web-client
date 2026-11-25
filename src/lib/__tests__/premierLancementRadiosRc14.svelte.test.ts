// @vitest-environment jsdom
//
// Retour de Rémi sur la rc13 (GO de Bertrand, rc14) — une installation neuve
// n'a plus de radios d'office. « Mes radios » vide ouvre directement
// l'annuaire, avec une phrase qui dit pourquoi, dans les vingt langues.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import { clearViewContext } from '../stores/navigation';
import { sectionApresChargement } from '../mesRadiosVide';
import { ONZE_LANGUES, dictionnaire } from './onzeDictionnaires';

const mocks = vi.hoisted(() => ({
  getRadios: vi.fn(), updateRadio: vi.fn(), playRadio: vi.fn(),
  importRadios: vi.fn(), exportRadiosUrl: vi.fn(() => '#'),
  getAnnuaireRadios: vi.fn(), ajouterDepuisAnnuaire: vi.fn(), jouerDepuisAnnuaire: vi.fn(),
}));
vi.mock('../api', async (importOriginal) => ({ ...(await importOriginal<object>()), getConfig: vi.fn(async () => ({ radios_country: '' })), ...mocks }));
vi.mock('../zoneRequise', () => ({ zoneRequise: () => 3 }));

import RadiosV2 from '../../components/v2/RadiosV2.svelte';
import { locale } from '../i18n';

const CLE = 'v2.radio.mineEmptyDirectory';
const station = (id: number, name: string) => ({ id, name, stream_url: `https://t.invalid/${id}`, favorite: false, genre: 'jazz', country_code: 'FR' });
const fiche = (id: string, name: string) => ({
  external_id: id, name, logo_url: null, country_code: 'FR', genre: 'eclectic',
  stream_url: `https://t.invalid/${id}`, radio_metadata_key: null, now_playing: false,
  my_radio_id: null, my_radio_favorite: null,
});
const ANNUAIRE = {
  total: 2, offset: 0, limit: 120, count: 2, stations: 2, origine: 'reseau',
  items: [fiche('S1', 'FIP'), fiche('S2', 'Radio Paradise')],
  countries: [{ code: 'FR', count: 2 }], genres: [{ key: 'eclectic', count: 2 }],
  attribution: { name: 'radio-metadata.fr', url: 'https://radio-metadata.fr', support_url: 'https://ko-fi.com/aleceiffel' },
};

const respirer = async () => { for (let i = 0; i < 10; i++) await new Promise((r) => setTimeout(r, 0)); flushSync(); };
let hote: HTMLDivElement;
let instance: Record<string, unknown> | null = null;

beforeEach(() => {
  clearViewContext('radios');
  HTMLCanvasElement.prototype.getContext = (() => null) as any;
  for (const fn of Object.values(mocks)) fn.mockReset();
  mocks.exportRadiosUrl.mockReturnValue('#');
  mocks.getAnnuaireRadios.mockResolvedValue(ANNUAIRE);
  locale.set('fr');
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

describe('« Mes radios » vide → l’annuaire', () => {
  it('installation neuve : l’annuaire s’ouvre, avec la phrase', async () => {
    mocks.getRadios.mockResolvedValue([]);
    await monter();
    const note = hote.querySelector('[data-testid="mes-radios-vide"]');
    expect(note?.textContent).toBe(dictionnaire('fr')[CLE]);
    expect(mocks.getAnnuaireRadios, 'l’annuaire est chargé').toHaveBeenCalled();
    expect(hote.textContent).toContain('Radio Paradise');
    const onglet = [...hote.querySelectorAll('[role="tab"]')].find((b) => b.getAttribute('aria-selected') === 'true');
    expect(onglet?.textContent?.trim()).toBe(dictionnaire('fr')['v2.radio.tabDirectory']);
  });

  it('contre-épreuve : avec des stations, « Mes radios » reste affichée, sans la phrase', async () => {
    mocks.getRadios.mockResolvedValue([station(1, 'TSF Jazz')]);
    await monter();
    expect(hote.querySelector('[data-testid="mes-radios-vide"]')).toBeNull();
    expect(hote.textContent).toContain('TSF Jazz');
    expect(mocks.getAnnuaireRadios).not.toHaveBeenCalled();
  });

  it('une erreur de chargement n’est pas une liste vide', async () => {
    mocks.getRadios.mockRejectedValue(new Error('réseau'));
    await monter();
    expect(hote.querySelector('[data-testid="mes-radios-vide"]')).toBeNull();
    expect(mocks.getAnnuaireRadios).not.toHaveBeenCalled();
  });
});

describe('sectionApresChargement', () => {
  it('seule « Mes radios » vide bascule sur l’annuaire', () => {
    expect(sectionApresChargement('mes', 0)).toBe('annuaire');
    expect(sectionApresChargement('mes', 3)).toBe('mes');
    expect(sectionApresChargement('mes', 0, true)).toBe('mes');
    expect(sectionApresChargement('annuaire', 0)).toBe('annuaire');
    expect(sectionApresChargement('carte', 0)).toBe('carte');
  });
});

describe('la phrase dans les vingt langues', () => {
  it('présente, non vide, et traduite (pas la phrase anglaise recopiée)', () => {
    const en = dictionnaire('en')[CLE];
    expect(en).toBeTruthy();
    expect(ONZE_LANGUES.length).toBe(20);
    for (const code of ONZE_LANGUES) {
      const v = dictionnaire(code)[CLE];
      expect(v, `${code} : clé absente`).toBeTruthy();
      if (code !== 'en') expect(v, `${code} : phrase anglaise recopiée`).not.toBe(en);
    }
    expect(dictionnaire('fr')[CLE]).toBe('Vous n\'avez pas encore de radios dans Mes radios : parcourez l\'annuaire pour en ajouter.');
  });
});
