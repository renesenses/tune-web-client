// @vitest-environment jsdom
//
// Phase 5 (web#1257) — trois capacités de LECTURE survivent au retrait de
// l'ancienne interface :
//   · « Quoi de neuf » (`WhatsNew`, `fetch('/api/v1/system/changelog…')`) ;
//   · la documentation de l'API (`SettingsView`, lien `/api/v1/system/api-docs`) ;
//   · la documentation des greffons (`PluginsView`, `fetch('/api/v1/plugins/docs')`).
// Toutes trois partaient hors des fonctions d'`api.ts` : l'inventaire des
// capacités ne les voyait pas (`docs/capacites-sans-chemin-phase5.md`).
//
// Ce témoin MONTE les vrais écrans v2 et clique. Il lit les requêtes
// réellement parties (`fetch` bouchonné) et le DOM rendu.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import SettingsV2 from '../../components/v2/SettingsV2.svelte';
import PluginsV2 from '../../components/v2/PluginsV2.svelte';
import { preferences } from '../stores/preferences';
import lFr from '../locales/fr';

const fr = lFr as unknown as Record<string, string>;

class ResizeObserverInerte {
  observe() {}
  unobserve() {}
  disconnect() {}
}

function reponse(status: number, corps: unknown): Response {
  const texte = typeof corps === 'string' ? corps : JSON.stringify(corps);
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: String(status),
    headers: { get: () => null },
    json: async () => corps,
    text: async () => texte,
  } as unknown as Response;
}

let hote: HTMLDivElement | null = null;
let monte: Record<string, any> | null = null;
let appels: { url: string; method: string }[] = [];
let changelog: unknown;
let docsGreffons: unknown;

async function attendre(tours = 6) {
  for (let i = 0; i < tours; i++) {
    await new Promise((r) => setTimeout(r, 0));
    flushSync();
  }
}

function monter(composant: any): HTMLDivElement {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(composant, { target: hote, props: {} });
  flushSync();
  return hote;
}

async function ouvrirSysteme(): Promise<HTMLDivElement> {
  const el = monter(SettingsV2);
  await attendre();
  const onglet = [...el.querySelectorAll('button')].find(
    (b) => (b.textContent ?? '').trim() === fr['settings.tabSystem'],
  );
  expect(onglet, 'onglet Système introuvable').toBeDefined();
  (onglet as HTMLButtonElement).click();
  flushSync();
  await attendre();
  return el;
}

function bouton(el: HTMLElement, libelle: string): HTMLButtonElement | undefined {
  return [...el.querySelectorAll('button')].find((x) => (x.textContent ?? '').trim() === libelle) as
    | HTMLButtonElement
    | undefined;
}

const gets = (motif: RegExp) => appels.filter((a) => a.method === 'GET' && motif.test(a.url));

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', ResizeObserverInerte);
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  appels = [];
  changelog = {
    version: '0.9.158',
    lang: 'fr',
    fallback: false,
    entries: [
      {
        version: '0.9.158',
        date: '2026-09-19',
        sections: [
          { title: 'Nouveautés', items: ['Consentement à la télémétrie en v2'] },
          { title: 'Corrections', items: ['La file ne se vide plus'] },
        ],
      },
      { version: '0.9.157', date: '2026-09-17', features: ['Page artiste commune'], fixes: [], improvements: [] },
    ],
  };
  docsGreffons = { url: 'https://mozaiklabs.fr/guide#plugins' };
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, options?: RequestInit) => {
      const u = String(url);
      const method = String(options?.method ?? 'GET').toUpperCase();
      appels.push({ url: u, method });
      if (/\/system\/changelog\?/.test(u)) return reponse(200, changelog);
      if (/\/system\/api-docs$/.test(u))
        return reponse(200, {
          version: '0.9.158',
          total_endpoints: 2,
          endpoints: [
            { method: 'GET', path: '/api/v1/system/health', description: 'Health check' },
            { method: 'POST', path: '/api/v1/system/cleanup', description: 'Library cleanup' },
          ],
        });
      if (/\/plugins\/docs$/.test(u)) return reponse(200, docsGreffons);
      if (/\/plugins/.test(u)) return reponse(200, []);
      return reponse(200, {});
    }),
  );
  preferences.update((p) => ({ ...p, settingsLevel: 'beginner' }));
});

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  if (hote) hote.remove();
  hote = null;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('Réglages v2 › Système › À propos — « Quoi de neuf »', () => {
  it('s’ouvre à tous les niveaux, demande les notes dans la langue de l’interface et les affiche', async () => {
    const el = await ouvrirSysteme();
    const b = bouton(el, fr['whatsnew.title']);
    expect(b, 'aucun bouton « Quoi de neuf » dans À propos').toBeDefined();
    expect(gets(/\/system\/changelog/).length, 'chargé avant le clic').toBe(0);
    b!.click();
    await attendre();
    const g = gets(/\/system\/changelog\?/);
    expect(g.length, 'aucun GET /system/changelog').toBe(1);
    expect(g[0].url).toMatch(/lang=fr/);
    const texte = el.textContent ?? '';
    expect(texte).toContain('v0.9.158');
    expect(texte).toContain('Consentement à la télémétrie en v2');
    expect(texte).toContain('La file ne se vide plus');
    expect(texte).toContain('Page artiste commune');
    expect(texte).toContain(fr['whatsNew.latest']);
  });

  it('jeu de secours hors ligne : le dit, et ne présente aucune entrée comme récente', async () => {
    changelog = { offline: true, entries: [{ version: '0.8.15', date: '2025-01-01', features: ['Ancien'], fixes: [], improvements: [] }] };
    const el = await ouvrirSysteme();
    bouton(el, fr['whatsnew.title'])!.click();
    await attendre();
    expect(el.textContent).toContain(fr['whatsnew.error']);
    expect(el.textContent).not.toContain(fr['whatsNew.latest']);
  });

  it('notes non traduites : l’écran le dit (#906)', async () => {
    (changelog as any).fallback = true;
    const el = await ouvrirSysteme();
    bouton(el, fr['whatsnew.title'])!.click();
    await attendre();
    expect(el.textContent).toContain(fr['whatsnew.notTranslated']);
  });
});

describe('Réglages v2 › Système › À propos — documentation de l’API', () => {
  it('au niveau Expert, lit GET /system/api-docs et liste les routes sur place', async () => {
    preferences.update((p) => ({ ...p, settingsLevel: 'expert' }));
    const el = await ouvrirSysteme();
    const b = bouton(el, fr['settings.apiDocs']);
    expect(b, 'aucun bouton « Documentation API »').toBeDefined();
    b!.click();
    await attendre();
    expect(gets(/\/system\/api-docs$/).length, 'aucun GET /system/api-docs').toBe(1);
    const texte = el.textContent ?? '';
    expect(texte).toContain('POST /api/v1/system/cleanup');
    expect(texte).toContain(fr['v2.set.apiDocsCount'].replace('{count}', '2'));
  });

  it('n’est pas offerte en dessous du niveau Expert, comme dans l’ancien écran', async () => {
    const el = await ouvrirSysteme();
    expect(bouton(el, fr['settings.apiDocs'])).toBeUndefined();
  });
});

describe('Extensions v2 — documentation des greffons', () => {
  it('lit GET /plugins/docs et affiche le lien que rend le serveur', async () => {
    const el = monter(PluginsV2);
    await attendre();
    expect(gets(/\/plugins\/docs$/).length, 'aucun GET /plugins/docs').toBe(1);
    const lien = el.querySelector('a[href="https://mozaiklabs.fr/guide#plugins"]');
    expect(lien, 'le lien vers la documentation des greffons n’est pas affiché').not.toBeNull();
    expect(lien!.textContent).toContain(fr['v2.plug.docs']);
  });

  it('une adresse non http(s) n’est jamais rendue en lien', async () => {
    docsGreffons = { url: 'javascript:void(0)' };
    const el = monter(PluginsV2);
    await attendre();
    expect(el.querySelector('p.docs a')).toBeNull();
  });
});
