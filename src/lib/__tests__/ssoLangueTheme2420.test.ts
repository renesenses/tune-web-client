// @vitest-environment jsdom
//
// 🔴 La page de connexion Mozaiklabs reçoit la langue et le thème de Tune.
//
// Sans `ui_locales` ni `theme`, la page de connexion s'ouvrait toujours dans
// la langue du navigateur et aux couleurs du site (demande d'Alex, 26/10).
// Les deux témoins de navigation MONTENT les vrais composants et CLIQUENT :
// un test qui chercherait « ui_locales » dans le source resterait vert si le
// bouton perdait son gestionnaire.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import { urlSsoAuthorize } from '../ssoAuthorize';
import { locale, localeNames } from '../i18n';
import { V2_THEMES } from '../v2Theme';
import AvatarMenu from '../../components/v2/AvatarMenu.svelte';
import LoginView from '../../components/partages/LoginView.svelte';
import { dictionnaire, ONZE_LANGUES } from './onzeDictionnaires';

vi.setConfig({ testTimeout: 30_000 });

class ObservateurInerte { observe() {} unobserve() {} disconnect() {} }

let hote: HTMLDivElement | null = null;
let monte: Record<string, unknown> | null = null;
let locationOrigine: PropertyDescriptor | undefined;
let temoinLocation: { href: string };

const souffler = async (n = 8) => {
  for (let i = 0; i < n; i++) { await new Promise((r) => setTimeout(r, 0)); flushSync(); }
};

function poserTheme(id: string | null) {
  if (id === null) document.documentElement.removeAttribute('data-v2-theme');
  else document.documentElement.setAttribute('data-v2-theme', id);
}

beforeEach(() => {
  locale.set('fr');
  poserTheme(null);
  vi.stubGlobal('ResizeObserver', ObservateurInerte);
  vi.stubGlobal('IntersectionObserver', ObservateurInerte);
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input.toString();
    let charge: unknown = {};
    if (url.includes('/cloud/sso/status')) charge = { configured: true, connected: false };
    else if (url.includes('/zones') || url.includes('/devices') || url.includes('/profiles')) charge = [];
    return {
      ok: true, status: 200,
      headers: new Headers({ 'Content-Type': 'application/json' }),
      text: async () => JSON.stringify(charge),
      json: async () => charge,
    } as unknown as Response;
  }));
  // Le clic PART vraiment : on lit la cible au lieu de laisser jsdom refuser.
  locationOrigine = Object.getOwnPropertyDescriptor(window, 'location');
  temoinLocation = { href: 'http://tune.test/' };
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: Object.assign(temoinLocation, {
      origin: 'http://tune.test', protocol: 'http:', host: 'tune.test', hostname: 'tune.test',
      pathname: '/', search: '', hash: '',
      reload: vi.fn(), assign: vi.fn(), replace: vi.fn(),
      toString: () => temoinLocation.href,
    }),
  });
  hote = document.createElement('div');
  document.body.appendChild(hote);
});

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  hote?.remove();
  hote = null;
  poserTheme(null);
  if (locationOrigine) Object.defineProperty(window, 'location', locationOrigine);
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('urlSsoAuthorize', () => {
  it('transmet la langue courante et le thème posé sur <html>', () => {
    locale.set('de');
    poserTheme('midnight-orange');
    expect(urlSsoAuthorize('/api/v1')).toBe(
      '/api/v1/cloud/sso/authorize?ui_locales=de&theme=midnight-orange',
    );
  });

  it.each(ONZE_LANGUES)('langue %s transmise telle quelle', (code) => {
    locale.set(code);
    expect(urlSsoAuthorize('')).toContain(`ui_locales=${code}`);
  });

  it('les 15 langues du client sont connues du transmetteur', () => {
    expect(Object.keys(localeNames)).toHaveLength(15);
  });

  it.each(V2_THEMES.map((x) => x.id))('thème %s transmis', (id) => {
    poserTheme(id);
    expect(urlSsoAuthorize('')).toContain(`theme=${id}`);
  });

  it('omet un thème absent ou inconnu, sans rien casser', () => {
    expect(urlSsoAuthorize('/api/v1')).not.toContain('theme=');
    poserTheme('brown;}body{display:none');
    const url = urlSsoAuthorize('/api/v1');
    expect(url).not.toContain('theme=');
    expect(url).not.toContain('display');
  });

  it('encode ce qu\'il écrit : deux paramètres, aucun caractère libre', () => {
    poserTheme('clear-grey');
    const requete = urlSsoAuthorize('/api/v1').split('?')[1];
    expect([...new URLSearchParams(requete).keys()].sort()).toEqual(['theme', 'ui_locales']);
    expect(requete).toMatch(/^[A-Za-z0-9_=&-]+$/);
  });
});

describe('les deux boutons de connexion Mozaiklabs envoient langue et thème', () => {
  it('🔴 menu de l’avatar : « Se connecter » part avec ui_locales et theme', async () => {
    locale.set('ja');
    poserTheme('brown');
    monte = mount(AvatarMenu, { target: hote! });
    await souffler();
    hote!.querySelector<HTMLButtonElement>('button.avatar')!.click();
    await souffler();
    const libelle = dictionnaire('ja')['settings.signIn'];
    const b = [...hote!.querySelectorAll<HTMLButtonElement>('button.item')].find((x) => x.textContent?.includes(libelle));
    expect(b, 'le bouton « Se connecter » du menu de l’avatar').toBeTruthy();
    b!.click();
    await souffler();
    expect(temoinLocation.href).toBe('/api/v1/cloud/sso/authorize?ui_locales=ja&theme=brown');
  });

  it('🔴 écran de connexion : « Connexion avec mozaiklabs.fr » part avec ui_locales et theme', async () => {
    locale.set('es');
    poserTheme('clear-white');
    monte = mount(LoginView, { target: hote!, props: {} });
    await souffler();
    const b = hote!.querySelector<HTMLButtonElement>('button.login-sso-btn');
    expect(b, 'le bouton SSO de l’écran de connexion').toBeTruthy();
    b!.click();
    await souffler();
    expect(temoinLocation.href).toBe('/api/v1/cloud/sso/authorize?ui_locales=es&theme=clear-white');
  });
});
