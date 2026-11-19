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
import fr from '../locales/fr';
import en from '../locales/en';

const LANGUES = ['de', 'el', 'en', 'es', 'fr', 'hu', 'it', 'ja', 'ko', 'nb', 'pl', 'ro', 'sv', 'tr', 'vi', 'zh'];

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
    expect(p.disabled, 'début de session : Précédent grisé').toBe(true);
    expect(s.disabled, 'début de session : Suivant grisé').toBe(true);

    empilerAuRang(1); empilerAuRang(2);
    flushSync();
    expect(p.disabled).toBe(false);
    expect(s.disabled, 'au bout du chemin').toBe(true);

    atteindreLeRang(0);
    flushSync();
    expect(p.disabled, 'revenu au début').toBe(true);
    expect(s.disabled).toBe(false);
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

  it('montées en tête de la grappe de la coquille v2', () => {
    const src = readFileSync(resolve(__dirname, '../../components/v2/ShellV2.svelte'), 'utf-8');
    const grappe = src.indexOf('<div class="av-tr"');
    const fleches = src.indexOf('<FlechesNavigation />');
    expect(grappe).toBeGreaterThan(0);
    expect(fleches, 'les flèches sont DANS la grappe, avant ses autres boutons').toBeGreaterThan(grappe);
    expect(src.indexOf('<GlobalSearchBar />')).toBeGreaterThan(fleches);
  });

  it('libellés présents dans les seize langues', async () => {
    for (const l of LANGUES) {
      const mod = (await import(`../locales/${l}.ts`)).default as Record<string, string>;
      for (const k of ['v2.nav.precedent', 'v2.nav.suivant', 'v2.nav.historique']) {
        expect(mod[k], `${l} : ${k}`).toBeTruthy();
      }
    }
    expect((fr as any)['v2.nav.precedent']).toBe('Précédent');
    expect((en as any)['v2.nav.suivant']).toBe('Forward');
  });
});
