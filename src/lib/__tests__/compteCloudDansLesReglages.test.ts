// @vitest-environment jsdom
//
// 🔴 Le geste de connexion au compte vit là où trois écrans le promettent.
//
// `outputModule.notLinkedBody` (onze langues), l'écran Concerts et le panneau
// des modules de sortie envoient tous l'utilisateur à
// « Réglages ▸ Système ▸ Cloud » pour relier son compte Mozaiklabs. Cette
// section ne portait QUE le consentement à la télémétrie : le texte mentait,
// et le seul vrai geste vivait dans le menu de l'avatar.
//
// Ce témoin MONTE les Réglages, ouvre Système comme un humain et CLIQUE. Il
// lit le DOM et la navigation réellement demandée : un test qui chercherait
// « authorize » dans le source resterait vert si le bouton perdait son
// gestionnaire, ou s'il n'était jamais rendu faute de niveau d'interface.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import SettingsV2 from '../../components/v2/SettingsV2.svelte';
import { preferences } from '../stores/preferences';
import type { SettingsLevel } from '../uiLevel';
import lFr from '../locales/fr';

const fr = lFr as unknown as Record<string, string>;

class ResizeObserverInerte {
  observe() {}
  unobserve() {}
  disconnect() {}
}

function reponse(status: number, corps: unknown): Response {
  const texte = typeof corps === 'string' ? corps : JSON.stringify(corps);
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: String(status),
    headers: { get: () => null },
    json: async () => corps,
    text: async () => texte,
  } as unknown as Response;
}

let hote: HTMLDivElement | null = null;
let monte: Record<string, any> | null = null;
let appels: { url: string; method: string }[] = [];
let statutSso: Record<string, unknown>;
let locationOrigine: PropertyDescriptor | undefined;
let temoinLocation: { href: string };

async function attendre(tours = 6) {
  for (let i = 0; i < tours; i++) {
    await new Promise((r) => setTimeout(r, 0));
    flushSync();
  }
}

async function ouvrirSysteme(niveau: SettingsLevel = 'beginner'): Promise<HTMLDivElement> {
  preferences.update((p) => ({ ...p, settingsLevel: niveau }));
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(SettingsV2, { target: hote, props: {} });
  flushSync();
  await attendre();
  const onglet = [...hote.querySelectorAll('button')].find(
    (b) => (b.textContent ?? '').trim() === fr['settings.tabSystem'],
  );
  expect(onglet, 'onglet Système introuvable').toBeDefined();
  (onglet as HTMLButtonElement).click();
  flushSync();
  await attendre();
  return hote;
}

/** La ligne « compte » de la section Cloud, telle qu'elle est MONTÉE. */
function ligneCompte(el: HTMLElement): HTMLElement | null {
  return el.querySelector('[data-sso="compte"]');
}

function bouton(el: HTMLElement, libelle: string): HTMLButtonElement | null {
  const ligne = ligneCompte(el);
  if (!ligne) return null;
  return (
    [...ligne.querySelectorAll('button')].find((b) => (b.textContent ?? '').trim() === libelle) ?? null
  );
}

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', ResizeObserverInerte);
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  appels = [];
  statutSso = { configured: true, connected: false };
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, options?: RequestInit) => {
      const u = String(url);
      const method = String(options?.method ?? 'GET').toUpperCase();
      appels.push({ url: u, method });
      if (/\/cloud\/sso\/status$/.test(u)) return reponse(200, statutSso);
      if (/\/cloud\/telemetry\/status$/.test(u)) {
        return reponse(200, { enabled: false, env_override: false, rate_limits: [] });
      }
      return reponse(200, {});
    }),
  );
  // Le clic PART vraiment : on remplace `location` pour lire la cible au lieu
  // de laisser jsdom refuser la navigation.
  locationOrigine = Object.getOwnPropertyDescriptor(window, 'location');
  temoinLocation = { href: 'http://tune.test/' };
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: Object.assign(temoinLocation, {
      origin: 'http://tune.test',
      protocol: 'http:',
      host: 'tune.test',
      hostname: 'tune.test',
      pathname: '/',
      search: '',
      hash: '',
      reload: vi.fn(),
      assign: vi.fn(),
      replace: vi.fn(),
      toString: () => temoinLocation.href,
    }),
  });
});

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  if (hote) hote.remove();
  hote = null;
  if (locationOrigine) Object.defineProperty(window, 'location', locationOrigine);
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('Réglages ▸ Système ▸ Cloud — relier son compte Mozaiklabs', () => {
  it('🔴 la section n’est PLUS filtrée au niveau « Essentiel »', async () => {
    const el = await ouvrirSysteme('beginner');
    expect(
      ligneCompte(el),
      'au niveau Essentiel, la section Cloud est absente : la navigation programmée mène au vide',
    ).not.toBeNull();
  });

  it('🔴 le bouton « Se connecter » MÈNE à /api/v1/cloud/sso/authorize', async () => {
    const el = await ouvrirSysteme('beginner');
    const b = bouton(el, fr['settings.signIn']);
    expect(b, 'aucun geste de connexion dans la section Cloud').not.toBeNull();
    b!.click();
    await attendre();
    expect(
      temoinLocation.href,
      'le clic ne part pas vers le chemin SSO du serveur',
    ).toBe('/api/v1/cloud/sso/authorize');
  });

  it('le drapeau de retour est posé AVANT de partir, comme dans le menu de l’avatar', async () => {
    const el = await ouvrirSysteme('beginner');
    bouton(el, fr['settings.signIn'])!.click();
    await attendre();
    expect(localStorage.getItem('tune_sso_pending'), 'drapeau de retour absent').not.toBeNull();
  });

  it('SSO non configuré : AUCUN bouton de connexion, et l’écran le dit', async () => {
    statutSso = { configured: false, connected: false };
    const el = await ouvrirSysteme('beginner');
    expect(ligneCompte(el), 'la section Cloud a disparu').not.toBeNull();
    expect(
      bouton(el, fr['settings.signIn']),
      'un bouton « Se connecter » est offert alors que le serveur n’a aucun nuage',
    ).toBeNull();
    expect(ligneCompte(el)!.textContent).toContain(fr['settings.cloudComingSoon']);
  });

  it('déjà connecté : l’écran nomme le compte et n’offre que « Se déconnecter »', async () => {
    statutSso = {
      configured: true,
      connected: true,
      user: { email: 'yves@exemple.fr', display_name: 'Yves Corbat' },
    };
    const el = await ouvrirSysteme('beginner');
    const ligne = ligneCompte(el)!;
    expect(ligne.textContent).toContain('Yves Corbat');
    expect(ligne.textContent).toContain('yves@exemple.fr');
    expect(ligne.textContent).not.toContain(fr['settings.notConnected']);
    expect(bouton(el, fr['settings.signIn']), 'propose de se connecter alors qu’on l’est').toBeNull();
    expect(bouton(el, fr['settings.signOut']), 'aucun moyen de délier le compte').not.toBeNull();
  });

  it('se déconnecter passe par la route de déconnexion et relit l’état', async () => {
    statutSso = {
      configured: true,
      connected: true,
      user: { email: 'yves@exemple.fr', display_name: 'Yves Corbat' },
    };
    const el = await ouvrirSysteme('beginner');
    statutSso = { configured: true, connected: false };
    bouton(el, fr['settings.signOut'])!.click();
    await attendre(10);
    expect(
      appels.some((a) => a.method === 'POST' && /\/cloud\/sso\/disconnect$/.test(a.url)),
      'aucune requête de déconnexion : le bouton ne fait rien',
    ).toBe(true);
    expect(ligneCompte(el)!.textContent).toContain(fr['settings.notConnected']);
  });

  it('la recherche des Réglages trouve la section sur « compte » et sur « relier »', async () => {
    const { searchSettings } = await import('../v2Settings');
    const resoudre = (k: string) => fr[k] ?? k;
    for (const mot of ['compte', 'relier']) {
      const trouve = searchSettings(mot, resoudre, 20).some((h) => h.section.id === 'cloud');
      expect(trouve, `« ${mot} » ne trouve pas la section Cloud`).toBe(true);
    }
  });
});
