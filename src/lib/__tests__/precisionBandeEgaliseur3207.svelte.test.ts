// @vitest-environment jsdom
/**
 * web#3207 (fil 2903, rc12) — égaliseur paramétrique : l'éditeur de bande
 * arrondissait la fréquence au Hz entier, le gain à 0,1 dB et le Q à 0,01.
 * Le serveur garde des `f64` ; une valeur relevée par mesure (ou importée avec
 * un Q à 3 décimales) était tronquée dès qu'on retouchait le champ.
 *
 * Attendu : au moins 2 décimales pour la fréquence, 3 pour le gain et le Q,
 * réaffichées telles quelles ; un simple clic sur un point (sans glisser) ne
 * réécrit plus la fréquence ni le gain.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import ParametricEq from '../../components/partages/ParametricEq.svelte';
import { locale } from '../i18n';

let hote: HTMLDivElement;
let composant: Record<string, unknown> | null = null;
let magasin: { freq: number; gain: number; q: number }[];
const bandes = new Proxy([] as any[], { get: (_c, k) => (magasin as any)[k] });

function monter(initial: typeof magasin) {
  magasin = initial;
  hote = document.createElement('div');
  document.body.appendChild(hote);
  composant = mount(ParametricEq, { target: hote, props: {
      get bands() { return magasin; },
      set bands(v: typeof magasin) { magasin = v; },
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

const point = () => hote.querySelector<SVGCircleElement>('circle.band-dot')!;
const svg = () => hote.querySelector('svg.peq-plot')!;
const champ = (cle: string) => hote.querySelector<HTMLInputElement>(`.peq-editor input[data-cle="${cle}"]`)!;
function choisir() {
  point().dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, clientX: 0, clientY: 0 }));
  flushSync();
}
function saisirEtValider(cle: string, v: string) {
  const c = champ(cle);
  c.value = v;
  c.dispatchEvent(new Event('input', { bubbles: true }));
  c.dispatchEvent(new Event('change', { bubbles: true }));
  flushSync();
}

describe('précision de l’éditeur de bande (#3207)', () => {
  it('épreuve : fréquence à 2 décimales, gain et Q à 3, gardés et réaffichés', () => {
    monter([{ freq: 1000, gain: 3, q: 2 }]);
    choisir();
    saisirEtValider('freq', '1234,56');
    saisirEtValider('gain', '-2,345');
    saisirEtValider('q', '1,707');
    expect(bandes[0]).toMatchObject({ freq: 1234.56, gain: -2.345, q: 1.707 });
    expect(champ('freq').value).toBe('1234.56');
    expect(champ('gain').value).toBe('-2.345');
    expect(champ('q').value).toBe('1.707');
  });

  it('épreuve : une bande importée (Q à 3 décimales) n’est pas tronquée quand on retouche un autre champ', () => {
    monter([{ freq: 105.5, gain: -3.25, q: 0.707 }]);
    choisir();
    expect(champ('q').value).toBe('0.707');
    saisirEtValider('gain', '-3,125');
    saisirEtValider('q', '0,707');
    expect(bandes[0]).toMatchObject({ freq: 105.5, gain: -3.125, q: 0.707 });
  });

  it('au-delà de la précision gardée, la valeur est arrondie et bornée', () => {
    monter([{ freq: 1000, gain: 3, q: 2 }]);
    choisir();
    saisirEtValider('freq', '1234,5678');
    saisirEtValider('q', '1,70749');
    saisirEtValider('gain', '40');
    expect(bandes[0]).toMatchObject({ freq: 1234.57, q: 1.707, gain: 12 });
  });

  it('un clic sur le point, sans glisser, ne réécrit ni la fréquence ni le gain', () => {
    monter([{ freq: 1234.56, gain: -2.345, q: 1.707 }]);
    hote.querySelector<HTMLButtonElement>('button.peq-edit')!.click(); flushSync();
    const p = point();
    p.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, clientX: 300, clientY: 100 }));
    // Tremblement d'un pixel : pas un glisser.
    svg().dispatchEvent(new MouseEvent('pointermove', { bubbles: true, clientX: 301, clientY: 101 }));
    svg().dispatchEvent(new Event('pointerup', { bubbles: true }));
    flushSync();
    expect(bandes[0]).toMatchObject({ freq: 1234.56, gain: -2.345, q: 1.707 });
    // Un vrai glisser déplace toujours le point.
    point().dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, clientX: 300, clientY: 100 }));
    svg().dispatchEvent(new MouseEvent('pointermove', { bubbles: true, clientX: 600, clientY: 20 }));
    svg().dispatchEvent(new Event('pointerup', { bubbles: true }));
    flushSync();
    expect(bandes[0].freq).not.toBe(1234.56);
    expect(bandes[0].q).toBe(1.707);
  });
});
