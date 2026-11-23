// @vitest-environment jsdom
//
// rc14 — Réglages › Système › Authentification : DÉSACTIVER l'authentification.
//
// Des utilisateurs l'activent pour mettre à jour, puis perdent leurs remotes
// (iPhone, Android), qui ne savent pas encore s'y connecter ; aucun bouton ne
// la coupait. Le serveur (`POST /auth/config {"auth_enabled": false}`) exige
// un jeton administrateur quand elle est active.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';

const mocks = vi.hoisted(() => ({
  getAuthActivation: vi.fn(),
  getAuthMe: vi.fn(),
  disableAuth: vi.fn(),
  activateAuth: vi.fn(),
  requestAuthActivationCode: vi.fn(),
}));
vi.mock('../api', async (importOriginal) => ({ ...(await importOriginal<object>()), ...mocks }));

import ActivationAuthV2 from '../../components/v2/ActivationAuthV2.svelte';
import { locale } from '../i18n';
import fr from '../locales/fr';
import { desactivationOfferte, cleDuRefusDesactivation } from '../activationAuth';

const attendre = () => new Promise((r) => setTimeout(r, 0));
const respirer = async () => { for (let i = 0; i < 8; i++) await attendre(); flushSync(); };

const ACTIVE_RESEAU = { auth_enabled: true, from_this_machine: false, code_required: false, min_password_length: 8 };
const ACTIVE_MACHINE = { ...ACTIVE_RESEAU, from_this_machine: true };
const COUPEE_RESEAU = { auth_enabled: false, from_this_machine: false, code_required: true, admin_username: 'admin', accounts: [], min_password_length: 8 };

let hote: HTMLDivElement;
let instance: Record<string, unknown> | null = null;

async function monter() {
  hote = document.createElement('div');
  document.body.append(hote);
  instance = mount(ActivationAuthV2, { target: hote });
  await respirer();
}

const bouton = () => hote.querySelector<HTMLButtonElement>('[data-desactivation-desactiver]');
const confirmer = () => hote.querySelector<HTMLButtonElement>('[data-desactivation-confirmer]');

beforeEach(() => {
  for (const fn of Object.values(mocks)) fn.mockReset();
  locale.set('fr');
});
afterEach(() => {
  if (instance) unmount(instance as any);
  instance = null;
  hote?.remove();
  document.body.innerHTML = '';
});

describe('rc14 — qui voit « Désactiver l’authentification »', () => {
  it('🔴 un compte non administrateur, hors de la machine, ne voit pas le bouton', async () => {
    mocks.getAuthActivation.mockResolvedValue(ACTIVE_RESEAU);
    mocks.getAuthMe.mockResolvedValue({ role: 'user' });
    await monter();
    expect(hote.querySelector('[data-activation-active]')).not.toBeNull();
    expect(bouton()).toBeNull();
  });

  it('sans session lisible (rôle inconnu), hors de la machine : pas de bouton', async () => {
    mocks.getAuthActivation.mockResolvedValue(ACTIVE_RESEAU);
    mocks.getAuthMe.mockResolvedValue({ error: 'unauthorized' });
    await monter();
    expect(bouton()).toBeNull();
  });

  it('🔴 un administrateur connecté le voit', async () => {
    mocks.getAuthActivation.mockResolvedValue(ACTIVE_RESEAU);
    mocks.getAuthMe.mockResolvedValue({ role: 'admin' });
    await monter();
    expect(bouton()?.textContent?.trim()).toBe(fr['authActivation.disable']);
  });

  it('depuis la machine du serveur, il est offert', async () => {
    mocks.getAuthActivation.mockResolvedValue(ACTIVE_MACHINE);
    mocks.getAuthMe.mockResolvedValue({ role: 'user' });
    await monter();
    expect(bouton()).not.toBeNull();
  });

  it('règle pure : jamais quand l’authentification est déjà coupée', () => {
    expect(desactivationOfferte({ auth_enabled: false, from_this_machine: true }, 'admin')).toBe(false);
    expect(desactivationOfferte(null, 'admin')).toBe(false);
    expect(desactivationOfferte({ auth_enabled: true, from_this_machine: false }, 'user')).toBe(false);
    expect(desactivationOfferte({ auth_enabled: true, from_this_machine: false }, 'admin')).toBe(true);
  });
});

describe('rc14 — la confirmation est obligatoire', () => {
  it('🔴 le premier clic montre la confirmation dans la page et n’envoie rien', async () => {
    mocks.getAuthActivation.mockResolvedValue(ACTIVE_RESEAU);
    mocks.getAuthMe.mockResolvedValue({ role: 'admin' });
    await monter();
    expect(hote.querySelector('[data-desactivation-confirmation]')).toBeNull();
    bouton()!.click();
    await respirer();
    expect(mocks.disableAuth).not.toHaveBeenCalled();
    const conf = hote.querySelector('[data-desactivation-confirmation]');
    expect(conf).not.toBeNull();
    expect(hote.querySelector('[data-desactivation-avertissement]')?.textContent?.trim()).toBe(
      'Tous les appareils du réseau pourront à nouveau piloter Tune sans mot de passe. Les remotes iPhone et Android se reconnectent.',
    );
    expect(confirmer()!.textContent?.trim()).toBe(fr['authActivation.confirmAndDisable']);
    // Le bouton de confirmation est DISTINCT du premier, et placé dans l'avertissement.
    expect(conf!.contains(confirmer())).toBe(true);
  });

  it('🔴 un double clic sur « Désactiver » n’envoie rien', async () => {
    mocks.getAuthActivation.mockResolvedValue(ACTIVE_RESEAU);
    mocks.getAuthMe.mockResolvedValue({ role: 'admin' });
    mocks.disableAuth.mockResolvedValue({ auth_enabled: false });
    await monter();
    const premier = bouton()!;
    premier.click();
    flushSync();
    premier.click();
    premier.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    await respirer();
    expect(mocks.disableAuth).not.toHaveBeenCalled();
    expect(hote.querySelector('[data-desactivation-confirmation]')).not.toBeNull();
  });

  it('« Annuler » referme la confirmation sans rien envoyer', async () => {
    mocks.getAuthActivation.mockResolvedValue(ACTIVE_RESEAU);
    mocks.getAuthMe.mockResolvedValue({ role: 'admin' });
    await monter();
    bouton()!.click();
    await respirer();
    hote.querySelector<HTMLButtonElement>('[data-desactivation-annuler]')!.click();
    await respirer();
    expect(hote.querySelector('[data-desactivation-confirmation]')).toBeNull();
    expect(confirmer()).toBeNull();
    expect(mocks.disableAuth).not.toHaveBeenCalled();
  });
});

describe('rc14 — la désactivation', () => {
  it('🔴 envoie la requête et l’écran suit la réponse du serveur', async () => {
    mocks.getAuthActivation
      .mockResolvedValueOnce(ACTIVE_RESEAU)
      .mockResolvedValue(COUPEE_RESEAU);
    mocks.getAuthMe.mockResolvedValue({ role: 'admin' });
    mocks.disableAuth.mockResolvedValue({ auth_enabled: false });
    await monter();
    bouton()!.click();
    await respirer();
    confirmer()!.click();
    await respirer();
    expect(mocks.disableAuth).toHaveBeenCalledTimes(1);
    expect(hote.querySelector('[data-activation-active]')).toBeNull();
    expect(bouton()).toBeNull();
    // L'écran repasse sur le flux d'activation par code.
    expect(hote.querySelector('[data-activation-code]')).not.toBeNull();
  });

  it('un refus du serveur (403) laisse l’état actif et dit pourquoi', async () => {
    mocks.getAuthActivation.mockResolvedValue(ACTIVE_RESEAU);
    mocks.getAuthMe.mockResolvedValue({ role: 'admin' });
    mocks.disableAuth.mockResolvedValue({ error: 'admin role required' });
    await monter();
    bouton()!.click();
    await respirer();
    confirmer()!.click();
    await respirer();
    expect(hote.querySelector('[data-activation-active]')).not.toBeNull();
    expect(hote.querySelector('[data-desactivation-refus]')?.textContent?.trim())
      .toBe(fr['authActivation.disableAdminRequired']);
  });

  it('🔴 sans session (401) : l’écran dit qu’il faut un compte administrateur', async () => {
    mocks.getAuthActivation.mockResolvedValue(ACTIVE_MACHINE);
    mocks.getAuthMe.mockResolvedValue({ error: 'authentication required' });
    mocks.disableAuth.mockResolvedValue({ error: 'authentication_required' });
    await monter();
    bouton()!.click();
    await respirer();
    confirmer()!.click();
    await respirer();
    expect(hote.querySelector('[data-activation-active]')).not.toBeNull();
    expect(hote.querySelector('[data-desactivation-refus]')?.textContent?.trim())
      .toBe(fr['authActivation.disableAdminRequired']);
  });

  it('clé du refus : succès, refus nommé, réponse vide', () => {
    expect(cleDuRefusDesactivation({ auth_enabled: false })).toBeNull();
    expect(cleDuRefusDesactivation({ auth_enabled: true })).toBe('authActivation.disableError');
    expect(cleDuRefusDesactivation({ error: 'admin role required' })).toBe('authActivation.disableAdminRequired');
    expect(cleDuRefusDesactivation(undefined)).toBe('authActivation.disableError');
  });
});

describe('rc14 — `disableAuth` : la bonne requête', () => {
  it('🔴 POST /auth/config {"auth_enabled": false}, jeton administrateur', async () => {
    const reel = await vi.importActual<typeof import('../api')>('../api');
    localStorage.setItem('tune_jwt_token', 'jeton-admin');
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ auth_enabled: false }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    try {
      const r = await reel.disableAuth();
      expect(r).toEqual({ auth_enabled: false });
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
      expect(String(url)).toMatch(/\/api\/v1\/auth\/config(\?|$)/);
      expect(init.method).toBe('POST');
      expect(JSON.parse(String(init.body))).toEqual({ auth_enabled: false });
      const entetes = new Headers(init.headers as HeadersInit);
      expect(entetes.get('Authorization')).toBe('Bearer jeton-admin');
    } finally {
      vi.unstubAllGlobals();
      localStorage.removeItem('tune_jwt_token');
    }
  });
});

describe('rc14 — `disableAuth` : le 401 est un refus, pas une panne', () => {
  for (const texte of ['authentication required', 'invalid token']) {
    it(`🔴 401 en texte brut (« ${texte} ») → { error }, jeton gardé`, async () => {
      const reel = await vi.importActual<typeof import('../api')>('../api');
      localStorage.setItem('tune_jwt_token', 'jeton-perime');
      vi.stubGlobal('fetch', vi.fn(async () => new Response(texte, { status: 401 })));
      try {
        const r = await reel.disableAuth();
        expect(r).toEqual({ error: 'authentication_required' });
        expect(cleDuRefusDesactivation(r)).toBe('authActivation.disableAdminRequired');
        expect(localStorage.getItem('tune_jwt_token')).toBe('jeton-perime');
      } finally {
        vi.unstubAllGlobals();
        localStorage.removeItem('tune_jwt_token');
      }
    });
  }

  it('403 en JSON → le corps du serveur', async () => {
    const reel = await vi.importActual<typeof import('../api')>('../api');
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: 'admin role required' }), { status: 403 })));
    try {
      expect(await reel.disableAuth()).toEqual({ error: 'admin role required' });
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe('rc14 — textes de la désactivation dans les 20 langues', () => {
  const langues = import.meta.glob('../locales/*.ts', { eager: true }) as Record<string, { default: Record<string, string> }>;
  const cles = ['disable', 'disableConfirm', 'confirmAndDisable', 'disabled', 'disableAdminRequired', 'disableError'];
  it('chaque dictionnaire porte les six clés, sans double encodage', () => {
    const dicos = Object.entries(langues).filter(([p]) => !p.endsWith('/index.ts'));
    expect(dicos.length).toBe(20);
    for (const [p, mod] of dicos) {
      for (const k of cles) {
        const v = mod.default[`authActivation.${k}`];
        expect(v, `${p} authActivation.${k}`).toBeTruthy();
        expect(v, `${p} authActivation.${k}`).not.toMatch(/Ã©|Ã¨|Ã |â€/);
      }
    }
  });
});
