// @vitest-environment jsdom
//
// web#3264 (relevé en corrigeant #3260) — égaliseur GRAPHIQUE, canaux G/D
// déliés : « Enregistrer » n'écrivait que la courbe gauche (la droite était
// perdue au rechargement), et `correspond()` répondait toujours faux dès que
// les canaux étaient déliés (« Modifié » affiché en permanence).
//
// Le serveur garde le champ `channel` de chaque bande (routes/eq_pro.rs,
// `EqBand.channel`) : un préréglage délié porte donc deux passes sur la grille.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import { get } from 'svelte/store';

const mocks = vi.hoisted(() => ({
  getPluginDetail: vi.fn(),
  getEqExpertSettings: vi.fn(),
  getEq: vi.fn(),
  setEq: vi.fn(),
  listEqPresets: vi.fn(),
  createEqPreset: vi.fn(),
  updateEqPreset: vi.fn(),
  deleteEqPreset: vi.fn(),
  getDsp: vi.fn(),
  setDsp: vi.fn(),
  listCrossfeedPresets: vi.fn(),
  saveCrossfeedPreset: vi.fn(),
  deleteCrossfeedPreset: vi.fn(),
  getLevelCompensation: vi.fn(),
}));

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return { ...actual, ...mocks };
});

import EqualizerV2 from '../../components/v2/EqualizerV2.svelte';
import { currentZoneId } from '../stores/zones';
import { dialogs } from '../stores/dialogs';
import lFr from '../locales/fr';
import { preferences } from '../stores/preferences';

const fr = lFr as unknown as Record<string, string>;
const GRILLE = [31, 63, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];
const GAUCHE = [3, 2, 1, 0, 0, 0, 0, 1, 2, 3];
const DROITE = [1, 1, 1, 0, 0, 0, -1, -1, -2, -2];
/** Un préréglage délié tel que le serveur le rend : deux passes sur la grille. */
const DELIE = {
  id: 'p-delie', name: 'Pièce dissymétrique', eq_type: 'graphic',
  bands: [
    ...GRILLE.map((freq, i) => ({ freq, gain: GAUCHE[i], q: 1, type: 'peak', channel: 0 })),
    ...GRILLE.map((freq, i) => ({ freq, gain: DROITE[i], q: 1, type: 'peak', channel: 1 })),
  ],
};
const LIE = {
  id: 'p-lie', name: 'Salon', eq_type: 'graphic',
  bands: GRILLE.map((freq, i) => ({ freq, gain: GAUCHE[i], q: 1, type: 'peak' })),
};

const respirer = () => new Promise((r) => setTimeout(r, 0));
async function laisserCharger() { for (let i = 0; i < 5; i++) await respirer(); flushSync(); }

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

function bouton(el: HTMLElement, texte: string): HTMLButtonElement | undefined {
  return Array.from(el.querySelectorAll<HTMLButtonElement>('.presets.mes button'))
    .find((b) => (b.textContent ?? '').trim() === texte);
}
const enregistrer = (el: HTMLElement) => bouton(el, fr['eq.save'])!;
const modif = (el: HTMLElement) => el.querySelector('.presets.mes .modif');

async function cliquer(b: HTMLButtonElement | undefined) {
  expect(b, 'bouton introuvable').toBeTruthy();
  b!.click();
  flushSync();
  await laisserCharger();
}


function boutonCtrl(el: HTMLElement, texte: string): HTMLButtonElement {
  const b = Array.from(el.querySelectorAll<HTMLButtonElement>('.ctrls button'))
    .find((x) => (x.textContent ?? '').trim() === texte);
  expect(b, `bouton « ${texte} » introuvable`).toBeTruthy();
  return b!;
}
async function clic(b: HTMLButtonElement) { b.click(); flushSync(); await laisserCharger(); }
/** Les curseurs de la courbe affichée (le canal en cours d'édition). */
const curseurs = (el: HTMLElement) => Array.from(el.querySelectorAll<HTMLInputElement>('.board input[type="range"]'));
async function regler(el: HTMLElement, i: number, v: number) {
  const c = curseurs(el)[i];
  c.value = String(v);
  c.dispatchEvent(new Event('input', { bubbles: true }));
  flushSync();
  await laisserCharger();
}
const valeurs = (el: HTMLElement) => curseurs(el).map((c) => Number(c.value));

beforeEach(() => {
  for (const m of Object.values(mocks)) m.mockReset();
  mocks.getPluginDetail.mockResolvedValue({ name: 'equalizer', installed: true });
  mocks.getEqExpertSettings.mockResolvedValue({ expert_bands: 10 });
  mocks.getEq.mockResolvedValue({ enabled: true, bands: [] });
  mocks.setEq.mockResolvedValue({ applied_live: true });
  mocks.listEqPresets.mockResolvedValue([LIE, DELIE]);
  mocks.updateEqPreset.mockImplementation(async (id: string, corps: any) => ({ id, ...corps }));
  mocks.createEqPreset.mockImplementation(async (corps: any) => ({ id: 'p-neuf', ...corps }));
  mocks.getDsp.mockResolvedValue({ crossfeed: { enabled: true, amount: 0.3, delay_ms: 0.5 } });
  mocks.setDsp.mockImplementation(async (_z: number, c: any) => ({ crossfeed: c.crossfeed, crossfeed_applied_live: true }));
  mocks.getLevelCompensation.mockResolvedValue(null);
  preferences.update((p) => ({ ...p, settingsLevel: 'expert' }));
  currentZoneId.set(1);
  localStorage.clear();
});

afterEach(() => {
  if (monte) unmount(monte as any);
  monte = null;
  hote?.remove();
  hote = null;
  for (const r of get(dialogs)) dialogs.settle(r.id, null);
  localStorage.clear();
});

describe('web#3264 — graphique, canaux déliés', () => {
  it('🔴 « Enregistrer » écrit les DEUX courbes', async () => {
    const el = await poser();
    await cliquer(bouton(el, 'Salon'));
    await clic(boutonCtrl(el, fr['v2.eq.unlink']));
    await clic(boutonCtrl(el, fr['v2.eq.right']));
    await regler(el, 9, -4);
    expect(enregistrer(el).disabled).toBe(false);
    await cliquer(enregistrer(el));

    expect(mocks.updateEqPreset).toHaveBeenCalledTimes(1);
    const [id, corps] = mocks.updateEqPreset.mock.calls[0];
    expect(id).toBe('p-lie');
    expect(corps.eq_type).toBe('graphic');
    const gauche = corps.bands.filter((b: any) => b.channel === 0).map((b: any) => b.gain);
    const droite = corps.bands.filter((b: any) => b.channel === 1).map((b: any) => b.gain);
    expect(gauche).toEqual(GAUCHE);
    expect(droite).toEqual([...GAUCHE.slice(0, 9), -4]);
    // Juste enregistré : plus rien de « modifié ».
    expect(enregistrer(el).disabled).toBe(true);
    expect(modif(el)).toBeNull();
  });

  it('🔴 appliquer un préréglage délié rend ses deux courbes et n’est pas « modifié »', async () => {
    const el = await poser();
    await cliquer(bouton(el, 'Pièce dissymétrique'));
    expect(enregistrer(el).disabled, '« Modifié » dès l’application').toBe(true);
    expect(modif(el)).toBeNull();
    expect(valeurs(el)).toEqual(GAUCHE);
    await clic(boutonCtrl(el, fr['v2.eq.right']));
    expect(valeurs(el)).toEqual(DROITE);
    // Le son reçoit bien les deux passes.
    const envoye = mocks.setEq.mock.calls.at(-1)![1].bands;
    expect(envoye.filter((b: any) => b.channel === 1).map((b: any) => b.gain)).toEqual(DROITE);
  });

  it('🔴 un gain du canal DROIT modifié dégrise « Enregistrer », le retour le regrise', async () => {
    const el = await poser();
    await cliquer(bouton(el, 'Pièce dissymétrique'));
    await clic(boutonCtrl(el, fr['v2.eq.right']));
    await regler(el, 6, 2);
    expect(enregistrer(el).disabled).toBe(false);
    expect(modif(el)).not.toBeNull();
    await regler(el, 6, -1);
    expect(enregistrer(el).disabled).toBe(true);
  });

  it('un gain du canal GAUCHE modifié dégrise aussi « Enregistrer »', async () => {
    const el = await poser();
    await cliquer(bouton(el, 'Pièce dissymétrique'));
    await regler(el, 0, 0);
    expect(enregistrer(el).disabled).toBe(false);
  });

  it('relier les canaux d’un préréglage délié le rend « modifié »', async () => {
    const el = await poser();
    await cliquer(bouton(el, 'Pièce dissymétrique'));
    await clic(boutonCtrl(el, fr['v2.eq.relink']));
    expect(enregistrer(el).disabled).toBe(false);
  });

  it('un préréglage lié appliqué après un délié relie les canaux', async () => {
    const el = await poser();
    await cliquer(bouton(el, 'Pièce dissymétrique'));
    await cliquer(bouton(el, 'Salon'));
    expect(enregistrer(el).disabled).toBe(true);
    expect(boutonCtrl(el, fr['v2.eq.unlink'])).toBeTruthy();
    const envoye = mocks.setEq.mock.calls.at(-1)![1].bands;
    expect(envoye.some((b: any) => b.channel !== undefined)).toBe(false);
  });
});
