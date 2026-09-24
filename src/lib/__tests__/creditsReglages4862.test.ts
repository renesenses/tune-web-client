// @vitest-environment jsdom
//
// « Remplir les crédits » — suite de renesenses/tune-server-rust#4767, route
// posée par tune-server-rust#4862 (`POST|GET /api/v1/system/enrich-credits`).
//
// Sans ces crédits, « Collaborations » et « Reprises » de la page artiste
// (FabienM, fils forum 1875 / 1906) n'ont rien à lire : `track_credits` est
// vide en pratique.
//
// 🔴 Ce témoin MONTE l'écran Réglages et CLIQUE, avec un `fetch` simulé : il
// vérifie la requête qui part vraiment et ce que l'écran affiche.
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

import SettingsV2 from '../../components/v2/SettingsV2.svelte';
import { preferences } from '../stores/preferences';
import { tachesDeFond } from '../stores/tachesDeFond';
import { TACHE_CREDITS } from '../tachesDeFond';
import lFr from '../locales/fr';

const fr = lFr as unknown as Record<string, string>;
const ROUTE = '/system/enrich-credits';

class ResizeObserverInerte {
  observe() {}
  unobserve() {}
  disconnect() {}
}

/** Réponse du POST, tenue en main par le cas : tant qu'elle n'est pas rendue,
 *  la requête est « en vol ». */
let rendre: ((r: Response) => void) | null = null;
const posts: { url: string }[] = [];
/** Ce que rend `GET /system/enrich-credits` — au repos par défaut. */
let etatGet: Record<string, unknown> = { status: 'idle', total: 0, processed: 0 };

const json = (corps: unknown, status = 200) =>
  new Response(JSON.stringify(corps), { status, headers: { 'Content-Type': 'application/json' } });

const fetchSimule = vi.fn(async (entree: RequestInfo | URL, init?: RequestInit) => {
  const url = String(entree);
  const methode = (init?.method ?? 'GET').toUpperCase();
  if (url.includes(ROUTE)) {
    if (methode === 'POST') {
      posts.push({ url });
      return new Promise<Response>((r) => { rendre = r; });
    }
    return json(etatGet);
  }
  return json({});
});

let hote: HTMLDivElement | null = null;
let monte: Record<string, any> | null = null;

async function attendre(tours = 4) {
  for (let i = 0; i < tours; i++) {
    await new Promise((r) => setTimeout(r, 0));
    flushSync();
  }
}

async function ecranPret(): Promise<HTMLElement> {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(SettingsV2, { target: hote, props: {} });
  flushSync();
  await attendre();
  const onglet = [...hote.querySelectorAll('button')].find(
    (b) => (b.textContent ?? '').trim() === fr['settings.tabLibrary'],
  );
  expect(onglet, 'onglet Bibliothèque introuvable à l’écran').toBeDefined();
  (onglet as HTMLButtonElement).click();
  await attendre();
  return hote;
}

/** Le bouton de la rangée « Remplir les crédits », reconnu par son libellé. */
function bouton(el: HTMLElement): HTMLButtonElement | null {
  const rangee = [...el.querySelectorAll('.row')].find((r) =>
    (r.querySelector('.lbl span')?.textContent ?? '').trim() === fr['settings.credits'],
  );
  return (rangee?.querySelector('button') as HTMLButtonElement | null) ?? null;
}

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', ResizeObserverInerte);
  vi.stubGlobal('fetch', fetchSimule);
  fetchSimule.mockClear();
  posts.length = 0;
  rendre = null;
  etatGet = { status: 'idle', total: 0, processed: 0 };
  tachesDeFond.set([]);
  // La section Enrichissement est rangée au niveau Expert (`v2Settings.ts`).
  preferences.update((p) => ({ ...p, settingsLevel: 'expert' }));
});

afterEach(() => {
  rendre?.(json({}, 202));
  if (monte) unmount(monte);
  monte = null;
  if (hote) hote.remove();
  hote = null;
  tachesDeFond.set([]);
  vi.unstubAllGlobals();
});

describe('Réglages › Bibliothèque › Enrichissement : crédits (#4862)', () => {
  it('le clic envoie POST /api/v1/system/enrich-credits', async () => {
    const el = await ecranPret();
    const b = bouton(el);
    expect(b, 'aucun bouton « Remplir les crédits »').not.toBeNull();
    b!.click();
    await attendre();
    expect(posts).toHaveLength(1);
    expect(posts[0].url).toMatch(/\/api\/v1\/system\/enrich-credits$/);
  });

  it('occupé pendant la requête : un second clic ne relance rien', async () => {
    const el = await ecranPret();
    bouton(el)!.click();
    await attendre();
    expect(bouton(el)!.disabled, 'le bouton reste cliquable pendant la requête').toBe(true);
    // Même si le clic passait, la garde de la fonction doit tenir.
    bouton(el)!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await attendre();
    expect(posts).toHaveLength(1);

    rendre!(json({ status: 'credits_enrichment_started', task_id: 'x', candidats: 0, albums_avec_mbid: 0 }, 202));
    await attendre(8);
    expect(bouton(el)!.disabled, 'le bouton ne se libère pas après la réponse').toBe(false);
  });

  it('occupé tant que la tâche `credits_releases` est au registre', async () => {
    tachesDeFond.set([{ id: TACHE_CREDITS, label: 'Crédits MusicBrainz des albums…', kind: 'enrichment' }]);
    const el = await ecranPret();
    expect(bouton(el)!.disabled).toBe(true);
    bouton(el)!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await attendre();
    expect(posts).toHaveLength(0);
  });

  it('une passe en cours côté serveur : occupé, et l’avancement chiffré est affiché', async () => {
    etatGet = { status: 'running', total: 340, processed: 12, enriched: 10 };
    const el = await ecranPret();
    expect(bouton(el)!.disabled, 'le GET dit `running` mais le bouton reste offert').toBe(true);
    const av = el.querySelector('[data-avancement="credits"]');
    expect(av, 'aucun avancement affiché').not.toBeNull();
    expect(av!.textContent).toContain('12');
    expect(av!.textContent).toContain('340');
    bouton(el)!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await attendre();
    expect(posts).toHaveLength(0);
  });

  it('au repos, aucun avancement', async () => {
    const el = await ecranPret();
    expect(el.querySelector('[data-avancement="credits"]')).toBeNull();
    expect(bouton(el)!.disabled).toBe(false);
  });

  it('un 409 (passe déjà lancée) est dit dans la langue de l’écran', async () => {
    const el = await ecranPret();
    bouton(el)!.click();
    await attendre();
    rendre!(json({ status: 'already_running' }, 409));
    await attendre(8);
    expect(el.textContent).toContain(fr['settings.creditsAlreadyRunning']);
  });

  it('un 429 (quota gratuit du jour) est dit dans la langue de l’écran', async () => {
    const el = await ecranPret();
    bouton(el)!.click();
    await attendre();
    rendre!(json({ code: 'daily_quota_exhausted', error: 'free_tier_daily_enrichment_limit_reached' }, 429));
    await attendre(8);
    expect(el.textContent).toContain(fr['settings.releaseTypesQuota']);
  });
});
