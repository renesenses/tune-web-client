// @vitest-environment jsdom
//
// 15/11/2026 — « État du serveur » à la maquette de Levente (image 5).
//
// Ce banc MONTE l'écran avec des réponses à la forme réelle du serveur
// (`/system/health`, `/library/stats` avec `total_size_bytes`,
// `/system/diagnostics` avec `cpu_temp_c`) et vérifie la RÈGLE 1 du brief :
// une tuile sans donnée réelle est absente — jamais « 0 Go », jamais un
// « en ligne » quand la route de santé échoue.
//
// Contre-épreuve : retirer le `{#if enTete.octets !== null}` de
// `TuneHealthV2.svelte` fait rougir « taille inconnue ⇒ pas de tuile ».
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import { get } from 'svelte/store';
import TuneHealthV2 from '../../components/v2/TuneHealthV2.svelte';
import { lireEnTete, tailleBibliotheque } from '../etatServeurEnTete';
import { activeView } from '../stores/navigation';
import { dictionnaire, ONZE_LANGUES } from './onzeDictionnaires';

const fr = dictionnaire('fr');

let stats: unknown = { albums: 5677, tracks: 72348, artists: 900, total_size_bytes: 1_800_000_000_000 };
let santeEchoue = false;
let diag: unknown = { cpu_temp_c: 34.4, output_providers: [] };
let hote: HTMLDivElement | null = null;
let monte: Record<string, any> | null = null;

function enveloppe(corps: unknown, status = 200): Response {
  return {
    ok: status < 400, status, statusText: status < 400 ? 'OK' : 'ERR',
    headers: new Map([['content-type', 'application/json']]),
    json: async () => corps,
    text: async () => JSON.stringify(corps),
  } as unknown as Response;
}

async function attendre(tours = 8) {
  for (let i = 0; i < tours; i++) {
    await new Promise((r) => setTimeout(r, 0));
    flushSync();
  }
}

async function monter(): Promise<HTMLElement> {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(TuneHealthV2, { target: hote, props: {} });
  flushSync();
  await attendre();
  return hote;
}

beforeEach(() => {
  stats = { albums: 5677, tracks: 72348, artists: 900, total_size_bytes: 1_800_000_000_000 };
  santeEchoue = false;
  diag = { cpu_temp_c: 34.4, output_providers: [] };
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} } as any);
  vi.stubGlobal('fetch', vi.fn(async (input: any) => {
    const u = typeof input === 'string' ? input : String(input?.url ?? input);
    if (u.includes('/system/health')) return santeEchoue ? enveloppe({ error: 'down' }, 503) : enveloppe({ status: 'ok', version: '1.0.0-rc12' });
    if (u.includes('/library/stats')) return enveloppe(stats);
    if (/\/system\/diagnostics(\?|$)/.test(u)) return enveloppe(diag);
    if (/\/(zones|devices|profiles|shortcuts|collections)(\?|\/|$)/.test(u)) return enveloppe([]);
    return enveloppe({});
  }));
});

afterEach(() => {
  if (monte) { unmount(monte); monte = null; }
  hote?.remove();
  hote = null;
  vi.unstubAllGlobals();
});

describe('lireEnTete — seulement ce que le serveur a servi', () => {
  it('santé lue, chiffres servis ⇒ tout est là', () => {
    const e = lireEnTete({ ok: true, valeur: { status: 'ok', version: ' 1.0.0 ' } }, { albums: 3, tracks: 10, total_size_bytes: 42 });
    expect(e).toEqual({ enLigne: true, version: '1.0.0', albums: 3, pistes: 10, octets: 42 });
  });
  it('🔴 taille à 0 ou absente ⇒ `null` (pas « 0 Go »)', () => {
    expect(lireEnTete({ ok: true, valeur: {} }, { albums: 3, tracks: 10, total_size_bytes: 0 }).octets).toBeNull();
    expect(lireEnTete({ ok: true, valeur: {} }, { albums: 3, tracks: 10 }).octets).toBeNull();
  });
  it('🔴 santé en échec ⇒ hors ligne ; réponse illisible ⇒ comptes `null`', () => {
    const e = lireEnTete({ ok: false }, 'n’importe quoi');
    expect(e.enLigne).toBe(false);
    expect(e.albums).toBeNull();
    expect(e.pistes).toBeNull();
    expect(e.version).toBeNull();
  });
  it('pas encore lu ⇒ `enLigne: null`', () => {
    expect(lireEnTete(null, null).enLigne).toBeNull();
  });
});

describe('tailleBibliotheque — unités décimales, écrites dans la langue', () => {
  it('1,8 To en français, 1.8 TB en anglais, Go sous le téraoctet', () => {
    expect(tailleBibliotheque(1_800_000_000_000, 'fr').replace(/\s/g, ' ')).toBe('1,8 To');
    expect(tailleBibliotheque(1_800_000_000_000, 'en')).toBe('1.8 TB');
    expect(tailleBibliotheque(640_000_000_000, 'en')).toBe('640 GB');
  });
});

describe('écran monté', () => {
  it('le bandeau montre en ligne, version, albums, titres et taille', async () => {
    const el = await monter();
    const r = el.querySelector('[data-testid="server-summary"]');
    expect(r, 'bandeau absent').not.toBeNull();
    expect(r!.querySelector('[data-resume="etat"]')!.textContent).toContain(fr['v2.health.summary.online']);
    expect(r!.querySelector('[data-resume="etat"]')!.textContent).toContain('1.0.0-rc12');
    expect(r!.querySelector('[data-resume="albums"]')!.textContent).toMatch(/5\s?677/);
    expect(r!.querySelector('[data-resume="tracks"]')!.textContent).toMatch(/72\s?348/);
    expect(r!.querySelector('[data-resume="size"]')!.textContent).toContain(fr['v2.health.summary.size']);
  });

  it('🔴 taille inconnue ⇒ pas de tuile', async () => {
    stats = { albums: 2, tracks: 5, total_size_bytes: 0 };
    const el = await monter();
    expect(el.querySelector('[data-resume="size"]')).toBeNull();
    expect(el.querySelector('[data-resume="tracks"]')).not.toBeNull();
  });

  it('🔴 santé en échec ⇒ « injoignable », jamais « en ligne »', async () => {
    santeEchoue = true;
    const el = await monter();
    const t = el.querySelector('[data-resume="etat"]')!.textContent ?? '';
    expect(t).toContain(fr['v2.health.summary.offline']);
    expect(t).not.toContain(fr['v2.health.summary.online']);
  });

  it('la température s’affiche en grand ; aucune courbe d’historique inventée', async () => {
    const el = await monter();
    expect(el.querySelector('[data-temperature="valeur"]')!.textContent).toMatch(/^34\s°C$/);
    // Un seul dessin : le pictogramme du thermomètre. Pas de courbe.
    expect(el.querySelectorAll('.bloc-temp svg').length).toBe(1);
    expect(el.querySelectorAll('.bloc-temp polyline, .bloc-temp canvas').length).toBe(0);
  });

  it('sans `cpu_temp_c` ⇒ pas de bloc température', async () => {
    diag = { output_providers: [] };
    const el = await monter();
    expect(el.querySelector('.bloc-temp')).toBeNull();
  });

  it('chaque carte de traitement porte son pictogramme', async () => {
    const el = await monter();
    const cartes = [...el.querySelectorAll('article.card')];
    expect(cartes.length).toBeGreaterThan(3);
    for (const c of cartes) expect(c.querySelector('.cicone svg'), c.querySelector('h2')?.textContent ?? '').not.toBeNull();
  });

  it('« Gérer les extensions » ouvre l’écran Extensions', async () => {
    const el = await monter();
    const b = [...el.querySelectorAll('button')].find((x) => x.textContent?.trim() === fr['v2.health.summary.manageModules']);
    expect(b, 'bouton absent').toBeDefined();
    b!.click();
    expect(get(activeView)).toBe('plugins');
  });

  it('journaux, réseau, actualiser et réglages restent accessibles (règle 2)', async () => {
    const el = await monter();
    const textes = [...el.querySelectorAll('button')].map((b) => b.textContent?.trim());
    for (const k of ['diagnostics.showLogs', 'diagnostics.exportLogs', 'diagnostics.network', 'v2.health.refresh', 'v2.eq.openSettings']) {
      expect(textes, k).toContain(fr[k]);
    }
  });
});

describe('i18n', () => {
  it('les clés du bandeau existent dans toutes les langues', () => {
    for (const code of ONZE_LANGUES) {
      const d = dictionnaire(code);
      for (const k of ['online', 'offline', 'version', 'albums', 'tracks', 'size', 'manageModules']) {
        expect(d[`v2.health.summary.${k}`], `${code} ${k}`).toBeTruthy();
      }
      expect(d['v2.health.summary.version'], code).toContain('{v}');
    }
  });
});
