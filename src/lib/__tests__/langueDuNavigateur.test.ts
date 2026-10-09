// @vitest-environment jsdom
//
// Lancement public du 06/10/2026 : tout nouvel utilisateur voyait l'interface
// en FRANÇAIS. `defaults.language` valait `'fr'`, `main.ts` retombait sur
// `?? 'fr'`, et la langue du navigateur n'était lue nulle part.
//
// Règle « choisie / par défaut » : `langueParDefaut.ts`.
//
// Contre-épreuve (mesurée) : remettre `language: 'fr'` dans `defaults` et
// retirer les `resoudreLangue` de `loadPrefs` / `syncPreferencesFromServer`
// fait échouer « en-US → en », « nl → en » et les trois cas « ancien 'fr' ».
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';
import { langueChoisie, langueDuNavigateur, resoudreLangue } from '../langueParDefaut';

const STORAGE_KEY = 'tune-preferences';

function navigateurEn(languages: string[], language = languages[0] ?? '') {
  vi.spyOn(navigator, 'languages', 'get').mockReturnValue(languages);
  vi.spyOn(navigator, 'language', 'get').mockReturnValue(language);
}

function serveurQuiPorte(prefs: Record<string, unknown> | null) {
  return vi.fn(async (url: unknown) => {
    const u = String(url);
    if (u.includes('system/config') && prefs) {
      return {
        ok: true, status: 200,
        json: async () => ({ ui_preferences: JSON.stringify(prefs) }),
        text: async () => '',
      } as unknown as Response;
    }
    if (u.includes('system/config')) {
      return { ok: true, status: 200, json: async () => ({}), text: async () => '' } as unknown as Response;
    }
    return { ok: false, status: 404, json: async () => ({}), text: async () => '' } as unknown as Response;
  });
}

/** Le magasin tel qu'au démarrage, puis après la synchronisation du profil. */
async function demarrer(prefsServeur: Record<string, unknown> | null = null) {
  vi.stubGlobal('fetch', serveurQuiPorte(prefsServeur));
  vi.resetModules();
  const mod = await import('../stores/preferences');
  const auDemarrage = get(mod.preferences);
  await mod.syncPreferencesFromServer();
  return { auDemarrage, apresSynchro: get(mod.preferences), mod };
}

describe('premier lancement : la langue du navigateur', () => {
  beforeEach(() => { localStorage.clear(); });
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); localStorage.clear(); });

  it('navigateur en-US → en', async () => {
    navigateurEn(['en-US', 'en']);
    const { auDemarrage, apresSynchro } = await demarrer();
    expect(auDemarrage.language).toBe('en');
    expect(apresSynchro.language).toBe('en');
  });

  it('navigateur fr-FR → fr', async () => {
    navigateurEn(['fr-FR', 'fr']);
    const { auDemarrage } = await demarrer();
    expect(auDemarrage.language).toBe('fr');
  });

  it("navigateur nl → en (langue que l'interface ne parle pas)", async () => {
    navigateurEn(['nl-NL', 'nl']);
    const { auDemarrage } = await demarrer();
    expect(auDemarrage.language).toBe('en');
  });

  it('navigator.languages dans l’ordre : nl puis de → de', async () => {
    navigateurEn(['nl-BE', 'de-DE', 'en']);
    const { auDemarrage } = await demarrer();
    expect(auDemarrage.language).toBe('de');
  });

  it('navigator.language quand languages est vide', () => {
    expect(langueDuNavigateur({ languages: [], language: 'ja-JP' })).toBe('ja');
    expect(langueDuNavigateur({ languages: ['zh-TW'] })).toBe('zh');
    expect(langueDuNavigateur({})).toBe('en');
  });

  it("profil serveur sans préférences : la langue du navigateur, pas 'fr'", async () => {
    navigateurEn(['en-GB']);
    const { apresSynchro } = await demarrer(null);
    expect(apresSynchro.language).toBe('en');
  });
});

describe('un choix explicite est gardé', () => {
  beforeEach(() => { localStorage.clear(); });
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); localStorage.clear(); });

  it('choix explicite fr gardé, sur un navigateur anglais', async () => {
    navigateurEn(['en-US']);
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ theme: 'dark', language: 'fr', langueAuto: null }));
    const { auDemarrage, apresSynchro } = await demarrer({ language: 'de', langueAuto: 'de' });
    expect(auDemarrage.language).toBe('fr');
    expect(apresSynchro.language).toBe('fr');
  });

  it('le sélecteur des Réglages pose un choix qui survit au rechargement', async () => {
    navigateurEn(['en-US']);
    const { mod } = await demarrer();
    mod.preferences.update((pr) => ({ ...pr, language: 'fr', langueAuto: null }));
    const { auDemarrage } = await demarrer();
    expect(auDemarrage.language).toBe('fr');
  });

  it('ancien blob avec une langue autre que fr : un choix, gardé', async () => {
    navigateurEn(['fr-FR']);
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ theme: 'dark', language: 'sv' }));
    const { auDemarrage } = await demarrer();
    expect(auDemarrage.language).toBe('sv');
  });

  it('choix porté par le PROFIL serveur, navigateur neuf', async () => {
    navigateurEn(['en-US']);
    const { apresSynchro } = await demarrer({ language: 'it', langueAuto: null });
    expect(apresSynchro.language).toBe('it');
  });

  it('choix du profil adopté même si ce navigateur a déjà des préférences auto', async () => {
    navigateurEn(['en-US']);
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ theme: 'dark', language: 'en', langueAuto: 'en' }));
    const { apresSynchro } = await demarrer({ language: 'ko', langueAuto: null });
    expect(apresSynchro.language).toBe('ko');
  });
});

describe("un 'fr' qui n'était que le défaut n'est pas un choix", () => {
  beforeEach(() => { localStorage.clear(); });
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); localStorage.clear(); });

  it('ancien blob local fr (sans langueAuto), navigateur anglais → en', async () => {
    navigateurEn(['en-US']);
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ theme: 'dark', language: 'fr' }));
    const { auDemarrage } = await demarrer();
    expect(auDemarrage.language).toBe('en');
  });

  it('blob serveur fr par défaut, navigateur neuf anglais → en', async () => {
    navigateurEn(['en-US']);
    const { apresSynchro } = await demarrer({ theme: 'dark', language: 'fr' });
    expect(apresSynchro.language).toBe('en');
  });

  it('fusion {...defaults, ...server, ...local} : deux fr par défaut → en', async () => {
    navigateurEn(['en-US']);
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ theme: 'dark', language: 'fr' }));
    const { apresSynchro } = await demarrer({ theme: 'dark', language: 'fr' });
    expect(apresSynchro.language).toBe('en');
  });

  it('une langue changée par un client plus ancien (langueAuto recopié) est un choix', () => {
    expect(langueChoisie({ language: 'de', langueAuto: 'en' })).toBe('de');
    expect(langueChoisie({ language: 'en', langueAuto: 'en' })).toBeNull();
  });

  it('resoudreLangue normalise un choix en langueAuto: null', () => {
    expect(resoudreLangue([{ language: 'sv' }], { languages: ['en'] })).toEqual({ language: 'sv', langueAuto: null });
    expect(resoudreLangue([{ language: 'fr' }], { languages: ['nl'] })).toEqual({ language: 'en', langueAuto: 'en' });
  });
});
