// @vitest-environment jsdom
/**
 * tune-server-rust#7423 : dans l'égaliseur paramétrique, effacer le champ
 * Fréquence (ou Q) pour retaper une valeur rétablissait aussitôt l'ancienne,
 * car la bande était réécrite à chaque frappe avec un repli (20 Hz, Q 1,41).
 * La valeur ne doit être bornée et appliquée qu'à la validation (`change`).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import ParametricEq from '../../components/partages/ParametricEq.svelte';
import { locale } from '../i18n';

let hote: HTMLDivElement;
let composant: Record<string, unknown> | null = null;
let magasin: { freq: number; gain: number; q: number }[];
// Le composant remplace son tableau à chaque modification (`bands = [...bands]`) :
// on lit donc toujours la dernière valeur reliée, jamais le tableau d'origine.
const bandes = new Proxy([] as any[], { get: (_c, k) => (magasin as any)[k] });

beforeEach(() => {
  locale.set('fr');
  (SVGElement.prototype as any).setPointerCapture = () => {};
  magasin = [{ freq: 1000, gain: 3, q: 2 }];
  hote = document.createElement('div');
  document.body.appendChild(hote);
  composant = mount(ParametricEq, { target: hote, props: {
      get bands() { return magasin; },
      set bands(v: typeof magasin) { magasin = v; },
    } });
  flushSync();
  hote.querySelector('circle.band-dot')!.dispatchEvent(new Event('pointerdown', { bubbles: true }));
  flushSync();
});
afterEach(() => {
  if (composant) unmount(composant);
  hote.remove();
});

const champs = () => Array.from(hote.querySelectorAll<HTMLInputElement>('.peq-editor input[type="number"]'));
function saisir(c: HTMLInputElement, v: string) {
  c.value = v;
  c.dispatchEvent(new Event('input', { bubbles: true }));
  flushSync();
}
function valider(c: HTMLInputElement) {
  c.dispatchEvent(new Event('change', { bubbles: true }));
  flushSync();
}

describe('saisie Fréquence / Gain / Q (#7423)', () => {
  it('effacer le champ ne réécrit pas la bande et ne rétablit pas une valeur', () => {
    const [freq, , q] = champs();
    saisir(freq, '');
    expect(freq.value).toBe('');
    expect(bandes[0].freq).toBe(1000);
    saisir(q, '');
    expect(q.value).toBe('');
    expect(bandes[0].q).toBe(2);
  });

  it('une saisie en cours reste telle quelle puis est appliquée à la validation', () => {
    const [freq] = champs();
    saisir(freq, '5');
    expect(freq.value).toBe('5');
    expect(bandes[0].freq).toBe(1000);
    saisir(freq, '5000');
    valider(freq);
    expect(bandes[0].freq).toBe(5000);
  });

  it('la validation borne la valeur', () => {
    // Les champs sont relus après chaque validation : le rendu peut les remplacer.
    saisir(champs()[0], '5');
    valider(champs()[0]);
    expect(bandes[0].freq).toBe(20);
    saisir(champs()[1], '99');
    valider(champs()[1]);
    expect(bandes[0].gain).toBe(12);
    saisir(champs()[2], '100');
    valider(champs()[2]);
    expect(bandes[0].q).toBe(30);
  });

  it('valider un champ vide garde la valeur de la bande et la réaffiche', () => {
    const [freq] = champs();
    saisir(freq, '');
    valider(freq);
    expect(bandes[0].freq).toBe(1000);
    expect(freq.value).toBe('1000');
  });
});
