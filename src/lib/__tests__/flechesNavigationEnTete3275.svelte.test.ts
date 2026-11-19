// @vitest-environment jsdom
//
// web#3275 — les flèches de l'EN-TÊTE : présentes dans la grappe de la
// coquille, nommées, grisées aux extrémités, et qui font le geste du
// navigateur.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import FlechesNavigation from '../../components/v2/FlechesNavigation.svelte';
import { atteindreLeRang, demarrerAuRang, empilerAuRang, _reinitialiserRangs } from '../memoireNavigation';
import loc_de from '../locales/de';
import loc_el from '../locales/el';
import loc_en from '../locales/en';
import loc_es from '../locales/es';
import loc_fr from '../locales/fr';
import loc_hu from '../locales/hu';
import loc_it from '../locales/it';
import loc_ja from '../locales/ja';
import loc_ko from '../locales/ko';
import loc_nb from '../locales/nb';
import loc_pl from '../locales/pl';
import loc_ro from '../locales/ro';
import loc_sv from '../locales/sv';
import loc_tr from '../locales/tr';
import loc_vi from '../locales/vi';
import loc_zh from '../locales/zh';

const LANGUES: Record<string, Record<string, string>> = { de: loc_de, el: loc_el, en: loc_en, es: loc_es, fr: loc_fr, hu: loc_hu, it: loc_it, ja: loc_ja, ko: loc_ko, nb: loc_nb, pl: loc_pl, ro: loc_ro, sv: loc_sv, tr: loc_tr, vi: loc_vi, zh: loc_zh } as any;

/** Grisée par `aria-disabled` (le bouton garde le focus). */
const grisee = (b: Element) => b.getAttribute('aria-disabled') === 'true';

let hote: HTMLDivElement | null = null;
let monte: Record<string, any> | null = null;

beforeEach(() => {
  _reinitialiserRangs();
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(FlechesNavigation, { target: hote });
  flushSync();
});

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  hote?.remove();
  hote = null;
});

const bouton = (sens: string) => hote!.querySelector<HTMLButtonElement>(`[data-fleche-nav="${sens}"]`);

describe('web#3275 — flèches Précédent / Suivant de l’en-tête', () => {
  it('nommées pour les lecteurs d’écran, et grisées quand il n’y a rien avant / après', () => {
    const p = bouton('reculer')!, s = bouton('avancer')!;
    expect(p.getAttribute('aria-label')).toBeTruthy();
    expect(s.getAttribute('aria-label')).toBeTruthy();
    expect(p.getAttribute('aria-label')).not.toBe(s.getAttribute('aria-label'));
    expect(grisee(p), 'début de session : Précédent grisé').toBe(true);
    expect(grisee(s), 'début de session : Suivant grisé').toBe(true);

    empilerAuRang(1); empilerAuRang(2);
    flushSync();
    expect(grisee(p)).toBe(false);
    expect(grisee(s), 'au bout du chemin').toBe(true);

    atteindreLeRang(0);
    flushSync();
    expect(grisee(p), 'revenu au début').toBe(true);
    expect(grisee(s)).toBe(false);
  });

  it('le clic fait le geste du navigateur, une fois', () => {
    demarrerAuRang(0, false);
    empilerAuRang(1);
    atteindreLeRang(0);
    atteindreLeRang(1);
    flushSync();
    const back = vi.spyOn(history, 'back').mockImplementation(() => {});
    const forward = vi.spyOn(history, 'forward').mockImplementation(() => {});
    bouton('reculer')!.click();
    expect(back).toHaveBeenCalledTimes(1);
    expect(forward).not.toHaveBeenCalled();
    back.mockRestore();
    forward.mockRestore();
  });

  it('grisée, la flèche garde le focus et le clic ne part pas (relecture de #3278)', () => {
    empilerAuRang(1);
    flushSync();
    const p = bouton('reculer')!;
    p.focus();
    expect(document.activeElement).toBe(p);
    atteindreLeRang(0);
    flushSync();
    expect(grisee(p)).toBe(true);
    expect(document.activeElement, '`disabled` aurait jeté le focus sur le document').toBe(p);
    const back = vi.spyOn(history, 'back').mockImplementation(() => {});
    p.click();
    expect(back).not.toHaveBeenCalled();
    back.mockRestore();
  });

  it('montées en tête de la grappe de la coquille v2', () => {
    const src = readFileSync(resolve(__dirname, '../../components/v2/ShellV2.svelte'), 'utf-8');
    const grappe = src.indexOf('<div class="av-tr"');
    const fleches = src.indexOf('<FlechesNavigation />');
    expect(grappe).toBeGreaterThan(0);
    expect(fleches, 'les flèches sont DANS la grappe, avant ses autres boutons').toBeGreaterThan(grappe);
    expect(src.indexOf('<GlobalSearchBar />')).toBeGreaterThan(fleches);
  });

  it('libellés présents dans les seize langues', () => {
    expect(Object.keys(LANGUES)).toHaveLength(16);
    for (const [l, mod] of Object.entries(LANGUES)) {
      for (const k of ['v2.nav.precedent', 'v2.nav.suivant', 'v2.nav.historique']) {
        expect(mod[k], `${l} : ${k}`).toBeTruthy();
      }
    }
    expect(LANGUES.fr['v2.nav.precedent']).toBe('Précédent');
    expect(LANGUES.en['v2.nav.suivant']).toBe('Forward');
  });
});
