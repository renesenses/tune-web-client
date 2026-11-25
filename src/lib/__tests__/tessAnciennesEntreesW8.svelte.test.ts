// @vitest-environment jsdom
//
// rc14, lot W8 — Bertrand, recette TESS du 25/11 sur le .18 : « avec TESS, les
// anciennes pages de greffons ne doivent plus apparaître dans Studio ».
//   1. RÈGLE : avec TESS, les entrées Égaliseur, Crossfeed, Crossfeed Pro et
//      Crosstalk sortent de la barre ; sans TESS (ou capacité inconnue), rien
//      ne change. Convertisseur et Dé-ploc (outils sur fichiers), Réveils,
//      Métadonnées, État du serveur restent toujours.
//   2. LISTE : chaque vue masquée est l'écran historique d'un greffon du
//      catalogue TESS — on ne masque rien que TESS ne sache ouvrir.
//   3. LIEN « Réglages avancés » : il ne contourne pas le verrou Premium.
//   4. Égaliseur ouvert par ce lien en Free : le mode paramétrique (Premium)
//      dit qu'il est Premium et n'écrit rien.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';

const mocks = vi.hoisted(() => ({
  getPluginDetail: vi.fn(), getEqExpertSettings: vi.fn(), getEq: vi.fn(),
  setEq: vi.fn(), getDsp: vi.fn(), listEqPresets: vi.fn(), setDsp: vi.fn(),
}));
vi.mock('../api', async (importOriginal) => ({ ...(await importOriginal<Record<string, unknown>>()), ...mocks }));

import { STUDIO } from '../../components/v2/Sidebar.svelte';
import EqualizerV2 from '../../components/v2/EqualizerV2.svelte';
import { entreesAvecTess, VUES_REMPLACEES_PAR_TESS } from '../stores/tess';
import { vueHistorique, vueReglagesAvances } from '../tessPanneaux';
import { ServeurTessSimule } from '../tessSimulation';
import { licenseState } from '../stores/license';
import { currentZoneId } from '../stores/zones';
import { preferences } from '../stores/preferences';
import { locale } from '../i18n';
import { dictionnaire, ONZE_LANGUES } from './onzeDictionnaires';

const vues = (l: { view: string }[]) => l.map((i) => i.view);
const TOUJOURS = ['converter', 'declick', 'alarms', 'metadata', 'diagnostics'];

describe('W8 — 1. entrées masquées si TESS', () => {
  it('🔴 TESS annoncé : les quatre anciennes entrées de greffons sortent, les outils restent', () => {
    const v = vues(entreesAvecTess(STUDIO, 'oui'));
    expect(v[0]).toBe('tess');
    for (const x of ['equalizer', 'crossfeed', 'crossfeedpro', 'crosstalk']) expect(v, x).not.toContain(x);
    for (const x of TOUJOURS) expect(v, x).toContain(x);
  });

  it('contre-épreuve : serveur sans TESS ou capacité inconnue ⇒ la barre d’avant, TESS en moins', () => {
    for (const c of ['non', 'inconnue'] as const) {
      expect(vues(entreesAvecTess(STUDIO, c)), c).toEqual(vues(STUDIO).filter((x) => x !== 'tess'));
    }
  });
});

describe('W8 — 2. la liste vient du catalogue TESS', () => {
  it('chaque vue masquée est l’écran historique d’un greffon du catalogue, et est une entrée Studio', () => {
    const ids = new ServeurTessSimule().catalogue.plugins.map((p) => p.id);
    const ecrans = new Set(ids.map(vueHistorique).filter(Boolean));
    for (const v of VUES_REMPLACEES_PAR_TESS) {
      expect(ecrans.has(v), v).toBe(true);
      expect(vues(STUDIO), v).toContain(v);
    }
    // Et rien d'autre de Studio n'est l'écran d'un greffon TESS.
    for (const v of vues(STUDIO)) if (ecrans.has(v)) expect(VUES_REMPLACEES_PAR_TESS, v).toContain(v);
  });
});

describe('W8 — 3. « Réglages avancés » ne contourne pas le verrou', () => {
  it('🔴 `premium_required` ⇒ pas de lien, quel que soit le greffon', () => {
    for (const id of ['equalizer-parametric', 'crossfeed-pro', 'crosstalk', 'room-correction']) {
      expect(vueReglagesAvances(id, 'premium_required'), id).toBeNull();
    }
  });

  it('contre-épreuve : déverrouillé ⇒ l’écran historique', () => {
    expect(vueReglagesAvances('equalizer-graphic', null)).toBe('equalizer');
    expect(vueReglagesAvances('crossfeed', null)).toBe('crossfeed');
    expect(vueReglagesAvances('crossfeed-pro', null)).toBe('crossfeedpro');
    expect(vueReglagesAvances('crosstalk', null)).toBe('crosstalk');
    expect(vueReglagesAvances('mono-downmix', null)).toBeNull();
  });

  it('la clé « Réglages avancés » existe dans les 20 langues', () => {
    expect(ONZE_LANGUES).toHaveLength(20);
    for (const l of ONZE_LANGUES) expect(dictionnaire(l)['tess.advancedSettings'], l).toBeTruthy();
  });
});

describe('W8 — 4. Égaliseur en Free : le paramétrique est Premium', () => {
  const COURBE = [
    { freq: 45, gain: 3.5, q: 0.7, type: 'low_shelf' },
    { freq: 1700, gain: 2, q: 1.8, type: 'peak' },
  ];
  const attendre = () => new Promise((r) => setTimeout(r, 0));
  const respirer = async () => { for (let i = 0; i < 6; i++) await attendre(); flushSync(); };
  let hote: HTMLDivElement;
  let instance: Record<string, unknown> | null = null;

  beforeEach(() => {
    for (const fn of Object.values(mocks)) fn.mockReset();
    mocks.getPluginDetail.mockResolvedValue({ name: 'equalizer', installed: true });
    mocks.getEqExpertSettings.mockResolvedValue({ expert_bands: 10 });
    mocks.getEq.mockResolvedValue({ enabled: true, bands: COURBE });
    mocks.listEqPresets.mockResolvedValue([]);
    mocks.setEq.mockResolvedValue({ applied_live: true });
    mocks.getDsp.mockResolvedValue({});
    preferences.update((p) => ({ ...p, settingsLevel: 'expert' as never }));
    locale.set('en');
    currentZoneId.set(1);
  });
  afterEach(() => {
    if (instance) unmount(instance as any);
    instance = null;
    hote?.remove();
    licenseState.update((s) => ({ ...s, tier: 'free', loaded: false }));
  });

  async function monter() {
    hote = document.createElement('div');
    document.body.append(hote);
    instance = mount(EqualizerV2, { target: hote, props: {} });
    flushSync();
    await respirer();
    return hote;
  }
  function saisirGain(el: HTMLElement) {
    const champ = el.querySelectorAll<HTMLInputElement>('.peq input[type="text"]')[1];
    expect(champ, 'champ de gain paramétrique').toBeTruthy();
    champ.value = '6';
    champ.dispatchEvent(new Event('input', { bubbles: true }));
    champ.dispatchEvent(new Event('change', { bubbles: true }));
    flushSync();
  }

  it('🔴 compte gratuit : le motif Premium est affiché et aucune courbe paramétrique ne part', async () => {
    licenseState.update((s) => ({ ...s, tier: 'free', loaded: true }));
    const el = await monter();
    const note = el.querySelector('[data-eq-parametrique-premium]');
    expect(note?.textContent).toContain('Tune Premium');
    saisirGain(el);
    await new Promise((r) => setTimeout(r, 400));
    await respirer();
    expect(mocks.setEq).not.toHaveBeenCalled();
  });

  it('contre-épreuve : avec Premium, pas de motif et la courbe part', async () => {
    licenseState.update((s) => ({ ...s, tier: 'premium', loaded: true }));
    const el = await monter();
    expect(el.querySelector('[data-eq-parametrique-premium]')).toBeNull();
    saisirGain(el);
    await new Promise((r) => setTimeout(r, 400));
    await respirer();
    expect(mocks.setEq).toHaveBeenCalled();
  });
});
