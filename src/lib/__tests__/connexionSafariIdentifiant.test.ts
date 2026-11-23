// @vitest-environment jsdom
//
// Connexion depuis Safari sur iPhone (rc14).
//
// 1. Le champ identifiant de `LoginView` n'avait ni `autocapitalize="none"`,
//    ni `autocorrect="off"`, ni `spellcheck="false"`. iOS met donc une
//    majuscule au premier caractère, et le serveur cherche l'identifiant EN
//    RESPECTANT LA CASSE : « Admin » échoue là où « admin » passe.
// 2. Le libellé disait « E-mail ou identifiant », alors que le serveur ne
//    cherche que l'identifiant (tune-server-rust, `tune-server/src/auth.rs`,
//    `login` : `SELECT … FROM profiles WHERE username = ?`). Un e-mail saisi
//    échoue toujours.
//
// Ce témoin MONTE l'écran et lit les champs rendus.
import { afterEach, describe, expect, it } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import LoginView from '../../components/partages/LoginView.svelte';
import { locale } from '../i18n';
import de from '../locales/de';
import el from '../locales/el';
import en from '../locales/en';
import es from '../locales/es';
import fr from '../locales/fr';
import hu from '../locales/hu';
import it_ from '../locales/it';
import ja from '../locales/ja';
import ko from '../locales/ko';
import nb from '../locales/nb';
import pl from '../locales/pl';
import ro from '../locales/ro';
import sv from '../locales/sv';
import tr from '../locales/tr';
import vi from '../locales/vi';
import zh from '../locales/zh';

let hote: HTMLDivElement | null = null;
let monte: Record<string, unknown> | null = null;

function monter() {
  locale.set('fr');
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(LoginView, { target: hote, props: {} });
  flushSync();
  return hote;
}

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  hote?.remove();
  hote = null;
});

describe('connexion Safari iPhone — champ identifiant', () => {
  it('🔴 ni majuscule automatique, ni correction, ni vérification orthographique', () => {
    const h = monter();
    const champ = h.querySelector<HTMLInputElement>('[data-login-identifiant]');
    expect(champ, 'le champ identifiant est rendu').toBeTruthy();
    expect(champ!.getAttribute('autocapitalize')).toBe('none');
    expect(champ!.getAttribute('autocorrect')).toBe('off');
    expect(champ!.getAttribute('spellcheck')).toBe('false');
    expect(champ!.getAttribute('autocomplete')).toBe('username');
  });

  it('le mot de passe se remplit par le trousseau (`current-password`)', () => {
    const h = monter();
    const mdp = h.querySelector<HTMLInputElement>('[data-login-mot-de-passe]');
    expect(mdp?.getAttribute('autocomplete')).toBe('current-password');
    expect(mdp?.getAttribute('type')).toBe('password');
  });

  it('🔴 le libellé dit « Identifiant », pas « E-mail »', () => {
    const h = monter();
    const champ = h.querySelector<HTMLInputElement>('[data-login-identifiant]')!;
    expect(champ.getAttribute('placeholder')).toBe('Identifiant');
    expect(champ.getAttribute('aria-label')).toBe('Identifiant');
  });
});

describe('le libellé, dans les 16 langues', () => {
  const langues: Record<string, Record<string, string>> = {
    de, el, en, es, fr, hu, it: it_, ja, ko, nb, pl, ro, sv, tr, vi, zh,
  } as unknown as Record<string, Record<string, string>>;
  // Le mot « e-mail » de chaque langue, tel que ses fichiers l'écrivaient.
  const MOTS_EMAIL = /e-?mail|e-?post|correo|邮箱|이메일|メール|email/i;

  for (const [code, l] of Object.entries(langues)) {
    it(`${code} : identifiant seul, sans e-mail`, () => {
      const libelle = l['login.identifierPlaceholder'];
      expect(libelle, `${code} : la clé existe`).toBeTruthy();
      expect(libelle, `${code} : le serveur ne cherche jamais l'e-mail`).not.toMatch(MOTS_EMAIL);
    });
  }
});
