// @vitest-environment jsdom
//
// web#3176 (Jean Valjean, fil 2881 ; go de Bertrand du 17/11) — Radio : la
// recherche, les filtres et les genres restent en haut pendant le défilement
// des stations, dans « Mes radios » comme dans l'Annuaire. Un en-tête COLLANT
// dans le défilement de l'écran (`.scroll`), et les stations hors de lui.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { clearViewContext } from '../stores/navigation';

const mocks = vi.hoisted(() => ({
  getRadios: vi.fn(), updateRadio: vi.fn(), playRadio: vi.fn(),
  importRadios: vi.fn(), exportRadiosUrl: vi.fn(() => '#'),
  getAnnuaireRadios: vi.fn(), ajouterDepuisAnnuaire: vi.fn(), jouerDepuisAnnuaire: vi.fn(),
}));
vi.mock('../api', async (importOriginal) => ({ ...(await importOriginal<object>()), getConfig: vi.fn(async () => ({ radios_country: '' })), ...mocks }));
vi.mock('../zoneRequise', () => ({ zoneRequise: () => 3 }));

import RadiosV2 from '../../components/v2/RadiosV2.svelte';
import { locale } from '../i18n';

const station = (id: number, name: string) => ({ id, name, stream_url: `https://t.invalid/${id}`, favorite: false, genre: 'jazz', country_code: 'FR' });
const fiche = (id: string, name: string) => ({
  external_id: id, name, logo_url: null, country_code: 'FR', genre: 'eclectic',
  stream_url: `https://t.invalid/${id}`, radio_metadata_key: null, now_playing: false,
  my_radio_id: null, my_radio_favorite: null,
});
const ANNUAIRE = {
  total: 2, offset: 0, limit: 120, count: 2, stations: 2, origine: 'reseau',
  items: [fiche('S1', 'FIP'), fiche('S2', 'Radio Paradise')],
  countries: [{ code: 'FR', count: 2 }], genres: [{ key: 'eclectic', count: 2 }, { key: 'news', count: 1 }],
  attribution: { name: 'radio-metadata.fr', url: 'https://radio-metadata.fr', support_url: 'https://ko-fi.com/aleceiffel' },
};

const respirer = async () => { for (let i = 0; i < 8; i++) await new Promise((r) => setTimeout(r, 0)); flushSync(); };
let hote: HTMLDivElement;
let instance: Record<string, unknown> | null = null;

beforeEach(() => {
  clearViewContext('radios');
  HTMLCanvasElement.prototype.getContext = (() => null) as any;
  for (const fn of Object.values(mocks)) fn.mockReset();
  mocks.getRadios.mockResolvedValue([station(1, 'Jazz Sans Perte'), station(2, 'TSF Jazz')]);
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

/** Règle CSS d'un sélecteur, lue dans la source du composant. */
const regle = (fichier: string, selecteur: string) => {
  const s = readFileSync(resolve(__dirname, `../../components/v2/${fichier}`), 'utf8');
  const style = s.slice(s.indexOf('<style>'));
  const i = style.indexOf(`${selecteur}{`);
  return i < 0 ? '' : style.slice(i, style.indexOf('}', i));
};

describe('web#3176 — Mes radios : en-tête collant', () => {
  it('la recherche et les filtres sont dans l’en-tête collant, les stations hors de lui', async () => {
    await monter();
    const entete = hote.querySelector('.scroll > [data-testid="radio-entete-collant"]');
    expect(entete, 'en-tête collant, enfant direct du défilement').not.toBeNull();
    expect(entete!.querySelector('.v2-rech')).not.toBeNull();
    expect(entete!.querySelector('[data-testid="radio-filtres-corps"]')).not.toBeNull();
    // Contre-épreuve : un en-tête qui emporterait la liste ne collerait rien.
    expect(hote.querySelectorAll('.st').length).toBeGreaterThan(0);
    expect(entete!.querySelector('.st')).toBeNull();
  });

  it('🔴 collant, opaque (fond de l’écran, clair comme sombre) et au-dessus des vignettes', () => {
    const r = regle('RadiosV2.svelte', '.entete-collant');
    expect(r).toContain('position:sticky');
    expect(r).toContain('top:0');
    expect(r).toContain('background:var(--v2-bg)');
    expect(r).toMatch(/z-index:([3-9]|\d\d)/);
  });
});

describe('web#3176 — Annuaire : en-tête collant', () => {
  async function ouvrirAnnuaire() {
    await monter();
    hote.querySelectorAll<HTMLButtonElement>('.sections button')[1].click();
    await respirer();
  }

  it('recherche, filtres et genres dans l’en-tête collant, les fiches hors de lui', async () => {
    await ouvrirAnnuaire();
    const entete = hote.querySelector('.annuaire > [data-testid="radio-entete-collant"]');
    expect(entete).not.toBeNull();
    expect(entete!.querySelector('.v2-rech')).not.toBeNull();
    expect(entete!.querySelector('.filtres')).not.toBeNull();
    expect(entete!.querySelectorAll('.chip').length, 'les genres').toBeGreaterThan(0);
    expect(hote.querySelectorAll('.annuaire .fiche').length).toBe(2);
    expect(entete!.querySelector('.fiche')).toBeNull();
  });

  it('🔴 collant pleine largeur, opaque ; sur mobile les genres tiennent sur une rangée', () => {
    const r = regle('RadioAnnuaire.svelte', '.entete-collant');
    expect(r).toContain('position:sticky');
    expect(r).toContain('background:var(--v2-bg)');
    expect(r).toContain('margin:0 -30px');
    const s = readFileSync(resolve(__dirname, '../../components/v2/RadioAnnuaire.svelte'), 'utf8');
    const mobile = s.slice(s.indexOf('@media (max-width: 640px)'));
    expect(mobile).toContain('.entete-collant{margin:0 -16px');
    expect(mobile).toContain('flex-wrap:nowrap; overflow-x:auto');
  });
});
