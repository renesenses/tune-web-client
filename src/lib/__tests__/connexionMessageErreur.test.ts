// @vitest-environment jsdom
//
// Message d'erreur de connexion (rc14).
//
// tune-server-rust répond `{"error": "invalid credentials"}` avec un 401
// (`tune-server/src/auth.rs`, `login`). `LoginView` ne lisait que `detail` ou
// `message` : l'écran n'affichait que « Erreur 401 », sans dire quoi faire.
//
// Ce témoin MONTE l'écran devant un faux serveur et soumet le formulaire.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import LoginView from '../../components/partages/LoginView.svelte';
import { locale } from '../i18n';
import { messageErreurConnexion } from '../erreurConnexion';
import lFr from '../locales/fr';

const fr = lFr as unknown as Record<string, string>;

let hote: HTMLDivElement | null = null;
let monte: Record<string, unknown> | null = null;

const respirer = () => new Promise((r) => setTimeout(r, 0));
async function souffler(n = 6) {
  for (let i = 0; i < n; i++) {
    await respirer();
    flushSync();
  }
}

function serveur(status: number, corps: unknown) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({
      ok: status >= 200 && status < 300,
      status,
      headers: new Headers({ 'Content-Type': 'application/json' }),
      json: async () => corps,
      text: async () => JSON.stringify(corps),
    }) as unknown as Response),
  );
}

async function seConnecter(identifiant: string, motDePasse: string) {
  locale.set('fr');
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(LoginView, { target: hote, props: {} });
  flushSync();
  const [champ, mdp] = [...hote.querySelectorAll<HTMLInputElement>('.login-form input')];
  champ.value = identifiant;
  champ.dispatchEvent(new Event('input', { bubbles: true }));
  mdp.value = motDePasse;
  mdp.dispatchEvent(new Event('input', { bubbles: true }));
  flushSync();
  hote.querySelector<HTMLFormElement>('.login-form')!.dispatchEvent(
    new Event('submit', { bubbles: true, cancelable: true }),
  );
  await souffler();
  return (hote.querySelector('.login-error')?.textContent ?? '').trim();
}

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  hote?.remove();
  hote = null;
  vi.unstubAllGlobals();
});

describe('connexion refusée — le message', () => {
  it('🔴 401 : « identifiant ou mot de passe incorrect », pas « Erreur 401 »', async () => {
    serveur(401, { error: 'invalid credentials' });
    const msg = await seConnecter('Admin', 'secret');
    expect(msg).toBe(fr['login.invalidCredentials']);
    expect(msg).not.toContain('401');
  });

  it('🔴 un autre refus lit `error`, le champ que le serveur renvoie', async () => {
    serveur(429, { error: 'too many login attempts, try again later' });
    const msg = await seConnecter('admin', 'secret');
    expect(msg).toBe('too many login attempts, try again later');
  });

  it('sans corps lisible, le statut reste dit', async () => {
    serveur(500, {});
    const msg = await seConnecter('admin', 'secret');
    expect(msg).toBe(fr['login.errorStatus'].replace('{status}', '500'));
  });
});

describe('messageErreurConnexion', () => {
  const tr = (cle: string) => fr[cle] ?? cle;
  it('lit `error`, puis `detail`, puis `message`', () => {
    expect(messageErreurConnexion(400, { error: 'a', detail: 'b', message: 'c' }, tr)).toBe('a');
    expect(messageErreurConnexion(400, { detail: 'b', message: 'c' }, tr)).toBe('b');
    expect(messageErreurConnexion(400, { message: 'c' }, tr)).toBe('c');
    expect(messageErreurConnexion(400, null, tr)).toBe('Erreur 400');
  });
  it('à l’inscription, un 401 n’est pas traduit en « mot de passe incorrect »', () => {
    expect(messageErreurConnexion(401, { error: 'registration disabled' }, tr, false)).toBe('registration disabled');
  });
});
