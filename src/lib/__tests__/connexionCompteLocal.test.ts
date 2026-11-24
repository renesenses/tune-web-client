// @vitest-environment jsdom
//
// 🔴 rc14 — l'écran de connexion de Tune demande le compte LOCAL du serveur.
//
// Trois testeurs le même jour (fils 3061, 3067, et un troisième) y ont tapé
// leur compte mozaiklabs.fr. Le compte attendu est celui du serveur Tune :
// identifiant `default`, mot de passe choisi à l'activation de
// l'authentification. Le bouton « Connexion avec mozaiklabs.fr » entretenait
// la confusion : avant toute session, `/api/v1/cloud/sso/authorize` répond
// « authentication required » (voulu côté serveur : relier un compte exige
// l'administrateur quand l'authentification est active).
//
// Ce témoin MONTE l'écran et lit le DOM rendu :
//   1. le champ identifiant vaut `default`, sauf valeur mémorisée ;
//   2. une aide dit « compte de ce serveur, pas mozaiklabs.fr », 20 langues ;
//   3. le bouton SSO n'est PAS sur l'écran de connexion ;
//   4. contre-épreuve : il reste dans les Réglages, une fois connecté.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import LoginView from '../../components/partages/LoginView.svelte';
import SettingsV2 from '../../components/v2/SettingsV2.svelte';
import { locale } from '../i18n';
import { preferences } from '../stores/preferences';
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

const LANGUES: Record<string, Record<string, string>> = {
  de, el, en, es, fr, hu, it: it_, ja, ko, nb, nl, pl, ro, ru, sv, tr, uk, vi: vi_, zh, 'zh-Hant': zhHant,
} as unknown as Record<string, Record<string, string>>;

const CLE_AIDE = 'login.identifierHelp';
const CLE_MEMOIRE = 'tune_login_identifiant';

let hote: HTMLDivElement | null = null;
let monte: Record<string, any> | null = null;

function monterConnexion() {
  locale.set('fr');
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(LoginView, { target: hote, props: {} });
  flushSync();
  return hote;
}

beforeEach(() => {
  try { localStorage.removeItem(CLE_MEMOIRE); } catch {}
});

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  hote?.remove();
  hote = null;
  try { localStorage.removeItem(CLE_MEMOIRE); } catch {}
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('écran de connexion — compte local du serveur Tune', () => {
  it('🔴 le champ identifiant est pré-rempli avec `default`', () => {
    const h = monterConnexion();
    const champ = h.querySelector<HTMLInputElement>('[data-login-identifiant]');
    expect(champ, 'champ identifiant rendu').toBeTruthy();
    expect(champ!.value).toBe('default');
  });

  it('une valeur mémorisée l’emporte sur `default`', () => {
    localStorage.setItem(CLE_MEMOIRE, 'salon');
    const h = monterConnexion();
    expect(h.querySelector<HTMLInputElement>('[data-login-identifiant]')!.value).toBe('salon');
  });

  it('l’utilisateur peut changer la valeur', () => {
    const h = monterConnexion();
    const champ = h.querySelector<HTMLInputElement>('[data-login-identifiant]')!;
    champ.value = 'autre';
    champ.dispatchEvent(new Event('input', { bubbles: true }));
    flushSync();
    expect(champ.value).toBe('autre');
    expect(champ.readOnly).toBe(false);
    expect(champ.disabled).toBe(false);
  });

  it('🔴 une aide sous le champ dit « compte de ce serveur, pas mozaiklabs.fr »', () => {
    const h = monterConnexion();
    const aide = h.querySelector<HTMLElement>('[data-login-identifiant-aide]');
    expect(aide, 'aide absente sous le champ identifiant').toBeTruthy();
    expect(aide!.textContent?.trim()).toBe(
      'Le compte de ce serveur Tune (créé à l’activation de l’authentification), pas votre compte mozaiklabs.fr.',
    );
    const champ = h.querySelector<HTMLInputElement>('[data-login-identifiant]')!;
    expect(champ.getAttribute('aria-describedby')).toBe(aide!.id);
  });

  it.each(Object.keys(LANGUES))('🔴 aide traduite en %s, sans mojibake', (code) => {
    const texte = LANGUES[code][CLE_AIDE];
    expect(texte, `${code} : ${CLE_AIDE} manquante`).toBeTruthy();
    expect(texte).toContain('mozaiklabs.fr');
    expect(texte).not.toMatch(/Ã/);
  });

  it('🔴 PAS de bouton « Connexion avec mozaiklabs.fr » sur l’écran de connexion', () => {
    const h = monterConnexion();
    expect(h.querySelector('.login-sso-btn'), 'bouton SSO encore affiché').toBeNull();
    const libelle = (fr as unknown as Record<string, string>)['login.ssoButton'];
    expect(h.textContent ?? '').not.toContain(libelle);
  });
});

// ── Contre-épreuve : le geste reste là où il a un sens ──────────────────────
describe('contre-épreuve — Réglages ▸ Système ▸ Cloud, session ouverte', () => {
  class ResizeObserverInerte { observe() {} unobserve() {} disconnect() {} }
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
  async function attendre(tours = 6) {
    for (let i = 0; i < tours; i++) {
      await new Promise((r) => setTimeout(r, 0));
      flushSync();
    }
  }

  it('le bouton « Se connecter » (mozaiklabs.fr) est toujours dans les Réglages', async () => {
    vi.stubGlobal('ResizeObserver', ResizeObserverInerte);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        const u = String(url);
        if (/\/cloud\/sso\/status$/.test(u)) return reponse(200, { configured: true, connected: false });
        if (/\/cloud\/telemetry\/status$/.test(u)) {
          return reponse(200, { enabled: false, env_override: false, rate_limits: [] });
        }
        return reponse(200, {});
      }),
    );
    locale.set('fr');
    preferences.update((p) => ({ ...p, settingsLevel: 'beginner' }));
    const frD = fr as unknown as Record<string, string>;
    hote = document.createElement('div');
    document.body.appendChild(hote);
    monte = mount(SettingsV2, { target: hote, props: {} });
    flushSync();
    await attendre();
    const onglet = [...hote.querySelectorAll('button')].find(
      (b) => (b.textContent ?? '').trim() === frD['settings.tabSystem'],
    );
    expect(onglet, 'onglet Système introuvable').toBeDefined();
    (onglet as HTMLButtonElement).click();
    flushSync();
    await attendre();
    const ligne = hote.querySelector('[data-sso="compte"]');
    expect(ligne, 'section Cloud absente').not.toBeNull();
    const b = [...ligne!.querySelectorAll('button')].find(
      (x) => (x.textContent ?? '').trim() === frD['settings.signIn'],
    );
    expect(b, 'le geste de connexion mozaiklabs.fr a disparu des Réglages').toBeDefined();
  });
});
