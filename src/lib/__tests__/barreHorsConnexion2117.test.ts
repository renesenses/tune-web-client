// @vitest-environment jsdom
//
// #2117 (Levente, ticket support 220) — repli hors connexion de la barre
// latérale synchronisée par profil.
//
// Un geste fait quand le serveur ne répond pas reste en `localStorage` (la
// barre de cet appareil le garde), mais son `PATCH` est perdu. Il ne repartait
// qu'au rechargement de la page ou au retour sur l'onglet : les autres
// appareils du profil ne le voyaient pas tant que celui-ci restait ouvert.
// On reprend au retour du réseau (`online`) et par une relecture différée.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';

const STORAGE_KEY = 'tune-preferences';
const CHOIX_A = { ordre: ['search', 'home', 'library'], masquees: ['tags'] };
const CHOIX_B = { ordre: ['library', 'home'], masquees: ['podcasts', 'radios'] };
/** Délai de la relecture différée (`DELAI_REPRISE_MS`). Écrit ici, et non importé, pour
 *  que la contre-épreuve sur l'ancien magasin échoue sur le comportement. */
const DELAI = 60_000;

let patchs: string[] = [];
let lectures = 0;
let prefsServeur: Record<string, unknown> = {};
/** 'ok' : le serveur répond ; 'coupe' : le réseau est coupé ; 'refus' : 403. */
let etat: 'ok' | 'coupe' | 'refus' = 'ok';

function serveur() {
  return vi.fn(async (url: unknown, init?: RequestInit) => {
    const u = String(url);
    if (etat === 'coupe') throw new TypeError('Failed to fetch');
    if (u.includes('system/config')) {
      if (init?.method === 'PATCH') {
        if (etat === 'refus') return { ok: false, status: 403, json: async () => ({}), text: async () => '' } as unknown as Response;
        patchs.push(String(init.body));
        const ecrit = JSON.parse(JSON.parse(String(init.body)).ui_preferences);
        prefsServeur = ecrit;
        return { ok: true, status: 200, json: async () => ({ ok: true }), text: async () => '' } as unknown as Response;
      }
      lectures++;
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

function barreEcrite(): unknown[] {
  return patchs.map((b) => JSON.parse(JSON.parse(b).ui_preferences).barreLaterale);
}

beforeEach(() => {
  localStorage.clear(); patchs = []; lectures = 0; prefsServeur = {}; etat = 'ok';
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
  vi.setSystemTime(10_000);
});
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  localStorage.clear();
});

// ⚠️ Ce bloc passe EN PREMIER : chaque `vi.resetModules()` crée un nouveau
// magasin, et l'écoute `online` des magasins précédents resterait posée sur le
// même `window`.
describe('#2117 — retour du réseau', () => {
  it('🔴 un geste de barre fait hors connexion repart au serveur dès le retour du réseau', async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ barreLaterale: CHOIX_A, barreLateraleMaj: 1_000 }));
    prefsServeur = { theme: 'midnight', barreLaterale: CHOIX_A, barreLateraleMaj: 1_000 };
    const mod = await charger();

    etat = 'coupe';
    mod.preferences.update((p) => ({ ...p, barreLaterale: CHOIX_B, barreLateraleMaj: 2_000 }));
    await vi.advanceTimersByTimeAsync(0);
    // Repli local : la barre de cet appareil garde le geste.
    expect(get(mod.preferences).barreLaterale).toEqual(CHOIX_B);
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}').barreLaterale).toEqual(CHOIX_B);
    expect(patchs).toHaveLength(0);

    etat = 'ok';
    window.dispatchEvent(new Event('online'));
    await vi.advanceTimersByTimeAsync(0);

    expect(barreEcrite(), 'le geste perdu ne repartait qu’au rechargement').toContainEqual(CHOIX_B);
    expect(prefsServeur.barreLateraleMaj).toBe(2_000);
    expect(prefsServeur.theme, 'le reste part tel que le serveur l’a rendu').toBe('midnight');
  });
});

describe('#2117 — serveur qui ne répond pas', () => {
  it('🔴 la relecture différée renvoie le geste perdu quand le serveur revient', async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ barreLaterale: CHOIX_A, barreLateraleMaj: 1_000 }));
    prefsServeur = { barreLaterale: CHOIX_A, barreLateraleMaj: 1_000 };
    const mod = await charger();

    etat = 'coupe';
    mod.preferences.update((p) => ({ ...p, barreLaterale: CHOIX_B, barreLateraleMaj: 2_000 }));
    await vi.advanceTimersByTimeAsync(0);
    expect(patchs).toHaveLength(0);

    // Toujours coupé à la première reprise : on retente plus tard.
    await vi.advanceTimersByTimeAsync(DELAI);
    expect(patchs).toHaveLength(0);

    etat = 'ok';
    await vi.advanceTimersByTimeAsync(DELAI);
    expect(barreEcrite()).toContainEqual(CHOIX_B);

    // Une fois réparé, plus rien ne part.
    const n = patchs.length;
    const l = lectures;
    await vi.advanceTimersByTimeAsync(DELAI * 3);
    expect(patchs).toHaveLength(n);
    expect(lectures).toBe(l);
  });

  it('un geste fait ailleurs pendant la coupure, plus récent, n’est pas écrasé', async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ barreLaterale: CHOIX_A, barreLateraleMaj: 1_000 }));
    prefsServeur = { barreLaterale: CHOIX_A, barreLateraleMaj: 1_000 };
    const mod = await charger();

    etat = 'coupe';
    mod.preferences.update((p) => ({ ...p, barreLaterale: CHOIX_B, barreLateraleMaj: 2_000 }));
    await vi.advanceTimersByTimeAsync(0);

    const CHOIX_C = { ordre: ['radios'], masquees: [] };
    prefsServeur = { barreLaterale: CHOIX_C, barreLateraleMaj: 3_000 };
    etat = 'ok';
    await vi.advanceTimersByTimeAsync(DELAI);
    expect(patchs).toHaveLength(0);
    expect(get(mod.preferences).barreLaterale).toEqual(CHOIX_C);
  });

  it('premier chargement hors connexion : la copie locale reste, et le serveur est relu ensuite', async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ barreLaterale: CHOIX_A, barreLateraleMaj: 1_000 }));
    etat = 'coupe';
    const mod = await charger();
    expect(get(mod.preferences).barreLaterale).toEqual(CHOIX_A);

    prefsServeur = { barreLaterale: CHOIX_B, barreLateraleMaj: 5_000 };
    etat = 'ok';
    await vi.advanceTimersByTimeAsync(DELAI);
    expect(get(mod.preferences).barreLaterale).toEqual(CHOIX_B);
    expect(patchs, 'une relecture n’écrit rien').toHaveLength(0);
  });

  it('un refus (4xx) n’est pas une coupure : pas de reprise en boucle', async () => {
    const mod = await charger();
    const l = lectures;
    etat = 'refus';
    mod.preferences.update((p) => ({ ...p, barreLaterale: CHOIX_B, barreLateraleMaj: 2_000 }));
    await vi.advanceTimersByTimeAsync(DELAI * 2);
    expect(lectures).toBe(l);
  });
});
