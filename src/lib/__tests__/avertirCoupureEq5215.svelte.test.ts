// @vitest-environment jsdom
//
// tune-server-rust#5215 — Levente (fil 1974, casque) : couper l'égaliseur
// rendait d'un coup les ~10 dB que sa réserve retirait, « without warning ».
// Une fenêtre prévient AVANT la coupure, avec le saut en dB quand le serveur
// publie de quoi le calculer, et une case « Ne plus afficher ».
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import { get } from 'svelte/store';
import { dictionnaire, ONZE_LANGUES } from './onzeDictionnaires';

const mocks = vi.hoisted(() => ({
  getPluginDetail: vi.fn(), getEqExpertSettings: vi.fn(), getEq: vi.fn(),
  setEq: vi.fn(), getDsp: vi.fn(), listEqPresets: vi.fn(), setDsp: vi.fn(),
}));
vi.mock('../api', () => mocks);

import EqualizerV2 from '../../components/v2/EqualizerV2.svelte';
import DialogContainer from '../../components/partages/DialogContainer.svelte';
import { currentZoneId } from '../stores/zones';
import { dialogs } from '../stores/dialogs';
import { locale } from '../i18n';
import { CLE_NE_PLUS_AVERTIR, doitAvertir, sautALaCoupure } from '../avertissementCoupureEq';

/** Le cas du ticket : réserve −10,4 dB, volume de Tune à 100 %, rien de rendu. */
const AU_MAXIMUM = {
  enabled: true, eq_db: -10.4, crossfeed_db: -0.2, compensation_db: 10.6,
  rendered_db: 0, unrendered_db: 10.6, volume: 1, local_output_only: false, applied_by: 'output_volume',
};
/** Volume à 25 % (−12 dB de marge) : la compensation rend tout, pas de saut. */
const TOUT_RENDU = { ...AU_MAXIMUM, rendered_db: 10.6, unrendered_db: 0, volume: 0.25 };

const attendre = () => new Promise((resolve) => setTimeout(resolve, 0));
const respirer = async () => { for (let i = 0; i < 6; i++) await attendre(); flushSync(); };
let hote: HTMLDivElement;
let instance: Record<string, unknown> | null = null;
async function monter() {
  hote = document.createElement('div');
  document.body.append(hote);
  instance = mount(EqualizerV2, { target: hote });
  flushSync();
  await respirer();
  return hote;
}
const interrupteur = () => hote.querySelector<HTMLInputElement>('.v2-actions input[type="checkbox"]')!;
async function basculer() {
  const c = interrupteur();
  c.checked = !c.checked;
  c.dispatchEvent(new Event('change', { bubbles: true }));
  await respirer();
}
const enAttente = () => get(dialogs);

beforeEach(() => {
  for (const fn of Object.values(mocks)) fn.mockReset();
  mocks.getPluginDetail.mockResolvedValue({ name: 'equalizer', installed: true });
  mocks.getEqExpertSettings.mockResolvedValue({ expert_bands: 10 });
  mocks.getEq.mockResolvedValue({ enabled: true, bands: [31, 63, 125, 250, 500, 1000, 2000, 4000, 8000, 16000].map((f) => ({ freq: f, gain: 6, q: 1 })) });
  mocks.listEqPresets.mockResolvedValue([]);
  mocks.setEq.mockResolvedValue({ applied_live: true });
  mocks.getDsp.mockResolvedValue({ level_compensation: AU_MAXIMUM });
  localStorage.removeItem(CLE_NE_PLUS_AVERTIR);
  for (const d of get(dialogs)) dialogs.settle(d.id, false);
  locale.set('fr');
  currentZoneId.set(1);
});
afterEach(() => {
  if (instance) unmount(instance as any);
  instance = null;
  hote?.remove();
  for (const d of get(dialogs)) dialogs.settle(d.id, false);
});

describe('#5215 — le saut calculé depuis level_compensation', () => {
  it('volume 100 % : le saut vaut ce que l’égaliseur retire', () => {
    expect(sautALaCoupure(AU_MAXIMUM)).toBe(10.4);
  });
  it('compensation entièrement rendue : pas de saut, pas de fenêtre', () => {
    expect(sautALaCoupure(TOUT_RENDU)).toBe(0);
    expect(doitAvertir(sautALaCoupure(TOUT_RENDU))).toBe(false);
  });
  it('compensation coupée : le saut vaut ce que l’égaliseur retire', () => {
    expect(sautALaCoupure({ ...TOUT_RENDU, enabled: false, compensation_db: 0, rendered_db: 0 })).toBe(10.4);
  });
  it('zone réseau (gain cuit dans le flux) : rien à rattraper par le volume', () => {
    expect(sautALaCoupure({ ...AU_MAXIMUM, rendered_db: 10.6, unrendered_db: 0, applied_by: 'stream_gain' })).toBe(0);
  });
  it('serveur sans le champ : saut inconnu, et l’on prévient quand même', () => {
    expect(sautALaCoupure(undefined)).toBeNull();
    expect(doitAvertir(null)).toBe(true);
  });
});

describe('#5215 — la fenêtre avant la coupure', () => {
  it('🔴 couper à volume 100 % ouvre la fenêtre avec le saut, et rien ne part avant la réponse', async () => {
    await monter();
    await basculer();
    const [d] = enAttente();
    expect(d, 'aucune fenêtre avant la coupure — #5215').toBeTruthy();
    expect(d.message).toContain('+10.4 dB');
    expect(d.case).toEqual({ label: 'Ne plus afficher', coche: false });
    expect(mocks.setEq).not.toHaveBeenCalled();

    // Annuler : l'égaliseur reste allumé, l'interrupteur revient.
    dialogs.settle(d.id, null);
    await respirer();
    await new Promise((r) => setTimeout(r, 350));
    expect(mocks.setEq).not.toHaveBeenCalled();
    expect(interrupteur().checked).toBe(true);
  });

  it('accepter coupe ; « Ne plus afficher » coché, la fenêtre ne revient plus', async () => {
    await monter();
    await basculer();
    const [d] = enAttente();
    dialogs.settle(d.id, { coche: true });
    await respirer();
    expect(mocks.setEq).toHaveBeenCalledOnce();
    expect(mocks.setEq.mock.calls[0][1].enabled).toBe(false);
    expect(localStorage.getItem(CLE_NE_PLUS_AVERTIR)).toBe('1');

    await basculer(); // rallumer : jamais de fenêtre
    await basculer(); // recouper : la case a été cochée
    expect(enAttente()).toHaveLength(0);
    expect(mocks.setEq).toHaveBeenCalledTimes(3);
  });

  it('accepter sans cocher : la fenêtre reviendra', async () => {
    await monter();
    await basculer();
    dialogs.settle(enAttente()[0].id, { coche: false });
    await respirer();
    expect(localStorage.getItem(CLE_NE_PLUS_AVERTIR)).toBeNull();
  });

  it('compensation entièrement rendue : la coupure part sans fenêtre', async () => {
    mocks.getDsp.mockResolvedValue({ level_compensation: TOUT_RENDU });
    await monter();
    await basculer();
    expect(enAttente()).toHaveLength(0);
    expect(mocks.setEq).toHaveBeenCalledOnce();
  });

  it('serveur sans level_compensation : la fenêtre s’ouvre, sans chiffre', async () => {
    mocks.getDsp.mockResolvedValue({});
    await monter();
    await basculer();
    const [d] = enAttente();
    expect(d).toBeTruthy();
    expect(d.message).not.toMatch(/dB/);
  });
});

describe('#5215 — la case à cocher de la fenêtre', () => {
  it('le conteneur affiche la case et rend son état', async () => {
    const h = document.createElement('div');
    document.body.append(h);
    const c = mount(DialogContainer, { target: h });
    const reponse = dialogs.confirmAvecCase('Attention', 'Ne plus afficher', { coche: false });
    flushSync();
    const caseOption = h.querySelector<HTMLInputElement>('.dialog-case input[type="checkbox"]');
    expect(caseOption, 'pas de case « Ne plus afficher »').not.toBeNull();
    caseOption!.click();
    flushSync();
    h.querySelector<HTMLButtonElement>('.dialog-btn.primary')!.click();
    expect(await reponse).toEqual({ coche: true });
    unmount(c);
    h.remove();
  });
  it('la case part DÉCOCHÉE, et annuler rend null', async () => {
    const r = dialogs.confirmAvecCase('Attention', 'Ne plus afficher', { coche: false });
    expect(get(dialogs)[0].case?.coche).toBe(false);
    dialogs.settle(get(dialogs)[0].id, null);
    expect(await r).toBeNull();
  });
});

describe('#5215 — libellés dans les onze langues', () => {
  it.each(ONZE_LANGUES)('%s', (code) => {
    const d = dictionnaire(code);
    for (const cle of ['v2.eq.offWarn', 'v2.eq.offWarnDb', 'v2.eq.offWarnDontShow']) {
      expect(d[cle], `${code} : ${cle}`).toBeTruthy();
    }
    expect(d['v2.eq.offWarnDb']).toContain('{db}');
  });
});
