// @vitest-environment jsdom
//
// Fils 2166 et 2168 du forum — Bilou, Windows, 10/10/2026 : « Ne fonctionne
// toujours pas en rc3, désolé ». Les deux correctifs annoncés (#1971, vue de
// démarrage ; #1980, onglets) sont DANS le tag web v1.0.0-rc3 : ils ne
// couvraient pas ce cas-ci.
//
// ## Le cas
//
// Le réglage est fait dans un navigateur (ou à une adresse) dont le stockage
// n'est pas celui de l'onglet que Tune ouvre au lancement
// (`http://localhost:8888`). Le serveur reçoit bien le réglage : chaque geste
// part en `PATCH /system/config`, rangé par profil. Mais l'onglet du
// lancement porte une COPIE LOCALE ANCIENNE — le blob entier, défauts compris,
// que le magasin sérialise dès sa première émission — et :
//
//   1. `syncPreferencesFromServer` fusionne `{ ...defaults, ...server, ...local }` :
//      le local gagne clé par clé, donc `startupView: 'home'` (le défaut,
//      jamais choisi) recouvre la `'library'` du serveur ;
//   2. en rc3, cette fusion repart au serveur (PATCH au chargement, #2042) :
//      le choix fait ailleurs est EFFACÉ du serveur, pour tout le monde ;
//   3. la coquille lit la vue de démarrage À SON MONTAGE, avant la réponse du
//      serveur : même un serveur juste ne pourrait pas être suivi.
//
// La barre latérale (fil 2168), elle, est arbitrée par date du dernier geste
// (fil 2109) : ce parcours ne la perd PAS, même en rc3. Son test est une
// garde ; la cause du fil 2168 n'est pas reproduite ici.
//
// Deux stockages, un serveur : on sauve et on remet le `localStorage` entre
// deux « navigateurs », et chaque onglet est une instance neuve du module.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';

const STORAGE_KEY = 'tune-preferences';
const CHOIX = { ordre: ['library', 'home', 'search'], masquees: ['radios', 'podcasts', 'tags'] };

let blobServeur: string | null = null;
let patchs: Record<string, unknown>[] = [];

function serveur() {
  return vi.fn(async (url: unknown, init?: RequestInit) => {
    const u = String(url);
    if (u.includes('system/config')) {
      if ((init?.method ?? 'GET').toUpperCase() === 'PATCH') {
        const corps = JSON.parse(String(init?.body));
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

/** Un onglet qui s'ouvre : module neuf, puis la relecture du serveur. */
async function ouvrirOnglet(): Promise<Mod> {
  vi.resetModules();
  const mod = await import('../stores/preferences');
  await mod.syncPreferencesFromServer();
  return mod;
}

/** Le stockage d'un navigateur : on le sauve, on le remet. */
function stockage(): string | null { return localStorage.getItem(STORAGE_KEY); }
function poserStockage(blob: string | null) {
  localStorage.clear();
  if (blob !== null) localStorage.setItem(STORAGE_KEY, blob);
}

function serveurDit(): Record<string, unknown> {
  return blobServeur ? JSON.parse(blobServeur) : {};
}

/**
 * Le parcours de Bilou : un premier passage dans l'onglet du lancement (il
 * y laisse sa copie locale, défauts compris), le réglage fait AILLEURS, puis
 * Tune relancé, qui rouvre `localhost:8888`.
 */
async function parcours(geste: (m: Mod) => void): Promise<Mod> {
  // 1. Un passage dans l'onglet du lancement : stockage neuf, serveur neuf.
  poserStockage(null);
  await ouvrirOnglet();
  const copieDuLancement = stockage();
  expect(copieDuLancement, 'le magasin range bien une copie locale').not.toBeNull();

  // 2. Le réglage, dans un AUTRE stockage (autre navigateur, autre adresse).
  poserStockage(null);
  const ailleurs = await ouvrirOnglet();
  geste(ailleurs);

  // 3. Tune relancé : l'onglet de `localhost:8888`, avec sa copie ancienne.
  poserStockage(copieDuLancement);
  return await ouvrirOnglet();
}

describe('fils 2166 et 2168 — une copie locale ancienne ne recouvre plus le réglage du serveur', () => {
  beforeEach(() => {
    localStorage.clear();
    blobServeur = null;
    patchs = [];
    vi.stubGlobal('fetch', serveur());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('🔴 2166 — « Bibliothèque » choisie ailleurs : l’onglet du lancement la retient', async () => {
    const lancement = await parcours((m) => m.preferences.update((p) => ({ ...p, startupView: 'library' })));
    expect(get(lancement.preferences).startupView, 'la copie locale (« home », le défaut) a gagné').toBe('library');
  });

  it('🔴 2166 — le chargement n’efface pas, AU SERVEUR, la vue choisie ailleurs', async () => {
    await parcours((m) => m.preferences.update((p) => ({ ...p, startupView: 'library' })));
    expect(serveurDit().startupView, 'le PATCH du chargement a remis « home » au serveur').toBe('library');
  });

  it('2168 (garde, déjà vert en rc3) — la barre réglée ailleurs : l’onglet du lancement la retient, et le serveur aussi', async () => {
    const lancement = await parcours((m) =>
      m.preferences.update((p) => ({ ...p, barreLaterale: CHOIX, barreLateraleMaj: Date.now() })));
    expect(get(lancement.preferences).barreLaterale).toEqual(CHOIX);
    expect(serveurDit().barreLaterale).toEqual(CHOIX);
  });

  it('contre-épreuve : un choix fait DANS l’onglet du lancement tient toujours', async () => {
    poserStockage(null);
    const a = await ouvrirOnglet();
    a.preferences.update((p) => ({ ...p, startupView: 'queue', barreLaterale: CHOIX, barreLateraleMaj: Date.now() }));
    const b = await ouvrirOnglet();
    expect(get(b.preferences).startupView).toBe('queue');
    expect(get(b.preferences).barreLaterale).toEqual(CHOIX);
  });

  it('contre-épreuve : sans rien au serveur, la copie locale fait foi', async () => {
    poserStockage(JSON.stringify({ startupView: 'playlists' }));
    const a = await ouvrirOnglet();
    expect(get(a.preferences).startupView).toBe('playlists');
  });
});

