// @vitest-environment jsdom
//
// web#1647 — importer un fichier PEQ dans l'Égaliseur (Levente Toth, fil 1974 :
// « load predefined PEQ (txt) files, instead of setting 10-15 bands manually »).
//
// La route serveur existe depuis v0.9.142 (`POST /eq/import/autoeq`,
// tune-server-rust#1405) ; l'écran n'avait aucun bouton pour l'appeler. Ces
// témoins MONTENT le vrai écran et tiennent :
//   1. le bouton existe et envoie le TEXTE du fichier, nommé d'après le fichier ;
//   2. le préréglage rejoint « Mes presets » et s'ouvre en paramétrique ;
//   3. le bilan est DIT : lignes écartées, préampli non appliqué en plus ;
//   4. un fichier qui demande plus de marge que ses gains : importé, PAS activé.
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
  getLevelCompensation: vi.fn(),
}));

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return { ...actual, ...mocks };
});

import EqualizerV2 from '../../components/v2/EqualizerV2.svelte';
import { currentZoneId } from '../stores/zones';
import { bilanImportPeq, nomDuFichierPeq } from '../eqImportPeq';
import lFr from '../locales/fr';

const fr = lFr as unknown as Record<string, string>;

const TEXTE = [
  'Preamp: -6.4 dB',
  'Filter 1: ON LSC Fc 105 Hz Gain 5.5 dB Q 0.70',
  'Filter 2: ON PK Fc 180 Hz Gain -2.1 dB Q 0.80',
  'Filter 3: OFF PK Fc 2000 Hz Gain 3.0 dB Q 2.00',
].join('\n');

const IMPORTE = {
  id: 'p-autoeq',
  name: 'Sennheiser HD 600',
  eq_type: 'parametric',
  bands: [
    { freq: 105, gain: 5.5, q: 0.7, type: 'low_shelf' },
    { freq: 180, gain: -2.1, q: 0.8, type: 'peak' },
  ],
};
const reponse = (extra: Record<string, unknown> = {}) => ({
  preset: IMPORTE,
  band_count: 2,
  ignored_filter_count: 1,
  ignored_filters: [{ line: 4, filter_type: 'PK', reason: 'disabled' }],
  preamp_db: -6.4,
  reserved_headroom_db: 7.6,
  preamp_applied: false,
  preamp_covered_by_headroom: true,
  ...extra,
});

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

function boutonImport(el: HTMLElement): HTMLButtonElement | undefined {
  return Array.from(el.querySelectorAll<HTMLButtonElement>('.presets.mes button'))
    .find((b) => (b.textContent ?? '').trim() === fr['eq.importPeq']);
}

/** Dépose un fichier dans le champ caché, comme le sélecteur du navigateur. */
async function deposer(el: HTMLElement, nom: string, texte: string) {
  const champ = el.querySelector<HTMLInputElement>('input[type="file"]');
  expect(champ, 'champ de fichier absent').toBeTruthy();
  const fichier = new File([texte], nom, { type: 'text/plain' });
  Object.defineProperty(champ!, 'files', { value: [fichier], configurable: true });
  champ!.dispatchEvent(new Event('change', { bubbles: true }));
  flushSync();
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
});

describe('#1647 — nom et bilan d’un import PEQ', () => {
  it('le nom vient du fichier, sans le suffixe AutoEq', () => {
    expect(nomDuFichierPeq('Sennheiser HD 600 ParametricEQ.txt')).toBe('Sennheiser HD 600');
    expect(nomDuFichierPeq('C:\\eq\\Mon casque.txt')).toBe('Mon casque');
    expect(nomDuFichierPeq('ParametricEQ.txt')).toBeUndefined();
  });

  it('les lignes écartées sont nommées, avec leur type', () => {
    const b = bilanImportPeq(reponse() as any);
    expect(b.bandes).toBe(2);
    expect(b.lignesIgnorees).toBe('4 (PK)');
    expect(b.alerte).toBe(false);
    expect(bilanImportPeq(reponse({ preamp_covered_by_headroom: false }) as any).alerte).toBe(true);
  });
});

describe('#1647 — Égaliseur : importer un fichier PEQ', () => {
  it('🔴 le bouton existe et envoie le texte du fichier au serveur', async () => {
    mocks.importAutoEqPreset.mockResolvedValue(reponse());
    const el = await poser();
    expect(boutonImport(el), 'aucune porte d’entrée vers /eq/import/autoeq').toBeTruthy();
    await deposer(el, 'Sennheiser HD 600 ParametricEQ.txt', TEXTE);
    expect(mocks.importAutoEqPreset).toHaveBeenCalledWith({ text: TEXTE, name: 'Sennheiser HD 600' });
  });

  it('🔴 le préréglage rejoint « Mes presets » et s’applique en paramétrique', async () => {
    mocks.importAutoEqPreset.mockResolvedValue(reponse());
    const el = await poser();
    await deposer(el, 'Sennheiser HD 600 ParametricEQ.txt', TEXTE);
    const mien = Array.from(el.querySelectorAll<HTMLButtonElement>('.presets.mes .mien button'))
      .find((b) => (b.textContent ?? '').trim() === 'Sennheiser HD 600');
    expect(mien, 'le préréglage importé doit apparaître dans Mes presets').toBeTruthy();
    expect(mocks.setEq, 'le préréglage importé doit être envoyé à la zone').toHaveBeenCalled();
    const [zone, corps] = mocks.setEq.mock.calls.at(-1)!;
    expect(zone).toBe(1);
    expect(corps.bands.map((b: any) => [b.freq, b.gain, b.type])).toEqual([
      [105, 5.5, 'low_shelf'],
      [180, -2.1, 'peak'],
    ]);
  });

  it('🔴 le bilan est dit : ligne écartée, préampli non appliqué en plus', async () => {
    mocks.importAutoEqPreset.mockResolvedValue(reponse());
    const el = await poser();
    await deposer(el, 'Sennheiser HD 600 ParametricEQ.txt', TEXTE);
    const bilan = el.querySelector('.bilan-peq');
    expect(bilan, 'le bilan de l’import doit être affiché').toBeTruthy();
    const texte = bilan!.textContent ?? '';
    expect(texte).toContain(fr['eq.importPeqIgnored'].replace('{lines}', '4 (PK)'));
    expect(texte).toContain('-6.4');
    expect(texte).toContain('7.6');
  });

  it('🔴 un fichier qui demande plus de marge que ses gains : importé, PAS activé', async () => {
    mocks.importAutoEqPreset.mockResolvedValue(reponse({ preamp_covered_by_headroom: false, warning: 'x' }));
    const el = await poser();
    await deposer(el, 'Bizarre.txt', TEXTE);
    expect(mocks.setEq, 'activé d’office malgré l’alerte de marge').not.toHaveBeenCalled();
    expect(el.querySelector('.bilan-peq.alerte')?.textContent).toContain(fr['eq.importPeqWarning']);
  });

  it('un refus du serveur ne crée rien et le dit', async () => {
    mocks.importAutoEqPreset.mockRejectedValue(new Error('profil AutoEq illisible — ligne 2'));
    const el = await poser();
    await deposer(el, 'Casse.txt', 'n’importe quoi');
    expect(el.querySelectorAll('.presets.mes .mien').length).toBe(0);
    expect(el.querySelector('.bilan-peq')).toBeNull();
    expect(mocks.setEq).not.toHaveBeenCalled();
  });
});
