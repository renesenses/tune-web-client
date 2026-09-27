// @vitest-environment jsdom
//
// « Mes préréglages » : une liste vide ne veut PAS dire « supprimés ».
//
// Quand `GET /eq/presets` n'aboutit pas, `EqualizerV2` faisait
// `catch { mesPresets = []; }` : liste vide, aucun message. L'utilisateur en
// conclut que ses préréglages ont été effacés — ils sont côté serveur,
// intacts, c'est seulement la lecture qui a échoué.
//
// L'ancien écran tenait un MIROIR dans le stockage local
// (`EqualizerView.svelte`, `PRESETS_CACHE_KEY = 'tune-eq-presets-cache'`) et
// affirmait d'où venait la liste (`eq.presetsLoadFailed`). Les deux sont
// partis avec lui le 19/09 (`d5ed7deb`, phase 5) ; la clé i18n, elle, est
// restée dans les onze langues, sans personne pour l'afficher.
//
// 🔴 CES TÉMOINS MONTENT LE VRAI ÉCRAN, comme `eqReserve5171.test.ts` : un
// avertissement présent dans la source mais jamais rendu ne garde rien.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';

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
  listEqPresets: vi.fn(),
  createEqPreset: vi.fn(),
  deleteEqPreset: vi.fn(),
}));

vi.mock('../api', () => mocks);

import EqualizerV2 from '../../components/v2/EqualizerV2.svelte';
import { currentZoneId } from '../stores/zones';

/** La clé de v1 — même tiroir, même liste. */
const CLE = 'tune-eq-presets-cache';

const PRESET_A = {
  id: 'p-a',
  name: 'Salon soir',
  eq_type: 'graphic',
  bands: [31, 63, 125, 250, 500, 1000, 2000, 4000, 8000, 16000].map((freq) => ({ freq, gain: 2, q: 1 })),
};
const PRESET_B = {
  id: 'p-b',
  name: 'Casque',
  eq_type: 'graphic',
  bands: [31, 63, 125, 250, 500, 1000, 2000, 4000, 8000, 16000].map((freq) => ({ freq, gain: -1, q: 1 })),
};

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

/** Les préréglages PERSONNELS réellement rendus, dans l'ordre. */
const miens = (el: HTMLElement) =>
  Array.from(el.querySelectorAll('.presets.mes .mien > button:first-child')).map(
    (b) => (b.textContent ?? '').trim(),
  );
/** L'avertissement « cette liste vient du cache local ». */
const avert = (el: HTMLElement) => el.querySelector('.mes-cache');

beforeEach(() => {
  for (const m of Object.values(mocks)) m.mockReset();
  mocks.getPluginDetail.mockResolvedValue({ name: 'equalizer', installed: true });
  mocks.getEqExpertSettings.mockResolvedValue({ expert_bands: 10 });
  mocks.getEq.mockResolvedValue({ enabled: true, bands: [] });
  mocks.setEq.mockResolvedValue({ applied_live: true });
  mocks.getDsp.mockResolvedValue({});
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

describe('Égaliseur — le miroir local de « Mes préréglages »', () => {
  it('🔴 serveur en échec AVEC miroir : la liste RESTE, et l’écran dit d’où elle vient', async () => {
    localStorage.setItem(CLE, JSON.stringify([PRESET_A, PRESET_B]));
    mocks.listEqPresets.mockRejectedValue(new TypeError('Failed to fetch'));

    const el = await poser();
    expect(el.querySelectorAll('.board input.v').length, 'l’écran est bien monté').toBe(10);
    // Le défaut : cette liste se vidait.
    expect(miens(el), 'les préréglages du miroir restent affichés').toEqual(['Salon soir', 'Casque']);
    expect(avert(el), 'rien ne disait pourquoi la liste pouvait être périmée').not.toBeNull();
    expect(avert(el)!.textContent).toBe(
      'Vos préréglages n’ont pas pu être lus sur le serveur : cette liste vient du cache local',
    );
  });

  it('🔴 serveur en échec SANS miroir : liste vide, et RIEN ne prétend qu’elle vient du cache', async () => {
    // v1 montrait l'avertissement dès que le serveur échouait, miroir ou pas :
    // « cette liste vient du cache local » sur une liste vide était faux. On
    // se taît plutôt que de mentir — aucun libellé existant ne dit
    // honnêtement « illisible, et rien en réserve ».
    mocks.listEqPresets.mockRejectedValue(new TypeError('Failed to fetch'));

    const el = await poser();
    expect(el.querySelectorAll('.board input.v').length, 'l’écran est bien monté').toBe(10);
    expect(miens(el)).toEqual([]);
    expect(avert(el), 'la phrase affirme un cache : sans cache, elle ne doit pas paraître').toBeNull();
  });

  it('serveur qui répond : AUCUN avertissement, et le miroir est rafraîchi', async () => {
    localStorage.setItem(CLE, JSON.stringify([PRESET_A]));
    mocks.listEqPresets.mockResolvedValue([PRESET_B]);

    const el = await poser();
    expect(miens(el)).toEqual(['Casque']);
    expect(avert(el), 'le serveur a répondu : il n’y a rien à avertir').toBeNull();
    const garde = JSON.parse(localStorage.getItem(CLE) ?? 'null');
    expect(garde.map((p: { id: string }) => p.id), 'le miroir suit la réponse du serveur').toEqual(['p-b']);
  });

  it('🔴 un stockage local qui JETTE ne casse pas l’écran', async () => {
    // Fenêtre privée, données bloquées, quota : l'accès lui-même peut lever.
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('stockage refusé');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('stockage refusé');
    });
    mocks.listEqPresets.mockResolvedValue([PRESET_A]);

    const el = await poser();
    expect(el.querySelectorAll('.board input.v').length, 'l’écran reste monté et utilisable').toBe(10);
    expect(miens(el), 'la réponse du serveur s’affiche même sans miroir possible').toEqual(['Salon soir']);
    expect(avert(el)).toBeNull();
  });

  it('🔴 un miroir laissé par l’ANCIEN écran est écarté, pas appliqué à moitié', async () => {
    // v1 écrivait sa propre forme dans la même clé : `mode`/`gains`, sans
    // `bands`. La reprendre telle quelle offrirait un préréglage qui, cliqué,
    // applique une courbe vide en portant le nom de la sienne.
    localStorage.setItem(
      CLE,
      JSON.stringify([{ id: 'v1', name: 'Vieux', mode: 'graphic', gains: [3, 3, 0, 0, 0, 0, 0, 0, 0, 0] }]),
    );
    mocks.listEqPresets.mockRejectedValue(new TypeError('Failed to fetch'));

    const el = await poser();
    expect(miens(el)).toEqual([]);
    expect(avert(el), 'rien de lisible en réserve : la phrase du cache serait fausse').toBeNull();
  });

  it('un miroir illisible (JSON cassé) se comporte comme une absence de miroir', async () => {
    localStorage.setItem(CLE, '{ceci n’est pas du JSON');
    mocks.listEqPresets.mockRejectedValue(new TypeError('Failed to fetch'));

    const el = await poser();
    expect(el.querySelectorAll('.board input.v').length).toBe(10);
    expect(miens(el)).toEqual([]);
    expect(avert(el)).toBeNull();
  });
});
