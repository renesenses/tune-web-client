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

describe('#2735 — niveau par défaut des Réglages', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    localStorage.clear();
  });

  type Cas = {
    nom: string;
    local?: Record<string, unknown>;
    ancien?: string;
    serveur?: Record<string, unknown> | null;
    auDepart: string;
    apres: string;
  };
  const cas: Cas[] = [
    { nom: 'installation neuve', serveur: null, auDepart: 'beginner', apres: 'beginner' },
    { nom: 'blob serveur vide', serveur: {}, auDepart: 'beginner', apres: 'beginner' },
    ...['beginner', 'intermediate', 'expert'].map((niveau) => ({
      nom: 'niveau local ' + niveau, local: { theme: 'dark', settingsLevel: niveau },
      serveur: { settingsLevel: 'beginner' }, auDepart: niveau, apres: niveau,
    })),
    { nom: 'blob local sans niveau', local: { theme: 'dark' }, auDepart: 'expert', apres: 'expert' },
    { nom: 'niveau local inconnu', local: { theme: 'dark', settingsLevel: 'inconnu' }, auDepart: 'expert', apres: 'expert' },
    { nom: 'ancien interrupteur éteint', ancien: '0', auDepart: 'beginner', apres: 'beginner' },
    { nom: 'ancien interrupteur allumé', ancien: '1', auDepart: 'expert', apres: 'expert' },
    { nom: 'ancien interrupteur et blob sans niveau', ancien: '1', local: { theme: 'dark' }, auDepart: 'expert', apres: 'expert' },
    ...['expert', 'intermediate'].map((niveau) => ({
      nom: 'niveau serveur ' + niveau, serveur: { theme: 'dark', settingsLevel: niveau },
      auDepart: 'beginner', apres: niveau,
    })),
    { nom: 'blob serveur sans niveau', serveur: { theme: 'dark' }, auDepart: 'beginner', apres: 'expert' },
  ];
  it.each(cas)('$nom', async ({ local, ancien, serveur, auDepart, apres }) => {
    if (local) localStorage.setItem(STORAGE_KEY, JSON.stringify(local));
    if (ancien !== undefined) localStorage.setItem('tune_settings_advanced', ancien);
    vi.stubGlobal('fetch', serveurQuiPorte(serveur ?? null));
    vi.resetModules();
    const mod = await import('../stores/preferences');
    expect(get(mod.preferences).settingsLevel).toBe(auDepart);
    await mod.syncPreferencesFromServer();
    expect(get(mod.preferences).settingsLevel).toBe(apres);
  });

  it('le sélecteur Essentiel / Avancé / Expert reste dans le menu avatar', () => {
    const src = readFileSync(resolve(__dirname, '../../components/v2/AvatarMenu.svelte'), 'utf8');
    expect(src).toMatch(/\{#each LEVELS as l \(l\)\}\s*<button class:on=\{level === l\} onclick=\{\(\) => setLevel\(l\)\}>\{\$t\(LEVEL_LABEL_KEYS\[l\] as any\)\}<\/button>/);
  });
});
