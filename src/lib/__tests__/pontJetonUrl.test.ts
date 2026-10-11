// @vitest-environment jsdom
/**
 * Par le pont, ce qui ne passe pas par `fetch` n'a aucun moyen de poser
 * l'en-tête `X-Bridge-Token` : `<img src>` des pochettes, liens `<a href>`
 * d'export, `window.location.href`. Le pont accepte désormais le jeton en
 * `?token=` pour les LECTURES relayées (tune-server-rust, batch rc4) : le
 * client doit donc l'ajouter à ces adresses-là, et à elles seules.
 *
 * Le SSO, lui, ne peut pas traverser le pont (voir `ssoDisponible`) : le
 * bouton disparaît en mode relais, avec une explication.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import LoginView from '../../components/partages/LoginView.svelte';
import * as bridgeStatique from '../bridge';

const UUID = '75f24b9e-fb8a-4de2-8007-99edd3454263';
const ORIGINE = 'https://bridge.mozaiklabs.fr';
const JETON = 'jeton/du+pont';
const JETON_URL = encodeURIComponent(JETON);
const RELAIS = `${ORIGINE}/api/relay/${UUID}`;

const locationOrigine = window.location;
const historyOrigine = window.history;

function pageA(pathname: string) {
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: {
      pathname,
      hash: '',
      search: '',
      origin: ORIGINE,
      host: 'bridge.mozaiklabs.fr',
      protocol: 'https:',
      href: `${ORIGINE}${pathname}`,
    },
  });
  Object.defineProperty(window, 'history', {
    configurable: true,
    value: { replaceState: vi.fn() },
  });
}

/** `api.ts` lit sa base à l'import : on le recharge après avoir posé l'URL. */
async function modules() {
  vi.resetModules();
  const bridge = await import('../bridge');
  bridge.reinitialiserPourTest();
  const api = await import('../api');
  return { bridge, api };
}

function parLePont() {
  localStorage.setItem('tune.bridge.token', JETON);
  pageA(`/${UUID}/`);
}

function enLocal() {
  pageA('/');
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  Object.defineProperty(window, 'location', { configurable: true, value: locationOrigine });
  Object.defineProperty(window, 'history', { configurable: true, value: historyOrigine });
  vi.restoreAllMocks();
});

describe('pochettes par le pont', () => {
  it('une pochette par condensat porte le jeton en ?token=', async () => {
    parLePont();
    const { api } = await modules();
    expect(api.artworkUrl('abc.jpg', 300)).toBe(
      `${RELAIS}/library/artwork/abc.jpg?size=300&token=${JETON_URL}`,
    );
  });

  it('une adresse /api/v1 toute faite part vers le relais, jeton compris', async () => {
    parLePont();
    const { api } = await modules();
    expect(api.artworkUrl('/api/v1/library/artwork/abc.jpg')).toBe(
      `${RELAIS}/library/artwork/abc.jpg?token=${JETON_URL}`,
    );
  });

  it('servie en local, rien ne change : ni relais ni jeton', async () => {
    enLocal();
    const { api } = await modules();
    expect(api.artworkUrl('abc.jpg', 300)).toBe('/api/v1/library/artwork/abc.jpg?size=300');
    expect(api.artworkUrl('/api/v1/library/artwork/abc.jpg')).toBe(
      '/api/v1/library/artwork/abc.jpg',
    );
  });
});

describe('exports et téléchargements par le pont', () => {
  it('export de la base et des radios : jeton dans l’URL', async () => {
    parLePont();
    const { api } = await modules();
    expect(api.exportDatabaseUrl()).toBe(`${RELAIS}/system/database/export?token=${JETON_URL}`);
    expect(api.exportRadiosUrl()).toBe(`${RELAIS}/radios/export.m3u?token=${JETON_URL}`);
  });

  it('urlNavigateur : requête existante, fragment, adresse étrangère', async () => {
    parLePont();
    const { bridge } = await modules();
    expect(bridge.urlNavigateur('/api/v1/history/export?limit=10000')).toBe(
      `${RELAIS}/history/export?limit=10000&token=${JETON_URL}`,
    );
    expect(bridge.urlNavigateur('/api/v1/x#y')).toBe(`${RELAIS}/x?token=${JETON_URL}#y`);
    expect(bridge.urlNavigateur('https://ailleurs.example/a.jpg')).toBe(
      'https://ailleurs.example/a.jpg',
    );
    expect(bridge.urlNavigateur('')).toBe('');
  });

  it('urlNavigateur ne touche à rien en local', async () => {
    enLocal();
    const { bridge } = await modules();
    expect(bridge.urlNavigateur('/api/v1/history/export?limit=10000')).toBe(
      '/api/v1/history/export?limit=10000',
    );
  });

  // Ces deux liens sont écrits dans le balisage : la garde lit la source.
  it.each([
    ['src/components/v2-heritage/DashboardView.svelte', '/api/v1/history/export'],
    ['src/components/v2/FavoritesV2.svelte', '/api/v1/radio-favorites/export'],
  ])('%s passe son lien d’export par urlNavigateur', (fichier, chemin) => {
    const source = readFileSync(join(process.cwd(), fichier), 'utf8');
    const lignes = source.split('\n').filter((l) => l.includes(chemin));
    expect(lignes.length).toBeGreaterThan(0);
    for (const l of lignes) expect(l).toContain('urlNavigateur(');
  });
});

describe('SSO mozaiklabs.fr par le pont', () => {
  // Composant importé en tête de fichier (règle #1333) : il vit avec le
  // module `bridge` STATIQUE, qu'on réinitialise après avoir posé l'URL.
  function monter() {
    bridgeStatique.reinitialiserPourTest();
    const cible = document.createElement('div');
    document.body.appendChild(cible);
    const vue = mount(LoginView, { target: cible, props: { surCouche: true } });
    flushSync();
    return { cible, fin: () => { unmount(vue); cible.remove(); } };
  }

  it('par le pont : pas de bouton, une explication à la place', async () => {
    parLePont();
    const { cible, fin } = monter();
    expect(bridgeStatique.ssoDisponible()).toBe(false);
    expect(cible.querySelector('.login-sso-btn')).toBeNull();
    expect(cible.querySelector('.login-sso-indisponible')).not.toBeNull();
    fin();
  });

  it('en local : le bouton reste', async () => {
    enLocal();
    const { cible, fin } = monter();
    expect(bridgeStatique.ssoDisponible()).toBe(true);
    expect(cible.querySelector('.login-sso-btn')).not.toBeNull();
    expect(cible.querySelector('.login-sso-indisponible')).toBeNull();
    fin();
  });

  // Les trois autres portes d'entrée du SSO : menu du compte, Réglages, Cercle.
  it.each([
    'src/components/v2/AvatarMenu.svelte',
    'src/components/v2/SettingsV2.svelte',
    'src/components/v2/CircleV2.svelte',
  ])('%s masque « Se connecter » par le pont', (fichier) => {
    const source = readFileSync(join(process.cwd(), fichier), 'utf8');
    expect(source).toMatch(/import \{[^}]*\bssoDisponible\b[^}]*\} from '[./]+\/lib\/bridge'/);
    expect(source).toMatch(/\{(?:#|:else )if[^}]*ssoDisponible\(\)/);
  });
});
