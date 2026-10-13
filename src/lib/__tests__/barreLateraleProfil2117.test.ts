// @vitest-environment jsdom
//
// #2117 (Levente, ticket support 220) — la barre latérale suit le PROFIL côté
// serveur, sur tous les appareils.
//
// L'ordre et les entrées masquées la suivent depuis le fil 2109 (e5f52f28,
// rc3 ; témoin barreLateralePartagee2109). Il restait deux trous :
//   1. les cases « Afficher dans la barre » des types de sources (#5065) : le
//      local gagnait TOUJOURS, type par type, et tout appareil ayant vu une
//      source CD une fois avait `cd: true` figé — la case décochée ailleurs
//      n'arrivait jamais ;
//   2. un réglage fait sur un autre appareil n'arrivait qu'au rechargement de
//      la page : rien ne relisait le serveur pendant la session.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { arbitrerTypesBarre, gesteTypesBarre } from '../typesSourcesBarre';

const STORAGE_KEY = 'tune-preferences';
const CHOIX_A = { ordre: ['search', 'home', 'library'], masquees: ['tags'] };
const CHOIX_B = { ordre: [], masquees: ['podcasts', 'radios'] };

let patchs: string[] = [];
let prefsServeur: Record<string, unknown> = {};

function serveur() {
  return vi.fn(async (url: unknown, init?: RequestInit) => {
    const u = String(url);
    if (u.includes('system/config')) {
      if (init?.method === 'PATCH') {
        patchs.push(String(init.body));
        return { ok: true, status: 200, json: async () => ({ ok: true }), text: async () => '' } as unknown as Response;
      }
      return {
        ok: true, status: 200,
        json: async () => ({ ui_preferences: JSON.stringify(prefsServeur) }),
        text: async () => '',
      } as unknown as Response;
    }
    return { ok: false, status: 404, json: async () => ({}), text: async () => '' } as unknown as Response;
  });
}

async function charger() {
  vi.stubGlobal('fetch', serveur());
  vi.resetModules();
  const mod = await import('../stores/preferences');
  await mod.syncPreferencesFromServer();
  return mod;
}

async function attendre(tours = 8) {
  for (let i = 0; i < tours; i++) await new Promise((r) => setTimeout(r, 0));
}

function rendreVisible() {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
  document.dispatchEvent(new Event('visibilitychange'));
}

// ⚠️ Ce bloc passe EN PREMIER : chaque `vi.resetModules()` crée un nouveau
// magasin, et l'écoute `visibilitychange` des magasins précédents resterait
// posée sur le même `document`.
describe('#2117 — un réglage fait sur un autre appareil arrive SANS recharger', () => {
  beforeEach(() => { localStorage.clear(); patchs = []; prefsServeur = {}; });
  afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); localStorage.clear(); });

  it('🔴 revenir sur l’onglet relit la barre du profil', async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ theme: 'dark', barreLaterale: CHOIX_A, barreLateraleMaj: 1_000 }));
    prefsServeur = { barreLaterale: CHOIX_A, barreLateraleMaj: 1_000 };
    const mod = await charger();
    expect(get(mod.preferences).barreLaterale).toEqual(CHOIX_A);

    // Sur le téléphone, une minute plus tard : nouvel ordre, nouvelles entrées masquées.
    prefsServeur = { barreLaterale: CHOIX_B, barreLateraleMaj: 2_000, sourcesBarre: { hdmi: false }, sourcesBarreMaj: 2_000 };
    const t0 = Date.now();
    vi.spyOn(Date, 'now').mockReturnValue(t0 + mod.ECART_RELECTURE_MS + 1);
    rendreVisible();
    await attendre();

    const p = get(mod.preferences);
    expect(p.barreLaterale, 'rien ne relisait le serveur pendant la session').toEqual(CHOIX_B);
    expect(p.sourcesBarre?.hdmi).toBe(false);
    // Le reste de la session n'est pas défait, et rien n'est écrit.
    expect(p.theme).toBe('dark');
    expect(patchs).toHaveLength(0);
  });

  it('pas de relecture en rafale : au plus une par demi-minute', async () => {
    const mod = await charger();
    const appels = () => (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls
      .filter(([u, init]) => String(u).includes('system/config') && !(init as RequestInit | undefined)?.method).length;
    const avant = appels();
    rendreVisible();
    await attendre();
    expect(appels()).toBe(avant);
  });
});

describe('#2117 — les types de sources de la barre suivent le profil', () => {
  beforeEach(() => { localStorage.clear(); patchs = []; prefsServeur = {}; });
  afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); localStorage.clear(); });

  it('🔴 « CD » décoché sur un autre appareil arrive ici, malgré le `cd: true` figé localement', async () => {
    // Cet appareil a vu une source CD : le défaut s'est figé coché (non daté).
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ theme: 'dark', sourcesBarre: { cd: true, entree: true } }));
    prefsServeur = { sourcesBarre: { cd: false }, sourcesBarreMaj: 5_000 };
    const p = get((await charger()).preferences);
    expect(p.sourcesBarre?.cd, 'le local figé écrasait le geste fait ailleurs').toBe(false);
    // Un type que l'autre appareil n'a pas décidé garde sa valeur d'ici.
    expect(p.sourcesBarre?.entree).toBe(true);
    expect(p.sourcesBarreMaj).toBe(5_000);
  });

  it('un geste fait ICI, plus récent, garde la main et répare le serveur', async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ sourcesBarre: { cd: true }, sourcesBarreMaj: 6_000 }));
    prefsServeur = { theme: 'midnight', sourcesBarre: { cd: false }, sourcesBarreMaj: 5_000 };
    const p = get((await charger()).preferences);
    expect(p.sourcesBarre?.cd).toBe(true);
    expect(patchs).toHaveLength(1);
    const ecrit = JSON.parse(JSON.parse(patchs[0]).ui_preferences);
    expect(ecrit.sourcesBarre).toEqual({ cd: true });
    expect(ecrit.sourcesBarreMaj).toBe(6_000);
    expect(ecrit.theme, 'le reste part tel que le serveur l’a rendu').toBe('midnight');
  });

  it('deux blobs jamais datés : le comportement d’avant (le local, complété du serveur)', () => {
    expect(arbitrerTypesBarre({ sourcesBarre: { cd: true } }, { sourcesBarre: { cd: false, hdmi: false } }))
      .toEqual({ sourcesBarre: { cd: true, hdmi: false }, sourcesBarreMaj: 0 });
  });

  it('chaque geste est daté, et Réglages passe par lui', () => {
    expect(gesteTypesBarre({ cd: true }, 'hdmi', false, 1234))
      .toEqual({ sourcesBarre: { cd: true, hdmi: false }, sourcesBarreMaj: 1234 });
    const src = readFileSync(resolve(process.cwd(), 'src/components/v2/SettingsV2.svelte'), 'utf-8');
    expect(src).toContain('...gesteTypesBarre(pr.sourcesBarre, type, coche)');
  });
});
