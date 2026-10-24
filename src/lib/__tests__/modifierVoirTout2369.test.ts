// @vitest-environment jsdom
//
// web#2369 (Didier, fil forum 2411, rc7, interface web) : sur la page
// « Voir tout » d'un widget (Qobuz › Éditorial › Pop/Rock), le bouton
// « Modifier » de l'en-tête restait affiché. Il règle la PAGE (ajout / retrait
// de widgets, #880) et son clic refermait « Voir tout » : le testeur se
// retrouvait sur la page Qobuz principale, en mode édition. Il n'existe pas de
// réglage propre à un widget : le bouton n'a rien à faire là.
//
// Même composant pour l'Accueil et tous les services : `PageWidgets`.
//
// Contre-épreuve : sans le `{#if !voirTout}` autour des actions de l'en-tête,
// le deuxième test tombe (le bouton « Modifier » est trouvé dans la page
// « Voir tout »).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import PageWidgets from '../../components/v2/PageWidgets.svelte';
import { currentProfileId } from '../stores/profile';
import type { Contexte } from '../accueilWidgets';
import lFr from '../locales/fr';

const fr = lFr as unknown as Record<string, string>;
let hote: HTMLDivElement | null = null;
let monte: Record<string, any> | null = null;
const souffler = (ms = 40) => new Promise((r) => setTimeout(r, ms));

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async () => ({
    ok: true, status: 200, statusText: 'OK',
    headers: new Map([['content-type', 'application/json']]),
    json: async () => ({}), text: async () => '{}',
  } as unknown as Response)));
  currentProfileId.set(1);
  try { localStorage.clear(); } catch { /* */ }
});

afterEach(() => {
  if (monte) { unmount(monte); monte = null; }
  hote?.remove();
  hote = null;
  vi.unstubAllGlobals();
});

const widget = {
  id: 'temoin',
  cleTitre: 'v2.home.wRecentlyAdded',
  forme: 'bande' as const,
  charger: async (c: Contexte) =>
    Array.from({ length: Math.min(c.limite ?? 3, 7) }, (_, i) => ({ id: `e${i}`, titre: `Élément ${i}` })),
};

async function poser() {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(PageWidgets, {
    target: hote,
    props: { catalogue: [widget], dispositionDefaut: ['temoin'], cle: 'temoin_widgets' },
  });
  flushSync();
  await souffler(80);
  flushSync();
  return hote;
}

/** Le bouton « Modifier » de l'en-tête, reconnu à son libellé visible. */
const boutonModifier = (page: HTMLElement) =>
  [...page.querySelectorAll<HTMLButtonElement>('.v2-actions button')]
    .find((b) => (b.textContent ?? '').trim() === fr['v2.home.edit']) ?? null;

describe('web#2369 — « Modifier » sur la page « Voir tout » d’un widget', () => {
  it('la page principale garde son bouton « Modifier »', async () => {
    const page = await poser();
    expect(boutonModifier(page), 'le bouton « Modifier » a disparu de la page principale').toBeTruthy();
  });

  it('🔴 la page « Voir tout » ne l’affiche plus, et le retour le rend', async () => {
    const page = await poser();
    page.querySelector<HTMLButtonElement>('button.voir-tout')!.click();
    await souffler(80);
    flushSync();
    expect(page.querySelector('.voir-tout-page'), 'la page « Voir tout » ne s’ouvre pas').toBeTruthy();
    expect(boutonModifier(page), '« Modifier » reste affiché dans « Voir tout » (Didier, fil 2411)').toBeNull();
    expect(page.querySelectorAll('.v2-actions button').length).toBe(0);

    page.querySelector<HTMLButtonElement>('.voir-tout-page button.retour')!.click();
    flushSync();
    expect(page.querySelector('.voir-tout-page')).toBeNull();
    expect(boutonModifier(page), 'le retour ne rend pas « Modifier »').toBeTruthy();
  });
});
