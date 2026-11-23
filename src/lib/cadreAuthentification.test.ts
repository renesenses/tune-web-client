import { describe, it, expect, vi, beforeEach } from 'vitest';
import { get } from 'svelte/store';

/**
 * Le message rouge « activez l'authentification » porte un BOUTON qui mène au
 * cadre Authentification des Réglages : un utilisateur ne trouvait pas le
 * cadre à partir du chemin écrit en toutes lettres.
 */
vi.stubGlobal('window', { location: { protocol: 'http:', host: 'localhost:8888' } });
vi.mock('./auth', () => ({ getToken: () => null, clearToken: () => {} }));
const error = vi.fn();
vi.mock('./stores/notifications', () => ({
  notifications: { error: (...a: unknown[]) => error(...a), success: vi.fn(), info: vi.fn(), dismiss: vi.fn() },
}));

const { fetchJSON } = await import('./api');
const { CIBLE_CADRE_AUTHENTIFICATION } = await import('./cadreAuthentification');
const { v2SettingsTarget } = await import('./stores/v2SettingsNav');
const { activeView } = await import('./stores/navigation');
const { reglageParId, lieuDuReglage, masqueAuNiveau } = await import('./reglagesIndex');
const { t } = await import('./i18n');
const { ONZE_LANGUES, dictionnaire } = await import('./__tests__/onzeDictionnaires');

function refus(reason: string) {
  const corps = JSON.stringify({ error: 'auth_required', reason, caller: '192.168.1.50' });
  const response = {
    ok: false,
    status: 403,
    statusText: 'Forbidden',
    headers: new Headers({ 'content-type': 'application/json' }),
    text: async () => corps,
    json: async () => JSON.parse(corps),
    clone() { return this; },
  };
  return vi.fn().mockResolvedValue(response);
}

beforeEach(() => {
  error.mockReset();
  v2SettingsTarget.set(null);
  activeView.set('home');
});

describe('bouton vers le cadre Authentification', () => {
  it('le message rouge du refus porte le bouton, et le bouton ouvre le cadre', async () => {
    for (const reason of ['not_local', 'port80_relay']) {
      error.mockReset();
      v2SettingsTarget.set(null);
      activeView.set('home');
      vi.stubGlobal('fetch', refus(reason));
      await fetchJSON('/api/v1/plugins/exemple/install', { method: 'POST', body: '{}' }).catch(() => {});
      expect(error).toHaveBeenCalledTimes(1);
      const action = error.mock.calls[0][3] as { label: string; run: () => void } | undefined;
      expect(action, `${reason} : bouton absent`).toBeDefined();
      expect(action!.label).toBe(get(t)('machineAction.openAuthSettings' as any));
      action!.run();
      await vi.waitFor(() => expect(get(activeView)).toBe('settings'));
      expect(get(v2SettingsTarget)).toEqual(CIBLE_CADRE_AUTHENTIFICATION);
    }
  });

  it('une autre erreur ne porte pas ce bouton', async () => {
    const corps = JSON.stringify({ error: 'boom' });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false, status: 500, statusText: 'x', headers: new Headers({ 'content-type': 'application/json' }),
      text: async () => corps, json: async () => JSON.parse(corps), clone() { return this; },
    }));
    await fetchJSON('/api/v1/plugins/exemple/install', { method: 'POST', body: '{}' }).catch(() => {});
    for (const appel of error.mock.calls) expect(appel[3]).toBeUndefined();
  });

  it('la cible existe : onglet Système, cadre Authentification, visible au niveau débutant', () => {
    const r = reglageParId(CIBLE_CADRE_AUTHENTIFICATION.reglage!);
    expect(r).toBeDefined();
    const lieu = lieuDuReglage(r!);
    expect(lieu.tab.id).toBe(CIBLE_CADRE_AUTHENTIFICATION.tab);
    expect(lieu.section.id).toBe(CIBLE_CADRE_AUTHENTIFICATION.section);
    expect(masqueAuNiveau(r!, 'beginner')).toBe(false);
  });

  it('le libellé du bouton existe dans les vingt langues', () => {
    expect(ONZE_LANGUES.length).toBe(20);
    for (const l of ONZE_LANGUES) {
      expect(String(dictionnaire(l)['machineAction.openAuthSettings'] ?? '').trim(), l).not.toBe('');
    }
  });
});
