// @vitest-environment jsdom
//
// rc14 — « Mot de passe oublié ? » sur l'écran de connexion (PR serveur #9564).
//
// Ce témoin MONTE l'écran et lit le DOM :
//   1. le lien est visible sous « Se connecter » ;
//   2. hors machine du serveur (`from_this_machine` faux), le formulaire est
//      masqué, la commande et l'avertissement restent ;
//   3. les erreurs du serveur ont chacune leur message ;
//   4. un 200 connecte (jeton gardé, accueil) et le mot de passe n'est ni
//      journalisé ni resté dans le DOM.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import LoginView from '../../components/partages/LoginView.svelte';
import { messageErreurReinitialisation } from '../erreurConnexion';
import { locale } from '../i18n';
import { activeView } from '../stores/navigation';
import fr from '../locales/fr';
import de from '../locales/de';
import en from '../locales/en';
import es from '../locales/es';
import el from '../locales/el';
import hu from '../locales/hu';
import it_ from '../locales/it';
import ja from '../locales/ja';
import ko from '../locales/ko';
import nb from '../locales/nb';
import nl from '../locales/nl';
import pl from '../locales/pl';
import ro from '../locales/ro';
import ru from '../locales/ru';
import sv from '../locales/sv';
import tr from '../locales/tr';
import uk from '../locales/uk';
import vi_ from '../locales/vi';
import zh from '../locales/zh';
import zhHant from '../locales/zh-Hant';
import { get } from 'svelte/store';

const LANGUES: Record<string, Record<string, string>> = {
  de, el, en, es, fr, hu, it: it_, ja, ko, nb, nl, pl, ro, ru, sv, tr, uk, vi: vi_, zh, 'zh-Hant': zhHant,
} as unknown as Record<string, Record<string, string>>;
const FR = fr as unknown as Record<string, string>;
const tr_ = (cle: string) => FR[cle] ?? cle;

const CLES = [
  'forgotPassword', 'resetTitle', 'resetIntro', 'resetHowWindows', 'resetHowMac', 'resetHowLinux',
  'resetHowDocker', 'resetHowTuneOs', 'resetCodePlaceholder', 'resetNewPassword',
  'resetConfirmPassword', 'resetSubmit', 'resetSubmitting', 'resetNotLocal', 'resetDone',
  'resetCodeInvalid', 'resetAttemptsExceeded', 'resetCodeExpired', 'resetPasswordTooShort',
  'resetMismatch', 'resetBack',
].map((k) => `login.${k}`);

function reponse(status: number, corps: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: String(status),
    headers: { get: () => null },
    json: async () => corps,
    text: async () => JSON.stringify(corps),
  } as unknown as Response;
}

let hote: HTMLDivElement | null = null;
let monte: Record<string, any> | null = null;
let appels: { url: string; init?: RequestInit }[] = [];

async function attendre() {
  for (let i = 0; i < 5; i++) await Promise.resolve();
  await new Promise((r) => setTimeout(r, 0));
  flushSync();
}

async function monter(depuisMachine: boolean | 'panne', suite?: (url: string, init?: RequestInit) => Response) {
  appels = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    appels.push({ url: String(url), init });
    if (String(url).endsWith('/auth/activation')) {
      if (depuisMachine === 'panne') throw new Error('réseau');
      return reponse(200, { auth_enabled: true, from_this_machine: depuisMachine, code_required: false });
    }
    return suite ? suite(String(url), init) : reponse(404, {});
  }));
  locale.set('fr');
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(LoginView, { target: hote, props: {} });
  flushSync();
  await attendre();
  return hote;
}

function ouvrirOublie(h: HTMLElement) {
  h.querySelector<HTMLButtonElement>('[data-login-oublie]')!.click();
  flushSync();
}

function saisir(h: HTMLElement, sel: string, valeur: string) {
  const c = h.querySelector<HTMLInputElement>(sel)!;
  c.value = valeur;
  c.dispatchEvent(new Event('input', { bubbles: true }));
  flushSync();
}

beforeEach(() => {
  try { localStorage.clear(); } catch {}
  activeView.set('settings' as any);
});

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  hote?.remove();
  hote = null;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('mot de passe oublié — le lien', () => {
  it('🔴 « Mot de passe oublié ? » est visible sous « Se connecter »', async () => {
    const h = await monter(true);
    const lien = h.querySelector<HTMLElement>('[data-login-oublie]');
    expect(lien, 'lien absent').toBeTruthy();
    expect(lien!.textContent?.trim()).toBe('Mot de passe oublié ?');
    const bouton = h.querySelector('button[type="submit"]')!;
    expect(bouton.compareDocumentPosition(lien!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('le lien ouvre le mode réinitialisation, « Retour » revient à la connexion', async () => {
    const h = await monter(true);
    ouvrirOublie(h);
    expect(h.querySelector('h2')!.textContent).toBe('Mot de passe administrateur oublié');
    expect(h.querySelector('[data-login-identifiant]')).toBeNull();
    h.querySelector<HTMLButtonElement>('[data-reset-retour]')!.click();
    flushSync();
    expect(h.querySelector('[data-login-identifiant]')).toBeTruthy();
  });

  it.each(Object.keys(LANGUES))('🔴 les %s clés sont traduites (pas de repli sur le français)', (code) => {
    for (const cle of CLES) {
      const v = LANGUES[code][cle];
      expect(v, `${code} : ${cle}`).toBeTruthy();
      expect(v).not.toMatch(/Ã/);
    }
    expect(LANGUES[code]['login.resetCodeInvalid']).toContain('{remaining}');
    if (code !== 'fr') expect(LANGUES[code]['login.resetTitle']).not.toBe(FR['login.resetTitle']);
  });
});

describe('mot de passe oublié — hors machine du serveur', () => {
  it('🔴 le formulaire est masqué, l’avertissement et les commandes restent', async () => {
    const h = await monter(false);
    ouvrirOublie(h);
    expect(h.querySelector('[data-reset-formulaire]'), 'formulaire affiché hors machine').toBeNull();
    expect(h.querySelector('[data-reset-code]')).toBeNull();
    expect(h.querySelector('[data-reset-hors-machine]')!.textContent).toContain('machine du serveur');
    expect(h.querySelector('[data-reset-commande="mac"]')!.textContent).toBe('tune-server --reinitialiser-admin');
  });

  it('serveur injoignable : même repli prudent, sans erreur', async () => {
    const h = await monter('panne');
    ouvrirOublie(h);
    expect(h.querySelector('[data-reset-formulaire]')).toBeNull();
    expect(h.querySelector('[data-reset-hors-machine]')).toBeTruthy();
  });

  it('les cinq systèmes donnent la commande du guide', async () => {
    const h = await monter(false);
    ouvrirOublie(h);
    expect(h.querySelectorAll('[data-reset-systemes] details').length).toBe(5);
    expect(h.querySelector('[data-reset-commande="docker"]')!.textContent)
      .toBe('docker exec -it -u tune tune /app/tune-server --reinitialiser-admin --mot-de-passe-stdin');
    expect(h.querySelector('[data-reset-commande="tuneos"]')!.textContent)
      .toBe("sudo sh -c 'cd /opt/tune && TUNE_DATA_DIR=/opt/tune/data ./tune-server --reinitialiser-admin --mot-de-passe-stdin'");
    expect(h.querySelector('[data-reset-commande="linux"]')!.textContent)
      .toBe("sudo -u tune sh -c 'cd /var/lib/tune && set -a && . /etc/default/tune-server && exec /opt/tune/tune-server --reinitialiser-admin'");
    expect(h.textContent).toContain('Mot de passe administrateur oublie');
  });

  it('en anglais, les commandes portent --reset-admin', async () => {
    const h = await monter(false);
    locale.set('en');
    flushSync();
    ouvrirOublie(h);
    expect(h.querySelector('[data-reset-commande="docker"]')!.textContent)
      .toBe('docker exec -it -u tune tune /app/tune-server --reset-admin --password-stdin');
  });
});

describe('mot de passe oublié — correspondance des erreurs', () => {
  const cas: [number, unknown, string][] = [
    [403, { error: 'reset_not_local' }, FR['login.resetNotLocal']],
    [403, { error: 'not_available_remotely' }, FR['login.resetNotLocal']],
    [403, { error: 'reset_code_invalid', remaining_attempts: 3 }, 'Code incorrect. Essais restants : 3.'],
    [403, { error: 'reset_code_invalid', remaining_attempts: 0 }, 'Code incorrect. Essais restants : 0.'],
    [429, { error: 'reset_attempts_exceeded' }, FR['login.resetAttemptsExceeded']],
    [410, { error: 'reset_code_expired' }, FR['login.resetCodeExpired']],
    [400, { error: 'password_too_short' }, FR['login.resetPasswordTooShort']],
  ];
  it.each(cas)('%i %j', (status, corps, attendu) => {
    expect(messageErreurReinitialisation(status, corps, tr_)).toBe(attendu);
  });

  it('un code inconnu retombe sur le texte du serveur, puis sur « Erreur {status} »', () => {
    expect(messageErreurReinitialisation(500, { error: 'boom' }, tr_)).toBe('boom');
    expect(messageErreurReinitialisation(502, null, tr_)).toBe('Erreur 502');
  });

  it('🔴 à l’écran : un mauvais code affiche les essais restants', async () => {
    const h = await monter(true, () => reponse(403, { error: 'reset_code_invalid', remaining_attempts: 4 }));
    ouvrirOublie(h);
    saisir(h, '[data-reset-code]', 'abcd-efgh');
    saisir(h, '[data-reset-mot-de-passe]', 'nouveau-mdp-1');
    saisir(h, '[data-reset-confirmation]', 'nouveau-mdp-1');
    h.querySelector<HTMLFormElement>('[data-reset-formulaire]')!.requestSubmit();
    await attendre();
    expect(h.querySelector('[data-login-erreur]')!.textContent).toBe('Code incorrect. Essais restants : 4.');
    expect(localStorage.getItem('tune_token')).toBeNull();
  });
});

describe('mot de passe oublié — contrôles locaux', () => {
  it('mot de passe trop court ou confirmation différente : rien n’est envoyé', async () => {
    const h = await monter(true);
    ouvrirOublie(h);
    saisir(h, '[data-reset-code]', 'ABCD');
    saisir(h, '[data-reset-mot-de-passe]', 'court');
    saisir(h, '[data-reset-confirmation]', 'court');
    h.querySelector<HTMLFormElement>('[data-reset-formulaire]')!.requestSubmit();
    await attendre();
    expect(h.querySelector('[data-login-erreur]')!.textContent).toBe(FR['login.resetPasswordTooShort']);
    saisir(h, '[data-reset-mot-de-passe]', 'assez-long-1');
    saisir(h, '[data-reset-confirmation]', 'assez-long-2');
    h.querySelector<HTMLFormElement>('[data-reset-formulaire]')!.requestSubmit();
    await attendre();
    expect(h.querySelector('[data-login-erreur]')!.textContent).toBe(FR['login.resetMismatch']);
    expect(appels.some((a) => a.url.endsWith('/auth/admin/reinitialiser'))).toBe(false);
  });
});

describe('mot de passe oublié — succès', () => {
  it('🔴 un 200 connecte : jeton gardé, accueil, mot de passe ni journalisé ni resté', async () => {
    const journal = [vi.spyOn(console, 'log'), vi.spyOn(console, 'info'), vi.spyOn(console, 'warn'), vi.spyOn(console, 'error'), vi.spyOn(console, 'debug')];
    const h = await monter(true, () => reponse(200, { token: 'jeton-neuf', success: true }));
    ouvrirOublie(h);
    saisir(h, '[data-reset-code]', 'abcd-efgh');
    expect(h.querySelector<HTMLInputElement>('[data-reset-code]')!.value).toBe('ABCD-EFGH');
    saisir(h, '[data-reset-mot-de-passe]', 'SecretTresLong-42');
    saisir(h, '[data-reset-confirmation]', 'SecretTresLong-42');
    h.querySelector<HTMLFormElement>('[data-reset-formulaire]')!.requestSubmit();
    await attendre();

    const appel = appels.find((a) => a.url.endsWith('/auth/admin/reinitialiser'))!;
    expect(appel.init!.method).toBe('POST');
    expect(JSON.parse(String(appel.init!.body))).toEqual({
      code: 'ABCD-EFGH',
      nouveau_mot_de_passe: 'SecretTresLong-42',
    });
    expect(localStorage.getItem('tune_token')).toBe('jeton-neuf');
    expect(get(activeView)).toBe('home');
    // Le mot de passe n'est ni journalisé…
    for (const espion of journal) {
      expect(JSON.stringify(espion.mock.calls)).not.toContain('SecretTresLong-42');
    }
    // … ni stocké, ni resté dans le DOM.
    expect(JSON.stringify({ ...localStorage })).not.toContain('SecretTresLong-42');
    expect(h.querySelector<HTMLInputElement>('[data-reset-mot-de-passe]')?.value ?? '').toBe('');
  });
});
