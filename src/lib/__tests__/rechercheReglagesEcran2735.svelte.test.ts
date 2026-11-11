// @vitest-environment jsdom
//
// renesenses/tune-web-client#2735 — le champ de recherche de l'écran Réglages :
// motif combobox + listbox, clavier complet, raccourcis ⌘F / Ctrl+F et « / »
// qui ne volent pas le focus d'un champ en cours de saisie ; puis, dans
// l'écran entier, le choix d'un résultat ouvre l'onglet, amène le réglage et
// le surligne — y compris quand le niveau choisi le masque.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return {
    ...actual,
    getConfig: vi.fn(async () => ({ music_dirs: [], quality_split: true })),
    getScanSchedule: vi.fn(async () => ({ enabled: false, time: '03:00' })),
    getScanStatus: vi.fn(async () => ({ scanning: false })),
    getScanReport: vi.fn(async () => null),
    getStats: vi.fn(async () => ({})),
  };
});

import RechercheReglagesV2 from '../../components/v2/RechercheReglagesV2.svelte';
import SettingsV2 from '../../components/v2/SettingsV2.svelte';
import { preferences } from '../stores/preferences';
import { v2SettingsTarget } from '../stores/v2SettingsNav';
import type { Reglage } from '../reglagesIndex';
import lFr from '../locales/fr';

const fr = lFr as unknown as Record<string, string>;

let hote: HTMLDivElement | null = null;
let monte: Record<string, any> | null = null;

async function attendre(tours = 4) {
  for (let i = 0; i < tours; i++) {
    await new Promise((r) => setTimeout(r, 0));
    flushSync();
  }
}

function monter(composant: any, props: Record<string, unknown> = {}) {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(composant, { target: hote, props });
  flushSync();
  return hote;
}

function taper(champ: HTMLInputElement, texte: string) {
  champ.focus();
  champ.value = texte;
  champ.dispatchEvent(new Event('input', { bubbles: true }));
  flushSync();
}

const touche = (el: EventTarget, key: string, extra: KeyboardEventInit = {}) => {
  const e = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...extra });
  el.dispatchEvent(e);
  flushSync();
  return e;
};

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} } as any);
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    const u = String(url);
    const corps = /\/(zones|profiles|devices|playlists|shortcuts)(\?|$)/.test(u) ? [] : {};
    return new Response(JSON.stringify(corps), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }));
  preferences.update((p) => ({ ...p, settingsLevel: 'beginner' }));
});

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  hote?.remove();
  hote = null;
  document.body.innerHTML = '';
  vi.unstubAllGlobals();
});

describe('#2735 — le champ de recherche (combobox)', () => {
  it('porte le motif ARIA, annonce le nombre de résultats, un résultat par réglage avec son chemin', () => {
    const h = monter(RechercheReglagesV2, { niveau: 'beginner', onchoisir: () => {} });
    const champ = h.querySelector<HTMLInputElement>('input[data-recherche-reglages]')!;
    expect(champ.getAttribute('role')).toBe('combobox');
    expect(champ.getAttribute('aria-autocomplete')).toBe('list');
    expect(champ.getAttribute('aria-expanded')).toBe('false');
    const liste = h.querySelector('[role="listbox"]')!;
    expect(champ.getAttribute('aria-controls')).toBe(liste.id);

    taper(champ, 'wasapi');
    expect(champ.getAttribute('aria-expanded')).toBe('true');
    const options = h.querySelectorAll('[role="option"][data-resultat]');
    expect(options.length).toBeGreaterThan(0);
    expect(options[0].getAttribute('data-resultat')).toBe('mode-wasapi');
    expect(options[0].textContent).toContain(fr['settings.tabAudio']);
    expect(champ.getAttribute('aria-activedescendant')).toBe(options[0].id);
    const statut = h.querySelector('[role="status"]')!;
    expect(statut.textContent).toMatch(/1 réglage|\d+ réglages/);
  });

  it('flèches, Entrée et Échap', () => {
    const choix: Reglage[] = [];
    const h = monter(RechercheReglagesV2, { niveau: 'expert', onchoisir: (r: Reglage) => choix.push(r) });
    const champ = h.querySelector<HTMLInputElement>('input[data-recherche-reglages]')!;
    taper(champ, 'replaygain');
    const options = [...h.querySelectorAll('[role="option"][data-resultat]')];
    expect(options.length).toBeGreaterThan(1);
    touche(champ, 'ArrowDown');
    expect(champ.getAttribute('aria-activedescendant')).toBe(options[1].id);
    expect(options[1].getAttribute('aria-selected')).toBe('true');
    touche(champ, 'ArrowUp');
    touche(champ, 'ArrowUp'); // boucle sur le dernier
    expect(champ.getAttribute('aria-activedescendant')).toBe(h.querySelectorAll('[role="option"][data-resultat]')[options.length - 1].id);
    touche(champ, 'Home');
    const e = touche(champ, 'Enter');
    expect(e.defaultPrevented).toBe(true);
    expect(choix.map((r) => r.id)).toEqual([options[0].getAttribute('data-resultat')]);
    expect(champ.getAttribute('aria-expanded')).toBe('false');
    touche(champ, 'ArrowDown'); // rouvre
    touche(champ, 'Escape');    // ferme
    expect(champ.getAttribute('aria-expanded')).toBe('false');
    touche(champ, 'Escape');    // vide
    expect(champ.value).toBe('');
  });

  it('un clic choisit le réglage', () => {
    const choix: string[] = [];
    const h = monter(RechercheReglagesV2, { niveau: 'expert', onchoisir: (r: Reglage) => choix.push(r.id) });
    taper(h.querySelector<HTMLInputElement>('input[data-recherche-reglages]')!, 'lrclib');
    h.querySelector<HTMLElement>('[data-resultat="paroles-lrclib"]')!.click();
    flushSync();
    expect(choix).toEqual(['paroles-lrclib']);
  });

  it('un réglage masqué par le niveau le dit, et reste proposé', () => {
    const h = monter(RechercheReglagesV2, { niveau: 'beginner', onchoisir: () => {} });
    taper(h.querySelector<HTMLInputElement>('input[data-recherche-reglages]')!, 'commande vocale');
    const opt = h.querySelector('[data-resultat="commande-vocale"]')!;
    expect(opt.querySelector('[data-masque-niveau]')?.textContent).toContain(fr['settings.levelExpert']);
  });

  it('aucun résultat : le message le dit', () => {
    const h = monter(RechercheReglagesV2, { niveau: 'beginner', onchoisir: () => {} });
    taper(h.querySelector<HTMLInputElement>('input[data-recherche-reglages]')!, 'zzqqxx');
    expect(h.querySelector('[role="status"]')!.textContent).toBe(fr['settings.noSettingFound'].replace('{query}', 'zzqqxx'));
  });

  it('⌘F, Ctrl+F et « / » placent le focus dans le champ', () => {
    const h = monter(RechercheReglagesV2, { niveau: 'beginner', onchoisir: () => {} });
    const champ = h.querySelector<HTMLInputElement>('input[data-recherche-reglages]')!;
    for (const [key, extra] of [['f', { metaKey: true }], ['f', { ctrlKey: true }], ['/', {}]] as const) {
      champ.blur();
      document.body.focus();
      const e = touche(document.body, key, extra);
      expect(document.activeElement, `${key} ${JSON.stringify(extra)}`).toBe(champ);
      expect(e.defaultPrevented).toBe(true);
    }
  });

  it('ne vole pas le focus d’un champ où l’on écrit — mais bien celui d’un interrupteur', () => {
    const h = monter(RechercheReglagesV2, { niveau: 'beginner', onchoisir: () => {} });
    const champ = h.querySelector<HTMLInputElement>('input[data-recherche-reglages]')!;
    const autre = document.createElement('input');
    autre.type = 'text';
    document.body.appendChild(autre);
    autre.focus();
    const e1 = touche(autre, '/');
    const e2 = touche(autre, 'f', { ctrlKey: true });
    expect(document.activeElement).toBe(autre);
    expect(e1.defaultPrevented || e2.defaultPrevented).toBe(false);

    const interrupteur = document.createElement('input');
    interrupteur.type = 'checkbox';
    document.body.appendChild(interrupteur);
    interrupteur.focus();
    touche(interrupteur, 'f', { metaKey: true });
    expect(document.activeElement).toBe(champ);
  });
});

describe('#2735 — dans l’écran Réglages', () => {
  it('choisir un résultat ouvre l’onglet, amène et surligne le réglage', { timeout: 60_000 }, async () => {
    const h = monter(SettingsV2);
    await attendre();
    const champ = h.querySelector<HTMLInputElement>('.v2-top input[data-recherche-reglages]');
    expect(champ, 'le champ vit en tête de l’écran').not.toBeNull();
    taper(champ!, 'trier les artistes');
    const opt = h.querySelector<HTMLElement>('[data-resultat="tri-artistes"]');
    expect(opt).not.toBeNull();
    opt!.click();
    await attendre();
    expect(h.querySelector('.tab.on')?.textContent).toContain(fr['settings.tabLibrary']);
    const cible = h.querySelector('[data-reglage="tri-artistes"]');
    expect(cible).not.toBeNull();
    expect(cible!.classList.contains('reglage-eclaire')).toBe(true);
  });

  it('un réglage masqué par le niveau s’affiche quand même, avec un mot qui le dit', { timeout: 60_000 }, async () => {
    const h = monter(SettingsV2);
    await attendre();
    expect(h.querySelector('[data-reglage="commande-vocale"]')).toBeNull();
    const champ = h.querySelector<HTMLInputElement>('input[data-recherche-reglages]')!;
    taper(champ, 'commande vocale');
    touche(champ, 'Enter');
    await attendre();
    const cible = h.querySelector('[data-reglage="commande-vocale"]');
    expect(cible, 'la section Expert est montrée à la demande').not.toBeNull();
    const mot = h.querySelector('[data-section="voice"] [data-force-niveau]');
    expect(mot?.textContent).toContain(fr['settings.levelExpert']);
    // Changer d'onglet referme la parenthèse.
    h.querySelector<HTMLButtonElement>('.tab')!.click();
    await attendre();
    expect(h.querySelector('[data-reglage="commande-vocale"]')).toBeNull();
  });

  it('la cible du menu avatar peut viser un réglage précis', { timeout: 60_000 }, async () => {
    const h = monter(SettingsV2);
    await attendre();
    v2SettingsTarget.set({ tab: 'general', section: 'searchExact', reglage: 'recherche-exacte' });
    await attendre();
    expect(h.querySelector('.tab.on')?.textContent).toContain(fr['settings.tabLibrary']);
    expect(h.querySelector('[data-reglage="recherche-exacte"]')?.classList.contains('reglage-eclaire')).toBe(true);
  });
});
