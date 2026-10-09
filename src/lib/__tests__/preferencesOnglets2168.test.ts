// @vitest-environment jsdom
//
// Fil 2168 du forum — « l'ordre et le choix des entrées de la barre latérale
// ne sont pas respectés, tout reste affiché ». Tune s'ouvre « automatiquement
// au lancement de Tune, ou après chargement d'une mise à jour » : le serveur
// ouvre un onglet NEUF à chaque démarrage, et l'ancien reste ouvert.
//
// Chaque onglet gardait son blob de préférences en mémoire et le réécrivait
// EN ENTIER au premier réglage touché, en `localStorage` comme au serveur.
// L'onglet de la veille effaçait donc la barre réglée dans l'onglet du jour.
//
// Deux instances du magasin, un seul `localStorage` : deux onglets.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';

const STORAGE_KEY = 'tune-preferences';
const CHOIX = { ordre: ['search', 'home', 'library'], masquees: ['tags', 'radios'] };

let patchs: Record<string, unknown>[] = [];
let blobServeur: string | null = null;

function serveur() {
  return vi.fn(async (url: unknown, init?: RequestInit) => {
    const u = String(url);
    if (u.includes('system/config')) {
      if (init?.method === 'PATCH') {
        const corps = JSON.parse(String(init.body));
        blobServeur = corps.ui_preferences;
        patchs.push(JSON.parse(corps.ui_preferences));
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

type Mod = typeof import('../stores/preferences');

/** Un onglet : une instance neuve du module, donc du magasin. */
async function ouvrirOnglet(): Promise<Mod> {
  vi.resetModules();
  return await import('../stores/preferences');
}

/** Ce que le navigateur envoie aux AUTRES onglets après une écriture. */
function signalerAuxAutresOnglets() {
  window.dispatchEvent(new StorageEvent('storage', {
    key: STORAGE_KEY,
    newValue: localStorage.getItem(STORAGE_KEY),
    storageArea: localStorage,
  }));
}

function range(): Record<string, unknown> {
  return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}');
}

describe('fil 2168 — un onglet resté ouvert n’écrase plus les réglages d’un autre', () => {
  beforeEach(() => {
    localStorage.clear();
    patchs = [];
    blobServeur = null;
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ theme: 'dark', language: 'en', barreLaterale: null }));
    vi.stubGlobal('fetch', serveur());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('🔴 la barre réglée dans l’onglet A survit à un autre réglage changé dans l’onglet B', async () => {
    const B = await ouvrirOnglet();   // l'onglet de la veille
    const A = await ouvrirOnglet();   // l'onglet ouvert au lancement
    A.preferences.update((p) => ({ ...p, barreLaterale: CHOIX, barreLateraleMaj: 1_000 }));
    B.preferences.update((p) => ({ ...p, theme: 'light' }));

    expect(range().barreLaterale, 'localStorage : B a réécrit son vieux blob').toEqual(CHOIX);
    expect(range().theme).toBe('light');
    const dernier = patchs[patchs.length - 1];
    expect(dernier.barreLaterale, 'serveur : B a renvoyé un blob périmé').toEqual(CHOIX);
    expect(dernier.barreLateraleMaj).toBe(1_000);
    expect(dernier.theme).toBe('light');
  });

  it('🔴 la langue choisie (#1977) et la vue de démarrage (#1971) sont protégées de même', async () => {
    const B = await ouvrirOnglet();
    const A = await ouvrirOnglet();
    A.preferences.update((p) => ({ ...p, language: 'de', langueAuto: null, startupView: 'library' }));
    B.preferences.update((p) => ({ ...p, volumeDisplay: 'dB' }));

    expect(range().language).toBe('de');
    expect(range().langueAuto).toBeNull();
    expect(range().startupView).toBe('library');
    expect(range().volumeDisplay).toBe('dB');
    const dernier = patchs[patchs.length - 1];
    expect(dernier.language).toBe('de');
    expect(dernier.langueAuto).toBeNull();
    expect(dernier.startupView).toBe('library');
  });

  it('🔴 l’évènement `storage` fait arriver dans B, en mémoire, le réglage fait dans A', async () => {
    const B = await ouvrirOnglet();
    const A = await ouvrirOnglet();
    A.preferences.update((p) => ({ ...p, barreLaterale: CHOIX, barreLateraleMaj: 1_000 }));
    signalerAuxAutresOnglets();

    expect(get(B.preferences).barreLaterale).toEqual(CHOIX);
    expect(get(B.preferences).barreLateraleMaj).toBe(1_000);
  });

  it('adopter un réglage venu d’un autre onglet ne le renvoie pas au serveur (pas de ping-pong)', async () => {
    const B = await ouvrirOnglet();
    const A = await ouvrirOnglet();
    A.preferences.update((p) => ({ ...p, startupView: 'queue' }));
    const avant = patchs.length;
    const ecrit = localStorage.getItem(STORAGE_KEY);
    signalerAuxAutresOnglets();

    expect(get(B.preferences).startupView).toBe('queue');
    expect(patchs.length, 'B ne doit rien renvoyer : A l’a déjà fait').toBe(avant);
    expect(localStorage.getItem(STORAGE_KEY)).toBe(ecrit);
  });

  it('🔴 le geste fait dans B après coup part de l’état à jour : B ne remet pas la barre que A a changée', async () => {
    const B = await ouvrirOnglet();
    const A = await ouvrirOnglet();
    B.preferences.update((p) => ({ ...p, barreLaterale: { ordre: [], masquees: ['podcasts'] }, barreLateraleMaj: 500 }));
    signalerAuxAutresOnglets();
    A.preferences.update((p) => ({ ...p, barreLaterale: CHOIX, barreLateraleMaj: 1_000 }));
    // Évènement perdu (onglet B gelé) : B change un autre réglage.
    B.preferences.update((p) => ({ ...p, tooltipsEnabled: false }));

    expect(range().barreLaterale).toEqual(CHOIX);
    expect(range().tooltipsEnabled).toBe(false);
    expect(get(B.preferences).barreLaterale, 'B rattrape en mémoire ce qu’il relit').toEqual(CHOIX);
  });

  it('🔴 un troisième onglet, ouvert au lancement suivant, reçoit la barre de A', async () => {
    const B = await ouvrirOnglet();
    const A = await ouvrirOnglet();
    A.preferences.update((p) => ({ ...p, barreLaterale: CHOIX, barreLateraleMaj: 1_000 }));
    B.preferences.update((p) => ({ ...p, theme: 'oled' }));

    const C = await ouvrirOnglet();
    await C.syncPreferencesFromServer();
    expect(get(C.preferences).barreLaterale).toEqual(CHOIX);
    expect(get(C.preferences).theme).toBe('oled');
  });
});
