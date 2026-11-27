// @vitest-environment jsdom
//
// rc14 — revue de sécurité de la session renouvelée. Sur un ordinateur
// partagé, une session ne doit pas durer sans fin :
//   - « Rester connecté » est une CASE, DÉCOCHÉE par défaut ; décochée, la
//     connexion n'envoie pas `remember` (24 h, comme avant) ;
//   - « Se déconnecter de ce serveur », dans le menu de l'avatar, envoie
//     `POST /auth/logout {refresh_token}` puis efface les jetons.
//
// 🔴 Ce témoin MONTE les composants et clique : une garde de texte serait
// verte sur un bouton jamais branché.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import LoginView from '../../components/partages/LoginView.svelte';
import AvatarMenu from '../../components/v2/AvatarMenu.svelte';
import { locale } from '../i18n';
import { preferences } from '../stores/preferences';
import { getRefreshToken, getToken, setToken } from '../auth';
import { dictionnaire } from './onzeDictionnaires';

vi.setConfig({ testTimeout: 30_000 });

class ObservateurInerte { observe() {} unobserve() {} disconnect() {} }

const fr = dictionnaire('fr');
let hote: HTMLDivElement | null = null;
let monte: Record<string, unknown> | null = null;
let appels: { url: string; method: string; corps: unknown; auth: string | null }[] = [];

const souffler = async (n = 8) => {
  for (let i = 0; i < n; i++) { await new Promise((r) => setTimeout(r, 0)); flushSync(); }
};

function reponse(status: number, corps: unknown): Response {
  return new Response(JSON.stringify(corps), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** Un JWT non signé qui expire dans une heure. */
function jwt(): string {
  const b64 = (o: object) => btoa(JSON.stringify(o)).replace(/=+$/, '');
  return `${b64({ alg: 'HS256' })}.${b64({ exp: Math.floor(Date.now() / 1000) + 3600 })}.sig`;
}

beforeEach(() => {
  localStorage.clear();
  locale.set('fr');
  appels = [];
  preferences.update((p) => ({ ...p, settingsLevel: 'expert' }));
  vi.stubGlobal('ResizeObserver', ObservateurInerte);
  vi.stubGlobal('IntersectionObserver', ObservateurInerte);
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    const method = (init?.method ?? 'GET').toUpperCase();
    const entetes = new Headers(init?.headers);
    let corps: unknown = null;
    try { corps = init?.body ? JSON.parse(String(init.body)) : null; } catch { corps = init?.body; }
    appels.push({ url, method, corps, auth: entetes.get('Authorization') });
    if (url.includes('/auth/login')) {
      return reponse(200, { token: jwt(), refresh_token: 'tune_rt_neuf', expires_in: 86400 });
    }
    if (url.includes('/auth/logout')) return reponse(200, { ok: true });
    if (url.includes('/cloud/sso/status')) return reponse(200, { configured: false, connected: false });
    if (url.includes('/auth/activation')) return reponse(404, { error: 'not_found' });
    return reponse(200, []);
  }));
  hote = document.createElement('div');
  document.body.appendChild(hote);
});

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  hote?.remove();
  hote = null;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function seConnecter(cocher: boolean) {
  monte = mount(LoginView, { target: hote! });
  await souffler();
  const case_ = hote!.querySelector<HTMLInputElement>('[data-login-rester-connecte]');
  expect(case_, 'la case « Rester connecté »').toBeTruthy();
  expect(case_!.checked, 'décochée par défaut').toBe(false);
  expect(hote!.textContent).toContain(fr['login.staySignedIn']);
  if (cocher) {
    case_!.click();
    flushSync();
  }
  const champs = hote!.querySelectorAll<HTMLInputElement>('input.login-input');
  champs[0].value = 'ana';
  champs[0].dispatchEvent(new Event('input'));
  champs[1].value = 'mot-de-passe';
  champs[1].dispatchEvent(new Event('input'));
  flushSync();
  hote!.querySelector<HTMLFormElement>('form.login-form')!.requestSubmit();
  await souffler();
  return appels.find((a) => a.url.includes('/auth/login'))!;
}

describe('« Rester connecté » (rc14)', () => {
  it('décochée : la connexion n’envoie pas `remember`', async () => {
    const login = await seConnecter(false);
    expect(login.corps).toEqual({ username: 'ana', password: 'mot-de-passe' });
  });

  it('cochée : `remember: true`, et le jeton de renouvellement est rangé', async () => {
    const login = await seConnecter(true);
    expect(login.corps).toEqual({ username: 'ana', password: 'mot-de-passe', remember: true });
    expect(getRefreshToken()).toBe('tune_rt_neuf');
  });
});

describe('« Se déconnecter de ce serveur » (rc14)', () => {
  it('révoque la session côté serveur, puis efface les jetons', async () => {
    setToken(jwt(), 'tune_rt_a_revoquer');
    monte = mount(AvatarMenu, { target: hote! });
    await souffler();
    hote!.querySelector<HTMLButtonElement>('button.avatar')!.click();
    await souffler();
    const b = hote!.querySelector<HTMLButtonElement>('[data-avatar-deconnexion]');
    expect(b, 'l’entrée du menu de l’avatar').toBeTruthy();
    expect(b!.textContent).toContain(fr['login.signOutOfServer']);
    b!.click();
    await souffler();
    const logout = appels.find((a) => a.url.includes('/auth/logout'));
    expect(logout?.method).toBe('POST');
    expect(logout?.corps).toEqual({ refresh_token: 'tune_rt_a_revoquer' });
    expect(logout?.auth).toMatch(/^Bearer /);
    expect(getToken()).toBeNull();
    expect(getRefreshToken()).toBeNull();
  });

  it('sans session ouverte, l’entrée n’apparaît pas', async () => {
    monte = mount(AvatarMenu, { target: hote! });
    await souffler();
    hote!.querySelector<HTMLButtonElement>('button.avatar')!.click();
    await souffler();
    expect(hote!.querySelector('[data-avatar-deconnexion]')).toBeNull();
  });
});
