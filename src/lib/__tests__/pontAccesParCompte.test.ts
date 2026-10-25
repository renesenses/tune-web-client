// @vitest-environment jsdom
/**
 * Le jeton de session (accès par compte, rc8) prend la place du jeton du pont
 * dans `bridge.ts`, sans rien casser du chemin hérité.
 *
 * Coexistence : tant qu'aucune session n'est ouverte, c'est l'ancien jeton
 * (`#token=`) qui part, exactement comme avant. Les bancs historiques
 * (`bridge.test.ts`, `pontConnexionLogo.test.ts`, `pontJetonUrl.test.ts`,
 * `pontZoneNavigateur.test.ts`) tournent sans modification.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  brancherAccesParCompte,
  entetesRelais,
  fermetureWebSocketRelais,
  installerIntercepteurRelais,
  jetonManquant,
  reinitialiserPourTest,
  urlFlux,
  urlNavigateur,
  urlWebSocket,
  viaRelais,
  type BranchementCompte,
} from '../bridge';
import { adresseAutorisation, decoderEtat, terminerAutorisation } from '../laissezPasser/oauth';

const UUID = '75f24b9e-fb8a-4de2-8007-99edd3454263';
const ORIGINE = 'https://bridge.mozaiklabs.fr';
const ANCIEN = 'ancien-jeton-du-pont';
const SESSION = 'jeton-de-session';

const locationOrigine = window.location;
const historyOrigine = window.history;
const fetchOrigine = window.fetch;

function pageA(pathname: string, hash = '', search = '') {
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: {
      pathname,
      hash,
      search,
      origin: ORIGINE,
      host: 'bridge.mozaiklabs.fr',
      protocol: 'https:',
      href: `${ORIGINE}${pathname}${search}${hash}`,
    },
  });
  Object.defineProperty(window, 'history', { configurable: true, value: { replaceState: vi.fn() } });
  reinitialiserPourTest();
}

function compte(p: Partial<BranchementCompte> = {}): BranchementCompte {
  return {
    jeton: () => null,
    actif: false,
    attente: () => null,
    refus: vi.fn(),
    lienObsolete: vi.fn(),
    ...p,
  };
}

function reponse(status: number, corps: unknown, entetes: Record<string, string> = {}) {
  return new Response(JSON.stringify(corps), { status, headers: { 'Content-Type': 'application/json', ...entetes } });
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

describe('jeton présenté au relais', () => {
  it('sans session ouverte (site sans clés) : l’ancien jeton, comme avant', () => {
    pageA(`/${UUID}/`, `#token=${ANCIEN}`);
    brancherAccesParCompte(compte({ actif: true }));
    expect(viaRelais()).toBe(true);
    expect(entetesRelais()).toEqual({ 'X-Bridge-Token': ANCIEN });
  });

  it('session ouverte : le jeton de session remplace l’ancien PARTOUT (en-tête, WebSocket, flux, <img>)', () => {
    pageA(`/${UUID}/`, `#token=${ANCIEN}`);
    brancherAccesParCompte(compte({ actif: true, jeton: () => SESSION }));
    expect(entetesRelais()).toEqual({ 'X-Bridge-Token': SESSION });
    expect(urlWebSocket()).toBe(`wss://bridge.mozaiklabs.fr/ws/client/${UUID}?token=${SESSION}`);
    expect(urlFlux('http://192.168.1.18:8888/stream/1.flac', `${ORIGINE}/stream/relay/${UUID}/1.flac`)).toBe(
      `${ORIGINE}/stream/relay/${UUID}/1.flac?token=${SESSION}`,
    );
    expect(urlNavigateur('/api/v1/albums/3/cover')).toBe(`${ORIGINE}/api/relay/${UUID}/albums/3/cover?token=${SESSION}`);
  });

  it('compte relié sans ancien lien : le mode distant est actif, il ne « manque » pas de jeton', () => {
    pageA(`/${UUID}/`);
    brancherAccesParCompte(compte({ actif: true }));
    expect(viaRelais()).toBe(true);
    expect(jetonManquant()).toBe(false);
    expect(entetesRelais()).toEqual({});
  });

  it('ni lien ni compte : inchangé (pas de mode distant, jeton manquant)', () => {
    pageA(`/${UUID}/`);
    brancherAccesParCompte(compte());
    expect(viaRelais()).toBe(false);
    expect(jetonManquant()).toBe(true);
  });
});

describe('intercepteur', () => {
  it('attend l’ouverture de la session, puis envoie le jeton de session', async () => {
    pageA(`/${UUID}/`);
    let jeton: string | null = null;
    let liberer!: () => void;
    const attente = new Promise<void>((r) => (liberer = r));
    let enAttente: Promise<void> | null = attente;
    brancherAccesParCompte(compte({ actif: true, jeton: () => jeton, attente: () => enAttente }));
    const espion = vi.fn(async (..._a: unknown[]) => reponse(200, {}));
    window.fetch = espion as unknown as typeof fetch;
    expect(installerIntercepteurRelais()).toBe(true);

    const p = fetch('/api/v1/system/config');
    await new Promise((r) => setTimeout(r, 0));
    expect(espion).not.toHaveBeenCalled();
    jeton = SESSION;
    enAttente = null;
    liberer();
    await p;
    const [url, init] = espion.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${ORIGINE}/api/relay/${UUID}/system/config`);
    expect(new Headers(init.headers).get('X-Bridge-Token')).toBe(SESSION);
  });

  it('lit le jeton À CHAQUE requête (session ouverte après l’installation)', async () => {
    pageA(`/${UUID}/`, `#token=${ANCIEN}`);
    let jeton: string | null = null;
    brancherAccesParCompte(compte({ actif: true, jeton: () => jeton }));
    const espion = vi.fn(async (..._a: unknown[]) => reponse(200, {}));
    window.fetch = espion as unknown as typeof fetch;
    installerIntercepteurRelais();
    await fetch('/api/v1/a');
    jeton = SESSION;
    await fetch('/api/v1/b');
    const jetons = espion.mock.calls.map((c) => new Headers((c[1] as RequestInit).headers).get('X-Bridge-Token'));
    expect(jetons).toEqual([ANCIEN, SESSION]);
  });

  it('signale l’avertissement `lien-obsolete` et les refus de session du relais', async () => {
    pageA(`/${UUID}/`, `#token=${ANCIEN}`);
    const b = compte();
    brancherAccesParCompte(b);
    const reponses = [
      reponse(200, {}, { 'X-Tune-Avertissement': 'lien-obsolete' }),
      reponse(401, { code: 'session_coupee', motif: 'ecoute_reprise_ailleurs', appareil: 'iPad' }),
      reponse(401, { detail: 'Session Tune expirée' }),
    ];
    window.fetch = vi.fn(async () => reponses.shift()!) as unknown as typeof fetch;
    installerIntercepteurRelais();
    await fetch('/api/v1/a');
    expect(b.lienObsolete).toHaveBeenCalledTimes(1);
    await fetch('/api/v1/b');
    await vi.waitFor(() => expect(b.refus).toHaveBeenCalledWith({ code: 'session_coupee', motif: 'ecoute_reprise_ailleurs', appareil: 'iPad' }));
    // Un 401 du SERVEUR Tune (compte local) n'est pas un refus du relais.
    await fetch('/api/v1/c');
    await new Promise((r) => setTimeout(r, 0));
    expect(b.refus).toHaveBeenCalledTimes(1);
  });

  it('WebSocket fermé en 4001 : la raison JSON part vers la session', () => {
    pageA(`/${UUID}/`);
    const b = compte({ actif: true });
    brancherAccesParCompte(b);
    expect(fermetureWebSocketRelais(4001, '{"code":"session_coupee","motif":"revoquee"}')).toBe(true);
    expect(b.refus).toHaveBeenCalledWith({ code: 'session_coupee', motif: 'revoquee' });
    expect(fermetureWebSocketRelais(1006, '')).toBe(false);
  });
});

describe('OAuth PKCE, client `tune-web-pont`', () => {
  it('adresse de retour FIXE, server_id dans `state`, PKCE S256 ; le retour échange le code', async () => {
    pageA(`/${UUID}/`);
    const url = new URL(await adresseAutorisation(UUID, ORIGINE, sessionStorage));
    expect(url.origin + url.pathname).toBe('https://mozaiklabs.fr/oauth/authorize');
    expect(url.searchParams.get('client_id')).toBe('tune-web-pont');
    expect(url.searchParams.get('redirect_uri')).toBe('https://bridge.mozaiklabs.fr/oauth/retour');
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    const state = url.searchParams.get('state')!;
    expect(decoderEtat(state)?.sid).toBe(UUID);

    const espion = vi.fn(async (..._a: unknown[]) => reponse(200, { access_token: 'a', refresh_token: 'r', expires_in: 100 }));
    const issue = await terminerAutorisation(`?code=c0de&state=${state}`, ORIGINE, espion as unknown as typeof fetch, () => 1000, sessionStorage);
    expect(issue).toEqual({ ok: true, serverId: UUID, jetons: { access: 'a', refresh: 'r', expire: 1100 } });
    const corps = new URLSearchParams((espion.mock.calls[0][1] as RequestInit).body as string);
    expect(corps.get('grant_type')).toBe('authorization_code');
    expect(corps.get('redirect_uri')).toBe('https://bridge.mozaiklabs.fr/oauth/retour');
    // Le vérificateur PKCE correspond au défi envoyé.
    const verif = corps.get('code_verifier')!;
    const empreinte = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verif)));
    const b64 = btoa(String.fromCharCode(...empreinte)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    expect(b64).toBe(url.searchParams.get('code_challenge'));
  });

  it('un `state` qui n’est pas le nôtre est refusé, sans échange de code', async () => {
    await adresseAutorisation(UUID, ORIGINE, sessionStorage);
    const espion = vi.fn();
    const issue = await terminerAutorisation('?code=c&state=autre', ORIGINE, espion as unknown as typeof fetch, () => 0, sessionStorage);
    expect(issue.ok).toBe(false);
    expect(espion).not.toHaveBeenCalled();
  });
});
