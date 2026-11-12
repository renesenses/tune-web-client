// @vitest-environment jsdom
// web#2783 — alec_eiffel, fil 2574 : « Last Played » était posée DANS la vue
// filtrée de « Mes radios » (sous la recherche, les filtres et l'onglet
// Favoris), ce qui laissait croire que toute la liste en dépendait ; elle
// disparaissait aussi dans l'Annuaire et la Carte, et dès qu'un filtre était
// posé.
//
// Attendu : une rangée séparée, tout en haut, AVANT les choix Mes radios /
// Annuaire / Carte, la même partout ; une ligne au plus, « Voir plus » déplie.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import { clearViewContext } from '../stores/navigation';

const mocks = vi.hoisted(() => ({
  getRadios: vi.fn(), updateRadio: vi.fn(), playRadio: vi.fn(), deleteRadio: vi.fn(),
  importRadios: vi.fn(), exportRadiosUrl: vi.fn(() => '#'),
  getAnnuaireRadios: vi.fn(),
}));
vi.mock('../api', async (importOriginal) => ({ ...(await importOriginal<object>()), getConfig: vi.fn(async () => ({ radios_country: '' })), ...mocks }));
vi.mock('../zoneRequise', () => ({ zoneRequise: () => 3 }));

import RadiosV2 from '../../components/v2/RadiosV2.svelte';
import { locale } from '../i18n';

const mk = (id: number, name: string, extra: object = {}) =>
  ({ id, name, stream_url: `https://a/${id}`, favorite: false, genre: 'Jazz', ...extra }) as any;
const A = mk(1, 'Alpha', { favorite: true, last_played: '2026-11-01T10:00:00Z' });
const B = mk(2, 'Bravo', { favorite: true });
const C = mk(3, 'Charlie', { last_played: '2026-11-03T10:00:00Z' });

const respirer = async () => { for (let i = 0; i < 10; i++) await new Promise((r) => setTimeout(r, 0)); flushSync(); };
let hote: HTMLDivElement;
let instance: Record<string, unknown> | null = null;
async function monter(radios: any[]) {
  mocks.getRadios.mockResolvedValue(radios);
  hote = document.createElement('div');
  document.body.append(hote);
  instance = mount(RadiosV2, { target: hote, props: {} });
  flushSync();
  await respirer();
}
const recentes = () => hote.querySelector<HTMLElement>('section.recentes');
const noms = () => [...(recentes()?.querySelectorAll('.st .nm') ?? [])].map((n) => n.textContent);
const onglet = (i: number) => hote.querySelectorAll<HTMLButtonElement>('.sections button')[i];

beforeEach(() => {
  clearViewContext('radios');
  for (const fn of Object.values(mocks)) fn.mockReset();
  mocks.exportRadiosUrl.mockReturnValue('#');
  mocks.getAnnuaireRadios.mockResolvedValue({ total: 0, offset: 0, limit: 120, count: 0, stations: 0, items: [], countries: [], genres: [] });
  localStorage.clear();
  locale.set('fr');
});
afterEach(() => {
  if (instance) unmount(instance as any);
  instance = null;
  hote?.remove();
  document.body.innerHTML = '';
});

describe('#2783 — « Dernières écoutées » séparée de la liste et de l’annuaire', () => {
  it('🔴 rangée posée AVANT les choix Mes radios / Annuaire / Carte, hors de la liste filtrée', async () => {
    await monter([A, B, C]);
    const sec = recentes();
    expect(sec, 'aucune rangée « Dernières écoutées »').not.toBeNull();
    const choix = hote.querySelector('.sections')!;
    expect(sec!.compareDocumentPosition(choix) & Node.DOCUMENT_POSITION_FOLLOWING,
      '« Dernières écoutées » n’est pas au-dessus des choix Mes radios / Annuaire / Carte').toBeTruthy();
    expect(sec!.closest('.scroll'), 'la rangée est encore dans la liste filtrée').toBeNull();
  });

  it('🔴 elle reste affichée dans l’Annuaire et sur la Carte', async () => {
    await monter([A, B, C]);
    onglet(1).click();
    await respirer();
    expect(noms(), 'la rangée disparaît dans l’Annuaire').toEqual(['Charlie', 'Alpha']);
    onglet(2).click();
    await respirer();
    expect(noms(), 'la rangée disparaît sur la Carte').toEqual(['Charlie', 'Alpha']);
  });

  it('🔴 un filtre de « Mes radios » ne l’efface pas, l’onglet Favoris non plus', async () => {
    await monter([A, B, C]);
    (hote.querySelector('.ronglets button') as HTMLButtonElement).click();
    await respirer();
    expect(noms()).toEqual(['Charlie', 'Alpha']);
    const champ = hote.querySelector<HTMLInputElement>('.filtres input')!;
    champ.value = 'Bravo';
    champ.dispatchEvent(new Event('input', { bubbles: true }));
    await respirer();
    expect(noms(), 'la recherche de Mes radios efface la rangée').toEqual(['Charlie', 'Alpha']);
  });

  it('une ligne au plus ; « Voir plus » déplie, « Réduire » replie', async () => {
    await monter([A, B, C]);
    const grille = () => recentes()!.querySelector('.grid')!;
    expect(grille().classList.contains('rangee')).toBe(true);
    const plus = recentes()!.querySelector<HTMLButtonElement>('.plus')!;
    expect(plus.textContent?.trim()).toBe('Voir plus');
    plus.click();
    flushSync();
    expect(grille().classList.contains('rangee')).toBe(false);
    expect(plus.textContent?.trim()).toBe('Réduire');
    plus.click();
    flushSync();
    expect(grille().classList.contains('rangee')).toBe(true);
  });
});
