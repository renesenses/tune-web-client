// @vitest-environment jsdom
// web#2716 — Radio : « Mes radios » et « Dernières écoutées » ne se mélangent
// plus. x station répétée,
// une section vide ne s'affiche pas. Contre-épreuve : `sectionsRadio` sans
// dédoublonnage (l'état d'avant) fait échouer le test « aucun doublon ».
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
import { sectionsRadio } from '../mesRadios';
import { locale } from '../i18n';

const mk = (id: number, name: string, extra: object = {}) =>
  ({ id, name, stream_url: `https://a/${id}`, favorite: false, genre: 'Jazz', ...extra }) as any;
const A = mk(1, 'Alpha', { favorite: true, last_played: '2026-11-01T10:00:00Z' });
const B = mk(2, 'Bravo', { favorite: true });
const C = mk(3, 'Charlie', { last_played: '2026-11-03T10:00:00Z' });
const D = mk(4, 'Delta', { last_played: '2026-11-02T10:00:00Z' });

const respirer = async () => { for (let i = 0; i < 10; i++) await new Promise((r) => setTimeout(r, 0)); flushSync(); };
let hote: HTMLDivElement;
let instance: Record<string, unknown> | null = null;
async function monter(radios: any[], favoris = false) {
  mocks.getRadios.mockResolvedValue(radios);
  hote = document.createElement('div');
  document.body.append(hote);
  instance = mount(RadiosV2, { target: hote, props: {} });
  flushSync();
  await respirer();
  if (favoris) { (hote.querySelector('.ronglets button') as HTMLButtonElement).click(); await respirer(); }
}
const noms = (sel: string) => [...hote.querySelectorAll(`${sel} .st .nm`)].map((n) => n.textContent);

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

describe('#2716 — sectionsRadio', () => {
  it('garde une station présente dans les deux sections', () => {
    const r = sectionsRadio([A, B], [C, A, D]);
    expect(r.mes.map((x) => x.id)).toEqual([1, 2]);
    expect(r.recentes.map((x) => x.id)).toEqual([3, 1, 4]);
  });
  it('pas de doublon à l’intérieur d’une section', () => {
    const r = sectionsRadio([A, A, B], [C, C]);
    expect(r.mes.map((x) => x.id)).toEqual([1, 2]);
    expect(r.recentes.map((x) => x.id)).toEqual([3]);
  });
  it('section vide : rien à montrer', () => {
    expect(sectionsRadio([A], []).recentes).toEqual([]);
    expect(sectionsRadio([], [C]).mes).toEqual([]);
  });
});

describe('#2716 — écran Radio', () => {
  it('dans chaque onglet : Dernières écoutées d’abord, puis Mes radios', async () => {
    for (const favoris of [false, true]) {
      await monter([A, B, C, D], favoris);
      // web#2783 : « Dernières écoutées » est rendue au-dessus des choix
      // Mes radios / Annuaire / Carte, hors de la zone défilante filtrée.
      const secs = [...hote.querySelectorAll('section.sec')];
      expect(secs.map((s) => s.querySelector('h2')?.textContent)).toEqual(['Dernières écoutées', 'Mes radios']);
      expect(secs[0].classList.contains('recentes')).toBe(true);
      expect(secs[1].classList.contains('mesradios')).toBe(true);
      unmount(instance as any); instance = null; hote.remove();
    }
  });

  it('récentes triées par last_played décroissant, et une radio peut être dans les deux', async () => {
    await monter([A, B, C, D]);
    expect(noms('.recentes')).toEqual(['Charlie', 'Delta', 'Alpha']);
    expect(noms('.mesradios')).toEqual(['Alpha', 'Bravo', 'Charlie', 'Delta']);
  });

  it('onglet Favoris : les récentes restent en haut, Mes radios = favoris', async () => {
    await monter([A, B, C, D], true);
    expect(noms('.recentes')).toEqual(['Charlie', 'Delta', 'Alpha']);
    expect(noms('.mesradios')).toEqual(['Alpha', 'Bravo']);
  });

  it('section vide masquée : aucune lecture → Mes radios seule', async () => {
    await monter([B, mk(5, 'Echo')]);
    expect(hote.querySelector('.recentes')).toBeNull();
    expect(hote.querySelectorAll('section.sec').length).toBe(1);
  });
});
