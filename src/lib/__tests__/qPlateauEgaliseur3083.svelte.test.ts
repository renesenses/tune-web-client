// @vitest-environment jsdom
/**
 * web#3083 (fil 2508, réponse 10927) — égaliseur paramétrique : sur une bande
 * `low_shelf` ou `high_shelf`, le champ Q restait actif et la molette le
 * changeait, alors que le serveur conçoit les plateaux à pente fixe (S = 1)
 * et ignore `q`. Le champ est désormais grisé, avec une infobulle, la
 * molette ne touche plus le Q d'un plateau, et la valeur reste dans la bande.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import ParametricEq from '../../components/partages/ParametricEq.svelte';
import { locale } from '../i18n';
import lFr from '../locales/fr';
import type { EqBand } from '../api';

const fr = lFr as unknown as Record<string, string>;
type Bande = EqBand;
let hote: HTMLDivElement;
let composant: Record<string, unknown> | null = null;
// Un état réactif, comme le `bind:bands` de l'écran Égaliseur.
const etat = $state<{ bandes: Bande[] }>({ bandes: [] });

function monter(initial: Bande[]) {
  etat.bandes = initial;
  hote = document.createElement('div');
  document.body.appendChild(hote);
  composant = mount(ParametricEq, { target: hote, props: {
      get bands() { return etat.bandes; },
      set bands(v: Bande[]) { etat.bandes = v; },
    } });
  flushSync();
}
beforeEach(() => {
  locale.set('fr');
  (SVGElement.prototype as any).setPointerCapture = () => {};
  (SVGElement.prototype as any).getBoundingClientRect = () =>
    ({ left: 0, top: 0, width: 640, height: 240, right: 640, bottom: 240, x: 0, y: 0 });
});
afterEach(() => {
  if (composant) unmount(composant);
  composant = null;
  hote.remove();
});

const points = () => Array.from(hote.querySelectorAll<SVGCircleElement>('circle.band-dot'));
const champQ = () => hote.querySelector<HTMLInputElement>('.peq-editor input[data-cle="q"]')!;
function selectionner(i: number) {
  points()[i].dispatchEvent(new Event('pointerdown', { bubbles: true }));
  hote.querySelector('svg.peq-plot')!.dispatchEvent(new Event('pointerup', { bubbles: true }));
  flushSync();
}
function editer() {
  hote.querySelector<HTMLButtonElement>('button.peq-edit')!.click();
  flushSync();
}
function molette(i: number) {
  points()[i].dispatchEvent(new WheelEvent('wheel', { deltaY: -100, bubbles: true, cancelable: true }));
  flushSync();
}

describe('web#3083 — Q d’un plateau', () => {
  beforeEach(() => monter([
    { freq: 100, gain: 3, q: 0.71, type: 'low_shelf' },
    { freq: 8000, gain: -2, q: 0.9, type: 'high_shelf' },
    { freq: 1000, gain: 1, q: 1.41, type: 'peak' },
  ]));

  it('low_shelf et high_shelf : champ Q désactivé, infobulle qui dit pourquoi, valeur gardée', () => {
    for (const [i, q] of [[0, '0.71'], [1, '0.9']] as const) {
      selectionner(i);
      expect(champQ().disabled, `bande ${i}`).toBe(true);
      expect(champQ().value).toBe(q);
      expect(champQ().closest('label')?.getAttribute('title')).toBe(fr['eq.peqQShelfTip']);
    }
  });

  it('peak : champ Q actif, sans infobulle', () => {
    selectionner(2);
    expect(champQ().disabled).toBe(false);
    expect(champQ().closest('label')?.hasAttribute('title')).toBe(false);
  });

  it('molette en édition : le Q d’un plateau ne bouge pas, celui d’un peak oui', () => {
    editer();
    molette(0);
    expect(etat.bandes[0].q).toBe(0.71);
    molette(2);
    expect(etat.bandes[2].q).toBeGreaterThan(1.41);
  });

  it('repasser la bande en peak réactive le champ, avec le Q d’origine', () => {
    selectionner(0);
    const type = hote.querySelector<HTMLSelectElement>('.peq-editor select')!;
    type.value = 'peak';
    type.dispatchEvent(new Event('change', { bubbles: true }));
    flushSync();
    expect(champQ().disabled).toBe(false);
    expect(champQ().value).toBe('0.71');
    expect(etat.bandes[0].q).toBe(0.71);
  });
});
