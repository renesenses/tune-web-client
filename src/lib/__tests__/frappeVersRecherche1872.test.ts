// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// #1872 — dans la Bibliothèque, une frappe écrit dans la recherche sans clic
// préalable ; les raccourcis de lecture à une touche gardent leur sens.
//
// Les DEUX gestionnaires réels sont posés sur `window`, comme dans l'appli :
// `setupKeyboardShortcuts` (coquille) et celui de la Bibliothèque. Seuls les
// appels réseau et les actions de zone sont remplacés par des espions.

const espions = vi.hoisted(() => ({
  next: vi.fn(), previous: vi.fn(), resume: vi.fn(), stop: vi.fn(),
  pause: vi.fn(), seek: vi.fn(), setVolume: vi.fn(),
}));

vi.mock('../stores/zones', async () => {
  const { writable } = await import('svelte/store');
  return {
    currentZone: writable({ id: 'z1', volume: 0.4 }),
    nextAndSync: espions.next,
    previousAndSync: espions.previous,
    resumeAndSync: espions.resume,
    stopAndSync: espions.stop,
  };
});
vi.mock('../stores/nowPlaying', async () => {
  const { writable } = await import('svelte/store');
  return {
    playbackState: writable('paused'),
    seekPositionMs: writable(0),
    mutedVolume: writable(null),
    currentTrack: writable({ source: 'local' }),
  };
});
vi.mock('../stores/navigation', async () => {
  const { writable } = await import('svelte/store');
  return { activeView: writable('library'), mobileNowPlayingOpen: writable(false) };
});
vi.mock('../api', () => ({
  pause: espions.pause, seek: espions.seek, setVolume: espions.setVolume,
}));

import { setupKeyboardShortcuts, TOUCHES_RACCOURCIS } from '../keyboard';
import { decisionFrappe, gestionnaireFrappeVersRecherche } from '../frappeVersRecherche';

let champ: HTMLInputElement;
let bouton: HTMLButtonElement;
let autreChamp: HTMLInputElement;
let valeurLiee: string;
let disponible: boolean;
let nettoyages: (() => void)[] = [];

function frappe(key: string, code: string, cible: EventTarget = document.activeElement ?? document.body,
  extra: KeyboardEventInit = {}) {
  const ev = new KeyboardEvent('keydown', { key, code, bubbles: true, cancelable: true, ...extra });
  cible.dispatchEvent(ev);
  return ev;
}

beforeEach(() => {
  document.body.innerHTML = '';
  champ = document.createElement('input');
  bouton = document.createElement('button');
  autreChamp = document.createElement('input');
  document.body.append(bouton, autreChamp, champ);
  valeurLiee = '';
  // Ce que fait `bind:value` : écouter `input`.
  champ.addEventListener('input', () => { valeurLiee = champ.value; });
  disponible = true;
  for (const f of Object.values(espions)) f.mockClear();

  nettoyages = [setupKeyboardShortcuts()];
  const surFrappe = gestionnaireFrappeVersRecherche({ champ: () => champ, disponible: () => disponible });
  window.addEventListener('keydown', surFrappe);
  nettoyages.push(() => window.removeEventListener('keydown', surFrappe));
  (document.activeElement as HTMLElement | null)?.blur?.();
});

afterEach(() => { for (const n of nettoyages) n(); });

describe('#1872 — taper écrit dans la recherche de la Bibliothèque', () => {
  it('une lettre non réservée remplit le champ, lui donne le focus, et Svelte le sait', () => {
    const ev = frappe('a', 'KeyA', document.body);
    expect(ev.defaultPrevented).toBe(true);
    expect(champ.value).toBe('a');
    expect(valeurLiee).toBe('a');
    expect(document.activeElement).toBe(champ);
    expect(champ.selectionStart).toBe(1);
    // Aucune action de lecture n'est partie.
    for (const f of Object.values(espions)) expect(f).not.toHaveBeenCalled();
  });

  it('depuis un bouton qui a le focus aussi, et la suite de la frappe va au champ', () => {
    bouton.focus();
    frappe('B', 'KeyB', bouton, { shiftKey: true });
    expect(champ.value).toBe('B');
    expect(document.activeElement).toBe(champ);
    // La lettre suivante tombe dans le champ : plus aucune redirection.
    expect(frappe('o', 'KeyO', champ).defaultPrevented).toBe(false);
  });

  it('chiffres, accents et ponctuation s’écrivent ; AltGr aussi', () => {
    frappe('7', 'Digit7', document.body);
    champ.blur();
    frappe('é', 'Digit2', document.body);
    champ.blur();
    // AltGr+0 sur AZERTY : « @ », rapporté comme Ctrl+Alt sous Windows/Linux.
    const ev = new KeyboardEvent('keydown', { key: '@', code: 'Digit0', ctrlKey: true, altKey: true, bubbles: true, cancelable: true });
    Object.defineProperty(ev, 'getModifierState', { value: (m: string) => m === 'AltGraph' });
    document.body.dispatchEvent(ev);
    expect(champ.value).toBe('7é@');
  });

  it('les raccourcis à une touche gardent leur action d’origine et n’écrivent rien', () => {
    frappe('n', 'KeyN', document.body);
    expect(espions.next).toHaveBeenCalledWith('z1');
    frappe('p', 'KeyP', document.body);
    expect(espions.previous).toHaveBeenCalledWith('z1');
    frappe('s', 'KeyS', document.body);
    expect(espions.stop).toHaveBeenCalledWith('z1');
    frappe('m', 'KeyM', document.body);
    expect(espions.setVolume).toHaveBeenCalledWith('z1', 0);
    frappe(' ', 'Space', document.body);
    expect(espions.resume).toHaveBeenCalledWith('z1');
    // Maj+N aussi : `keyboard.ts` ne regarde pas Maj.
    frappe('N', 'KeyN', document.body, { shiftKey: true });
    expect(espions.next).toHaveBeenCalledTimes(2);
    expect(champ.value).toBe('');
    expect(document.activeElement).not.toBe(champ);
  });

  it('chaque touche du gestionnaire de raccourcis est réservée — aucune n’est oubliée', () => {
    const src = readFileSync(resolve(process.cwd(), 'src/lib/keyboard.ts'), 'utf-8');
    const cases = [...src.matchAll(/case '([A-Za-z0-9]+)':/g)].map((m) => m[1]);
    expect(cases.length).toBeGreaterThanOrEqual(10);
    for (const c of cases) expect(TOUCHES_RACCOURCIS, c).toContain(c);
  });

  it('focus déjà dans un champ : rien ne bouge', () => {
    autreChamp.focus();
    const ev = frappe('a', 'KeyA', autreChamp);
    expect(ev.defaultPrevented).toBe(false);
    expect(champ.value).toBe('');
    expect(document.activeElement).toBe(autreChamp);
  });

  it('« / » donne le focus sans rien insérer', () => {
    const ev = frappe('/', 'Slash', document.body);
    expect(ev.defaultPrevented).toBe(true);
    expect(champ.value).toBe('');
    expect(document.activeElement).toBe(champ);
  });

  it('Échap rend le focus à l’élément qui l’avait', () => {
    bouton.focus();
    frappe('x', 'KeyX', bouton);
    expect(document.activeElement).toBe(champ);
    frappe('Escape', 'Escape', champ);
    expect(document.activeElement).toBe(bouton);
    // Le texte tapé reste : Échap rend le focus, il n'efface pas.
    expect(champ.value).toBe('x');
  });

  it('Échap sans élément précédent quitte simplement le champ', () => {
    frappe('x', 'KeyX', document.body);
    frappe('Escape', 'Escape', champ);
    expect(document.activeElement).not.toBe(champ);
  });

  it('Tab, Entrée et les combinaisons Cmd/Ctrl/Alt restent au navigateur', () => {
    for (const [key, code, extra] of [
      ['Tab', 'Tab', {}], ['Enter', 'Enter', {}], ['f', 'KeyF', { ctrlKey: true }],
      ['k', 'KeyK', { metaKey: true }], ['a', 'KeyA', { altKey: true }], ['Dead', 'BracketLeft', {}],
    ] as [string, string, KeyboardEventInit][]) {
      expect(frappe(key, code, document.body, extra).defaultPrevented, key).toBe(false);
    }
    expect(champ.value).toBe('');
    expect(document.activeElement).not.toBe(champ);
  });

  it('inerte quand un calque recouvre la grille, ou dans un menu', () => {
    disponible = false;
    frappe('a', 'KeyA', document.body);
    expect(champ.value).toBe('');
    disponible = true;
    const menu = document.createElement('div');
    menu.setAttribute('role', 'menu');
    const item = document.createElement('button');
    menu.append(item);
    document.body.append(menu);
    item.focus();
    frappe('a', 'KeyA', item);
    expect(champ.value).toBe('');
    expect(document.activeElement).toBe(item);
  });

  it('champ absent (onglet sans recherche) : rien', () => {
    const h = gestionnaireFrappeVersRecherche({ champ: () => null, disponible: () => true });
    expect(h(new KeyboardEvent('keydown', { key: 'a', code: 'KeyA' }))).toBe(null);
  });

  it('la règle pure', () => {
    const t = (key: string, code: string, extra: Partial<KeyboardEvent> = {}) =>
      decisionFrappe({ key, code, target: document.body, defaultPrevented: false, isComposing: false,
        metaKey: false, ctrlKey: false, altKey: false, ...extra }, document.body);
    expect(t('a', 'KeyA')).toBe('inserer');
    expect(t('/', 'Slash')).toBe('focus');
    expect(t('n', 'KeyN')).toBe(null);
    expect(t('a', 'KeyA', { isComposing: true })).toBe(null);
    expect(t('a', 'KeyA', { defaultPrevented: true })).toBe(null);
  });
});

describe('#1872 — branchement dans la Bibliothèque', () => {
  const lib = readFileSync(resolve(process.cwd(), 'src/components/v2/LibraryV2.svelte'), 'utf-8')
    .replace(/<!--[\s\S]*?-->/g, '').replace(/\/\*[\s\S]*?\*\//g, '');

  it('le champ est relié et le gestionnaire posé sur la fenêtre', () => {
    expect(lib).toContain("import { gestionnaireFrappeVersRecherche } from '../../lib/frappeVersRecherche'");
    expect(lib).toMatch(/<input bind:this=\{champRecherche\}[^>]*bind:value=\{q\}/);
    expect(lib).toContain("window.addEventListener('keydown', surFrappe)");
    expect(lib).toContain("window.removeEventListener('keydown', surFrappe)");
  });

  it('le champ s’annonce et annonce « / » aux technologies d’assistance', () => {
    expect(lib).toMatch(/<input bind:this=\{champRecherche\}[^>]*aria-label=[^>]*aria-keyshortcuts="\/"/);
  });

  it('inerte sous un calque, un menu, ou dans un serveur multimédia', () => {
    expect(lib).toContain('disponible: () => !opened && !enEdition && !ddOpen');
    expect(lib).toMatch(/if \(depot\) return;\s*const surFrappe/);
  });
});
