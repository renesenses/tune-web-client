// @vitest-environment jsdom
//
// Fil 2109 du forum (Levente Toth, ticket 220) : « les utilisateurs peuvent
// maintenant choisir ce qu'ils masquent dans la barre latérale ; ce serait
// bien que ce soit un réglage global, comme l'image de profil ».
//
// Le transport existe : `barreLaterale` est dans `ui_preferences`, rangé par
// profil côté serveur et réécrit à chaque geste (`PATCH /system/config`). Le
// défaut était dans la RELECTURE : `{ ...defaults, ...server, ...local }`, et
// le blob local de toute machine déjà ouverte une fois porte
// `barreLaterale: null`. Le choix fait sur A n'arrivait jamais sur B.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { arbitrerBarre, gesteBarre, horodatageBarre } from '../ordreBarreLaterale';

const STORAGE_KEY = 'tune-preferences';

const CHOIX_A = { ordre: ['search', 'home', 'library'], masquees: ['tags', 'radios'] };
const CHOIX_B = { ordre: [], masquees: ['podcasts'] };

/** Le blob qu'une machine écrit dès sa première ouverture, tous défauts. */
function blobLocal(extra: Record<string, unknown> = {}) {
  return JSON.stringify({ theme: 'midnight', language: 'en', barreLaterale: null, ...extra });
}

let patchs: string[] = [];

function serveurQuiPorte(prefs: Record<string, unknown>) {
  return vi.fn(async (url: unknown, init?: RequestInit) => {
    const u = String(url);
    if (u.includes('system/config')) {
      if (init?.method === 'PATCH') {
        patchs.push(String(init.body));
        return { ok: true, status: 200, json: async () => ({ ok: true }), text: async () => '' } as unknown as Response;
      }
      return {
        ok: true, status: 200,
        json: async () => ({ ui_preferences: JSON.stringify(prefs) }),
        text: async () => '',
      } as unknown as Response;
    }
    return { ok: false, status: 404, json: async () => ({}), text: async () => '' } as unknown as Response;
  });
}

async function magasinApresSynchro(prefsServeur: Record<string, unknown>) {
  vi.stubGlobal('fetch', serveurQuiPorte(prefsServeur));
  vi.resetModules();
  const mod = await import('../stores/preferences');
  await mod.syncPreferencesFromServer();
  return get(mod.preferences);
}

describe('fil 2109 — la barre latérale suit le profil, pas le navigateur', () => {
  beforeEach(() => { localStorage.clear(); patchs = []; });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('🔴 machine B, déjà ouverte une fois : la barre réglée sur A ARRIVE', async () => {
    localStorage.setItem(STORAGE_KEY, blobLocal());
    const p = await magasinApresSynchro({ barreLaterale: CHOIX_A, barreLateraleMaj: 1_000 });
    expect(p.barreLaterale, 'le null local écrase le choix porté par le serveur').toEqual(CHOIX_A);
    expect(p.barreLateraleMaj).toBe(1_000);
  });

  it('🔴 une barre MODIFIÉE ensuite sur A arrive aussi sur B, qui avait déjà une copie', async () => {
    localStorage.setItem(STORAGE_KEY, blobLocal({ barreLaterale: CHOIX_A, barreLateraleMaj: 1_000 }));
    const p = await magasinApresSynchro({ barreLaterale: CHOIX_B, barreLateraleMaj: 2_000 });
    expect(p.barreLaterale).toEqual(CHOIX_B);
  });

  it('🔴 « Rétablir l’ordre par défaut » fait sur A arrive sur B', async () => {
    localStorage.setItem(STORAGE_KEY, blobLocal({ barreLaterale: CHOIX_A, barreLateraleMaj: 1_000 }));
    const p = await magasinApresSynchro({ barreLaterale: null, barreLateraleMaj: 2_000 });
    expect(p.barreLaterale, 'un null DATÉ est un choix : l’ordre livré').toBeNull();
    expect(p.barreLateraleMaj).toBe(2_000);
  });

  it('un geste fait ICI, plus récent, garde la main — et répare le serveur', async () => {
    // Un onglet resté ouvert ailleurs a renvoyé une copie plus ancienne.
    localStorage.setItem(STORAGE_KEY, blobLocal({ barreLaterale: CHOIX_A, barreLateraleMaj: 3_000 }));
    const p = await magasinApresSynchro({ barreLaterale: CHOIX_B, barreLateraleMaj: 2_000 });
    expect(p.barreLaterale).toEqual(CHOIX_A);
    const dernier = JSON.parse(JSON.parse(patchs[patchs.length - 1]).ui_preferences);
    expect(dernier.barreLaterale, 'la fusion doit réécrire le geste le plus frais au serveur').toEqual(CHOIX_A);
    expect(dernier.barreLateraleMaj).toBe(3_000);
  });

  it('un blob serveur antérieur à la barre réglable ne touche pas au choix local', async () => {
    localStorage.setItem(STORAGE_KEY, blobLocal({ barreLaterale: CHOIX_A, barreLateraleMaj: 1_000 }));
    const p = await magasinApresSynchro({ theme: 'midnight' });
    expect(p.barreLaterale).toEqual(CHOIX_A);
  });

  it('une valeur serveur abîmée est écartée, le choix local reste', async () => {
    localStorage.setItem(STORAGE_KEY, blobLocal({ barreLaterale: CHOIX_A, barreLateraleMaj: 1_000 }));
    const p = await magasinApresSynchro({ barreLaterale: 'n’importe quoi', barreLateraleMaj: 9_999 });
    expect(p.barreLaterale).toEqual(CHOIX_A);
  });

  it('Accueil reste visible même si le serveur dit de le masquer', async () => {
    localStorage.setItem(STORAGE_KEY, blobLocal());
    const p = await magasinApresSynchro({ barreLaterale: { ordre: [], masquees: ['home', 'tags'] }, barreLateraleMaj: 5 });
    expect(p.barreLaterale?.masquees).toEqual(['tags']);
  });

  it('navigateur neuf : la barre du serveur est adoptée', async () => {
    const p = await magasinApresSynchro({ barreLaterale: CHOIX_A, barreLateraleMaj: 1_000 });
    expect(p.barreLaterale).toEqual(CHOIX_A);
  });
});

describe('fil 2109 — arbitrage entre l’appareil et le serveur', () => {
  const local = (barreLaterale: any, barreLateraleMaj = 0) => ({ barreLaterale, barreLateraleMaj });

  it('deux blobs jamais datés (écrits avant ce correctif) : un choix bat un défaut', () => {
    expect(arbitrerBarre(local(null), { barreLaterale: CHOIX_A }).barreLaterale).toEqual(CHOIX_A);
    expect(arbitrerBarre(local(CHOIX_A), { barreLaterale: null }).barreLaterale).toEqual(CHOIX_A);
    expect(arbitrerBarre(local(CHOIX_A), { barreLaterale: CHOIX_B }).barreLaterale).toEqual(CHOIX_B);
  });

  it('un horodatage abîmé compte pour « jamais daté »', () => {
    expect(horodatageBarre('12')).toBe(0);
    expect(horodatageBarre(Number.NaN)).toBe(0);
    expect(horodatageBarre(-3)).toBe(0);
    expect(horodatageBarre(42)).toBe(42);
    expect(arbitrerBarre(local(CHOIX_A, 10), { barreLaterale: CHOIX_B, barreLateraleMaj: 'demain' }).barreLaterale)
      .toEqual(CHOIX_A);
  });

  it('chaque geste est daté', () => {
    expect(gesteBarre(CHOIX_A, 1234)).toEqual({ barreLaterale: CHOIX_A, barreLateraleMaj: 1234 });
    expect(gesteBarre(null, 99)).toEqual({ barreLaterale: null, barreLateraleMaj: 99 });
  });

  it('🔴 les trois gestes de Réglages › Interface passent par gesteBarre', () => {
    const src = readFileSync(resolve(process.cwd(), 'src/components/v2/OrdreBarreLateraleV2.svelte'), 'utf-8');
    expect([...src.matchAll(/\.\.\.gesteBarre\(/g)].length).toBe(3);
    expect(src, 'un geste non daté serait défait par le serveur au chargement suivant')
      .not.toMatch(/barreLaterale:\s*(avecOrdre|avecVisibilite|null)/);
  });
});
