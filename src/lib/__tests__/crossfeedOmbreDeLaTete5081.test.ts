// @vitest-environment jsdom
//
// tune-server-rust#5081 — l'« ombre de la tête » du crossfeed : un filtre sur
// le terme croisé seul, plat jusqu'à la fréquence de coupure (200 Hz – 20 kHz)
// puis en pente de 3 à 6 dB par octave. Éteint par défaut.
//
// Ce témoin tient trois choses :
//   1. l'échelle LOGARITHMIQUE du curseur de coupure, et les bornes ;
//   2. l'écran MONTÉ : interrupteur, puis les deux curseurs quand il est
//      allumé, et ce qui part au serveur (`PUT /zones/{id}/dsp`) ;
//   3. un serveur qui ne connaît pas le filtre (0.9.165 et avant, sans
//      `cutoff_hz_min` dans `crossfeed_limits`) : les contrôles sont CACHÉS.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';

const dsp = vi.hoisted(() => ({ reponse: {} as any, envois: [] as any[] }));

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return {
    ...actual,
    getDsp: vi.fn(async () => dsp.reponse),
    setDsp: vi.fn(async (_zid: number, corps: any) => {
      dsp.envois.push(corps);
      return { crossfeed: corps.crossfeed, crossfeed_applied_live: true };
    }),
    listCrossfeedPresets: vi.fn(async () => []),
    getLevelCompensation: vi.fn(async () => null),
  };
});

import CrossfeedV2 from '../../components/v2/CrossfeedV2.svelte';
import { currentZoneId, zones } from '../stores/zones';
import {
  bornesOmbre, positionDeCoupure, coupureDePosition, libelleCoupure, reglagesOmbre,
  CF_COUPURE_POSITIONS,
} from '../crossfeed';
import * as LOCALES from './lesOnzeLangues';
import lFr from '../locales/fr';

const fr = lFr as unknown as Record<string, string>;

const BORNES_SERVEUR = {
  amount_max: 0.5,
  delay_ms_max: 5,
  cutoff_hz_min: 200,
  cutoff_hz_max: 20000,
  slope_db_per_octave_min: 3,
  slope_db_per_octave_max: 6,
};

describe('#5081 — l’échelle et les bornes de l’ombre de la tête', () => {
  it('un serveur sans les bornes du filtre ne le connaît pas : null', () => {
    expect(bornesOmbre(null)).toBeNull();
    expect(bornesOmbre({ amount_max: 0.5, delay_ms_max: 5 })).toBeNull();
    expect(bornesOmbre(BORNES_SERVEUR)).toEqual({
      coupureMin: 200, coupureMax: 20000, penteMin: 3, penteMax: 6,
    });
  });

  it('la coupure suit une échelle logarithmique : chaque décade, la même course', () => {
    expect(positionDeCoupure(200)).toBe(0);
    expect(positionDeCoupure(2000)).toBe(CF_COUPURE_POSITIONS / 2);
    expect(positionDeCoupure(20000)).toBe(CF_COUPURE_POSITIONS);
    expect(coupureDePosition(0)).toBe(200);
    expect(coupureDePosition(CF_COUPURE_POSITIONS / 2)).toBe(2000);
    expect(coupureDePosition(CF_COUPURE_POSITIONS)).toBe(20000);
    // Aller-retour : 700 Hz (le défaut) et 1 200 Hz (Jan Meier « extended »).
    expect(coupureDePosition(positionDeCoupure(700))).toBe(700);
    expect(coupureDePosition(positionDeCoupure(1200))).toBe(1200);
  });

  it('les libellés et les bornes de la charge utile', () => {
    expect(libelleCoupure(700)).toBe('700 Hz');
    expect(libelleCoupure(1200)).toBe('1.2 kHz');
    expect(libelleCoupure(20000)).toBe('20 kHz');
    expect(reglagesOmbre(true, 50, 9)).toEqual({
      head_shadow_enabled: true, cutoff_hz: 200, slope_db_per_octave: 6,
    });
    expect(reglagesOmbre(false, 30000, 1)).toEqual({
      head_shadow_enabled: false, cutoff_hz: 20000, slope_db_per_octave: 3,
    });
  });

  it('les huit clés existent dans les onze langues', () => {
    const tables = Object.values(LOCALES).filter(
      (v) => v && typeof v === 'object' && 'v2.cf.amountHint' in (v as object),
    ) as Record<string, string>[];
    expect(tables).toHaveLength(11);
    for (const cle of [
      'v2.cf.headShadow', 'v2.cf.headShadowHint', 'v2.cf.cutoff', 'v2.cf.cutoffHint',
      'v2.cf.cutoffAria', 'v2.cf.slope', 'v2.cf.slopeHint', 'v2.cf.slopeAria',
    ]) {
      for (const table of tables) expect(table[cle], cle).toBeTruthy();
    }
  });
});

let hote: HTMLDivElement | null = null;
let monte: Record<string, any> | null = null;

async function attendre(tours = 5) {
  for (let i = 0; i < tours; i++) {
    await new Promise((r) => setTimeout(r, 0));
    flushSync();
  }
}

async function ecran(): Promise<HTMLElement> {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(CrossfeedV2, { target: hote, props: {} });
  await attendre();
  return hote;
}

/** La rangée dont le libellé est `libelle`. */
function rangee(el: HTMLElement, libelle: string): HTMLElement | null {
  return ([...el.querySelectorAll('.row')] as HTMLElement[]).find(
    (r) => (r.querySelector('.lbl span')?.textContent ?? '').trim() === libelle,
  ) ?? null;
}

beforeEach(() => {
  dsp.envois = [];
  zones.set([{ id: 1, name: 'Casque', output_type: 'local', state: 'stopped' } as any]);
  currentZoneId.set(1);
});

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  hote?.remove();
  hote = null;
  vi.useRealTimers();
});

describe('#5081 — l’écran Crossfeed', () => {
  it('interrupteur éteint : les deux curseurs sont absents ; allumé, ils paraissent et le réglage part', async () => {
    dsp.reponse = {
      crossfeed: { enabled: true, amount: 0.3, delay_ms: 0.3,
        head_shadow_enabled: false, cutoff_hz: 700, slope_db_per_octave: 6 },
      crossfeed_limits: BORNES_SERVEUR,
    };
    const el = await ecran();
    const inter = rangee(el, fr['v2.cf.headShadow']);
    expect(inter, 'pas d’interrupteur « Ombre de la tête »').not.toBeNull();
    expect(rangee(el, fr['v2.cf.cutoff'])).toBeNull();
    expect(rangee(el, fr['v2.cf.slope'])).toBeNull();

    (inter!.querySelector('input[type=checkbox]') as HTMLInputElement).click();
    await attendre();
    const coupure = rangee(el, fr['v2.cf.cutoff']);
    const pente = rangee(el, fr['v2.cf.slope']);
    expect(coupure, 'curseur de coupure absent, filtre allumé').not.toBeNull();
    expect(pente, 'curseur de pente absent, filtre allumé').not.toBeNull();
    expect(coupure!.querySelector('.val')?.textContent?.trim()).toBe('700 Hz');
    const envoi = dsp.envois.at(-1)?.crossfeed;
    expect(envoi).toMatchObject({ head_shadow_enabled: true, cutoff_hz: 700, slope_db_per_octave: 6 });

    // Le curseur de coupure est logarithmique : sa position médiane vaut 2 kHz.
    vi.useFakeTimers();
    const glissiere = coupure!.querySelector('input[type=range]') as HTMLInputElement;
    glissiere.value = String(CF_COUPURE_POSITIONS / 2);
    glissiere.dispatchEvent(new Event('input', { bubbles: true }));
    flushSync();
    expect(coupure!.querySelector('.val')?.textContent?.trim()).toBe('2 kHz');
    vi.advanceTimersByTime(400);
    vi.useRealTimers();
    await attendre();
    expect(dsp.envois.at(-1)?.crossfeed).toMatchObject({ cutoff_hz: 2000 });
  });

  it('un serveur qui ne connaît pas le filtre : aucun contrôle, rien d’envoyé', async () => {
    dsp.reponse = {
      crossfeed: { enabled: true, amount: 0.3, delay_ms: 0.3 },
      crossfeed_limits: { amount_max: 0.5, delay_ms_max: 5 },
    };
    const el = await ecran();
    expect(rangee(el, fr['v2.cf.headShadow']), 'contrôle montré à un serveur 0.9.165').toBeNull();
    expect(rangee(el, fr['v2.cf.cutoff'])).toBeNull();
    // Un réglage d'intensité part sans les champs du filtre.
    const inter = rangee(el, fr['v2.cf.enable']);
    (inter!.querySelector('input[type=checkbox]') as HTMLInputElement).click();
    await attendre();
    expect(dsp.envois.at(-1)?.crossfeed).not.toHaveProperty('head_shadow_enabled');
  });
});
