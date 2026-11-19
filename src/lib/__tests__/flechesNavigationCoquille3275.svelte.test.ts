// @vitest-environment jsdom
//
// web#3275 (alec_eiffel, fil 2953) — LE PARCOURS DANS LA VRAIE COQUILLE.
//
// On monte `ShellV2` et ses vrais écrans, on tape une recherche dans la
// Bibliothèque, on part vers la Recherche puis les Réglages, et l'on revient
// par les FLÈCHES DE L'EN-TÊTE (pas par `history.back()` appelé du test). La
// Bibliothèque remontée doit montrer la recherche qu'on y avait tapée : sans
// la mémoire par entrée, l'écran détruit repartait vide.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync, tick } from 'svelte';
import { get } from 'svelte/store';
import ShellV2 from '../../components/v2/ShellV2.svelte';
import { activeView, pendingLibraryAlbum, vueDeRetour } from '../stores/navigation';
import { ficheArtisteService, streamingServices } from '../stores/streaming';
import { detailOuvert } from '../historiqueCoquille';
import { _reinitialiserMemoire, _reinitialiserRangs } from '../memoireNavigation';

const COLLECTIONS =
  /\/(profiles|zones|playlists|devices|shortcuts|collections|tags|favorites|history|radios|podcasts|artists|albums|tracks|top-artists|recent|genres)(\?|\/|$)/;

function reponsePour(url: string) {
  const corps = COLLECTIONS.test(url) ? [] : {};
  return {
    ok: true, status: 200, statusText: 'OK',
    headers: new Map([['content-type', 'application/json']]),
    json: async () => corps,
    text: async () => JSON.stringify(corps),
  } as unknown as Response;
}

/** Grisée par `aria-disabled` (le bouton garde le focus). */
const grisee = (b: Element) => b.getAttribute('aria-disabled') === 'true';

let hote: HTMLDivElement | null = null;
let monte: Record<string, any> | null = null;

async function laisserPasser() {
  for (let i = 0; i < 6; i++) { await Promise.resolve(); await tick(); }
  flushSync();
}

/** Cliquer une flèche de l'en-tête et attendre le `popstate` qu'elle provoque. */
function cliquerFleche(sens: 'reculer' | 'avancer'): Promise<void> {
  return new Promise((resolve, reject) => {
    const b = hote!.querySelector<HTMLButtonElement>(`.av-tr [data-fleche-nav="${sens}"]`);
    if (!b) { reject(new Error(`flèche ${sens} absente de l’en-tête`)); return; }
    if (grisee(b)) { reject(new Error(`flèche ${sens} grisée`)); return; }
    const filet = setTimeout(() => reject(new Error('aucun popstate')), 4_000);
    window.addEventListener('popstate', () => { clearTimeout(filet); resolve(); }, { once: true });
    b.click();
  });
}

const champBibliotheque = () => hote!.querySelector<HTMLInputElement>('.v2-lib input[type="search"]');

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => reponsePour(String(url))));
  vi.stubGlobal('WebSocket', class {
    close() {} addEventListener() {} removeEventListener() {} send() {}
  } as unknown as typeof WebSocket);
  vi.stubGlobal('ResizeObserver', class {
    observe() {} unobserve() {} disconnect() {}
  } as unknown as typeof ResizeObserver);
  _reinitialiserMemoire();
  _reinitialiserRangs();
  activeView.set('library');
  pendingLibraryAlbum.set(null);
  vueDeRetour.set(null);
  detailOuvert.set(null);
  ficheArtisteService.set(null);
  streamingServices.set({} as any);
  history.replaceState(null, '', '/');
});

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  hote?.remove();
  hote = null;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('web#3275 — flèches de l’en-tête dans la coquille v2', () => {
  it('Bibliothèque (recherche tapée) → Recherche → Réglages, ‹ ‹ rend la Bibliothèque avec sa recherche, › rend la Recherche', async () => {
    hote = document.createElement('div');
    document.body.appendChild(hote);
    monte = mount(ShellV2, { target: hote });
    flushSync();
    await laisserPasser();

    const p = () => hote!.querySelector<HTMLButtonElement>('.av-tr [data-fleche-nav="reculer"]')!;
    const s = () => hote!.querySelector<HTMLButtonElement>('.av-tr [data-fleche-nav="avancer"]')!;
    expect(p(), 'la flèche Précédent est dans l’en-tête').toBeTruthy();
    expect(grisee(p()), 'début de session : grisée').toBe(true);
    expect(grisee(s()), 'début de session : grisée').toBe(true);

    const champ = champBibliotheque();
    expect(champ, 'le champ de recherche de la Bibliothèque').toBeTruthy();
    champ!.value = 'miles';
    champ!.dispatchEvent(new Event('input', { bubbles: true }));
    flushSync();

    activeView.set('search');
    flushSync();
    await laisserPasser();
    activeView.set('settings');
    flushSync();
    await laisserPasser();
    expect(grisee(p())).toBe(false);
    expect(grisee(s())).toBe(true);

    await cliquerFleche('reculer');
    await laisserPasser();
    expect(get(activeView)).toBe('search');
    await cliquerFleche('reculer');
    await laisserPasser();
    expect(get(activeView)).toBe('library');
    expect(champBibliotheque()?.value, 'la Bibliothèque remontée garde la recherche qu’on y avait tapée').toBe('miles');
    expect(grisee(p()), 'première entrée : Précédent grisé').toBe(true);
    expect(grisee(s()), 'Suivant actif').toBe(false);

    await cliquerFleche('avancer');
    await laisserPasser();
    expect(get(activeView)).toBe('search');
  });

  it('arrivée par la barre latérale : la Bibliothèque repart vide (#3843)', async () => {
    hote = document.createElement('div');
    document.body.appendChild(hote);
    monte = mount(ShellV2, { target: hote });
    flushSync();
    await laisserPasser();
    const champ = champBibliotheque()!;
    champ.value = 'miles';
    champ.dispatchEvent(new Event('input', { bubbles: true }));
    flushSync();
    activeView.set('search');
    flushSync();
    await laisserPasser();
    activeView.set('library');
    flushSync();
    await laisserPasser();
    expect(champBibliotheque()?.value).toBe('');
  });
});
