// @vitest-environment jsdom
// tune-server-rust#4685 — l'interrupteur « Compensation de niveau », monté.
//
// Il affiche ce que le serveur publie (`level_compensation` de `GET
// /zones/{id}/dsp`), écrit l'interrupteur par `PUT`, et se tait devant un
// serveur antérieur qui ne publie pas le champ : un interrupteur sans effet
// serait pire qu'aucun.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import { dictionnaire, ONZE_LANGUES } from './onzeDictionnaires';

const mocks = vi.hoisted(() => ({
  getDsp: vi.fn(),
  setDsp: vi.fn(),
}));
vi.mock('../api', () => mocks);

import CompensationNiveauV2 from '../../components/v2/CompensationNiveauV2.svelte';
import { currentZoneId } from '../stores/zones';

const ETAT = {
  enabled: true, eq_db: -9.36, crossfeed_db: -1.02, compensation_db: 10.38, local_output_only: true,
};

const respirer = () => new Promise((r) => setTimeout(r, 0));
async function laisserCharger() { for (let i = 0; i < 4; i++) await respirer(); flushSync(); }

let hote: HTMLDivElement | null = null;
let monte: Record<string, unknown> | null = null;
async function poser(): Promise<HTMLDivElement> {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(CompensationNiveauV2, { target: hote, props: { revision: 0 } });
  flushSync();
  await laisserCharger();
  return hote;
}

beforeEach(() => {
  for (const m of Object.values(mocks)) m.mockReset();
  currentZoneId.set(3);
});
afterEach(() => {
  if (monte) unmount(monte as any);
  monte = null;
  hote?.remove();
  hote = null;
});

describe('Compensation de niveau (#4685)', () => {
  it('affiche ce que chaque étage retire et ce que le volume rend', async () => {
    mocks.getDsp.mockResolvedValue({ level_compensation: ETAT });
    const el = await poser();
    const bloc = el.querySelector('[data-testid="compensation-niveau"]');
    expect(bloc, 'le bloc manque').not.toBeNull();
    expect(bloc!.textContent).toContain('-9.4');
    expect(bloc!.textContent).toContain('-1.0');
    expect(bloc!.textContent).toContain('+10.4');
    const sw = el.querySelector('input[type="checkbox"]') as HTMLInputElement;
    expect(sw.checked).toBe(true);
    expect(mocks.getDsp).toHaveBeenCalledWith(3);
  });

  it('basculer écrit `level_compensation.enabled` et reprend la réponse', async () => {
    mocks.getDsp.mockResolvedValue({ level_compensation: ETAT });
    mocks.setDsp.mockResolvedValue({
      level_compensation: { ...ETAT, enabled: false, compensation_db: 0 },
    });
    const el = await poser();
    const sw = el.querySelector('input[type="checkbox"]') as HTMLInputElement;
    sw.click();
    await laisserCharger();
    expect(mocks.setDsp).toHaveBeenCalledWith(3, { level_compensation: { enabled: false } });
    expect((el.querySelector('input[type="checkbox"]') as HTMLInputElement).checked).toBe(false);
  });

  it('un refus remet l’interrupteur où il était, et le dit', async () => {
    mocks.getDsp.mockResolvedValue({ level_compensation: ETAT });
    mocks.setDsp.mockRejectedValue(new Error('500'));
    const el = await poser();
    (el.querySelector('input[type="checkbox"]') as HTMLInputElement).click();
    await laisserCharger();
    expect((el.querySelector('input[type="checkbox"]') as HTMLInputElement).checked).toBe(true);
    expect(el.querySelector('.err')).not.toBeNull();
  });

  it('serveur antérieur (champ absent) ⇒ rien n’est affiché', async () => {
    mocks.getDsp.mockResolvedValue({ crossfeed: { enabled: false, amount: 0.3, delay_ms: 0.3 } });
    const el = await poser();
    expect(el.querySelector('[data-testid="compensation-niveau"]')).toBeNull();
  });

  it('les six libellés existent dans les onze langues', () => {
    const cles = ['v2.lc.title', 'v2.lc.hint', 'v2.lc.valueOn', 'v2.lc.valueOff', 'v2.lc.valueNone', 'v2.lc.errSave'];
    for (const langue of ONZE_LANGUES) {
      const d = dictionnaire(langue);
      for (const cle of cles) expect(d[cle], `${langue} : ${cle}`).toBeTruthy();
      for (const cle of ['v2.lc.valueOn', 'v2.lc.valueOff']) {
        expect(d[cle], `${langue} : ${cle} sans {eq}/{cf}`).toMatch(/\{eq\}.*\{cf\}/);
      }
      expect(d['v2.lc.valueOn'], `${langue} : valueOn sans {comp}`).toContain('{comp}');
    }
  });
});
