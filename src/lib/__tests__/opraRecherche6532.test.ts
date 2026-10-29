// @vitest-environment jsdom
//
// tune-server-rust#6532 (alec_eiffel, fil 2334 ; Tades, fil 2282) — la base
// OPRA, seconde source de la recherche de casques de l'Égaliseur. Une seule
// liste, chaque résultat avec la pastille de sa base ; l'import d'une courbe
// OPRA passe par son `id` ; la licence d'OPRA (CC BY-SA 4.0) demande le logo,
// une courte description et le lien du dépôt dans le navigateur de la base,
// et le crédit de la courbe (auteur en tête) une fois importée. Ces témoins
// MONTENT le vrai écran.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';

const mocks = vi.hoisted(() => ({
  getPluginDetail: vi.fn(),
  getEqExpertSettings: vi.fn(),
  getEq: vi.fn(),
  setEq: vi.fn(),
  listEqPresets: vi.fn(),
  createEqPreset: vi.fn(),
  updateEqPreset: vi.fn(),
  deleteEqPreset: vi.fn(),
  importAutoEqPreset: vi.fn(),
  searchHeadphones: vi.fn(),
  importAutoEqFromDatabase: vi.fn(),
  importOpraCurve: vi.fn(),
  getLevelCompensation: vi.fn(),
}));

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return { ...actual, ...mocks };
});

import EqualizerV2 from '../../components/v2/EqualizerV2.svelte';
import { currentZoneId } from '../stores/zones';
import { notifications } from '../stores/notifications';
import lFr from '../locales/fr';
import { ONZE_LANGUES, dictionnaire } from './onzeDictionnaires';

const fr = lFr as unknown as Record<string, string>;
const DEPOT = 'https://github.com/opra-project/OPRA';

const OPRA_HD650 = {
  source: 'opra', key: 'sennheiser:hd650::oratory1990_harman_target', name: 'Sennheiser HD650',
  vendor: 'Sennheiser', model: 'HD650', author: 'oratory1990', details: 'Harman Target',
  form: 'over_the_ear', link: 'https://www.dropbox.com/s/qs4hs92tvfbwr04/Sennheiser%20HD650.pdf?dl=0',
};
const AUTOEQ_HD650 = {
  source: 'autoeq', key: 'oratory1990/over-ear/Sennheiser HD 650', name: 'Sennheiser HD 650',
  vendor: null, model: 'Sennheiser HD 650', author: 'oratory1990', details: null, form: 'over-ear', link: null,
};
const RECHERCHE = {
  query: 'hd650', results: [OPRA_HD650, AUTOEQ_HD650], total: 2, unavailable_sources: [],
  attribution: { opra: { name: 'OPRA', repository: DEPOT, license: 'CC BY-SA 4.0', license_url: 'https://creativecommons.org/licenses/by-sa/4.0/' } },
};
const CREDIT = {
  author: 'oratory1990', details: 'Harman Target', link: OPRA_HD650.link,
  database: 'OPRA', repository: DEPOT, license: 'CC BY-SA 4.0',
  license_url: 'https://creativecommons.org/licenses/by-sa/4.0/',
};
const IMPORTE = {
  preset: {
    id: 'p-opra', name: 'Sennheiser HD650 (oratory1990 · Harman Target)', eq_type: 'parametric',
    bands: [{ freq: 105, gain: 5.5, q: 0.71, type: 'low_shelf' }], source: 'opra', credit: CREDIT,
  },
  band_count: 10, ignored_filters: [], preamp_db: -9.3, reserved_headroom_db: -11.2,
  preamp_applied: false, preamp_covered_by_headroom: true, credit: CREDIT, approximated_shelves: [],
};

const respirer = () => new Promise((r) => setTimeout(r, 0));
async function laisserCharger() { for (let i = 0; i < 6; i++) await respirer(); flushSync(); }

let hote: HTMLDivElement | null = null;
let monte: Record<string, unknown> | null = null;

async function poser(): Promise<HTMLDivElement> {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(EqualizerV2, { target: hote });
  flushSync();
  await laisserCharger();
  return hote;
}

function ouvrir(el: HTMLElement) {
  const bouton = Array.from(el.querySelectorAll<HTMLButtonElement>('button'))
    .find((b) => (b.textContent ?? '').trim() === fr['eq.autoeqSearch']);
  expect(bouton, 'aucun bouton « Rechercher un casque »').toBeTruthy();
  bouton!.click();
  flushSync();
}

async function chercher(el: HTMLElement, q: string) {
  ouvrir(el);
  const champ = el.querySelector<HTMLInputElement>('.autoeq input[type="search"]');
  champ!.value = q;
  champ!.dispatchEvent(new Event('input', { bubbles: true }));
  flushSync();
  el.querySelector<HTMLFormElement>('.autoeq-form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  flushSync();
  await laisserCharger();
}

async function choisir(el: HTMLElement, index: number) {
  el.querySelectorAll<HTMLButtonElement>('.autoeq-resultats button')[index].click();
  await laisserCharger();
}

beforeEach(() => {
  for (const m of Object.values(mocks)) m.mockReset();
  mocks.getPluginDetail.mockResolvedValue({ name: 'equalizer', installed: true });
  mocks.getEqExpertSettings.mockResolvedValue({ expert_bands: 10 });
  mocks.getEq.mockResolvedValue({ enabled: true, bands: [] });
  mocks.setEq.mockResolvedValue({ applied_live: true });
  mocks.listEqPresets.mockResolvedValue([]);
  mocks.getLevelCompensation.mockResolvedValue(null);
  currentZoneId.set(1);
  localStorage.clear();
});

afterEach(() => {
  if (monte) unmount(monte as any);
  monte = null;
  hote?.remove();
  hote = null;
  localStorage.clear();
  vi.restoreAllMocks();
});

describe('#6532 — Égaliseur : la base OPRA à côté d’AutoEq', () => {
  it('🔴 les deux bases dans la même liste, chacune avec sa pastille', async () => {
    mocks.searchHeadphones.mockResolvedValue(RECHERCHE);
    const el = await poser();
    await chercher(el, 'hd650');
    const lignes = Array.from(el.querySelectorAll('.autoeq-resultats li'));
    expect(lignes.map((l) => l.querySelector('.autoeq-base')?.textContent)).toEqual(['OPRA', 'AutoEq']);
    expect(lignes.map((l) => l.querySelector('.autoeq-source')?.textContent)).toEqual([
      'oratory1990 · Harman Target',
      'oratory1990',
    ]);
    expect(lignes[0].querySelector('button')?.getAttribute('title'))
      .toBe(fr['eq.opraImportTitle'].replace('{name}', 'Sennheiser HD650').replace('{author}', 'oratory1990 · Harman Target'));
  });

  it('🔴 le navigateur de la base porte le logo OPRA, sa description et le lien du dépôt', async () => {
    const el = await poser();
    ouvrir(el);
    const bloc = el.querySelector('.opra-attribution');
    expect(bloc, 'bloc d’attribution OPRA absent').toBeTruthy();
    const logo = bloc!.querySelector<HTMLImageElement>('img');
    expect(logo?.getAttribute('alt')).toBe('OPRA');
    expect(logo?.getAttribute('src')).toMatch(/opra-logo/);
    expect(bloc!.textContent).toContain(fr['eq.opraAbout']);
    const liens = Array.from(bloc!.querySelectorAll('a')).map((a) => a.getAttribute('href'));
    expect(liens).toContain(DEPOT);
    // Le crédit AutoEq existant est conservé.
    expect(el.querySelector('.autoeq-credit')?.textContent).toBe(fr['eq.autoeqCredit']);
  });

  it('🔴 choisir une courbe OPRA l’importe par son id et affiche son crédit, auteur en tête', async () => {
    mocks.searchHeadphones.mockResolvedValue(RECHERCHE);
    mocks.importOpraCurve.mockResolvedValue(IMPORTE);
    const el = await poser();
    await chercher(el, 'hd650');
    await choisir(el, 0);
    expect(mocks.importOpraCurve).toHaveBeenCalledWith({ id: 'sennheiser:hd650::oratory1990_harman_target' });
    expect(mocks.importAutoEqFromDatabase).not.toHaveBeenCalled();
    const mien = Array.from(el.querySelectorAll<HTMLButtonElement>('.presets.mes .mien button'))
      .find((b) => (b.textContent ?? '').trim() === IMPORTE.preset.name);
    expect(mien, 'la courbe importée doit rejoindre Mes presets').toBeTruthy();
    const auteur = el.querySelector('.credit-courbe .credit-auteur');
    expect(auteur?.textContent).toContain(fr['eq.opraCurveCredit'].replace('{author}', 'oratory1990'));
    expect(auteur?.textContent).toContain('Harman Target');
    expect(auteur?.querySelector('a')?.getAttribute('href')).toBe(OPRA_HD650.link);
    const base = el.querySelector('.credit-courbe .credit-base');
    const hrefs = Array.from(base!.querySelectorAll('a')).map((a) => a.getAttribute('href'));
    expect(hrefs).toEqual([DEPOT, 'https://creativecommons.org/licenses/by-sa/4.0/']);
    expect(base!.textContent).toContain('CC BY-SA 4.0');
  });

  it('un profil AutoEq choisi part toujours par son chemin, sans crédit OPRA', async () => {
    mocks.searchHeadphones.mockResolvedValue(RECHERCHE);
    mocks.importAutoEqFromDatabase.mockResolvedValue({ ...IMPORTE, credit: undefined, approximated_shelves: undefined,
      preset: { ...IMPORTE.preset, id: 'p-ae', name: 'Sennheiser HD 650 (oratory1990)', credit: undefined, source: 'autoeq' } });
    const el = await poser();
    await chercher(el, 'hd650');
    await choisir(el, 1);
    expect(mocks.importAutoEqFromDatabase).toHaveBeenCalledWith({ path: 'oratory1990/over-ear/Sennheiser HD 650' });
    expect(mocks.importOpraCurve).not.toHaveBeenCalled();
    expect(el.querySelector('.credit-courbe')).toBeNull();
  });

  it('🔴 une base injoignable : les résultats de l’autre s’affichent, et l’écran le dit', async () => {
    mocks.searchHeadphones.mockResolvedValue({ ...RECHERCHE, results: [AUTOEQ_HD650], total: 1, unavailable_sources: ['opra'] });
    const el = await poser();
    await chercher(el, 'hd650');
    expect(el.querySelectorAll('.autoeq-resultats li').length).toBe(1);
    expect(el.querySelector('.autoeq-partiel')?.textContent).toBe(fr['eq.opraUnavailable']);
  });

  it('les plateaux approchés sont nommés dans le bilan', async () => {
    mocks.searchHeadphones.mockResolvedValue(RECHERCHE);
    mocks.importOpraCurve.mockResolvedValue({ ...IMPORTE, approximated_shelves: [
      { band: 1, type: 'low_shelf', requested_q: 0.48 }, { band: 8, type: 'high_shelf', requested_q: 0.4 },
    ] });
    const el = await poser();
    await chercher(el, 'hd650');
    await choisir(el, 0);
    expect(el.querySelector('.bilan-peq .approches')?.textContent)
      .toBe(fr['eq.opraApproximated'].replace('{bands}', '1 (Q 0.48), 8 (Q 0.4)'));
  });

  it('🔴 un filtre non pris en charge (422) : le refus est dit, rien n’est ajouté', async () => {
    const erreur = vi.spyOn(notifications, 'error');
    mocks.searchHeadphones.mockResolvedValue(RECHERCHE);
    mocks.importOpraCurve.mockRejectedValue(Object.assign(new Error('bande 11 : filtre « band_pass »'), { status: 422 }));
    const el = await poser();
    await chercher(el, 'hd650');
    await choisir(el, 0);
    expect(erreur).toHaveBeenCalledWith(fr['eq.opraFilterUnsupported'].replace('{detail}', 'bande 11 : filtre « band_pass »'));
    expect(el.querySelectorAll('.presets.mes .mien').length).toBe(0);
  });

  it('les clés OPRA existent dans toutes les langues', () => {
    const cles = Object.keys(fr).filter((k) => k.startsWith('eq.opra'));
    expect(cles.length).toBe(10);
    // 15 depuis l'ajout du polonais, du norvégien et du grec (train rc9).
    expect(ONZE_LANGUES.length).toBe(15);
    for (const lang of ONZE_LANGUES) {
      const table = dictionnaire(lang);
      for (const k of cles) expect(table[k], `${lang} : ${k}`).toBeTruthy();
      // Les libellés modifiés nomment les deux bases dans toutes les langues.
      expect(table['eq.autoeqSearch'], lang).toContain('OPRA');
    }
  });
});

describe('#6532 — api.searchHeadphones sur un serveur qui n’a que la recherche AutoEq', () => {
  it('🔴 un 404 de la route unifiée retombe sur /eq/autoeq/search', async () => {
    const { searchHeadphones } = await vi.importActual<typeof import('../api')>('../api');
    const appels: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      appels.push(url);
      const ancien = /\/eq\/autoeq\/search/.test(url);
      const charge = ancien
        ? { query: 'hd650', total: 1, results: [{ name: 'Sennheiser HD 650', source: 'oratory1990', rig: null, form: 'over-ear', path: 'oratory1990/over-ear/Sennheiser HD 650' }] }
        : { error: 'not found' };
      return {
        ok: ancien, status: ancien ? 200 : 404, statusText: ancien ? 'OK' : 'Not Found',
        headers: new Headers({ 'Content-Type': 'application/json' }),
        text: async () => JSON.stringify(charge),
        json: async () => charge,
      } as unknown as Response;
    }));
    try {
      const r = await searchHeadphones('hd650');
      expect(appels.map((u) => u.replace(/\?.*/, '').replace(/^.*\/api\/v1/, ''))).toEqual(['/eq/headphones/search', '/eq/autoeq/search']);
      expect(r.results).toEqual([{
        source: 'autoeq', key: 'oratory1990/over-ear/Sennheiser HD 650', name: 'Sennheiser HD 650', vendor: null,
        model: 'Sennheiser HD 650', author: 'oratory1990', details: null, form: 'over-ear', link: null,
      }]);
      expect(r.unavailable_sources).toEqual([]);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
