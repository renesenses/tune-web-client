// @vitest-environment jsdom
//
// tune-server-rust#5171 — le réglage « Réserve » de l'égaliseur : Sûre (norme
// L1, aucune saturation possible, défaut) ou Réaliste (maximum réel de la
// courbe, plus un limiteur de sécurité sur les crêtes rares).
//
// 🔴 CES TÉMOINS MONTENT LE VRAI ÉCRAN, comme `eqGreffonFacultatif.test.ts`.
// Un serveur qui ne publie pas `headroom_mode` dans `GET /zones/{id}/eq` ne
// connaît pas le réglage : le contrôle doit être CACHÉ, pas montré inerte.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import { dictionnaire } from './onzeDictionnaires';

const mocks = vi.hoisted(() => ({
  getPluginDetail: vi.fn(),
  getEqExpertSettings: vi.fn(),
  getEq: vi.fn(),
  setEq: vi.fn(),
  setEqHeadroomMode: vi.fn(),
  setEqExpertSettings: vi.fn(),
  installPlugin: vi.fn(),
  enablePlugin: vi.fn(),
  setDsp: vi.fn(),
  getDsp: vi.fn(),
}));

vi.mock('../api', () => mocks);

import EqualizerV2 from '../../components/v2/EqualizerV2.svelte';
import { currentZoneId } from '../stores/zones';

const LOCALES = ['fr', 'en', 'de', 'es', 'it', 'ja', 'ko', 'ro', 'sv', 'zh', 'hu'];
const CLES = ['v2.eq.headroom', 'v2.eq.headroomSafe', 'v2.eq.headroomRealistic', 'v2.eq.headroomHelp'];

const respirer = () => new Promise((r) => setTimeout(r, 0));
async function laisserCharger() { for (let i = 0; i < 4; i++) await respirer(); flushSync(); }

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

const reserve = (el: HTMLElement) => el.querySelector('.ctrls.reserve');
const choix = (el: HTMLElement) =>
  Array.from(el.querySelectorAll('.ctrls.reserve .seg button')) as HTMLButtonElement[];

beforeEach(() => {
  for (const m of Object.values(mocks)) m.mockReset();
  mocks.getPluginDetail.mockResolvedValue({ name: 'equalizer', installed: true });
  mocks.getEqExpertSettings.mockResolvedValue({ expert_bands: 10 });
  mocks.setEq.mockResolvedValue({ applied_live: true });
  mocks.getDsp.mockResolvedValue({});
  currentZoneId.set(1);
});

afterEach(() => {
  if (monte) unmount(monte as any);
  monte = null;
  hote?.remove();
  hote = null;
});

describe('Égaliseur — la réserve (#5171)', () => {
  it('🔴 serveur qui ne connaît pas le réglage ⇒ contrôle CACHÉ', async () => {
    mocks.getEq.mockResolvedValue({ enabled: true, bands: [] });
    const el = await poser();
    expect(el.querySelectorAll('.board input.v').length, 'l’écran est bien monté').toBe(10);
    expect(
      reserve(el),
      'serveur sans `headroom_mode` : le contrôle « Réserve » doit être caché, il n’agirait sur rien',
    ).toBeNull();
  });

  it('serveur récent, réserve sûre ⇒ « Sûre » choisie, et la phrase d’aide', async () => {
    mocks.getEq.mockResolvedValue({ enabled: true, bands: [], headroom_mode: 'safe' });
    const el = await poser();
    expect(reserve(el)).not.toBeNull();
    const [sure, realiste] = choix(el);
    expect(sure.textContent).toBe('Sûre');
    expect(realiste.textContent).toBe('Réaliste');
    expect(sure.classList.contains('on')).toBe(true);
    expect(realiste.classList.contains('on')).toBe(false);
    expect(reserve(el)!.textContent).toContain(
      'Sûre : aucune saturation possible. Réaliste : plus de niveau, un limiteur de sécurité agit sur les crêtes rares',
    );
  });

  it('cliquer « Réaliste » envoie la SEULE réserve, et le bouton suit', async () => {
    mocks.getEq.mockResolvedValue({ enabled: true, bands: [], headroom_mode: 'safe' });
    mocks.setEqHeadroomMode.mockResolvedValue({ headroom_mode: 'realistic', applied_live: true });
    const el = await poser();
    choix(el)[1].click();
    await laisserCharger();
    expect(mocks.setEqHeadroomMode).toHaveBeenCalledWith(1, 'realistic');
    // La courbe n'est pas renvoyée pour changer la réserve.
    expect(mocks.setEq).not.toHaveBeenCalled();
    expect(choix(el)[1].classList.contains('on')).toBe(true);
    expect(choix(el)[0].classList.contains('on')).toBe(false);
  });

  it('🔴 un refus du serveur remet le choix d’avant, et le dit', async () => {
    mocks.getEq.mockResolvedValue({ enabled: true, bands: [], headroom_mode: 'safe' });
    mocks.setEqHeadroomMode.mockRejectedValue(new Error('boom'));
    const el = await poser();
    choix(el)[1].click();
    await laisserCharger();
    expect(choix(el)[0].classList.contains('on')).toBe(true);
    expect(el.querySelector('.err')).not.toBeNull();
  });

  it('quatre clés, onze dictionnaires', () => {
    for (const code of LOCALES) {
      const dico = dictionnaire(code);
      for (const cle of CLES) expect(dico[cle], `${code} / ${cle}`).toBeTruthy();
    }
  });
});
