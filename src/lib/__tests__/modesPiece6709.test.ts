// @vitest-environment jsdom
//
// tune-server-rust#6709 (Tades, fil 2364) — « Modes de la pièce » dans
// l'Égaliseur. Le serveur calcule (`POST /eq/room-modes`), l'écran montre des
// filtres MODIFIABLES, puis les applique par `setEq` comme toute courbe
// paramétrique. Zone sensible : des atténuations seulement.
//
// Témoins :
//   1. aucun gain envoyé n'est positif, même si l'utilisateur ou le serveur
//      en propose un (bornes −20 à −3 dB, Q 4 à 20) ;
//   2. « Appliquer » passe par `setEq` (le chemin de l'égaliseur), en
//      paramétrique, avec les filtres cochés et retouchés ;
//   3. un refus du serveur est nommé, et rien ne part vers le son.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';

const mocks = vi.hoisted(() => ({
  getPluginDetail: vi.fn(),
  getEqExpertSettings: vi.fn(),
  getEq: vi.fn(),
  setEq: vi.fn(),
  listEqPresets: vi.fn(),
  getLevelCompensation: vi.fn(),
  computeRoomModes: vi.fn(),
}));

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return { ...actual, ...mocks };
});

import EqualizerV2 from '../../components/v2/EqualizerV2.svelte';
import { currentZoneId } from '../stores/zones';
import { preferences } from '../stores/preferences';
import {
  bandesAAppliquer, borneGain, borneQ, corpsDeLaPiece, filtresEditables, lireMetres, SAISIE_VIDE,
} from '../eqModesPiece';
import lFr from '../locales/fr';

const fr = lFr as unknown as Record<string, string>;

const REPONSE = {
  filters: [
    { freq: 34.3, gain: -10.4, q: 6.2, type: 'peak', modes: [[1, 0, 0]] },
    { freq: 68.6, gain: -7.1, q: 12.5, type: 'peak', modes: [[2, 0, 0], [0, 0, 1]] },
    // Un serveur qui se tromperait : l'écran ne doit PAS le suivre.
    { freq: 85.8, gain: 4, q: 40, type: 'peak', modes: [[0, 2, 0]] },
  ],
  modes: [
    { n: [1, 0, 0], freq: 34.3, kind: 'axial', coupling: 0.82 },
    { n: [1, 1, 0], freq: 54.91, kind: 'tangential', coupling: 0 },
  ],
  modes_total: 120,
  assumptions: { speed_of_sound_m_s: 343, rt60_s: 0.4, count: 8, min_freq_hz: 20, max_freq_hz: 250 },
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

function bouton(el: HTMLElement, texte: string): HTMLButtonElement | undefined {
  return Array.from(el.querySelectorAll<HTMLButtonElement>('button'))
    .find((b) => (b.textContent ?? '').trim() === texte);
}

function saisir(el: HTMLElement, nom: string, valeur: string) {
  const champ = el.querySelector<HTMLInputElement>(`input[name="${nom}"]`);
  expect(champ, `champ ${nom} absent`).toBeTruthy();
  champ!.value = valeur;
  champ!.dispatchEvent(new Event('input', { bubbles: true }));
}

async function ouvrirEtCalculer(el: HTMLElement) {
  bouton(el, fr['v2.eq.modeRoomModes'])!.click();
  flushSync();
  saisir(el, 'longueur', '5');
  saisir(el, 'largeur', '4');
  saisir(el, 'hauteur', '2,5');
  saisir(el, 'auditeur', '1');
  saisir(el, 'enceintes', '0,8');
  flushSync();
  el.querySelector<HTMLFormElement>('.modes-piece form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
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
  mocks.computeRoomModes.mockResolvedValue(REPONSE);
  preferences.update((p) => ({ ...p, settingsLevel: 'expert' }));
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

describe('#6709 — bornes : des atténuations seulement', () => {
  it('🔴 aucun gain ne sort au-dessus de −3 dB, quelle que soit l’entrée', () => {
    for (const g of [12, 6, 0.5, 0, -1, -2.9, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(borneGain(g), `gain ${g}`).toBe(-3);
    }
    expect(borneGain(-7.5)).toBe(-7.5);
    expect(borneGain(-50)).toBe(-20);
    expect(borneGain(Number.NEGATIVE_INFINITY)).toBe(-3);
    expect(borneQ(40)).toBe(20);
    expect(borneQ(0.5)).toBe(4);
  });

  it('🔴 les bandes envoyées sont toutes négatives, même si le serveur dit +4', () => {
    const bandes = bandesAAppliquer(filtresEditables(REPONSE.filters as any));
    expect(bandes.map((b) => b.gain)).toEqual([-10.4, -7.1, -3]);
    expect(bandes.every((b) => b.gain < 0 && b.type === 'peak')).toBe(true);
    expect(bandes[2].q).toBe(20);
  });

  it('les dimensions se lisent à la virgule comme au point', () => {
    expect(lireMetres('2,5')).toBe(2.5);
    expect(lireMetres(' 4.2 m ')).toBe(4.2);
    expect(lireMetres('')).toBeNull();
    expect(lireMetres('cinq')).toBeNull();
    const r = corpsDeLaPiece({ ...SAISIE_VIDE, longueur: '5', largeur: '4', hauteur: '2,5', auditeur: '1', enceintes: '0,8' });
    expect(r).toEqual({ corps: {
      length_m: 5, width_m: 4, height_m: 2.5, listener_from_back_wall_m: 1, speaker_from_front_wall_m: 0.8, count: 8,
    } });
    expect(corpsDeLaPiece({ ...SAISIE_VIDE, longueur: '5' })).toEqual({ illisible: 'largeur' });
  });
});

describe('#6709 — Égaliseur : onglet « Modes de la pièce »', () => {
  it('🔴 le calcul envoie la pièce, et rien ne part vers le son avant « Appliquer »', async () => {
    const el = await poser();
    await ouvrirEtCalculer(el);
    expect(mocks.computeRoomModes).toHaveBeenCalledWith({
      length_m: 5, width_m: 4, height_m: 2.5, listener_from_back_wall_m: 1, speaker_from_front_wall_m: 0.8, count: 8,
    });
    expect(el.querySelectorAll('.modes-piece table.filtres tbody tr').length).toBe(3);
    expect(mocks.setEq, 'calculer ne doit rien appliquer').not.toHaveBeenCalled();
  });

  it('🔴 « Appliquer » passe par setEq, en paramétrique, avec les retouches bornées', async () => {
    const el = await poser();
    await ouvrirEtCalculer(el);
    const gains = el.querySelectorAll<HTMLInputElement>('.modes-piece input.gain');
    // L'utilisateur tape +6 dans la première case : elle redevient −3.
    gains[0].value = '6';
    gains[0].dispatchEvent(new Event('change', { bubbles: true }));
    flushSync();
    expect(gains[0].value).toBe('-3');
    // Il décoche le deuxième filtre.
    const coches = el.querySelectorAll<HTMLInputElement>('.modes-piece input[type="checkbox"]');
    coches[1].click();
    flushSync();
    bouton(el, fr['v2.eq.room.apply'])!.click();
    flushSync();
    await laisserCharger();
    expect(mocks.setEq).toHaveBeenCalledTimes(1);
    const [zone, corps] = mocks.setEq.mock.calls[0];
    expect(zone).toBe(1);
    expect(corps.enabled).toBe(true);
    expect(corps.bands.map((b: any) => [b.freq, b.gain, b.q, b.type])).toEqual([
      [34.3, -3, 6.2, 'peak'],
      [85.8, -3, 20, 'peak'],
    ]);
    expect(corps.bands.every((b: any) => b.gain < 0)).toBe(true);
    // La courbe s'ouvre en paramétrique : modifiable bande par bande.
    const onglet = bouton(el, fr['v2.eq.modeParametric']);
    expect(onglet?.classList.contains('on')).toBe(true);
  });

  it('un refus du serveur est nommé, et rien ne part vers le son', async () => {
    const refus = Object.assign(new Error('length_m = 0 : attendu entre 1.5 et 30'), {
      status: 400, code: 'room_value_out_of_bounds', corps: { error: 'room_value_out_of_bounds', field: 'length_m' },
    });
    mocks.computeRoomModes.mockRejectedValue(refus);
    const el = await poser();
    await ouvrirEtCalculer(el);
    const alerte = el.querySelector('.modes-piece .erreur')?.textContent ?? '';
    expect(alerte).toBe(fr['v2.eq.room.errBounds'].replace('{field}', fr['v2.eq.room.length']));
    expect(el.querySelector('.modes-piece table.filtres')).toBeNull();
    expect(mocks.setEq).not.toHaveBeenCalled();
  });
});
