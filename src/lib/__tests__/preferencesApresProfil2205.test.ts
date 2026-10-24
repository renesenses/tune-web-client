// @vitest-environment jsdom
//
// web#2205 — fil 2299, Jean Valjean (rc6, Windows 11, Firefox réglé pour
// tout effacer à la fermeture) : « Afficher le bouton Stop » ne tient que le
// temps de la session.
//
// Ce banc rejoue un DÉMARRAGE À STOCKAGE VIDE avec le vrai `bootstrapV2`, le
// vrai `loadProfiles` et le vrai magasin de préférences. Seul `fetch` est
// remplacé, par un serveur qui range `ui_preferences` PAR PROFIL et qui, comme
// `routes/active_profile.rs`, retombe sur le profil 1 quand une requête
// n'a pas d'`X-Profile-Id`.
//
// Le foyer : « Default » (1, masqué par la liste, web#1672) et « Jean » (2).
// Le réglage a été écrit au nom de Jean, sous `ui_preferences:2`.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';

vi.mock('../websocket', () => ({
  tuneWS: {
    connect: () => {},
    setCurrentZoneId: () => {},
    get isPolling() { return false; },
    onEvent: () => () => {},
  },
}));

const BLOBS: Record<number, Record<string, unknown>> = {
  1: {},
  2: { afficherBoutonStop: true },
};

let lecturesDeConfig: (string | null)[] = [];

function repondre(corps: unknown): Response {
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    headers: new Headers({ 'content-type': 'application/json' }),
    json: async () => corps,
    text: async () => JSON.stringify(corps),
  } as unknown as Response;
}

function enTeteProfil(init?: RequestInit): string | null {
  const h = init?.headers as Record<string, string> | Headers | undefined;
  if (!h) return null;
  if (h instanceof Headers) return h.get('X-Profile-Id');
  return (h as Record<string, string>)['X-Profile-Id'] ?? null;
}

describe('web#2205 — au démarrage, les préférences sont relues pour le profil choisi', () => {
  beforeEach(() => {
    vi.resetModules();
    localStorage.clear();
    lecturesDeConfig = [];
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      const u = String(url);
      if (/\/profiles\/dernier-choisi/.test(u)) return repondre({ profile_id: null, source: null });
      if (/\/profiles(\?|$)/.test(u)) {
        // Le serveur met un peu de temps à répondre : c'est ce délai que la
        // relecture des préférences ne doit pas doubler.
        await new Promise((r) => setTimeout(r, 20));
        return repondre([
          { id: 1, name: 'Default', avatar_color: '#6366f1' },
          { id: 2, name: 'Jean', avatar_color: '#22c55e' },
        ]);
      }
      if (/\/system\/config$/.test(u) && String(init?.method ?? 'GET').toUpperCase() === 'GET') {
        const entete = enTeteProfil(init);
        lecturesDeConfig.push(entete);
        const pid = entete ? Number(entete) : 1; // repli du serveur : profil 1
        return repondre({ ui_preferences: BLOBS[pid] ?? {} });
      }
      if (/\/zones(\?|$)/.test(u)) return repondre([]);
      return repondre([]);
    }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('stockage vide : le réglage de Jean revient (la relecture porte X-Profile-Id: 2)', async () => {
    const { bootstrapV2 } = await import('../v2Bootstrap');
    const { currentProfileId } = await import('../stores/profile');
    const { preferences } = await import('../stores/preferences');

    await bootstrapV2();

    expect(get(currentProfileId)).toBe(2);
    expect(lecturesDeConfig.length, 'aucune relecture de /system/config').toBeGreaterThan(0);
    expect(
      lecturesDeConfig[0],
      'la première relecture est partie sans profil : le serveur a rendu le blob du profil 1',
    ).toBe('2');
    expect(get(preferences).afficherBoutonStop, '« Afficher le bouton Stop » perdu au démarrage').toBe(true);
  });
});
