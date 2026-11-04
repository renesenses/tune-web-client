// @vitest-environment jsdom
//
// tune-server-rust#6385 — importer un fichier d'égaliseur venu d'ailleurs
// (AutoEq ParametricEQ, Equalizer APO, OPRA) avec un APERÇU des bandes avant
// application. Ces témoins MONTENT le vrai écran et tiennent :
//   1. le fichier part d'abord à l'aperçu ; rien n'est importé ni appliqué ;
//   2. l'aperçu montre chaque bande (type, fréquence, gain, Q, canal) ;
//   3. « Appliquer » importe le même texte et l'applique ;
//   4. « Annuler » ne crée rien ;
//   5. un refus nommé du serveur est dit dans la langue de l'écran, ligne ou
//      bande comprise.
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
  previewEqImport: vi.fn(),
  getLevelCompensation: vi.fn(),
}));
const notifier = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return { ...actual, ...mocks };
});
vi.mock('../stores/notifications', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../stores/notifications')>();
  return { ...actual, notifications: { ...actual.notifications, ...notifier } };
});

import EqualizerV2 from '../../components/v2/EqualizerV2.svelte';
import { currentZoneId } from '../stores/zones';
import { messageErreurImport, type TextesErreurImport } from '../eqImportPeq';
import lFr from '../locales/fr';

const fr = lFr as unknown as Record<string, string>;

// Le profil OPRA du HD 650 (oratory1990), tel que le serveur le rend en aperçu.
const TEXTE = '{"author":"oratory1990","type":"parametric_eq","parameters":{"gain_db":-9.3,"bands":[]}}';
const BANDES = [
  { freq: 20, gain: 4, q: 1.1, type: 'peak' },
  { freq: 105, gain: 5.5, q: 0.71, type: 'low_shelf' },
  { freq: 11000, gain: -2.5, q: 0.71, type: 'high_shelf', channel: 1 },
];
const APERCU = {
  format: 'opra',
  bands: BANDES,
  band_count: 3,
  max_bands: 31,
  ignored_filter_count: 0,
  ignored_filters: [],
  preamp_db: -9.3,
  reserved_headroom_db: -10.1,
  preamp_applied: false,
  preamp_covered_by_headroom: true,
  name: 'HD650',
};
const IMPORTE = {
  preset: { id: 'p-opra', name: 'HD650', eq_type: 'parametric', bands: BANDES },
  ...APERCU,
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

async function deposer(el: HTMLElement, nom: string, texte: string) {
  const champ = el.querySelector<HTMLInputElement>('input[type="file"]');
  expect(champ, 'champ de fichier absent').toBeTruthy();
  const fichier = new File([texte], nom, { type: 'application/json' });
  Object.defineProperty(champ!, 'files', { value: [fichier], configurable: true });
  champ!.dispatchEvent(new Event('change', { bubbles: true }));
  flushSync();
  await laisserCharger();
}

async function cliquer(b: HTMLButtonElement | null) {
  expect(b).toBeTruthy();
  b!.click();
  flushSync();
  await laisserCharger();
}

function refus(code: string, corps: Record<string, unknown>) {
  return Object.assign(new Error('fichier d’égaliseur illisible — …'), { status: 400, code, corps: { code, ...corps } });
}

beforeEach(() => {
  for (const m of Object.values(mocks)) m.mockReset();
  notifier.error.mockReset();
  notifier.success.mockReset();
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

describe('#6385 — aperçu avant application', () => {
  it('🔴 le fichier part à l’aperçu : rien n’est importé ni appliqué', async () => {
    mocks.previewEqImport.mockResolvedValue(APERCU);
    const el = await poser();
    await deposer(el, 'HD650.json', TEXTE);
    expect(mocks.previewEqImport).toHaveBeenCalledWith({ text: TEXTE, name: 'HD650' });
    expect(mocks.importAutoEqPreset, 'importé sans passer par « Appliquer »').not.toHaveBeenCalled();
    expect(mocks.setEq, 'appliqué sans passer par « Appliquer »').not.toHaveBeenCalled();
    expect(el.querySelector('.apercu-peq'), 'aucun aperçu affiché').toBeTruthy();
  });

  it('🔴 l’aperçu montre chaque bande : type, fréquence, gain, Q, canal', async () => {
    mocks.previewEqImport.mockResolvedValue(APERCU);
    const el = await poser();
    await deposer(el, 'HD650.json', TEXTE);
    const lignes = Array.from(el.querySelectorAll('.apercu-bandes tbody tr'))
      .map((tr) => Array.from(tr.querySelectorAll('td')).map((td) => (td.textContent ?? '').trim()));
    expect(lignes).toEqual([
      ['1', 'peak', '20', '4.0', '1.1', fr['eq.importChannelBoth']],
      ['2', 'low_shelf', '105', '5.5', '0.71', fr['eq.importChannelBoth']],
      ['3', 'high_shelf', '11000', '-2.5', '0.71', fr['eq.importChannelRight']],
    ]);
    expect(el.querySelector('.apercu-peq')?.textContent).toContain('-9.3');
  });

  it('🔴 « Appliquer » importe le même texte, puis l’applique à la zone', async () => {
    mocks.previewEqImport.mockResolvedValue(APERCU);
    mocks.importAutoEqPreset.mockResolvedValue(IMPORTE);
    const el = await poser();
    await deposer(el, 'HD650.json', TEXTE);
    await cliquer(el.querySelector<HTMLButtonElement>('.apercu-appliquer'));
    expect(mocks.importAutoEqPreset).toHaveBeenCalledWith({ text: TEXTE, name: 'HD650' });
    expect(mocks.setEq).toHaveBeenCalled();
    expect(el.querySelector('.apercu-peq'), 'l’aperçu reste ouvert après application').toBeNull();
  });

  it('« Annuler » ne crée rien', async () => {
    mocks.previewEqImport.mockResolvedValue(APERCU);
    const el = await poser();
    await deposer(el, 'HD650.json', TEXTE);
    await cliquer(el.querySelector<HTMLButtonElement>('.apercu-annuler'));
    expect(el.querySelector('.apercu-peq')).toBeNull();
    expect(mocks.importAutoEqPreset).not.toHaveBeenCalled();
    expect(mocks.setEq).not.toHaveBeenCalled();
  });
});

describe('#6385 — refus nommés, dans la langue de l’écran', () => {
  const textes: TextesErreurImport = {
    aLaLigne: fr['eq.importErrAtLine'],
    aLaBande: fr['eq.importErrAtBand'],
    causes: {
      unrecognized_line: fr['eq.importErrUnrecognizedLine'],
      unknown_filter_type: fr['eq.importErrUnknownFilterType'],
      missing_field: fr['eq.importErrMissingField'],
      invalid_number: fr['eq.importErrInvalidNumber'],
      value_out_of_range: fr['eq.importErrValueOutOfRange'],
      missing_on_off: fr['eq.importErrMissingOnOff'],
      unsupported_channel: fr['eq.importErrUnsupportedChannel'],
      per_channel_preamp: fr['eq.importErrPerChannelPreamp'],
      no_active_filter: fr['eq.importErrNoActiveFilter'],
      too_many_bands: fr['eq.importErrTooManyBands'],
      profile_too_large: fr['eq.importPeqTooLarge'],
      invalid_json: fr['eq.importErrInvalidJson'],
      unsupported_eq_type: fr['eq.importErrUnsupportedEqType'],
      unsupported_slope: fr['eq.importErrUnsupportedSlope'],
    },
  };

  it('une ligne, une bande, un dépassement : chacun a sa phrase', () => {
    expect(messageErreurImport(refus('unrecognized_line', { line: 1 }), textes))
      .toBe(`Ligne 1 : ${fr['eq.importErrUnrecognizedLine']}`);
    expect(messageErreurImport(refus('unknown_filter_type', { band: 3 }), textes))
      .toBe(`Bande 3 : ${fr['eq.importErrUnknownFilterType']}`);
    expect(messageErreurImport(refus('too_many_bands', { band_count: 35, max_bands: 31 }), textes))
      .toContain('35 bandes');
    expect(messageErreurImport(new Error('réseau'), textes)).toBeNull();
  });

  it('🔴 l’écran dit le refus nommé, pas la phrase du serveur', async () => {
    mocks.previewEqImport.mockRejectedValue(refus('unrecognized_line', { line: 1 }));
    const el = await poser();
    await deposer(el, 'config.txt', 'Device: x');
    expect(el.querySelector('.apercu-peq')).toBeNull();
    expect(notifier.error).toHaveBeenCalledTimes(1);
    const dit = notifier.error.mock.calls[0][0] as string;
    expect(dit).toContain(`Ligne 1 : ${fr['eq.importErrUnrecognizedLine']}`);
  });
});
