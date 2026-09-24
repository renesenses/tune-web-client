// @vitest-environment jsdom
//
// « Remplir les types de sortie » — suite de renesenses/tune-server-rust#4767
// et du fil forum 1906 (FabienM).
//
// Le serveur sait, depuis v0.9.163, remplir `albums.release_type` (album / EP /
// single) depuis MusicBrainz : `POST /api/v1/system/enrich-release-types`. Sans
// ce remplissage, la page d'un artiste ne peut pas séparer ses albums de ses EP
// et singles — et rien dans l'interface ne permettait de le déclencher.
//
// 🔴 Ce témoin MONTE l'écran Réglages et CLIQUE, avec un `fetch` simulé : il
// vérifie la requête qui part vraiment (URL, méthode), pas la présence d'un nom
// de fonction dans un fichier.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return {
    ...actual,
    // Ce que l'écran interroge au montage : des réponses inertes, pour que le
    // seul appel réseau observé soit celui du bouton.
    getConfig: vi.fn(async () => ({ music_dirs: [], quality_split: true })),
    getScanSchedule: vi.fn(async () => ({ enabled: false, time: '03:00' })),
    getScanStatus: vi.fn(async () => ({ scanning: false })),
    getScanReport: vi.fn(async () => null),
    getStats: vi.fn(async () => ({})),
  };
});

import SettingsV2 from '../../components/v2/SettingsV2.svelte';
import { V2_SETTINGS } from '../v2Settings';
import { preferences } from '../stores/preferences';
import { tachesDeFond } from '../stores/tachesDeFond';
import { TACHE_TYPES_DE_SORTIE } from '../tachesDeFond';
import lFr from '../locales/fr';

const fr = lFr as unknown as Record<string, string>;
const ROUTE = '/system/enrich-release-types';

class ResizeObserverInerte {
  observe() {}
  unobserve() {}
  disconnect() {}
}

/** Réponse du POST, tenue en main par le cas : tant qu'elle n'est pas rendue,
 *  la requête est « en vol ». */
let rendre: ((r: Response) => void) | null = null;
const appelsRoute: { url: string; method: string }[] = [];

const fetchSimule = vi.fn(async (entree: RequestInfo | URL, init?: RequestInit) => {
  const url = String(entree);
  if (url.includes(ROUTE)) {
    appelsRoute.push({ url, method: (init?.method ?? 'GET').toUpperCase() });
    return new Promise<Response>((r) => { rendre = r; });
  }
  return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } });
});

let hote: HTMLDivElement | null = null;
let monte: Record<string, any> | null = null;

function poser(): HTMLDivElement {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(SettingsV2, { target: hote, props: {} });
  flushSync();
  return hote;
}

function ouvrirBibliotheque(el: HTMLElement) {
  const onglet = [...el.querySelectorAll('button')].find(
    (b) => (b.textContent ?? '').trim() === fr['settings.tabLibrary'],
  );
  expect(onglet, 'onglet Bibliothèque introuvable à l’écran').toBeDefined();
  (onglet as HTMLButtonElement).click();
  flushSync();
}

/** Le bouton de la rangée « Remplir les types de sortie », reconnu par le
 *  libellé de sa rangée. */
function boutonTypes(el: HTMLElement): HTMLButtonElement | null {
  const rangee = [...el.querySelectorAll('.row')].find((r) =>
    (r.querySelector('.lbl span')?.textContent ?? '').trim() === fr['settings.releaseTypes'],
  );
  return (rangee?.querySelector('button') as HTMLButtonElement | null) ?? null;
}

async function attendre(tours = 4) {
  for (let i = 0; i < tours; i++) {
    await new Promise((r) => setTimeout(r, 0));
    flushSync();
  }
}

async function ecranPret(): Promise<HTMLElement> {
  const el = poser();
  await attendre();
  ouvrirBibliotheque(el);
  await attendre();
  return el;
}

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', ResizeObserverInerte);
  vi.stubGlobal('fetch', fetchSimule);
  fetchSimule.mockClear();
  appelsRoute.length = 0;
  rendre = null;
  tachesDeFond.set([]);
  // La section Enrichissement est rangée au niveau Expert (`v2Settings.ts`).
  preferences.update((p) => ({ ...p, settingsLevel: 'expert' }));
});

afterEach(() => {
  rendre?.(new Response('{}', { status: 202 }));
  if (monte) unmount(monte);
  monte = null;
  if (hote) hote.remove();
  hote = null;
  tachesDeFond.set([]);
  vi.unstubAllGlobals();
});

describe('Réglages › Bibliothèque › Enrichissement : types de sortie (#4767)', () => {
  it('la rangée vit dans la section Enrichissement de l’onglet Bibliothèque', () => {
    const section = V2_SETTINGS.find((t) => t.id === 'library')?.sections.find((s) => s.id === 'enrichment');
    expect(section, 'section enrichment absente de la carte').toBeDefined();
  });

  it('le clic envoie POST /api/v1/system/enrich-release-types', async () => {
    const el = await ecranPret();
    const b = boutonTypes(el);
    expect(b, 'aucun bouton « Remplir les types de sortie »').not.toBeNull();
    b!.click();
    await attendre();
    expect(appelsRoute).toHaveLength(1);
    expect(appelsRoute[0].method).toBe('POST');
    expect(appelsRoute[0].url).toMatch(/\/api\/v1\/system\/enrich-release-types$/);
  });

  it('occupé pendant la requête : un second clic ne relance rien', async () => {
    const el = await ecranPret();
    const b = boutonTypes(el)!;
    b.click();
    await attendre();
    expect(boutonTypes(el)!.disabled, 'le bouton reste cliquable pendant la requête').toBe(true);
    // Même si le clic passait (bouton réactivé par erreur), la garde de la
    // fonction doit tenir : on force l'événement.
    boutonTypes(el)!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await attendre();
    expect(appelsRoute).toHaveLength(1);

    rendre!(new Response(JSON.stringify({ status: 'release_type_enrichment_started', candidats: 12, premium: true }), {
      status: 202, headers: { 'Content-Type': 'application/json' },
    }));
    await attendre(8);
    expect(boutonTypes(el)!.disabled, 'le bouton ne se libère pas après la réponse').toBe(false);
  });

  it('occupé tant que le serveur garde la tâche `types_de_sortie` au registre', async () => {
    tachesDeFond.set([{ id: TACHE_TYPES_DE_SORTIE, label: 'Type de sortie des albums…', kind: 'enrichment' }]);
    const el = await ecranPret();
    const b = boutonTypes(el)!;
    expect(b.disabled).toBe(true);
    b.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await attendre();
    expect(appelsRoute).toHaveLength(0);
  });

  it('un 429 (quota gratuit du jour) est dit dans la langue de l’écran', async () => {
    const el = await ecranPret();
    boutonTypes(el)!.click();
    await attendre();
    rendre!(new Response(JSON.stringify({ code: 'daily_quota_exhausted', error: 'free_tier_daily_enrichment_limit_reached' }), {
      status: 429, headers: { 'Content-Type': 'application/json' },
    }));
    await attendre(8);
    expect(el.textContent).toContain(fr['settings.releaseTypesQuota']);
  });
});
