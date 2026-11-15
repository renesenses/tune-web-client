// @vitest-environment jsdom
//
// web#2689 — interface en anglais : des textes restaient en français.
// L'écran de connexion (`LoginView`) et l'avis PURE de l'égaliseur de
// l'écran de lecture (`NowPlayingEqPanel`) étaient écrits en dur, dans
// `components/partages/`, hors de la garde `check-francais-v2` (qui ne lit que
// `v2/`). Les témoins montent les VRAIS composants en anglais et cherchent le
// français à l'écran.
//
// Contre-épreuve : sur `origin/main`, « Se connecter », « Mot de passe »,
// « Pas encore de compte ? » et « Mode PURE actif » s'affichent en anglais.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import LoginView from '../../components/partages/LoginView.svelte';
import NowPlayingEqPanel from '../../components/partages/NowPlayingEqPanel.svelte';
import { locale } from '../i18n';

vi.setConfig({ testTimeout: 60_000 });

const FRANCAIS = /Se connecter|Mot de passe|Pas encore de compte|Deja un compte|Déjà un compte|Creer un compte|Nom d'utilisateur|Email ou identifiant|Connexion avec|Mode PURE actif|préréglages ci-dessous|\bou\b/;

let hote: HTMLDivElement | null = null;
let monte: Record<string, unknown> | null = null;

function monter(c: unknown, props: Record<string, unknown>): HTMLDivElement {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(c as never, { target: hote, props: props as never }) as Record<string, unknown>;
  flushSync();
  return hote;
}

/** Le texte visible ET les textes indicatifs des champs. */
function toutLeTexte(h: HTMLElement): string {
  const indices = [...h.querySelectorAll('input')].map((i) => i.getAttribute('placeholder') ?? '');
  return `${h.textContent ?? ''} ${indices.join(' ')}`;
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({}), text: async () => '{}' })));
  locale.set('en');
});
afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  hote?.remove();
  hote = null;
  locale.set('fr');
  vi.unstubAllGlobals();
});

describe('web#2689 — aucun français dans l’interface anglaise', () => {
  it('🔴 écran de connexion', () => {
    const h = monter(LoginView, {});
    const texte = toutLeTexte(h);
    expect(texte).not.toMatch(FRANCAIS);
    expect(texte).toContain('Sign in');
    expect(texte).toContain('Password');
  });

  it('🔴 écran de création de compte', () => {
    const h = monter(LoginView, {});
    const lien = [...h.querySelectorAll<HTMLButtonElement>('.login-link')].find((b) => /account/i.test(b.textContent ?? ''));
    expect(lien, 'lien « Create account » absent').toBeTruthy();
    lien!.click();
    flushSync();
    const texte = toutLeTexte(h);
    expect(texte).not.toMatch(FRANCAIS);
    expect(texte).toContain('Username');
  });

  it('🔴 avis PURE de l’égaliseur de l’écran de lecture', () => {
    const h = monter(NowPlayingEqPanel, { current: '', onSelect: () => {}, pureMode: true });
    const avis = h.querySelector('.eq-pure-notice');
    expect(avis, 'avis PURE absent — témoin sans objet').not.toBeNull();
    expect(avis!.textContent ?? '').not.toMatch(FRANCAIS);
    expect(avis!.textContent ?? '').toContain('PURE mode is on');
  });

  it('en français, les textes restent français', () => {
    locale.set('fr');
    const h = monter(LoginView, {});
    expect(toutLeTexte(h)).toContain('Se connecter');
  });
});
