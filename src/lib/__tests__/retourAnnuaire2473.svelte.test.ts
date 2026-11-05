// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import { get } from 'svelte/store';
import { activeView, previousView, clearViewContext } from '../stores/navigation';

const mocks = vi.hoisted(() => ({
  rechercherRadiosParCriteres: vi.fn(), getRadios: vi.fn(), updateRadio: vi.fn(), playRadio: vi.fn(),
  importRadios: vi.fn(), exportRadiosUrl: vi.fn(() => '#'),
  getAnnuaireRadios: vi.fn(), ajouterDepuisAnnuaire: vi.fn(), jouerDepuisAnnuaire: vi.fn(),
}));
vi.mock('../api', async (importOriginal) => ({ ...(await importOriginal<object>()), ...mocks }));
vi.mock('../zoneRequise', () => ({ zoneRequise: () => 3 }));

import RadiosV2 from '../../components/v2/RadiosV2.svelte';
import { locale } from '../i18n';
import { preferences } from '../stores/preferences';
import { FILTRES_RADIO_VIDES } from '../radioFiltres';

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
  mocks.rechercherRadiosParCriteres.mockResolvedValue({ items: [] });
  mocks.exportRadiosUrl.mockReturnValue('#');
  mocks.getAnnuaireRadios.mockResolvedValue(ANNUAIRE);
  locale.set('fr');
  preferences.update(p => ({ ...p, radioFiltres: { ...FILTRES_RADIO_VIDES } }));
  clearViewContext('radios');
  activeView.set('radios');
  mocks.jouerDepuisAnnuaire.mockResolvedValue({ output_sent: true });
});
afterEach(() => {
  if (instance) unmount(instance as any);
  instance = null;
  hote?.remove();
  document.body.innerHTML = '';
  clearViewContext('radios');
});

async function monterRadios() {
  hote = document.createElement('div');
  document.body.append(hote);
  instance = mount(RadiosV2, { target: hote });
  flushSync();
  await respirer();
}
const onglets = () => [...hote.querySelectorAll<HTMLButtonElement>('.sections button')];

async function quitterEtRevenir() {
  activeView.set('nowplaying');
  const retour = get(previousView);
  expect(retour).toBe('radios');
  await unmount(instance!);
  instance = null;
  hote.remove();
  activeView.set(retour!);
  await monterRadios();
}

describe('web#2473 / serveur#7052 — contexte de Radio au retour', () => {
  it('après lecture dans l’Annuaire, le remontage garde Annuaire sélectionné', async () => {
    await monterRadios();
    onglets()[1].click();
    await respirer();
    const station = hote.querySelector<HTMLButtonElement>('.fiche .ouvrir');
    expect(station, 'aucune station affichée, le témoin ne mesure rien').not.toBeNull();
    station!.click();
    await respirer();
    expect(mocks.jouerDepuisAnnuaire).toHaveBeenCalledWith('S100001', 3);
    await quitterEtRevenir();
    expect(onglets()[1].getAttribute('aria-selected'), 'le retour a perdu l’Annuaire quitté').toBe('true');
    expect(hote.querySelector('.fiche')).not.toBeNull();
    expect(mocks.updateRadio).not.toHaveBeenCalled();
  });
  it('le même retour conserve la Carte quand elle était choisie', async () => {
    await monterRadios();
    onglets()[2].click();
    await respirer();
    await quitterEtRevenir();
    expect(onglets()[2].getAttribute('aria-selected')).toBe('true');
  });
  it('une nouvelle session de navigation repart sur Mes radios', async () => {
    await monterRadios();
    expect(onglets()[0].getAttribute('aria-selected')).toBe('true');
    onglets()[1].click();
    await respirer();
    await unmount(instance!);
    instance = null;
    hote.remove();
    clearViewContext('radios');
    await monterRadios();
    expect(onglets()[0].getAttribute('aria-selected')).toBe('true');
  });
});


describe('#2630 — retrouver recherche, filtres et défilement de l’Annuaire', () => {
  it('restaure recherche, pays, genre et critères avancés après Lecture en cours', async () => {
    mocks.getAnnuaireRadios.mockImplementation(async ({ country, genre }) => country && genre
      ? { ...ANNUAIRE, total: 0, count: 0, items: [], countries: [{ code: 'US', count: 1 }], genres: [] }
      : { ...ANNUAIRE, countries: [{ code: 'GB', count: 3 }], genres: [{ key: 'jazz', count: 3 }] });
    preferences.update(p => ({ ...p, radioFiltres: { ...FILTRES_RADIO_VIDES, codec: 'aac', bitrateMin: 192 } }));
    await monterRadios(); onglets()[1].click(); await respirer();
    const recherche = hote.querySelector<HTMLInputElement>('.annuaire .v2-rech input')!;
    recherche.value = 'BBC'; recherche.dispatchEvent(new Event('input', { bubbles: true }));
    const pays = hote.querySelector<HTMLSelectElement>('.annuaire select.choix')!;
    pays.value = 'GB'; pays.dispatchEvent(new Event('change', { bubbles: true }));
    const jazz = [...hote.querySelectorAll<HTMLButtonElement>('.annuaire button')].find(b => /Jazz/.test(b.textContent ?? ''))!;
    expect(jazz).toBeTruthy(); jazz.click(); flushSync();
    await vi.waitFor(() => expect(mocks.getAnnuaireRadios).toHaveBeenLastCalledWith(expect.objectContaining({ q: 'BBC', country: 'GB', genre: 'jazz' })));
    mocks.getAnnuaireRadios.mockClear();
    await quitterEtRevenir();
    expect(hote.querySelector<HTMLInputElement>('.annuaire .v2-rech input')?.value, 'la recherche a été perdue au retour').toBe('BBC');
    await vi.waitFor(() => expect(mocks.getAnnuaireRadios).toHaveBeenLastCalledWith(expect.objectContaining({
      q: 'BBC', country: 'GB', genre: 'jazz', criteres: { codec: 'aac', quality_min: '192' },
    })));
    await vi.waitFor(() => expect(hote.querySelector<HTMLSelectElement>('.annuaire select.choix')?.value).toBe('GB'));
    expect(hote.querySelector('.annuaire .chip.active')?.textContent).toMatch(/Jazz/);
    expect(hote.querySelectorAll('.annuaire .fiche')).toHaveLength(0);
  });

  it('recharge les pages visibles avant de restaurer le défilement, même si le serveur borne les pages', async () => {
    const stations = Array.from({ length: 260 }, (_, i) => fiche({ external_id: `S${i}`, name: `Station ${i}` }));
    mocks.getAnnuaireRadios.mockImplementation(async ({ offset = 0, limit = 120 }) => {
      const items = stations.slice(offset, offset + Math.min(limit, 120));
      return { ...ANNUAIRE, total: 260, stations: 260, offset, limit: 120, count: items.length, items };
    });
    await monterRadios(); onglets()[1].click(); await respirer();
    expect(hote.querySelectorAll('.annuaire .fiche')).toHaveLength(120);
    const plus = hote.querySelector<HTMLButtonElement>('.annuaire .suite button')!;
    expect(plus, 'bouton de page suivante absent').toBeTruthy(); plus.click(); await respirer();
    expect(hote.querySelectorAll('.annuaire .fiche')).toHaveLength(240);
    // jsdom ne mesure pas le rendu : on vérifie la valeur du conteneur et
    // l'ordre du rechargement, sans revendiquer une mesure géométrique.
    (hote.querySelector('.scroll') as HTMLElement).scrollTop = 1850;
    hote.querySelector('.scroll')!.dispatchEvent(new Event('scroll'));
    mocks.getAnnuaireRadios.mockClear();
    await quitterEtRevenir();
    await vi.waitFor(() => expect(hote.querySelectorAll('.annuaire .fiche')).toHaveLength(240));
    expect((hote.querySelector('.scroll') as HTMLElement).scrollTop, 'le défilement doit revenir après les résultats').toBe(1850);
    expect(mocks.getAnnuaireRadios).toHaveBeenLastCalledWith(expect.objectContaining({ offset: 120, limit: 120 }));
  });
});
