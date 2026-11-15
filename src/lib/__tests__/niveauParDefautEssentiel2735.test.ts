// @vitest-environment jsdom
//
// renesenses/tune-web-client#2735 — décision de Bertrand du 09/11/2026 : une
// installation NEUVE ouvre les Réglages au niveau Essentiel (au lieu de
// l'Expert du 27/08). Une installation EXISTANTE garde son niveau.
//
// « Jamais choisi » et « Expert choisi » ne se distinguent pas dans le
// stockage (le blob des préférences s'écrit en entier, défauts compris, dès la
// première ouverture). La frontière retenue est donc l'existence de
// préférences enregistrées, dans le navigateur ou sur le serveur.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const STORAGE_KEY = 'tune-preferences';

function serveurQuiPorte(prefs: Record<string, unknown> | null) {
  return vi.fn(async (url: unknown) => {
    const u = String(url);
    if (u.includes('system/config')) {
      return {
        ok: true, status: 200,
        json: async () => (prefs ? { ui_preferences: JSON.stringify(prefs) } : {}),
        text: async () => '',
      } as unknown as Response;
    }
    return { ok: false, status: 404, json: async () => ({}), text: async () => '' } as unknown as Response;
  });
}

async function niveauAuChargement(): Promise<string> {
  vi.resetModules();
  const mod = await import('../stores/preferences');
  return get(mod.preferences).settingsLevel;
}

async function niveauApresSynchro(prefsServeur: Record<string, unknown> | null): Promise<string> {
  vi.stubGlobal('fetch', serveurQuiPorte(prefsServeur));
  vi.resetModules();
  const mod = await import('../stores/preferences');
  await mod.syncPreferencesFromServer();
  return get(mod.preferences).settingsLevel;
}

describe('#2735 — niveau par défaut des Réglages', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('installation neuve (rien d’enregistré, nulle part) : Essentiel', async () => {
    expect(await niveauAuChargement()).toBe('beginner');
    expect(await niveauApresSynchro(null)).toBe('beginner');
    expect(await niveauApresSynchro({}), 'un blob serveur vide n’est pas une installation existante').toBe('beginner');
  });

  it('un niveau enregistré dans le navigateur est gardé, Expert compris', async () => {
    for (const niveau of ['beginner', 'intermediate', 'expert']) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ theme: 'dark', settingsLevel: niveau }));
      expect(await niveauAuChargement(), niveau).toBe(niveau);
      expect(await niveauApresSynchro({ settingsLevel: 'beginner' }), `${niveau} : le local fait foi`).toBe(niveau);
    }
  });

  it('préférences enregistrées SANS niveau valide : installation existante, ancien défaut Expert', async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ theme: 'dark' }));
    expect(await niveauAuChargement()).toBe('expert');
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ theme: 'dark', settingsLevel: 'n’importe quoi' }));
    expect(await niveauAuChargement()).toBe('expert');
  });

  it('l’ancien interrupteur « avancé » prime toujours sur les deux défauts', async () => {
    localStorage.setItem('tune_settings_advanced', '0');
    expect(await niveauAuChargement()).toBe('beginner');
    localStorage.clear();
    localStorage.setItem('tune_settings_advanced', '1');
    expect(await niveauAuChargement()).toBe('expert');
    localStorage.clear();
    localStorage.setItem('tune_settings_advanced', '1');
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ theme: 'dark' }));
    expect(await niveauAuChargement(), 'blob sans niveau + ancien interrupteur').toBe('expert');
  });

  it('navigateur neuf face à un serveur qui a déjà des préférences : le niveau du serveur', async () => {
    expect(await niveauApresSynchro({ theme: 'dark', settingsLevel: 'expert' })).toBe('expert');
    localStorage.clear();
    expect(await niveauApresSynchro({ theme: 'dark', settingsLevel: 'intermediate' })).toBe('intermediate');
    localStorage.clear();
    expect(await niveauApresSynchro({ theme: 'dark' }), 'blob serveur sans niveau : ancien défaut').toBe('expert');
  });

  it('le sélecteur Essentiel / Avancé / Expert reste dans le menu avatar', () => {
    const src = readFileSync(resolve(__dirname, '../../components/v2/AvatarMenu.svelte'), 'utf8');
    expect(src).toMatch(/\{#each LEVELS as l \(l\)\}\s*<button class:on=\{level === l\} onclick=\{\(\) => setLevel\(l\)\}>\{\$t\(LEVEL_LABEL_KEYS\[l\] as any\)\}<\/button>/);
  });
});
