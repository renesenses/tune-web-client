// @vitest-environment jsdom
//
// web#3139 — ajm (fil 2833, Opera sous Windows) : l'adresse IP du serveur a
// changé et l'interface est retombée à Essentiel, alors que le profil porte
// Expert côté serveur.
//
// Le parcours : nouvelle adresse = nouvelle origine = navigateur sans copie
// locale. `loadPrefs` range `'beginner'` (#2735) en `localStorage` dès la
// première émission. La relecture du serveur échoue (serveur encore en
// démarrage après un redémarrage à froid). Au rechargement suivant, la copie
// locale existe : la fusion `{ ...defaults, ...server, ...local }` laissait ce
// défaut jamais choisi recouvrir le niveau du profil.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';

const STORAGE_KEY = 'tune-preferences';
let blobServeur: string | null = null;
let serveurEnDemarrage = false;

function serveur() {
  return vi.fn(async (url: unknown, init?: RequestInit) => {
    const u = String(url);
    if (u.includes('system/config')) {
      if (serveurEnDemarrage) throw new TypeError('Failed to fetch');
      if ((init?.method ?? 'GET').toUpperCase() === 'PATCH') {
        blobServeur = JSON.parse(String(init?.body)).ui_preferences;
        return { ok: true, status: 200, json: async () => ({ ok: true }), text: async () => '' } as unknown as Response;
      }
      return {
        ok: true, status: 200,
        json: async () => (blobServeur ? { ui_preferences: blobServeur } : {}),
        text: async () => '',
      } as unknown as Response;
    }
    return { ok: false, status: 404, json: async () => ({}), text: async () => '' } as unknown as Response;
  });
}

async function ouvrirOnglet() {
  vi.resetModules();
  const mod = await import('../stores/preferences');
  await mod.syncPreferencesFromServer();
  return mod;
}

describe('web#3139 — le niveau du profil survit à un changement d\'adresse', () => {
  beforeEach(() => {
    localStorage.clear();
    blobServeur = JSON.stringify({ settingsLevel: 'expert', theme: 'dark' });
    serveurEnDemarrage = false;
    vi.stubGlobal('fetch', serveur());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('serveur injoignable à la première ouverture, puis rechargement : Expert du profil repris', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    // 1. Nouvelle origine, serveur pas encore prêt : défaut Essentiel rangé.
    serveurEnDemarrage = true;
    const premier = await ouvrirOnglet();
    expect(get(premier.preferences).settingsLevel).toBe('beginner');
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}').settingsLevel).toBe('beginner');

    // 2. Le serveur répond, la page est rechargée : copie locale présente.
    serveurEnDemarrage = false;
    const second = await ouvrirOnglet();
    expect(get(second.preferences).settingsLevel).toBe('expert');
    // Le serveur garde l'Expert : rien n'a été réécrit en Essentiel.
    expect(JSON.parse(blobServeur ?? '{}').settingsLevel).toBe('expert');
  });

  it('contre-épreuve : un niveau choisi ici (et envoyé) reste celui du profil', async () => {
    const onglet = await ouvrirOnglet();
    onglet.preferences.update((p) => ({ ...p, settingsLevel: 'beginner' }));
    expect(JSON.parse(blobServeur ?? '{}').settingsLevel).toBe('beginner');
    const recharge = await ouvrirOnglet();
    expect(get(recharge.preferences).settingsLevel).toBe('beginner');
  });
});
