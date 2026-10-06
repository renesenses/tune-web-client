// @vitest-environment jsdom
//
// Ticket 177 (Levente, fil 1974) — « l'EQ a oublié mes réglages » : l'écran
// Égaliseur se réaffichait à plat alors que le serveur appliquait toujours
// ses dix bandes, et la carte de compensation annonçait « +10.6 dB rendus »
// à volume 100 %, où rien n'est rendu.
//
// web#1646 a rétabli la relecture d'une courbe paramétrique. Ces bancs
// couvrent ce qui restait : une lecture en ÉCHEC dessinait une courbe plate
// éditable (dont le premier geste écrasait la vraie), une réponse PÉRIMÉE
// pouvait remplacer la bonne, et l'onglet Graphique d'une courbe paramétrique
// allumait « Plat » comme préréglage actif.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import { dictionnaire, ONZE_LANGUES } from './onzeDictionnaires';

const mocks = vi.hoisted(() => ({
  getPluginDetail: vi.fn(), getEqExpertSettings: vi.fn(), getEq: vi.fn(),
  setEq: vi.fn(), getDsp: vi.fn(), listEqPresets: vi.fn(), setDsp: vi.fn(),
}));
vi.mock('../api', () => mocks);

import EqualizerV2 from '../../components/v2/EqualizerV2.svelte';
import CompensationNiveauV2 from '../../components/v2/CompensationNiveauV2.svelte';
import { currentZoneId } from '../stores/zones';
import { preferences } from '../stores/preferences';
import { locale } from '../i18n';

/** Dix bandes paramétriques hors grille ISO — la forme d'un préréglage « Tres ». */
const TRES = [
  { freq: 45, gain: 3.5, q: 0.7, type: 'low_shelf' }, { freq: 90, gain: -2, q: 1.4, type: 'peak' },
  { freq: 180, gain: -1.5, q: 1.1, type: 'peak' }, { freq: 420, gain: 1, q: 0.9, type: 'peak' },
  { freq: 850, gain: -0.5, q: 2, type: 'peak' }, { freq: 1700, gain: 2, q: 1.8, type: 'peak' },
  { freq: 3300, gain: -3, q: 3, type: 'peak' }, { freq: 5200, gain: 1.5, q: 2.2, type: 'peak' },
  { freq: 7400, gain: -2.5, q: 4, type: 'peak' }, { freq: 11000, gain: 2, q: 0.7, type: 'high_shelf' },
];
const PRESET_TRES = { id: 'p-tres', name: 'Tres', eq_type: 'parametric', bands: TRES };

const attendre = () => new Promise((resolve) => setTimeout(resolve, 0));
const respirer = async () => { for (let i = 0; i < 6; i++) await attendre(); flushSync(); };
let hote: HTMLDivElement;
let instance: Record<string, unknown> | null = null;
async function monter(composant: any = EqualizerV2, props: Record<string, unknown> = {}) {
  hote = document.createElement('div');
  document.body.append(hote);
  instance = mount(composant, { target: hote, props });
  flushSync();
  await respirer();
  return hote;
}
const presetActif = () => [...hote.querySelectorAll<HTMLButtonElement>('.presets button.actif')].map((b) => b.textContent?.trim());

beforeEach(() => {
  for (const fn of Object.values(mocks)) fn.mockReset();
  mocks.getPluginDetail.mockResolvedValue({ name: 'equalizer', installed: true });
  mocks.getEqExpertSettings.mockResolvedValue({ expert_bands: 10 });
  mocks.getEq.mockResolvedValue({ enabled: true, bands: TRES });
  mocks.listEqPresets.mockResolvedValue([PRESET_TRES]);
  mocks.setEq.mockResolvedValue({ applied_live: true });
  mocks.getDsp.mockResolvedValue({});
  preferences.update((p) => ({ ...p, settingsLevel: 'expert' as never }));
  locale.set('fr');
  currentZoneId.set(1);
});
afterEach(() => {
  if (instance) unmount(instance as any);
  instance = null;
  hote?.remove();
});

describe('ticket 177 — l’écran Égaliseur montre la courbe EN SERVICE', () => {
  it('le cas de la capture : dix bandes PEQ et « Tres » reconnu, rien d’écrit', async () => {
    const el = await monter();
    expect(el.querySelector('.peq-count')?.textContent).toContain('10/31');
    expect(presetActif()).toEqual(['Tres']);
    expect(mocks.setEq).not.toHaveBeenCalled();
  });

  it('🔴 lecture en échec : pas de courbe plate éditable, un message et « Réessayer »', async () => {
    mocks.getEq.mockRejectedValueOnce(new Error('timeout'));
    const el = await monter();
    expect(el.querySelector('.board'), 'une grille à plat est dessinée sur une lecture ratée').toBeNull();
    expect(el.querySelector('.peq-count')).toBeNull();
    expect(el.querySelector('.lecture-echouee')).not.toBeNull();
    expect(mocks.setEq).not.toHaveBeenCalled();

    (el.querySelector('.lecture-echouee button') as HTMLButtonElement).click();
    await respirer();
    expect(el.querySelector('.lecture-echouee')).toBeNull();
    expect(el.querySelector('.peq-count')?.textContent).toContain('10/31');
  });

  it('🔴 une réponse périmée ne remplace pas celle de la zone courante', async () => {
    let libererZone1!: (v: unknown) => void;
    mocks.getEq.mockImplementation((zid: number) => zid === 1
      ? new Promise((r) => { libererZone1 = r; })
      : Promise.resolve({ enabled: true, bands: TRES }));
    const el = await monter();
    currentZoneId.set(2);
    await respirer();
    expect(el.querySelector('.peq-count')?.textContent).toContain('10/31');
    libererZone1({ enabled: true, bands: [] }); // la zone 1 répond APRÈS, à plat
    await respirer();
    expect(el.querySelector('.peq-count')?.textContent, 'la réponse de la zone 1 a écrasé la zone 2').toContain('10/31');
  });

  it('🔴 onglet Graphique d’une courbe paramétrique : « Plat » ne s’allume pas, une note le dit', async () => {
    const el = await monter();
    const graphique = [...el.querySelectorAll<HTMLButtonElement>('.modes button')][0];
    graphique.click();
    flushSync();
    expect(el.querySelector('.board')).not.toBeNull();
    expect(presetActif(), 'la grille à plat est annoncée « Plat » alors que l’égaliseur corrige').toEqual([]);
    expect(el.querySelector('.note-peq')).not.toBeNull();
  });

  it('une vraie grille graphique garde « Plat » quand elle est plate', async () => {
    const grille = [31, 63, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];
    mocks.getEq.mockResolvedValue({ enabled: true, bands: grille.map((f) => ({ freq: f, gain: 0, q: 1 })) });
    const el = await monter();
    expect(presetActif()).toContain('Plat');
    expect(el.querySelector('.note-peq')).toBeNull();
  });
});

describe('ticket 177 — la carte de compensation dit ce qui est APPLIQUÉ', () => {
  it('égaliseur −10.4, crossfeed −0.2, volume 100 % : « 0.0 dB rendus », jamais « +10.6 dB rendus »', async () => {
    mocks.getDsp.mockResolvedValue({ level_compensation: {
      enabled: true, eq_db: -10.4, crossfeed_db: -0.2, compensation_db: 10.6,
      rendered_db: 0, unrendered_db: 10.6, volume: 1, local_output_only: false,
    } });
    const el = await monter(CompensationNiveauV2, { revision: 0 });
    const texte = el.querySelector('[data-testid="compensation-niveau"] .val')?.textContent ?? '';
    expect(texte).toContain('0.0 dB rendus');
    expect(texte).not.toContain('+10.6 dB rendus');
  });
});

describe('ticket 177 — libellés dans les onze langues', () => {
  it.each(ONZE_LANGUES)('%s', (code) => {
    const d = dictionnaire(code);
    for (const cle of ['v2.eq.readFailed', 'v2.eq.retry', 'v2.eq.graphicHidesParametric']) {
      expect(d[cle], `${code} : ${cle}`).toBeTruthy();
    }
  });
});
