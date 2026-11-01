// @vitest-environment jsdom
/**
 * rc11 — égaliseur paramétrique :
 * 1. le graphe est FIGÉ par défaut : glisser, molette et double-clic ne
 *    changent rien ; « Modifier » ouvre l'édition, « Terminé » la referme ;
 * 2. une couleur par canal (gauche, droite, les deux), sur les points et les
 *    courbes, avec une légende.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import ParametricEq from '../../components/partages/ParametricEq.svelte';
import { locale } from '../i18n';
import lFr from '../locales/fr';

const fr = lFr as unknown as Record<string, string>;
let hote: HTMLDivElement;
let composant: Record<string, unknown> | null = null;
let magasin: { freq: number; gain: number; q: number; channel?: number }[];
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
  const svgProto = SVGElement.prototype as any;
  svgProto.getBoundingClientRect = () => ({ left: 0, top: 0, width: 640, height: 240, right: 640, bottom: 240, x: 0, y: 0 });
});
afterEach(() => {
  if (composant) unmount(composant);
  hote.remove();
});

const svg = () => hote.querySelector('svg.peq-plot')!;
const points = () => Array.from(hote.querySelectorAll<SVGCircleElement>('circle.band-dot'));
const boutonEdition = () => hote.querySelector<HTMLButtonElement>('button.peq-edit')!;
function glisser(i: number) {
  points()[i].dispatchEvent(new Event('pointerdown', { bubbles: true }));
  const mv = new MouseEvent('pointermove', { bubbles: true, clientX: 600, clientY: 20 });
  svg().dispatchEvent(mv);
  svg().dispatchEvent(new Event('pointerup', { bubbles: true }));
  flushSync();
}
function molette(i: number) {
  const e = new WheelEvent('wheel', { deltaY: -100, bubbles: true, cancelable: true });
  points()[i].dispatchEvent(e);
  flushSync();
  return e;
}
function doubleClic() {
  svg().dispatchEvent(new MouseEvent('dblclick', { bubbles: true, clientX: 320, clientY: 60 }));
  flushSync();
}

describe('graphe figé par défaut, « Modifier » / « Terminé »', () => {
  beforeEach(() => monter([{ freq: 1000, gain: 0, q: 1.41 }]));

  it('figé : glisser, molette et double-clic ne changent rien, la page défile', () => {
    expect(boutonEdition().textContent?.trim()).toBe(fr['eq.peqEdit']);
    glisser(0);
    expect(bandes[0]).toMatchObject({ freq: 1000, gain: 0 });
    const e = molette(0);
    expect(e.defaultPrevented).toBe(false);
    expect(bandes[0].q).toBe(1.41);
    doubleClic();
    expect(bandes.length).toBe(1);
  });

  it('« Modifier » active l’édition, « Terminé » fige de nouveau', () => {
    boutonEdition().click(); flushSync();
    expect(boutonEdition().textContent?.trim()).toBe(fr['eq.peqDone']);
    glisser(0);
    expect(bandes[0].freq).not.toBe(1000);
    expect(bandes[0].gain).toBeGreaterThan(0);
    expect(molette(0).defaultPrevented).toBe(true);
    doubleClic();
    expect(bandes.length).toBe(2);

    boutonEdition().click(); flushSync();
    expect(boutonEdition().textContent?.trim()).toBe(fr['eq.peqEdit']);
    const avant = { ...bandes[0] };
    glisser(0);
    expect(bandes[0]).toMatchObject(avant);
  });
});

describe('couleur par canal', () => {
  it('chaque point porte la classe de son canal ; la légende nomme les trois', () => {
    monter([
      { freq: 100, gain: 2, q: 1 },
      { freq: 1000, gain: -3, q: 1, channel: 0 },
      { freq: 5000, gain: 4, q: 1, channel: 1 },
    ]);
    const cls = points().map((p) => p.getAttribute('class'));
    expect(cls[0]).toContain('canal-tous');
    expect(cls[1]).toContain('canal-g');
    expect(cls[2]).toContain('canal-d');
    const legende = hote.querySelector('.peq-legende')!.textContent!;
    for (const k of ['eq.peqChannelBoth', 'eq.peqChannelLeft', 'eq.peqChannelRight']) expect(legende).toContain(fr[k]);
    // Asymétrique : une courbe par canal.
    expect(hote.querySelector('path.response-gauche')).toBeTruthy();
    expect(hote.querySelector('path.response-droite')).toBeTruthy();
    expect(hote.querySelector('path.response-tous')).toBeNull();
  });

  it('symétrique : une seule courbe, couleur « les deux canaux »', () => {
    monter([{ freq: 100, gain: 2, q: 1 }]);
    expect(hote.querySelector('path.response-tous')).toBeTruthy();
    expect(hote.querySelector('path.response-gauche')).toBeNull();
  });
});
