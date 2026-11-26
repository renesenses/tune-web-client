// @vitest-environment jsdom
//
// rc14 — la session renouvelée tant qu'elle sert (tune-server-rust,
// `POST /auth/refresh`). Le jeton d'accès dure 24 h ; le jeton de
// renouvellement (30 jours glissants) le remplace avant l'échéance et sur un
// 401. L'écran de connexion n'apparaît que si le serveur refuse la session.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';

import {
  AVANCE_RENOUVELLEMENT_MS,
  clearToken,
  echeanceDuJeton,
  getRefreshToken,
  getToken,
  renouvelerLaSession,
  setToken,
} from '../auth';
import { sessionExpiree } from '../stores/sessionExpiree';

/** Un JWT (non signé : le client ne vérifie pas) qui expire dans `dansMs`. */
function jwt(dansMs: number, marque = 'a'): string {
  const b64 = (o: object) =>
    btoa(JSON.stringify(o)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `${b64({ alg: 'HS256' })}.${b64({ exp: Math.floor((Date.now() + dansMs) / 1000), marque })}.sig`;
}

function reponse(statut: number, corps: unknown): Response {
  return new Response(JSON.stringify(corps), {
    status: statut,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('session renouvelée (rc14)', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionExpiree.set(false);
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('lit l’échéance dans le jeton', () => {
    const t = jwt(3_600_000);
    const e = echeanceDuJeton(t)!;
    expect(Math.abs(e - (Date.now() + 3_600_000))).toBeLessThan(2000);
    expect(echeanceDuJeton('pas-un-jwt')).toBeNull();
  });

  it('un 401 avec jeton de renouvellement renouvelle au lieu de déconnecter', async () => {
    setToken(jwt(1000), 'tune_rt_1');
    const nouveau = jwt(86_400_000, 'b');
    const appel = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(reponse(200, { token: nouveau, refresh_token: 'tune_rt_2' }));
    clearToken();
    await renouvelerLaSession();
    expect(appel).toHaveBeenCalledTimes(1);
    const [url, init] = appel.mock.calls[0];
    expect(String(url)).toMatch(/\/auth\/refresh$/);
    expect(JSON.parse(String((init as RequestInit).body))).toEqual({ refresh_token: 'tune_rt_1' });
    expect(getToken()).toBe(nouveau);
    expect(getRefreshToken()).toBe('tune_rt_2');
    expect(get(sessionExpiree)).toBe(false);
  });

  it('un renouvellement refusé ramène à l’écran de connexion', async () => {
    setToken(jwt(1000), 'tune_rt_1');
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      reponse(401, { code: 'refresh_token_revoked' }),
    );
    clearToken();
    await renouvelerLaSession();
    await Promise.resolve();
    expect(getToken()).toBeNull();
    expect(getRefreshToken()).toBeNull();
    expect(get(sessionExpiree)).toBe(true);
  });

  it('sans jeton de renouvellement (serveur antérieur), rien ne change', () => {
    const appel = vi.spyOn(globalThis, 'fetch');
    setToken(jwt(1000));
    clearToken();
    expect(appel).not.toHaveBeenCalled();
    expect(getToken()).toBeNull();
    expect(get(sessionExpiree)).toBe(true);
  });

  it('plusieurs 401 simultanés : une seule requête de renouvellement', async () => {
    setToken(jwt(1000), 'tune_rt_1');
    const appel = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(reponse(200, { token: jwt(86_400_000), refresh_token: 'tune_rt_2' }));
    clearToken();
    clearToken();
    clearToken();
    await renouvelerLaSession();
    expect(appel).toHaveBeenCalledTimes(1);
  });

  it('409 : un autre onglet a déjà tourné le jeton, on reprend le sien', async () => {
    setToken(jwt(1000), 'tune_rt_1');
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      // L'autre onglet range son nouveau jeton pendant ce temps.
      localStorage.setItem('tune_refresh_token', 'tune_rt_autre_onglet');
      return reponse(409, { code: 'refresh_token_already_rotated' });
    });
    expect(await renouvelerLaSession()).toBe('renouvelee');
    expect(get(sessionExpiree)).toBe(false);
  });

  it('une panne réseau ne déconnecte pas', async () => {
    setToken(jwt(1000), 'tune_rt_1');
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'));
    expect(await renouvelerLaSession()).toBe('differee');
    expect(getRefreshToken()).toBe('tune_rt_1');
    expect(get(sessionExpiree)).toBe(false);
  });

  it('renouvelle tout seul cinq minutes avant l’échéance', async () => {
    vi.useFakeTimers();
    const appel = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(reponse(200, { token: jwt(86_400_000), refresh_token: 'tune_rt_2' }));
    setToken(jwt(AVANCE_RENOUVELLEMENT_MS + 60_000), 'tune_rt_1');
    await vi.advanceTimersByTimeAsync(50_000);
    expect(appel).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(15_000);
    expect(appel).toHaveBeenCalledTimes(1);
    expect(getRefreshToken()).toBe('tune_rt_2');
  });
});
