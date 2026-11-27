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
//   1. le champ identifiant : `admin` (rc14), `default` (plus ancien), vide (relais) ;
//      valeur mémorisée prioritaire ;
//   2. une consigne dit « tapez admin… pas votre e-mail », 20 langues ;
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
const CLES_AIDE = ['login.identifierHelp', 'login.identifierHelpDefault', 'login.identifierHelpNeutral'];
const CLE_MEMOIRE = 'tune_login_identifiant';

let hote: HTMLDivElement | null = null;
let monte: Record<string, any> | null = null;

/** `activation` : corps de `GET /auth/activation` ; `null` = sonde en échec ; `undefined` = pas de sonde (relais). */
async function monterConnexion(activation?: Record<string, unknown> | null) {
  locale.set('fr');
  if (activation !== undefined) {
    vi.stubGlobal('fetch', vi.fn(async () => {
      if (activation === null) throw new Error('réseau');
      return { ok: true, status: 200, headers: { get: () => null }, json: async () => activation } as unknown as Response;
    }));
  }
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(LoginView, { target: hote, props: {} });
  flushSync();
  for (let i = 0; i < 5; i++) await Promise.resolve();
  await new Promise((r) => setTimeout(r, 0));
  flushSync();
  return hote;
}

const SERVEUR_RC14 = { auth_enabled: true, from_this_machine: false, max_password_length: 128, min_password_length: 8 };
const SERVEUR_RC13 = { auth_enabled: true, from_this_machine: false };

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
  const identifiant = (h: HTMLElement) => h.querySelector<HTMLInputElement>('[data-login-identifiant]')!;

  it('🔴 serveur rc14 : le champ identifiant est pré-rempli avec `admin`', async () => {
    const h = await monterConnexion(SERVEUR_RC14);
    expect(identifiant(h), 'champ identifiant rendu').toBeTruthy();
    expect(identifiant(h).value).toBe('admin');
  });

  it('🔴 serveur plus ancien (rc13, profil `default`) : `default`, le seul nom qui y marche', async () => {
    const h = await monterConnexion(SERVEUR_RC13);
    expect(identifiant(h).value).toBe('default');
  });

  it('🔴 relais (aucune sonde) ou sonde en échec : champ vide, jamais un nom faux', async () => {
    expect(identifiant(await monterConnexion(null)).value).toBe('');
    unmount(monte!); monte = null; hote!.remove();
    expect(identifiant(await monterConnexion()).value).toBe('');
  });

  it('une valeur mémorisée l’emporte, même sur un serveur rc14', async () => {
    localStorage.setItem(CLE_MEMOIRE, 'salon');
    const h = await monterConnexion(SERVEUR_RC14);
    expect(identifiant(h).value).toBe('salon');
  });

  it('ce que l’utilisateur a tapé n’est pas écrasé par la réponse du serveur', async () => {
    const h = await monterConnexion(null);
    identifiant(h).value = 'autre';
    identifiant(h).dispatchEvent(new Event('input', { bubbles: true }));
    flushSync();
    expect(identifiant(h).value).toBe('autre');
    expect(identifiant(h).readOnly).toBe(false);
    expect(identifiant(h).disabled).toBe(false);
  });

  const aideDe = (h: HTMLElement) => h.querySelector<HTMLElement>('[data-login-identifiant-aide]')!.textContent?.trim();

  it('🔴 serveur rc14 : « Tapez admin… Ce n’est pas votre adresse e-mail »', async () => {
    const h = await monterConnexion(SERVEUR_RC14);
    const aide = h.querySelector<HTMLElement>('[data-login-identifiant-aide]');
    expect(aide, 'aide absente sous le champ identifiant').toBeTruthy();
    expect(aideDe(h)).toBe(
      'Tapez admin, sauf si vous avez changé le nom de l’administrateur. Ce n’est pas votre adresse e-mail.',
    );
    expect(identifiant(h).getAttribute('aria-describedby')).toBe(aide!.id);
  });

  it('🔴 serveur plus ancien (champ `default`) : « Tapez default… »', async () => {
    const h = await monterConnexion(SERVEUR_RC13);
    expect(identifiant(h).value).toBe('default');
    expect(aideDe(h)).toBe(
      'Tapez default : c’est le nom de l’administrateur de ce serveur (version ancienne). Ce n’est pas votre adresse e-mail.',
    );
  });

  it('🔴 champ vide (relais, sonde en échec) : phrase neutre', async () => {
    const h = await monterConnexion(null);
    expect(identifiant(h).value).toBe('');
    expect(aideDe(h)).toBe(
      'Tapez le nom de l’administrateur de ce serveur (admin, ou default sur une ancienne version). Ce n’est pas votre adresse e-mail.',
    );
  });

  it('🔴 les consignes EN', async () => {
    expect(LANGUES.en[CLE_AIDE]).toBe(
      'Type admin, unless you renamed the administrator. This is not your email address.',
    );
    expect(LANGUES.en['login.identifierHelpDefault']).toContain('Type default');
    expect(LANGUES.en['login.identifierHelpNeutral']).toContain('admin, or default on an older version');
    locale.set('en');
    const h = await monterConnexion(SERVEUR_RC14);
    locale.set('en'); flushSync();
    expect(aideDe(h)).toBe('Type admin, unless you renamed the administrator. This is not your email address.');
  });

  it.each(Object.keys(LANGUES))('🔴 consignes et aide Tune OS traduites en %s, sans mojibake', (code) => {
    for (const cle of CLES_AIDE) {
      const texte = LANGUES[code][cle];
      expect(texte, `${code} : ${cle} manquante`).toBeTruthy();
      expect(texte).toContain(cle.endsWith('Default') ? 'default' : 'admin');
      expect(texte).not.toMatch(/Ã/);
      if (code !== 'fr' && code !== 'en') expect(texte).not.toBe(LANGUES.fr[cle]);
    }
    const os = LANGUES[code]['login.resetHowTuneOs'];
    expect(os).toContain('ssh tune@');
    expect(os).toContain('Cockpit');
    expect(os).toContain('sudo');
    if (code !== 'fr') expect(os).not.toBe(LANGUES.fr['login.resetHowTuneOs']);
  });

  it('🔴 PAS de bouton « Connexion avec mozaiklabs.fr » sur l’écran de connexion', async () => {
    const h = await monterConnexion();
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
