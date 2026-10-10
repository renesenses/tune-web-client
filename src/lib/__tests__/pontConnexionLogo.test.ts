// @vitest-environment jsdom
/**
 * Essai en 5G du 09/10/2026, client 1.0.0 servi par le pont
 * (`https://bridge.mozaiklabs.fr/{server_id}/#token=…`) :
 *
 *   - « Session expirée », puis la connexion répondait « Erreur 405 » :
 *     `LoginView` postait sur `/api/v1/auth/login` en dur, c'est-à-dire la
 *     RACINE du pont, au lieu de `/api/relay/{id}/auth/login` avec
 *     `X-Bridge-Token` ;
 *   - le logo `/tune-logo.png` restait cassé : la racine du pont n'en a pas.
 *
 * Et tous les `fetch('/api/v1/…')` écrits en dur ailleurs subissaient le même
 * sort : l'intercepteur du relais les rattrape.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import LoginView from '../../components/partages/LoginView.svelte';
import {
  reinitialiserPourTest,
  installerIntercepteurRelais,
  versLeRelais,
  urlRessourcePublique,
} from '../bridge';

const UUID = '75f24b9e-fb8a-4de2-8007-99edd3454263';
const ORIGINE = 'https://bridge.mozaiklabs.fr';
const JETON = 'jeton-du-pont-123';

const locationOrigine = window.location;
const historyOrigine = window.history;
const fetchOrigine = window.fetch;

function pageA(pathname: string, hash = '') {
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: {
      pathname,
      hash,
      search: '',
      origin: ORIGINE,
      host: 'bridge.mozaiklabs.fr',
      protocol: 'https:',
      href: `${ORIGINE}${pathname}${hash}`,
    },
  });
  Object.defineProperty(window, 'history', {
    configurable: true,
    value: { replaceState: vi.fn() },
  });
  reinitialiserPourTest();
}

function reponse(status: number, corps: unknown) {
  return new Response(JSON.stringify(corps), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function entete(init: RequestInit | undefined, nom: string): string | null {
  return new Headers(init?.headers ?? undefined).get(nom);
}

beforeEach(() => {
  localStorage.clear();
  delete (window as any).__tuneIntercepteurRelais;
});

afterEach(() => {
  Object.defineProperty(window, 'location', { configurable: true, value: locationOrigine });
  Object.defineProperty(window, 'history', { configurable: true, value: historyOrigine });
  window.fetch = fetchOrigine;
  delete (window as any).__tuneIntercepteurRelais;
  reinitialiserPourTest();
  vi.restoreAllMocks();
});

describe('LoginView servie par le pont', () => {
  it('se connecte PAR LE RELAIS, avec le jeton du pont, et affiche le logo', async () => {
    pageA(`/${UUID}/`, `#token=${JETON}`);
    const espion = vi.fn(async (..._a: unknown[]) => reponse(200, { token: 'jwt-tune' }));
    window.fetch = espion as unknown as typeof fetch;

    const cible = document.createElement('div');
    document.body.appendChild(cible);
    const vue = mount(LoginView, { target: cible, props: { surCouche: true } });
    flushSync();

    const logo = cible.querySelector('img.login-logo-img') as HTMLImageElement;
    expect(logo.getAttribute('src')).toBe(`/${UUID}/tune-logo.png`);

    const [identifiant, motDePasse] = Array.from(
      cible.querySelectorAll('form.login-form input'),
    ) as HTMLInputElement[];
    identifiant.value = 'bertrand';
    identifiant.dispatchEvent(new Event('input', { bubbles: true }));
    motDePasse.value = 'secret';
    motDePasse.dispatchEvent(new Event('input', { bubbles: true }));
    flushSync();
    (cible.querySelector('form.login-form') as HTMLFormElement).dispatchEvent(
      new Event('submit', { bubbles: true, cancelable: true }),
    );
    await vi.waitFor(() => expect(espion).toHaveBeenCalled());

    const [url, init] = espion.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${ORIGINE}/api/relay/${UUID}/auth/login`);
    expect(init.method).toBe('POST');
    expect(entete(init, 'X-Bridge-Token')).toBe(JETON);
    await vi.waitFor(() => expect(localStorage.getItem('tune_jwt_token')).toBe('jwt-tune'));

    unmount(vue);
    cible.remove();
  });
});

describe('ressources publiques', () => {
  it('ancre le logo sous /{server_id}/ par le relais', () => {
    pageA(`/${UUID}/`, `#token=${JETON}`);
    expect(urlRessourcePublique('tune-logo.png')).toBe(`/${UUID}/tune-logo.png`);
    expect(urlRessourcePublique('/tune-logo.png')).toBe(`/${UUID}/tune-logo.png`);
  });

  it('reste à la base Vite servie normalement', () => {
    pageA('/library/albums');
    expect(urlRessourcePublique('tune-logo.png')).toBe('/tune-logo.png');
  });
});

describe('intercepteur du relais', () => {
  it('réécrit un /api/v1 en dur vers le relais et ajoute le jeton', async () => {
    pageA(`/${UUID}/`, `#token=${JETON}`);
    const espion = vi.fn(async (..._a: unknown[]) => reponse(200, {}));
    window.fetch = espion as unknown as typeof fetch;
    expect(installerIntercepteurRelais()).toBe(true);

    await fetch('/api/v1/system/config', { headers: { 'X-Tune-Profile': '2' } });
    const [url, init] = espion.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${ORIGINE}/api/relay/${UUID}/system/config`);
    expect(entete(init, 'X-Bridge-Token')).toBe(JETON);
    expect(entete(init, 'X-Tune-Profile')).toBe('2');
  });

  it('ajoute le jeton à un appel qui vise déjà le relais sans lui', async () => {
    pageA(`/${UUID}/`, `#token=${JETON}`);
    const espion = vi.fn(async (..._a: unknown[]) => reponse(200, {}));
    window.fetch = espion as unknown as typeof fetch;
    installerIntercepteurRelais();

    await fetch(`${ORIGINE}/api/relay/${UUID}/system/update/status`, {
      headers: { Authorization: 'Bearer jwt' },
    });
    const [url, init] = espion.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${ORIGINE}/api/relay/${UUID}/system/update/status`);
    expect(entete(init, 'X-Bridge-Token')).toBe(JETON);
    expect(entete(init, 'Authorization')).toBe('Bearer jwt');
  });

  it('laisse passer un autre domaine sans y mettre le jeton', async () => {
    pageA(`/${UUID}/`, `#token=${JETON}`);
    const espion = vi.fn(async (..._a: unknown[]) => reponse(200, {}));
    window.fetch = espion as unknown as typeof fetch;
    installerIntercepteurRelais();

    await fetch('https://mozaiklabs.fr/api/v1/version');
    const [url, init] = espion.mock.calls[0] as [string, RequestInit | undefined];
    expect(url).toBe('https://mozaiklabs.fr/api/v1/version');
    expect(entete(init, 'X-Bridge-Token')).toBeNull();
    expect(versLeRelais('https://mozaiklabs.fr/api/v1/version')).toBeNull();
  });

  it("ne s'installe PAS servie normalement", () => {
    pageA('/');
    const espion = vi.fn();
    window.fetch = espion as unknown as typeof fetch;
    expect(installerIntercepteurRelais()).toBe(false);
    expect(window.fetch).toBe(espion);
  });

  it('est importé en tout premier par main.ts', () => {
    const source = readFileSync(join(process.cwd(), 'src/main.ts'), 'utf8');
    const imports = source.split('\n').filter((l) => /^import\s/.test(l));
    expect(imports[0]).toBe("import './lib/intercepteurRelais';");
  });
});
