// @vitest-environment jsdom
//
// Aucune écriture de configuration au CHARGEMENT d'une page.
//
// ## Ce qui a été vu (09/10/2026, essai d'écoute à distance par le pont)
//
// Chaque chargement du client envoyait des `PATCH /api/v1/system/config` sans
// que personne n'ait touché à rien. Lu dans le code : `syncPreferencesFromServer`
// relit le blob `ui_preferences` du serveur, le FUSIONNE avec celui du
// navigateur (le local gagne clé par clé), puis fait un `preferences.update` —
// et l'abonné du magasin réécrit alors le blob ENTIER au serveur. Puis une
// seconde fois pour la zone par défaut (`/system/settings/default-zone`), même
// quand elle n'a pas changé.
//
// Le danger n'est pas le trafic : c'est que le blob réécrit est celui du
// NAVIGATEUR. Un téléphone qui ouvre Tune par le pont avec une copie locale
// ancienne (langue, appareils masqués, thème…) la repousse au serveur à chaque
// ouverture, et efface ce qui a été réglé ailleurs. Sur le .18, le 09/10,
// `ui_preferences:1` a été réécrit (dernier passage 14:07:25 UTC).
//
// La règle : une écriture part d'un GESTE. Ce que le client relit ou déduit
// lui-même au démarrage s'adopte en mémoire et en `localStorage`, jamais au
// serveur.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';

const STORAGE_KEY = 'tune-preferences';

let patchs: { url: string; body: string }[] = [];

function serveur(prefs: Record<string, unknown>, zoneParDefaut: number | null = 10) {
  return vi.fn(async (url: unknown, init?: RequestInit) => {
    const u = String(url);
    if ((init?.method ?? 'GET').toUpperCase() !== 'GET') {
      patchs.push({ url: u, body: String(init?.body ?? '') });
      return { ok: true, status: 200, json: async () => ({ ok: true }), text: async () => '' } as unknown as Response;
    }
    if (u.includes('default-zone')) {
      return { ok: true, status: 200, json: async () => ({ zone_id: zoneParDefaut }), text: async () => '' } as unknown as Response;
    }
    if (u.includes('system/config')) {
      return {
        ok: true, status: 200,
        json: async () => ({ ui_preferences: JSON.stringify(prefs) }),
        text: async () => '',
      } as unknown as Response;
    }
    return { ok: false, status: 404, json: async () => ({}), text: async () => '' } as unknown as Response;
  });
}

async function charger(prefsServeur: Record<string, unknown>, zone: number | null = 10) {
  vi.stubGlobal('fetch', serveur(prefsServeur, zone));
  vi.resetModules();
  const mod = await import('../stores/preferences');
  await mod.syncPreferencesFromServer();
  return mod;
}

describe('aucune écriture de configuration au chargement', () => {
  beforeEach(() => { localStorage.clear(); patchs = []; });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('🔴 navigateur déjà ouvert (copie locale ancienne) : AUCUN PATCH', async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      theme: 'midnight', language: 'en', langueAuto: null, hiddenDeviceIds: [],
    }));
    await charger({ theme: 'dark', language: 'fr', langueAuto: null, hiddenDeviceIds: ['net:a', 'net:b'] });
    expect(patchs, 'le chargement a réécrit la configuration du serveur').toEqual([]);
  });

  it('🔴 navigateur neuf : AUCUN PATCH non plus', async () => {
    await charger({ theme: 'dark', language: 'fr', langueAuto: null });
    expect(patchs).toEqual([]);
  });

  it('🔴 la zone par défaut relue du serveur ne repart pas au serveur', async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ theme: 'dark', defaultZoneId: 3 }));
    const mod = await charger({ theme: 'dark' }, 7);
    expect(get(mod.preferences).defaultZoneId).toBe(7);
    expect(patchs).toEqual([]);
  });

  it('ce qui est relu est bien ADOPTÉ (mémoire et localStorage)', async () => {
    const mod = await charger({ theme: 'light', language: 'fr', langueAuto: null });
    expect(get(mod.preferences).theme).toBe('light');
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}').theme).toBe('light');
  });

  it('contre-épreuve : un GESTE après le chargement écrit, une fois', async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ theme: 'dark' }));
    const mod = await charger({ theme: 'dark' });
    mod.preferences.update((p) => ({ ...p, theme: 'light' }));
    expect(patchs).toHaveLength(1);
    expect(patchs[0].url).toContain('/system/config');
    expect(JSON.parse(JSON.parse(patchs[0].body).ui_preferences).theme).toBe('light');
  });

  it('adopterSansEcrire : mise à jour locale, sans PATCH (défaut figé par la barre latérale)', async () => {
    const mod = await charger({ theme: 'dark' });
    mod.preferences.adopterSansEcrire((p) => ({ ...p, sourcesBarre: { cd: true } }));
    expect(get(mod.preferences).sourcesBarre).toEqual({ cd: true });
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}').sourcesBarre).toEqual({ cd: true });
    expect(patchs).toEqual([]);
  });
});
