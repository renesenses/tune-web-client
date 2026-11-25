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
import { vueHistorique, vueReglagesAvances, motifDuVerrou } from '../tessPanneaux';
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
  const catalogue = new ServeurTessSimule().catalogue;

  it('🔴 tout motif de verrou ⇒ pas de lien (Premium, non installé, indisponible)', () => {
    for (const id of ['equalizer-graphic', 'equalizer-parametric', 'crossfeed', 'crossfeed-pro', 'crosstalk', 'room-correction']) {
      for (const m of ['premium_required', 'plugin_not_installed', 'plugin_unavailable'] as const) {
        expect(vueReglagesAvances(id, m), `${id} ${m}`).toBeNull();
      }
    }
  });

  it('🔴 `entitled: false` publié par le serveur ⇒ pas de lien, même avec une licence locale Premium', () => {
    for (const id of ['crossfeed-pro', 'crosstalk', 'equalizer-parametric']) {
      const m = motifDuVerrou(id, { [id]: { entitled: false } } as any, catalogue, true);
      expect(vueReglagesAvances(id, m), id).toBeNull();
    }
  });

  it('🔴 serveur sans droits publiés, licence locale gratuite ⇒ pas de lien vers un greffon Premium', () => {
    for (const id of ['crossfeed-pro', 'crosstalk', 'equalizer-parametric']) {
      expect(vueReglagesAvances(id, motifDuVerrou(id, null, catalogue, false)), id).toBeNull();
    }
    // Contre-épreuve : licence locale Premium ⇒ le lien revient.
    expect(vueReglagesAvances('crossfeed-pro', motifDuVerrou('crossfeed-pro', null, catalogue, true))).toBe('crossfeedpro');
    // Greffon gratuit, licence gratuite ⇒ lien.
    expect(vueReglagesAvances('equalizer-graphic', motifDuVerrou('equalizer-graphic', null, catalogue, false))).toBe('equalizer');
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

describe('W8 — 4. Égaliseur sans Premium : le paramétrique est en lecture seule et n’écrit rien', () => {
  const COURBE = [
    { freq: 45, gain: 3.5, q: 0.7, type: 'low_shelf' },
    { freq: 1700, gain: 2, q: 1.8, type: 'peak' },
  ];
  /** Un passe-haut : le gain n'y compte pas (0), la bande agit quand même. */
  const PASSE_HAUT = [{ freq: 120, gain: 0, q: 0.7, type: 'high_pass' }];
  const PRESET_PARAM = { id: 41, name: 'Casque', eq_type: 'parametric', bands: PASSE_HAUT };
  const attendre = () => new Promise((r) => setTimeout(r, 0));
  const respirer = async () => { for (let i = 0; i < 6; i++) await attendre(); flushSync(); };
  const apresAttente = async () => { await new Promise((r) => setTimeout(r, 400)); await respirer(); };
  let hote: HTMLDivElement;
  let instance: Record<string, unknown> | null = null;

  beforeEach(() => {
    for (const fn of Object.values(mocks)) fn.mockReset();
    mocks.getPluginDetail.mockResolvedValue({ name: 'equalizer', installed: true });
    mocks.getEqExpertSettings.mockResolvedValue({ expert_bands: 10 });
    mocks.getEq.mockResolvedValue({ enabled: true, bands: COURBE });
    mocks.listEqPresets.mockResolvedValue([PRESET_PARAM]);
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
  const caseActive = (el: HTMLElement) => el.querySelector<HTMLInputElement>('.v2-actions input[type="checkbox"]')!;
  const boutonPreset = (el: HTMLElement) =>
    [...el.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.trim() === 'Casque');

  it('🔴 compte gratuit : motif Premium, édition inerte, et la saisie forcée n’écrit rien', async () => {
    licenseState.update((s) => ({ ...s, tier: 'free', loaded: true }));
    const el = await monter();
    expect(el.querySelector('[data-eq-parametrique-premium]')?.textContent).toContain('Tune Premium');
    const verrou = el.querySelector<HTMLFieldSetElement>('[data-eq-parametrique-lecture-seule]')!;
    expect(verrou.disabled).toBe(true);
    expect((verrou as any).inert === true || verrou.hasAttribute('inert')).toBe(true);
    // Le bouton « Modifier » de l'éditeur est dans le bloc désactivé.
    expect(verrou.querySelector('.peq-edit')).not.toBeNull();
    saisirGain(el);
    await apresAttente();
    expect(mocks.setEq).not.toHaveBeenCalled();
  });

  it('🔴 compte gratuit : un passe-haut (gain 0) puis « Activé » recoché ⇒ rien ne part, la case ne bouge pas', async () => {
    licenseState.update((s) => ({ ...s, tier: 'free', loaded: true }));
    mocks.getEq.mockResolvedValue({ enabled: false, bands: PASSE_HAUT });
    const el = await monter();
    expect(el.querySelector('[data-eq-parametrique-lecture-seule]')).not.toBeNull();
    const c = caseActive(el);
    expect(c.checked).toBe(false);
    c.checked = true;
    c.dispatchEvent(new Event('change', { bubbles: true }));
    flushSync();
    await apresAttente();
    expect(mocks.setEq).not.toHaveBeenCalled();
    expect(caseActive(el).checked).toBe(false);
  });

  it('🔴 compte gratuit : « Remettre à plat » en paramétrique n’écrit rien', async () => {
    licenseState.update((s) => ({ ...s, tier: 'free', loaded: true }));
    const el = await monter();
    (el.querySelector('.v2-actions .v2-btn') as HTMLButtonElement).click();
    await apresAttente();
    expect(mocks.setEq).not.toHaveBeenCalled();
  });

  it('🔴 compte gratuit : un préréglage personnel paramétrique ne s’applique pas', async () => {
    licenseState.update((s) => ({ ...s, tier: 'free', loaded: true }));
    mocks.getEq.mockResolvedValue({ enabled: true, bands: [] });
    const el = await monter();
    const b = boutonPreset(el);
    expect(b, 'bouton du préréglage « Casque »').toBeTruthy();
    b!.click();
    await apresAttente();
    expect(mocks.setEq).not.toHaveBeenCalled();
    // L'écran n'a pas basculé sur une courbe que le serveur n'a pas reçue.
    expect(el.querySelector('[data-eq-parametrique-lecture-seule]')).toBeNull();
    expect(b!.getAttribute('aria-pressed')).not.toBe('true');
  });

  it('🔴 licence pas encore lue (`loaded: false`) : aucune écriture paramétrique, sans motif affiché', async () => {
    licenseState.update((s) => ({ ...s, tier: 'premium', loaded: false }));
    const el = await monter();
    expect(el.querySelector('[data-eq-parametrique-premium]')).toBeNull();
    expect(el.querySelector('[data-eq-parametrique-lecture-seule]')).not.toBeNull();
    saisirGain(el);
    await apresAttente();
    expect(mocks.setEq).not.toHaveBeenCalled();
  });

  it('contre-épreuve : avec Premium, pas de motif, édition libre, la courbe et le préréglage partent', async () => {
    licenseState.update((s) => ({ ...s, tier: 'premium', loaded: true }));
    const el = await monter();
    expect(el.querySelector('[data-eq-parametrique-premium]')).toBeNull();
    expect(el.querySelector('[data-eq-parametrique-lecture-seule]')).toBeNull();
    saisirGain(el);
    await apresAttente();
    expect(mocks.setEq).toHaveBeenCalled();
    mocks.setEq.mockClear();
    boutonPreset(el)!.click();
    await apresAttente();
    expect(mocks.setEq).toHaveBeenCalled();
    expect(mocks.setEq.mock.calls.at(-1)![1].bands).toEqual(PASSE_HAUT);
  });
});
