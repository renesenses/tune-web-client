// @vitest-environment jsdom
/**
 * web#3272 — suites de relecture de la liste des bandes (#3268) :
 * sélection qui suit sa bande, focus après la DERNIÈRE suppression, flèches
 * haut/bas dans les champs de la liste, cibles tactiles de 44 px.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, tick, unmount } from 'svelte';
import ParametricEq from '../../components/partages/ParametricEq.svelte';
import source from '../../components/partages/ParametricEq.svelte?raw';
import { locale } from '../i18n';
import lFr from '../locales/fr';
import type { EqBand } from '../api';

const fr = lFr as unknown as Record<string, string>;
let hote: HTMLDivElement;
let composant: Record<string, unknown> | null = null;
const etat = $state<{ bandes: EqBand[] }>({ bandes: [] });
const onchange = vi.fn();

function monter(initial: EqBand[]) {
  etat.bandes = initial;
  hote = document.createElement('div');
  document.body.appendChild(hote);
  composant = mount(ParametricEq, { target: hote, props: {
      get bands() { return etat.bandes; },
      set bands(v: EqBand[]) { etat.bandes = v; },
      onchange,
    } });
  flushSync();
}
beforeEach(() => {
  locale.set('fr');
  onchange.mockReset();
  (SVGElement.prototype as any).setPointerCapture = () => {};
  (SVGElement.prototype as any).getBoundingClientRect = () =>
    ({ left: 0, top: 0, width: 640, height: 240, right: 640, bottom: 240, x: 0, y: 0 });
  monter([
    { freq: 100, gain: 3, q: 0.71, type: 'low_shelf' },
    { freq: 1000, gain: -2.5, q: 1.41, type: 'peak', channel: 0 },
    { freq: 8000, gain: 1, q: 2, type: 'notch', channel: 1 },
  ]);
});
afterEach(() => {
  if (composant) unmount(composant);
  composant = null;
  hote.remove();
});

const lignes = () => Array.from(hote.querySelectorAll<HTMLLIElement>('.peq-liste li.peq-ligne'));
const champ = (i: number, cle: string) =>
  lignes()[i].querySelector<HTMLInputElement & HTMLSelectElement>(`[data-ligne-cle="${cle}"]`)!;
const croix = (i: number) => lignes()[i].querySelector<HTMLButtonElement>('button.peq-ligne-suppr')!;

const fleche = (c: HTMLElement, key: string, shiftKey = false) => {
  c.dispatchEvent(new KeyboardEvent('keydown', { key, shiftKey, bubbles: true, cancelable: true }));
  flushSync();
};
const numero = (i: number) => lignes()[i].querySelector<HTMLButtonElement>('button.peq-ligne-num')!;
const editeurFreq = () => hote.querySelector<HTMLInputElement>('.peq-editor input[data-cle="freq"]');

describe('web#3272 — liste des bandes, suites de relecture', () => {
  it('🔴 supprimer une AUTRE bande garde la sélection sur sa bande', async () => {
    numero(2).click();
    flushSync();
    expect(editeurFreq()?.value).toBe('8000');
    croix(0).click();
    flushSync();
    await tick();
    expect(editeurFreq()?.value, 'la sélection est tombée').toBe('8000');
    expect(numero(1).getAttribute('aria-pressed')).toBe('true');
    // Une bande APRÈS la sélectionnée : rien ne bouge.
    numero(0).click();
    flushSync();
    croix(1).click();
    flushSync();
    await tick();
    expect(editeurFreq()?.value).toBe('1000');
  });

  it('supprimer la bande sélectionnée referme l’éditeur', async () => {
    numero(1).click();
    flushSync();
    croix(1).click();
    flushSync();
    await tick();
    expect(editeurFreq()).toBeNull();
  });

  it('🔴 après la DERNIÈRE bande, le focus passe au bouton « + », pas au <body>', async () => {
    for (let n = 3; n > 0; n--) {
      croix(0).click();
      flushSync();
      await tick();
    }
    expect(etat.bandes).toHaveLength(0);
    expect(document.activeElement).toBe(hote.querySelector('button.peq-add'));
  });

  it('🔴 flèches haut/bas dans les champs de la liste (Maj = grand pas)', () => {
    const gain = champ(1, 'gain');
    fleche(gain, 'ArrowUp');
    expect(etat.bandes[1].gain).toBeCloseTo(-2.4, 6);
    fleche(gain, 'ArrowUp', true);
    expect(etat.bandes[1].gain).toBeCloseTo(-1.4, 6);
    expect(gain.value).toBe('-1.4');
    const q = champ(1, 'q');
    fleche(q, 'ArrowDown');
    expect(etat.bandes[1].q).toBeCloseTo(1.4, 6);
    const freq = champ(2, 'freq');
    fleche(freq, 'ArrowUp', true);
    expect(etat.bandes[2].freq).toBeCloseTo(8000 * Math.pow(2, 1 / 3), 1);
    expect(onchange).toHaveBeenCalledTimes(4);
  });

  it('les flèches ne touchent pas le Q grisé d’un plateau', () => {
    fleche(champ(0, 'q'), 'ArrowUp');
    expect(etat.bandes[0].q).toBe(0.71);
  });

  it('🔴 cibles tactiles de 44 px sur téléphone', () => {
    const media = source.slice(source.lastIndexOf('@media (max-width: 600px)'));
    expect(media).toMatch(/\.peq-ligne-num, \.peq-ligne-suppr \{ min-width: 44px; min-height: 44px; \}/);
    expect(media).toMatch(/\.peq-ligne input, \.peq-ligne select \{ min-height: 44px; \}/);
  });
});
