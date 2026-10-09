// @vitest-environment jsdom
//
// #1752 — « Il faudrait pouvoir arrêter la recherche des concerts pour pouvoir
// passer à un autre onglet » (Tades, fil 2023).
//
// Tenu ici, sur l'écran MONTÉ et sur le module :
//  1. pendant la recherche, un bouton « Arrêter » est là ; il abandonne la
//     requête en vol (le `signal` reçu par `fetch` passe à `aborted`) et
//     l'écran dit « Recherche arrêtée », pas « indisponible » ;
//  2. « Relancer la recherche » repart ;
//  3. quitter l'écran abandonne la requête ;
//  4. `creerArret` : une nouvelle recherche abandonne la précédente.
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import ConcertsView from '../../components/v2-heritage/ConcertsView.svelte';
import { preparerLocale } from '../i18n';
import { activeView } from '../stores/navigation';
import { concertsPlugin } from '../stores/concerts';
import { creerArret, estArret } from '../rechercheArretable';
import fr from '../locales/fr';

function reponse(status: number, corps: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: String(status),
    headers: new Headers({ 'content-type': 'application/json' }),
    json: async () => corps,
    text: async () => JSON.stringify(corps),
  } as unknown as Response;
}

/** Les signaux reçus par `upcoming`, dans l'ordre. */
let signaux: (AbortSignal | undefined)[] = [];
/** `true` : `upcoming` ne répond jamais (le nuage traîne) ; il ne rend la main
 *  que si on l'abandonne. */
let suspendu = true;

beforeAll(async () => { await preparerLocale('fr'); });

beforeEach(() => {
  vi.useFakeTimers();
  signaux = [];
  suspendu = true;
  concertsPlugin.set({ name: 'concerts', installed: true, enabled: true });
  activeView.set('concerts');
  vi.stubGlobal('fetch', vi.fn((url: string, init?: RequestInit) => {
    const u = String(url);
    if (u.includes('/ext/concerts/upcoming')) {
      signaux.push(init?.signal ?? undefined);
      if (!suspendu) return Promise.resolve(reponse(200, { concerts: [], scope: 'country', country: 'FR' }));
      return new Promise<Response>((_, rejeter) => {
        init?.signal?.addEventListener('abort', () => rejeter(new DOMException('abandon', 'AbortError')));
      });
    }
    if (u.includes('/ext/concerts/location')) {
      return Promise.resolve(reponse(200, { scope: 'country', city: 'Dijon', country: 'FR' }));
    }
    return Promise.resolve(reponse(200, {}));
  }));
  vi.stubGlobal('WebSocket', class {
    close() {}
    addEventListener() {}
    removeEventListener() {}
    send() {}
  } as unknown as typeof WebSocket);
});

let hote: HTMLDivElement | null = null;
let monte: Record<string, unknown> | null = null;

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  hote?.remove();
  hote = null;
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

async function laisserFaire() {
  for (let i = 0; i < 8; i++) {
    await vi.advanceTimersByTimeAsync(0);
    flushSync();
  }
}

async function poser(): Promise<HTMLDivElement> {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(ConcertsView as any, { target: hote });
  flushSync();
  await laisserFaire();
  return hote;
}

const texte = (el: HTMLElement) => (el.textContent ?? '').replace(/\s+/g, ' ');
const bouton = (el: HTMLElement, libelle: string) =>
  [...el.querySelectorAll('button')].find((b) => (b.textContent ?? '').trim() === libelle) as HTMLButtonElement | undefined;

describe('#1752 — arrêter la recherche des concerts', () => {
  it('pendant la recherche, « Arrêter » est proposé', async () => {
    const el = await poser();
    expect(texte(el)).toContain(fr['concerts.chargement']);
    expect(bouton(el, fr['concerts.arreter']), 'pas de bouton Arrêter').toBeTruthy();
  });

  it('« Arrêter » abandonne la requête et le dit, sans parler de panne', async () => {
    const el = await poser();
    expect(signaux).toHaveLength(1);
    expect(signaux[0], 'la requête ne porte aucun signal : rien ne peut l’arrêter').toBeTruthy();
    bouton(el, fr['concerts.arreter'])!.click();
    await laisserFaire();
    expect(signaux[0]!.aborted).toBe(true);
    expect(texte(el)).toContain(fr['concerts.rechercheArretee']);
    expect(texte(el)).not.toContain(fr['concerts.chargement']);
    expect(texte(el)).not.toContain(fr['concerts.indisponible']);
  });

  it('« Relancer la recherche » repart', async () => {
    const el = await poser();
    bouton(el, fr['concerts.arreter'])!.click();
    await laisserFaire();
    suspendu = false;
    bouton(el, fr['concerts.relancer'])!.click();
    await laisserFaire();
    expect(signaux).toHaveLength(2);
    expect(texte(el)).not.toContain(fr['concerts.rechercheArretee']);
    expect(texte(el)).toContain(fr['concerts.aucun']);
  });

  it('quitter l’écran abandonne la requête', async () => {
    await poser();
    unmount(monte!);
    monte = null;
    expect(signaux[0]!.aborted).toBe(true);
  });
});

describe('#1752 — creerArret', () => {
  it('une nouvelle recherche abandonne la précédente', () => {
    const a = creerArret();
    const s1 = a.nouveau();
    const s2 = a.nouveau();
    expect(s1.aborted).toBe(true);
    expect(s2.aborted).toBe(false);
    expect(a.arreter()).toBe(true);
    expect(s2.aborted).toBe(true);
    expect(a.arreter()).toBe(false);
  });

  it('reconnaît l’erreur d’un abandon, et rien d’autre', () => {
    expect(estArret(new DOMException('x', 'AbortError'))).toBe(true);
    expect(estArret(new Error('500'))).toBe(false);
    expect(estArret(null)).toBe(false);
  });
});
