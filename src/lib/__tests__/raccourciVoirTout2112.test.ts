// @vitest-environment jsdom
//
// web#2112 (FabienM, rc4, fil 2236 point 12) — « Je clique sur "Voir Tout" de
// la section "Nouveautés de vos artistes". Je crée un raccourci sur cette
// page, malheureusement le raccourci renvoie sur la page d'accueil. »
//
// La page « Voir tout » n'était qu'un état local de `PageWidgets` (#51) :
// `captureCurrentView` figeait la vue dessous, et `navigateToShortcut`
// rouvrait l'Accueil sans la page.
//
// Le témoin MONTE la page, clique « Voir tout », capture le raccourci comme
// le signet de la coquille, puis le rejoue par `navigateToShortcut` sur une
// page remontée — et sur une page qui monte APRÈS l'évènement (cas d'un
// service, dont la page attend son catalogue).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import { get } from 'svelte/store';

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return { ...actual, updateConfig: vi.fn(async () => ({})) };
});

import PageWidgets from '../../components/v2/PageWidgets.svelte';
import { currentProfileId } from '../stores/profile';
import { activeView } from '../stores/navigation';
import { captureCurrentView, clearShortcutTarget, currentShortcutTarget, navigateToShortcut } from '../stores/shortcuts';
import { demandeVoirTout, DUREE_DEMANDE_MS } from '../raccourciVoirTout';
import type { Contexte } from '../accueilWidgets';
import lFr from '../locales/fr';

const fr = lFr as unknown as Record<string, string>;
let hote: HTMLDivElement | null = null;
let monte: Record<string, any> | null = null;
const souffler = (ms = 40) => new Promise((r) => setTimeout(r, ms));

/** Un widget de témoin ; « Voir tout » en montre `tout` éléments. */
const widget = (id: string, tout: number) => ({
  id, cleTitre: 'v2.home.wRecentlyAdded', forme: 'bande' as const,
  charger: async (c: Contexte) => Array.from({ length: Math.min(c.limite ?? 2, tout) }, (_, i) => ({ id: `${id}${i}`, titre: `Élément ${i}` })),
});
const CATALOGUE = [widget('temoin', 7), widget('autre', 4)];

async function poser() {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(PageWidgets, {
    target: hote,
    props: { catalogue: CATALOGUE, dispositionDefaut: ['autre', 'temoin'], cle: 'temoin_widgets' },
  });
  flushSync();
  await souffler(80);
  flushSync();
  return hote;
}
function retirer() {
  if (monte) { unmount(monte); monte = null; }
  hote?.remove();
  hote = null;
}
/** Le bouton « Voir tout » de la bande `temoin` (la seconde de la pile). */
const voirToutTemoin = (h: HTMLElement) => h.querySelectorAll<HTMLButtonElement>('.tete button.voir-tout')[1];
const pageOuverte = (h: HTMLElement) => h.querySelector('.voir-tout-page');

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async () => ({
    ok: true, status: 200, statusText: 'OK',
    headers: new Map([['content-type', 'application/json']]),
    json: async () => ({}), text: async () => '{}',
  } as unknown as Response)));
  currentProfileId.set(1);
  activeView.set('home');
  clearShortcutTarget();
  demandeVoirTout.set(null);
  try { localStorage.clear(); } catch { /* */ }
});
afterEach(() => {
  retirer();
  clearShortcutTarget();
  demandeVoirTout.set(null);
  vi.unstubAllGlobals();
});

async function capturer() {
  const h = await poser();
  voirToutTemoin(h).click();
  await souffler(80);
  flushSync();
  expect(pageOuverte(h), 'la page « Voir tout » ne s’ouvre pas').toBeTruthy();
  return { view: 'home', ...captureCurrentView() } as any;
}

describe('web#2112 — un raccourci sur une page « Voir tout »', () => {
  it('🔴 la page publie sa cible, et le raccourci la retient', async () => {
    const capture = await capturer();
    expect(get(currentShortcutTarget)?.key).toBe('voirtout:temoin_widgets:temoin');
    expect(get(currentShortcutTarget)?.label).toBe(fr['v2.home.wRecentlyAdded']);
    expect(capture.view).toBe('home');
    expect(capture.state.target).toEqual({ key: 'voirtout:temoin_widgets:temoin', restore: { page: 'temoin_widgets', widget: 'temoin' } });
  });

  it('le retour à la pile oublie la cible', async () => {
    await capturer();
    hote!.querySelector<HTMLButtonElement>('.voir-tout-page button.retour')!.click();
    flushSync();
    expect(get(currentShortcutTarget)).toBeNull();
  });

  it('🔴 le raccourci rouvre la page « Voir tout » du BON widget', async () => {
    const capture = await capturer();
    retirer();
    clearShortcutTarget();
    const h = await poser();
    expect(pageOuverte(h)).toBeNull();
    navigateToShortcut({ id: 'x', name: 'Récents', icon: 'star', ...capture });
    await souffler(250);
    flushSync();
    expect(get(activeView)).toBe('home');
    const vue = pageOuverte(h);
    expect(vue, 'le raccourci rouvre l’accueil sans la page « Voir tout »').toBeTruthy();
    // Sept cartes : celles de `temoin`, pas les quatre de `autre`.
    expect(vue!.querySelectorAll('.carte').length).toBe(7);
    expect(get(currentShortcutTarget)?.key).toBe('voirtout:temoin_widgets:temoin');
  });

  it('🔴 la page qui monte APRÈS l’évènement (service au catalogue lent) s’ouvre quand même', async () => {
    const capture = await capturer();
    retirer();
    clearShortcutTarget();
    navigateToShortcut({ id: 'x', name: 'Récents', icon: 'star', ...capture });
    await souffler(250);
    const h = await poser();
    expect(pageOuverte(h), 'la demande s’est perdue avant que la page monte').toBeTruthy();
    // Consommée : une autre visite de l'accueil ne rouvre rien.
    expect(get(demandeVoirTout)).toBeNull();
  });

  it('une demande d’une AUTRE page, ou trop vieille, ne rouvre rien', async () => {
    demandeVoirTout.set({ page: 'autre_page', widget: 'temoin', at: Date.now() });
    let h = await poser();
    expect(pageOuverte(h)).toBeNull();
    retirer();
    demandeVoirTout.set({ page: 'temoin_widgets', widget: 'temoin', at: Date.now() - DUREE_DEMANDE_MS - 1 });
    h = await poser();
    expect(pageOuverte(h)).toBeNull();
  });
});
