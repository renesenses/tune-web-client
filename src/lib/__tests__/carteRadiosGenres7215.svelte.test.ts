// @vitest-environment jsdom
//
// tune-server-rust#7215 — la carte des radios range une station sous CHACUN de
// ses genres (`genres` de `/radios/directory`), avec repli sur `genre`.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';

const mocks = vi.hoisted(() => ({
  getRadios: vi.fn(), updateRadio: vi.fn(), playRadio: vi.fn(),
  importRadios: vi.fn(), exportRadiosUrl: vi.fn(() => '#'),
  getAnnuaireRadios: vi.fn(), ajouterDepuisAnnuaire: vi.fn(), jouerDepuisAnnuaire: vi.fn(),
}));
vi.mock('../api', async (importOriginal) => ({ ...(await importOriginal<object>()), ...mocks }));
vi.mock('../zoneRequise', () => ({ zoneRequise: () => 3 }));

import RadiosV2 from '../../components/v2/RadiosV2.svelte';
import { locale } from '../i18n';
import fr from '../locales/fr';

const fiche = (o: Record<string, unknown>) => ({
  external_id: 'S100001', name: 'OuiFM Blues & Rock', logo_url: null, country_code: 'FR',
  genre: 'blues', genres: ['blues', 'rock'], categories: [], keywords: [],
  stream_url: 'https://ouifm.example/bluesrock', now_playing: false,
  my_radio_id: null, my_radio_favorite: null, ...o,
});
const ANNUAIRE = {
  total: 3, offset: 0, limit: 1000, count: 3, stations: 3, origine: 'reseau',
  items: [
    fiche({}),
    fiche({ external_id: 'S100002', name: 'Classic Rock', genre: 'rock', genres: ['rock'] }),
    // un serveur plus ancien : `genre` seul
    fiche({ external_id: 'S100003', name: 'Vieux Jazz', genre: 'jazz', genres: undefined }),
  ],
  countries: [], genres: [],
  attribution: { name: 'radio-metadata.fr', url: 'https://radio-metadata.fr', support_url: 'https://ko-fi.com/aleceiffel' },
};

const respirer = async () => { for (let i = 0; i < 8; i++) await new Promise((r) => setTimeout(r, 0)); flushSync(); };
let hote: HTMLDivElement;
let instance: Record<string, unknown> | null = null;

beforeEach(() => {
  HTMLCanvasElement.prototype.getContext = (() => null) as any;
  for (const fn of Object.values(mocks)) fn.mockReset();
  mocks.getRadios.mockResolvedValue([]);
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

async function ouvrirCarte() {
  hote = document.createElement('div');
  document.body.append(hote);
  instance = mount(RadiosV2, { target: hote, props: {} });
  await respirer();
  [...hote.querySelectorAll<HTMLButtonElement>('.sections button')]
    .find((b) => b.textContent?.trim() === fr['v2.radio.tabMap'])!.click();
  await respirer();
}
const groupes = () => [...hote.querySelectorAll<HTMLButtonElement>('.noeuds .groupe')].map((b) => b.getAttribute('aria-label'));

describe('tune-server-rust#7215 — la carte et les genres multiples', () => {
  it('🔴 OuiFM Blues & Rock compte sous Rock ET sous Blues ; l’ancien format sous son genre', async () => {
    await ouvrirCarte();
    expect(groupes()).toEqual(['Rock, 2 stations', 'Blues, 1 station', 'Jazz, 1 station']);
  });
});
