// @vitest-environment jsdom
/**
 * Retour testeur du 01/11 (Falkon, Chromium) sur l'égaliseur paramétrique :
 * - Fréquence : « quoi que l'on rentre, il affiche 2 et autant de zéros ;
 *   effacement → 20 » ;
 * - Q : « en permanence 1,41 ; à l'effacement, le premier 1 persiste ».
 *
 * La frappe est simulée caractère par caractère, comme un clavier : le champ
 * doit garder EXACTEMENT ce qui est tapé, la bande ne change qu'en sortant du
 * champ (blur) ou sur Entrée ; virgule et point sont acceptés ; Échap annule ;
 * les flèches ajustent.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import ParametricEq from '../../components/partages/ParametricEq.svelte';
import { locale } from '../i18n';
import { lireDecimal } from '../saisieDecimale';

let hote: HTMLDivElement;
let composant: Record<string, unknown> | null = null;
let magasin: { freq: number; gain: number; q: number }[];
const bandes = new Proxy([] as any[], { get: (_c, k) => (magasin as any)[k] });

beforeEach(() => {
  locale.set('fr');
  (SVGElement.prototype as any).setPointerCapture = () => {};
  magasin = [{ freq: 1000, gain: 3, q: 1.41 }, { freq: 5000, gain: -2, q: 0.7 }];
  hote = document.createElement('div');
  document.body.appendChild(hote);
  composant = mount(ParametricEq, { target: hote, props: {
      get bands() { return magasin; },
      set bands(v: typeof magasin) { magasin = v; },
    } });
  flushSync();
  choisirPoint(0);
});
afterEach(() => {
  if (composant) unmount(composant);
  hote.remove();
});

function choisirPoint(i: number) {
  hote.querySelectorAll('circle.band-dot')[i]!.dispatchEvent(new Event('pointerdown', { bubbles: true }));
  flushSync();
}
const champ = (cle: 'freq' | 'gain' | 'q') =>
  hote.querySelector<HTMLInputElement>(`.peq-editor input[data-cle="${cle}"]`)!;

/** Une frappe : le navigateur modifie la valeur, puis émet `input`. */
function frappe(c: HTMLInputElement, valeurApres: string) {
  c.value = valeurApres;
  c.dispatchEvent(new Event('input', { bubbles: true }));
  flushSync();
}
function taper(c: HTMLInputElement, texte: string) {
  for (const ch of texte) frappe(c, c.value + ch);
}
function effacerTout(c: HTMLInputElement) {
  while (c.value.length) frappe(c, c.value.slice(0, -1));
}
function touche(c: HTMLInputElement, key: string, shiftKey = false) {
  c.dispatchEvent(new KeyboardEvent('keydown', { key, shiftKey, bubbles: true, cancelable: true }));
  flushSync();
}
function sortir(c: HTMLInputElement) {
  c.dispatchEvent(new Event('blur'));
  flushSync();
}

describe('champs Fréquence et Q : frappe libre, validation en sortie', () => {
  it('les champs sont des champs texte décimaux (virgule possible partout)', () => {
    for (const cle of ['freq', 'gain', 'q'] as const) {
      expect(champ(cle).type).toBe('text');
      expect(champ(cle).inputMode).toBe('decimal');
    }
  });

  it('Fréquence : effacer puis taper 1000 affiche 1000 à chaque étape, sans « 20 » ni « 2000 »', () => {
    const f = champ('freq');
    effacerTout(f);
    expect(f.value).toBe('');
    expect(bandes[0].freq).toBe(1000);
    const vus: string[] = [];
    for (const ch of '250') { frappe(f, f.value + ch); vus.push(f.value); }
    expect(vus).toEqual(['2', '25', '250']);
    expect(bandes[0].freq).toBe(1000);
    sortir(f);
    expect(bandes[0].freq).toBe(250);
    expect(f.value).toBe('250');
  });

  it('Q : effacer 1.41 caractère par caractère va jusqu’au vide, et une nouvelle valeur se tape', () => {
    const q = champ('q');
    const vus: string[] = [];
    while (q.value.length) { frappe(q, q.value.slice(0, -1)); vus.push(q.value); }
    expect(vus).toEqual(['1.4', '1.', '1', '']);
    taper(q, '4');
    expect(q.value).toBe('4');
    taper(q, ',5');
    expect(q.value).toBe('4,5');
    expect(bandes[0].q).toBe(1.41);
    touche(q, 'Enter');
    expect(bandes[0].q).toBe(4.5);
    expect(q.value).toBe('4.5');
  });

  it('la validation borne (5 Hz → 20 Hz, Q 100 → 30) et un champ vide garde la valeur', () => {
    const f = champ('freq');
    effacerTout(f); taper(f, '5'); sortir(f);
    expect(bandes[0].freq).toBe(20);
    const q = champ('q');
    effacerTout(q); taper(q, '100'); touche(q, 'Enter');
    expect(bandes[0].q).toBe(30);
    effacerTout(q); sortir(q);
    expect(bandes[0].q).toBe(30);
    expect(q.value).toBe('30');
  });

  it('Échap annule la saisie et réaffiche la valeur de la bande', () => {
    const f = champ('freq');
    effacerTout(f); taper(f, '42');
    touche(f, 'Escape');
    expect(f.value).toBe('1000');
    sortir(f);
    expect(bandes[0].freq).toBe(1000);
  });

  it('flèches : ajustement fin (Q ±0,01, gain ±0,1, fréquence ±1 %), plus grand avec Maj', () => {
    touche(champ('q'), 'ArrowUp');
    expect(bandes[0].q).toBe(1.42);
    touche(champ('q'), 'ArrowDown', true);
    expect(bandes[0].q).toBe(1.32);
    touche(champ('gain'), 'ArrowDown');
    expect(bandes[0].gain).toBe(2.9);
    touche(champ('freq'), 'ArrowUp');
    expect(bandes[0].freq).toBe(1010);
    expect(champ('freq').value).toBe('1010');
  });

  it('changer de point en cours de saisie valide la bande éditée, pas la nouvelle', () => {
    const f = champ('freq');
    effacerTout(f); taper(f, '300');
    choisirPoint(1);
    sortir(f);
    expect(bandes[0].freq).toBe(300);
    expect(bandes[1].freq).toBe(5000);
  });
});

describe('lireDecimal', () => {
  it('accepte virgule, point et espaces ; refuse le reste', () => {
    expect(lireDecimal('1,41')).toBe(1.41);
    expect(lireDecimal('1.41')).toBe(1.41);
    expect(lireDecimal('2 000')).toBe(2000);
    expect(lireDecimal('-3,5')).toBe(-3.5);
    expect(lireDecimal(',5')).toBe(0.5);
    expect(lireDecimal('')).toBeNull();
    expect(lireDecimal('1,2,3')).toBeNull();
    expect(lireDecimal('abc')).toBeNull();
  });
});
