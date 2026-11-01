// @vitest-environment jsdom
// tune-server-rust#7466 — « Plus de filtres » sur l'écran Radio : « Mes
// radios » garde les stations que le serveur retient, l'annuaire reçoit les
// critères, et le choix est retenu dans les préférences.
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

const station = (id: number, name: string) => ({ id, name, stream_url: `https://t.invalid/${id}`, favorite: false, genre: null, country_code: 'FR' });
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
  mocks.getRadios.mockResolvedValue([station(1, 'Jazz Sans Perte'), station(2, 'Rock Compresse')]);
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
const noms = () => [...hote.querySelectorAll('.nm')].map((n) => n.textContent?.trim());
const total = () => hote.querySelector('[data-testid="radio-filtres-total"]')?.textContent?.trim();

describe('tune-server-rust#7466 — « Plus de filtres »', () => {
  it('sans critère : toutes mes radios, aucune requête de critères, barre repliée', async () => {
    await monter();
    expect(noms()).toEqual(['Jazz Sans Perte', 'Rock Compresse']);
    expect(mocks.rechercherRadiosParCriteres).not.toHaveBeenCalled();
    expect(hote.querySelector('[data-testid="radio-filtres-corps"]')).toBeNull();
    expect(total()).toBe('2 stations');
  });

  it('🔴 « Sans perte » : seules les stations que le serveur retient, et le compteur suit', async () => {
    preferences.update((p) => ({ ...p, radioFiltres: { codec: null, bitrateMin: null, lossless: true, hires: false, metadataPlus: false, favoris: false } }));
    await monter();
    expect(mocks.rechercherRadiosParCriteres).toHaveBeenCalledWith('', { lossless: 'true' });
    expect(noms()).toEqual(['Jazz Sans Perte']);
    expect(total()).toBe('1 stations');
    // La barre reste ouverte quand un critère est actif.
    expect(hote.querySelector('[data-testid="radio-filtres-corps"]')).not.toBeNull();
  });

  it('🔴 la case Metadata+ est retenue dans les préférences et part vers l’annuaire', async () => {
    await monter();
    hote.querySelector<HTMLButtonElement>('[data-testid="radio-filtres-bascule"]')!.click();
    flushSync();
    const mdp = hote.querySelector<HTMLInputElement>('[data-testid="radio-filtres-mdp"]')!;
    expect(mdp.closest('label')?.textContent).toContain(fr['v2.radio.metadataPlus']);
    mdp.click();
    await respirer();
    expect(get(preferences).radioFiltres?.metadataPlus).toBe(true);
    expect(mocks.rechercherRadiosParCriteres).toHaveBeenLastCalledWith('', { metadata_plus: 'true' });

    [...hote.querySelectorAll<HTMLButtonElement>('.sections button')]
      .find((b) => b.textContent?.trim() === fr['v2.radio.tabDirectory'])!.click();
    await respirer();
    const appel = mocks.getAnnuaireRadios.mock.calls.at(-1)![0];
    expect(appel.criteres).toEqual({ metadata_plus: 'true' });
  });
});
