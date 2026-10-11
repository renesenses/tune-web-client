import { describe, it, expect, vi } from 'vitest';
/**
 * Rôle maître / agent (tune-server-rust#4626) : ce que l'écran d'appairage
 * envoie au serveur, et la lecture du code saisi.
 */
vi.stubGlobal('window', { location: { protocol: 'http:', host: 'localhost:8888' } });
vi.mock('../auth', () => ({ getToken: () => null, clearToken: () => {} }));
vi.mock('../stores/notifications', () => ({
  notifications: { error: vi.fn(), success: vi.fn(), info: vi.fn() },
}));
const api = await import('../api');

function repond(corps: unknown, status = 200) {
  const texte = corps === undefined ? '' : JSON.stringify(corps);
  const f = vi.fn().mockResolvedValue({
    ok: status < 400,
    status,
    headers: new Headers(texte ? { 'content-type': 'application/json' } : {}),
    text: async () => texte,
    json: async () => JSON.parse(texte),
  });
  vi.stubGlobal('fetch', f);
  return f;
}

describe('appairage maître / agent', () => {
  it("appairer envoie l'hôte, le port et le code au serveur maître", async () => {
    const f = repond({ agent: { agent_id: 'a' }, zones: [] }, 201);
    await api.appairerAgentTune('192.0.2.7', 8888, '123456');
    const [url, init] = f.mock.calls[0];
    expect(url).toBe('/api/v1/agent-tune/agents');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({ host: '192.0.2.7', port: 8888, code: '123456' });
  });

  it('émettre un code est un POST sur la route de l’agent', async () => {
    const f = repond({ code: '000123', expire_dans_s: 300 });
    const r = await api.emettreCodeAgent();
    expect(f.mock.calls[0][0]).toBe('/api/v1/agent-tune/agent/code');
    expect(f.mock.calls[0][1].method).toBe('POST');
    expect(r.code).toBe('000123');
  });

  it('oublier un agent encode son identifiant', async () => {
    const f = repond({ ok: true });
    await expect(api.oublierAgentTune('a/b')).resolves.toEqual({ ok: true });
    expect(f.mock.calls[0][0]).toBe('/api/v1/agent-tune/agents/a%2Fb');
    expect(f.mock.calls[0][1].method).toBe('DELETE');
  });

  it('un code se saisit avec ou sans espace, jamais avec autre chose que six chiffres', () => {
    expect(api.codeAgentRecevable('123 456')).toBe(true);
    expect(api.codeAgentRecevable('123456')).toBe(true);
    expect(api.codeAgentRecevable('12345')).toBe(false);
    expect(api.codeAgentRecevable('12a456')).toBe(false);
    expect(api.codeAgentNormalise(' 123 456 ')).toBe('123456');
    expect(api.codeAgentAffiche('012345')).toBe('012 345');
  });

  it('le compte à rebours du code ne passe jamais sous zéro', () => {
    expect(api.secondesRestantesCode(0, 300, 0)).toBe(300);
    expect(api.secondesRestantesCode(0, 300, 299_500)).toBe(1);
    expect(api.secondesRestantesCode(0, 300, 400_000)).toBe(0);
  });

  it("un serveur ancien, sans ces routes, ne casse pas l'écran", () => {
    expect(api.etatAgentTuneLisible(undefined)).toBeNull();
    expect(api.etatAgentTuneLisible({ ok: true })).toBeNull();
    const e = { agent_id: 'a', nom: 'Tune', maitres: [], sorties: [] };
    expect(api.etatAgentTuneLisible(e)).toBe(e);
  });
});
