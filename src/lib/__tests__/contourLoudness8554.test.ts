// @vitest-environment jsdom
//
// tune-server-rust#8554 — le contour de loudness qui suit le volume (ISO 226),
// dans l'égaliseur de zone. L'écran ne calcule rien : il montre ce que
// `GET /zones/{id}/eq/loudness` publie et n'écrit que les champs touchés.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import { dictionnaire } from './onzeDictionnaires';

const mocks = vi.hoisted(() => ({
  getLoudness: vi.fn(),
  setLoudness: vi.fn(),
}));

vi.mock('../api', () => mocks);

import ContourLoudnessV2 from '../../components/v2/ContourLoudnessV2.svelte';
import { currentZoneId } from '../stores/zones';

const LOCALES = ['fr', 'en', 'de', 'es', 'it', 'ja', 'ko', 'ro', 'sv', 'zh', 'hu', 'vi', 'el', 'nb', 'pl'];
const CLES = [
  'title', 'hint', 'bassOnly', 'intensity', 'source', 'sourceVolume', 'sourceManual', 'manualLevel',
  'reference', 'referenceHelp', 'statusActive', 'statusFlat', 'statusPure', 'statusStrict',
  'statusUnknown', 'statusUnsupported', 'errSave',
].map((k) => `v2.loud.${k}`);

const respirer = () => new Promise((r) => setTimeout(r, 0));
async function laisserCharger() { for (let i = 0; i < 4; i++) await respirer(); flushSync(); }

let hote: HTMLDivElement | null = null;
let monte: Record<string, unknown> | null = null;

async function poser(): Promise<HTMLDivElement> {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(ContourLoudnessV2, { target: hote });
  flushSync();
  await laisserCharger();
  return hote;
}

function etat(status: string, enabled = true, contour = [{ hz: 63, db: 7.6 }, { hz: 10000, db: 1.4 }]) {
  return {
    zone_id: 1,
    settings: {
      enabled, curve: 'iso226_2003', bass_only: false, intensity_pct: 100,
      reference_volume_db: 0, reference_phon: 80, level_source: 'volume', manual_level_db: -20,
    },
    status, curves: ['iso226_2003'], volume_db: -20, attenuation_db: 20, contour_db: contour,
  };
}

beforeEach(() => {
  for (const m of Object.values(mocks)) m.mockReset();
  currentZoneId.set(1);
});

afterEach(() => {
  if (monte) unmount(monte as any);
  monte = null;
  hote?.remove();
  hote = null;
});

describe('Contour de loudness (#8554)', () => {
  it('🔴 serveur antérieur (404) ⇒ rien n’est montré', async () => {
    mocks.getLoudness.mockRejectedValue(new Error('404'));
    const el = await poser();
    expect(el.querySelector('[data-testid="contour-loudness"]')).toBeNull();
  });

  it('actif ⇒ le contour au volume courant est dit', async () => {
    mocks.getLoudness.mockResolvedValue(etat('active'));
    const el = await poser();
    const ligne = el.querySelector('[data-testid="contour-loudness-etat"]')!;
    expect(ligne.getAttribute('data-status')).toBe('active');
    expect(ligne.textContent).toBe('+7.6 dB à 63 Hz, +1.4 dB à 10 kHz au volume actuel');
  });

  it('🔴 sous PURE ⇒ le contournement est dit, pas un contour', async () => {
    mocks.getLoudness.mockResolvedValue(etat('bypassed_pure'));
    const el = await poser();
    expect(el.querySelector('[data-testid="contour-loudness-etat"]')!.textContent)
      .toBe('Contourné : PURE est actif sur cette zone');
  });

  it('🔴 volume fixe ⇒ « niveau inconnu », avec le remède', async () => {
    mocks.getLoudness.mockResolvedValue(etat('level_unknown_fixed_volume'));
    const el = await poser();
    expect(el.querySelector('[data-testid="contour-loudness-etat"]')!.textContent)
      .toContain('choisissez un niveau manuel');
  });

  it('allumer n’envoie QUE l’interrupteur', async () => {
    mocks.getLoudness.mockResolvedValue(etat('disabled', false, []));
    mocks.setLoudness.mockResolvedValue(etat('active'));
    const el = await poser();
    (el.querySelector('.sw input') as HTMLInputElement).click();
    await laisserCharger();
    expect(mocks.setLoudness).toHaveBeenCalledWith(1, { enabled: true });
    expect(el.querySelector('[data-testid="contour-loudness-etat"]')).not.toBeNull();
  });

  it('l’intensité s’écrit au relâcher du curseur', async () => {
    mocks.getLoudness.mockResolvedValue(etat('active'));
    mocks.setLoudness.mockResolvedValue({ ...etat('active'), settings: { ...etat('active').settings, intensity_pct: 50 } });
    const el = await poser();
    const curseur = el.querySelector('[data-testid="contour-loudness-intensite"]') as HTMLInputElement;
    curseur.value = '50';
    curseur.dispatchEvent(new Event('change', { bubbles: true }));
    await laisserCharger();
    expect(mocks.setLoudness).toHaveBeenCalledWith(1, { intensity_pct: 50 });
  });

  it('🔴 un refus remet l’état d’avant, et le dit', async () => {
    mocks.getLoudness.mockResolvedValue(etat('disabled', false, []));
    mocks.setLoudness.mockRejectedValue(new Error('boom'));
    const el = await poser();
    (el.querySelector('.sw input') as HTMLInputElement).click();
    await laisserCharger();
    expect(el.querySelector('[data-testid="contour-loudness-etat"]')).toBeNull();
    expect(el.querySelector('.err')).not.toBeNull();
  });

  it('dix-sept clés, quinze dictionnaires', () => {
    for (const code of LOCALES) {
      const dico = dictionnaire(code);
      for (const cle of CLES) expect(dico[cle], `${code} / ${cle}`).toBeTruthy();
    }
  });
});
