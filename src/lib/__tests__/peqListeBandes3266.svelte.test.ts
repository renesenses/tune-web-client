// @vitest-environment jsdom
/**
 * web#3266 (forum, fil 2948) — égaliseur paramétrique : sous la courbe, la
 * LISTE de toutes les bandes, éditables sur place, avec une croix par ligne
 * pour supprimer une bande sans avoir à cliquer d'abord sur son point.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, tick, unmount } from 'svelte';
import ParametricEq from '../../components/partages/ParametricEq.svelte';
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
function saisir(c: HTMLInputElement, v: string) {
  c.value = v;
  c.dispatchEvent(new Event('change', { bubbles: true }));
  flushSync();
}
function choisir(c: HTMLSelectElement, v: string) {
  c.value = v;
  c.dispatchEvent(new Event('change', { bubbles: true }));
  flushSync();
}

describe('web#3266 — liste des bandes sous la courbe', () => {
  it('🔴 une ligne par bande, sans rien sélectionner, avec toutes ses valeurs', () => {
    expect(hote.querySelector('.peq-liste')?.getAttribute('aria-label')).toBe(fr['eq.peqBandList']);
    expect(lignes()).toHaveLength(3);
    expect(champ(1, 'freq').value).toBe('1000');
    expect(champ(1, 'gain').value).toBe('-2.5');
    expect(champ(1, 'q').value).toBe('1.41');
    expect(champ(2, 'type').value).toBe('notch');
    expect(champ(0, 'channel').value).toBe('both');
    expect(champ(1, 'channel').value).toBe('0');
    expect(champ(2, 'channel').value).toBe('1');
    // Q d'un plateau : grisé, comme dans l'éditeur (#3083).
    expect(champ(0, 'q').disabled).toBe(true);
    expect(champ(1, 'q').disabled).toBe(false);
  });

  it('🔴 la croix supprime SA bande, sans sélection préalable', async () => {
    expect(hote.querySelector('.peq-editor')).toBeNull();
    expect(croix(1).getAttribute('aria-label')).toBe('Supprimer la bande 2 (1000 Hz)');
    croix(1).click();
    flushSync();
    await tick();
    expect(etat.bandes.map((b) => b.freq)).toEqual([100, 8000]);
    expect(onchange).toHaveBeenCalled();
    expect(lignes()).toHaveLength(2);
    // Le focus passe à la croix qui a pris la place : on enchaîne au clavier.
    expect(document.activeElement).toBe(croix(1));
  });

  it('🔴 supprimer la dernière ligne rend le focus à la précédente', async () => {
    croix(2).click();
    flushSync();
    await tick();
    expect(etat.bandes).toHaveLength(2);
    expect(document.activeElement).toBe(croix(1));
  });

  it('🔴 fréquence, gain et Q éditables sur place, bornés comme l’éditeur', () => {
    saisir(champ(1, 'freq'), '1250,5');
    expect(etat.bandes[1].freq).toBe(1250.5);
    saisir(champ(1, 'gain'), '40');
    expect(etat.bandes[1].gain).toBe(12);
    expect(champ(1, 'gain').value).toBe('12');
    saisir(champ(1, 'q'), '3.333');
    expect(etat.bandes[1].q).toBe(3.333);
    expect(onchange).toHaveBeenCalledTimes(3);
  });

  it('une saisie illisible ne touche pas la bande ; Échap rétablit la valeur', () => {
    saisir(champ(1, 'gain'), 'abc');
    expect(etat.bandes[1].gain).toBe(-2.5);
    expect(champ(1, 'gain').value).toBe('-2.5');
    const c = champ(1, 'freq');
    c.value = '42';
    c.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    flushSync();
    expect(c.value).toBe('1000');
    expect(etat.bandes[1].freq).toBe(1000);
    c.value = '2000';
    c.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    flushSync();
    expect(etat.bandes[1].freq).toBe(2000);
  });

  it('🔴 type et canal éditables sur place', () => {
    choisir(champ(1, 'type'), 'high_shelf');
    expect(etat.bandes[1].type).toBe('high_shelf');
    expect(champ(1, 'q').disabled).toBe(true);
    choisir(champ(1, 'channel'), 'both');
    expect(etat.bandes[1].channel).toBeUndefined();
    choisir(champ(0, 'channel'), '1');
    expect(etat.bandes[0].channel).toBe(1);
  });

  it('chaque contrôle porte un libellé qui nomme sa bande ; le numéro sélectionne le point', () => {
    for (const cle of ['freq', 'gain', 'q', 'type', 'channel']) {
      expect(champ(2, cle).getAttribute('aria-label'), cle).toMatch(/— Bande 3$/);
    }
    const num = lignes()[2].querySelector<HTMLButtonElement>('button.peq-ligne-num')!;
    expect(num.getAttribute('aria-label')).toBe('Bande 3');
    num.click();
    flushSync();
    expect(num.getAttribute('aria-pressed')).toBe('true');
    expect(lignes()[2].classList.contains('selected')).toBe(true);
    expect(hote.querySelector('.peq-editor')).not.toBeNull();
    expect(hote.querySelectorAll('circle.band-dot')[2].classList.contains('selected')).toBe(true);
  });

  it('aucune bande, aucune liste', () => {
    unmount(composant!);
    hote.remove();
    monter([]);
    expect(hote.querySelector('.peq-liste')).toBeNull();
  });
});
