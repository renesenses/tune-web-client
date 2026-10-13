// @vitest-environment jsdom
//
// tune-server-rust#6197, étape 2 — un service fourni par un greffon WASM se
// connecte depuis Réglages ▸ Services avec les champs que SON MANIFESTE
// déclare (`GET /plugins/sources`), et Extensions montre son journal réseau.
//
// Avant : la carte du service n'offrait que « Se connecter », qui postait un
// corps vide — le serveur répondait « identifiants : « Adresse » est requis ».
//
// Ces témoins MONTENT `SettingsV2` et `PluginsV2` contre un faux serveur. Les
// identifiants employés sont factices.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import SettingsV2 from '../../components/v2/SettingsV2.svelte';
import PluginsV2 from '../../components/v2/PluginsV2.svelte';
import { locale } from '../i18n';
import { preferences } from '../stores/preferences';
import { v2SettingsTarget } from '../stores/v2SettingsNav';
import type { V2SettingsTabId } from '../v2Settings';
import {
  corpsDeConnexion, journalTrie, lireSourcesDesGreffons, saisieComplete, sansLesMotsDePasse, sourceDuService,
} from '../sourcesGreffons';

vi.setConfig({ testTimeout: 30_000 });

const MOT_DE_PASSE = 'f4ux-M0t de passe';

const SOURCES = {
  sources: [
    {
      plugin_id: 'source-exemple',
      service: 'exemple-wasm',
      display_name: 'Exemple (greffon)',
      login_fields: [
        { key: 'email', label: 'Adresse électronique', type: 'email', required: true },
        { key: 'password', label: 'Mot de passe', type: 'password', required: true },
        { key: 'base_url', label: 'Adresse du service', type: 'text', required: false },
      ],
      http_allowed_domains: ['api.exemple.invalid'],
      registered: true,
    },
    {
      plugin_id: 'imposteur',
      service: 'qobuz',
      display_name: 'Faux Qobuz',
      login_fields: [{ key: 'pin', label: 'Code', type: 'text', required: true }],
      http_allowed_domains: [],
      registered: false,
    },
  ],
  network: {
    'source-exemple': [
      { host: '127.0.0.1', requests: 12, refused: 0, last_status: 200, last_error: null, last_at_ms: 2000 },
      { host: 'evil.example', requests: 0, refused: 1, last_status: null, last_error: 'domain_not_allowed', last_at_ms: 3000 },
    ],
  },
};

class ObservateurInerte {
  observe() {}
  unobserve() {}
  disconnect() {}
}

let hote: HTMLDivElement | null = null;
let monte: Record<string, unknown> | null = null;
let postes: { url: string; corps: unknown }[] = [];

const respirer = () => new Promise((r) => setTimeout(r, 0));
async function souffler(n = 8) {
  for (let i = 0; i < n; i++) {
    await respirer();
    flushSync();
  }
}

/** Un faux serveur. `avecRoute` : le serveur porte-t-il `GET /plugins/sources` ? */
function serveur(avecRoute: boolean, connexion: Record<string, unknown> = { authenticated: true, username: 'Charly' }) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      const methode = (init?.method ?? 'GET').toUpperCase();
      let charge: unknown = {};
      let statut = 200;
      if (url.endsWith('/plugins/sources')) {
        if (avecRoute) charge = SOURCES;
        else { statut = 404; charge = { error: 'plugin not found' }; }
      } else if (url.includes('/streaming/exemple-wasm/auth') && methode === 'POST') {
        postes.push({ url, corps: init?.body ? JSON.parse(String(init.body)) : null });
        charge = connexion;
      } else if (url.includes('/streaming/services')) {
        charge = {
          'exemple-wasm': { enabled: true, authenticated: false },
          qobuz: { enabled: true, authenticated: false },
        };
      } else if (/\/plugins(\?|$)/.test(url)) {
        charge = [{ name: 'source-exemple', display_name: 'Source d’exemple', version: '0.1.0', installed: true,
          enabled: true, status: 'active', compatible: true, description: '' }];
      } else if (url.includes('/system/health')) charge = { status: 'ok' };
      else if (url.includes('/zones') || url.includes('/devices') || url.includes('/audio-plugins')) charge = [];
      return {
        ok: statut < 400,
        status: statut,
        headers: new Headers({ 'Content-Type': 'application/json' }),
        text: async () => JSON.stringify(charge),
        json: async () => charge,
      } as unknown as Response;
    }),
  );
}

async function monterCarteStreaming() {
  locale.set('fr');
  v2SettingsTarget.set({ tab: 'access' as V2SettingsTabId, section: 'streaming' });
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(SettingsV2, { target: hote, props: {} });
  await souffler();
  return hote;
}

function saisir(champ: HTMLInputElement, valeur: string) {
  champ.value = valeur;
  champ.dispatchEvent(new Event('input', { bubbles: true }));
  flushSync();
}

beforeEach(() => {
  postes = [];
  preferences.update((p) => ({ ...p, settingsLevel: 'expert' }));
  vi.stubGlobal('ResizeObserver', ObservateurInerte);
  vi.stubGlobal('IntersectionObserver', ObservateurInerte);
});

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  hote?.remove();
  hote = null;
  v2SettingsTarget.set(null);
  vi.unstubAllGlobals();
});

describe('#6197 — la carte d’un service fourni par un greffon', () => {
  it('🔴 les champs du manifeste, dans l’ordre, et le corps n’en porte pas d’autres', async () => {
    serveur(true);
    const h = await monterCarteStreaming();

    const bloc = h.querySelector('[data-connexion-source="exemple-wasm"]');
    expect(bloc, 'la carte doit offrir les champs du greffon (#6197)').toBeTruthy();
    const champs = [...bloc!.querySelectorAll<HTMLInputElement>('input')];
    expect(champs.map((c) => c.placeholder)).toEqual(['Adresse électronique', 'Mot de passe', 'Adresse du service']);
    expect(champs.map((c) => c.type)).toEqual(['email', 'password', 'text']);
    expect(h.textContent, 'le nom affiché du manifeste').toContain('Exemple (greffon)');

    const bouton = bloc!.querySelector<HTMLButtonElement>('button')!;
    expect(bouton.disabled, 'champs requis vides : bouton désarmé').toBe(true);
    saisir(champs[0], '  charly@exemple.fr ');
    saisir(champs[1], MOT_DE_PASSE);
    expect(bouton.disabled).toBe(false);
    bouton.click();
    await souffler();

    expect(postes.length, 'la connexion doit partir vers /streaming/exemple-wasm/auth').toBe(1);
    expect(postes[0].corps).toEqual({ email: 'charly@exemple.fr', password: MOT_DE_PASSE });
    expect(h.querySelector('[data-connexion-source="exemple-wasm"]'), 'connecté : plus de formulaire').toBeNull();
    expect(h.textContent).not.toContain(MOT_DE_PASSE);
  });

  it('un refus garde la carte et efface le mot de passe', async () => {
    serveur(true, { authenticated: false });
    const h = await monterCarteStreaming();
    const champs = [...h.querySelectorAll<HTMLInputElement>('[data-connexion-source="exemple-wasm"] input')];
    saisir(champs[0], 'charly@exemple.fr');
    saisir(champs[1], MOT_DE_PASSE);
    h.querySelector<HTMLButtonElement>('[data-connexion-source="exemple-wasm"] button')!.click();
    await souffler();
    const apres = [...h.querySelectorAll<HTMLInputElement>('[data-connexion-source="exemple-wasm"] input')];
    expect(apres[0].value).toBe('charly@exemple.fr');
    expect(apres[1].value, 'le mot de passe ne survit pas à la réponse').toBe('');
  });

  it('un greffon dont le nom est PRIS ne prête pas ses champs au vrai service', async () => {
    serveur(true);
    const h = await monterCarteStreaming();
    expect(h.querySelector('[data-connexion-source="qobuz"]')).toBeNull();
    expect(h.textContent).not.toContain('Faux Qobuz');
  });

  it('sur un serveur sans la route, la carte reste celle d’avant', async () => {
    serveur(false);
    const h = await monterCarteStreaming();
    expect(h.querySelector('[data-connexion-source]')).toBeNull();
  });
});

describe('#6197 — Extensions montre le journal réseau du greffon', () => {
  it('🔴 hôtes contactés et refusés, le plus récent d’abord', async () => {
    serveur(true);
    locale.set('fr');
    hote = document.createElement('div');
    document.body.appendChild(hote);
    monte = mount(PluginsV2, { target: hote, props: {} });
    await souffler(12);
    const journal = hote.querySelector('[data-journal-reseau="source-exemple"]');
    expect(journal, 'le journal réseau doit être sur la carte du greffon').toBeTruthy();
    const lignes = [...journal!.querySelectorAll('tbody tr')].map((tr) => tr.textContent ?? '');
    expect(lignes[0]).toContain('evil.example');
    expect(lignes[0]).toContain('domain_not_allowed');
    expect(lignes[1]).toContain('127.0.0.1');
    expect(lignes[1]).toContain('12');
    expect(hote.querySelector('[data-source-du-greffon="exemple-wasm"]')?.textContent).toContain('Exemple (greffon)');
  });
});

describe('#6197 — la lecture de `GET /plugins/sources`', () => {
  it('lit sans confiance : champs mal formés écartés, type inconnu lu `text`', () => {
    const lues = lireSourcesDesGreffons({
      sources: [
        { plugin_id: 'g', service: 's', login_fields: [{ key: 'k', type: 'color' }, { label: 'sans clé' }, null] },
        { plugin_id: '', service: 'x' },
        'n’importe quoi',
      ],
      network: { g: [{ host: 'h', requests: 'beaucoup' }, { requests: 3 }], h: 'pas une liste' },
    });
    expect(lues.sources).toHaveLength(1);
    expect(lues.sources[0].display_name).toBe('s');
    expect(lues.sources[0].login_fields).toEqual([{ key: 'k', label: 'k', type: 'text', required: false }]);
    expect(lues.sources[0].registered).toBe(false);
    expect(lues.network).toEqual({
      g: [{ host: 'h', requests: 0, refused: 0, last_status: null, last_error: null, last_at_ms: 0 }],
    });
    expect(lireSourcesDesGreffons(null)).toEqual({ sources: [], network: {} });
  });

  it('le corps, la complétude, l’effacement du mot de passe, le tri du journal', () => {
    const lues = lireSourcesDesGreffons(SOURCES);
    const src = sourceDuService(lues, 'exemple-wasm')!;
    expect(sourceDuService(lues, 'qobuz'), 'non inscrit : ignoré').toBeUndefined();
    expect(saisieComplete(src, { email: 'a', password: '' })).toBe(false);
    expect(saisieComplete(src, { email: 'a', password: ' x ' })).toBe(true);
    expect(corpsDeConnexion(src, { email: ' a ', password: ' x ', base_url: ' ', intrus: 'z' }))
      .toEqual({ email: 'a', password: ' x ' });
    expect(sansLesMotsDePasse(src, { email: 'a', password: 'x' })).toEqual({ email: 'a', password: '' });
    expect(journalTrie(lues, 'source-exemple').map((l) => l.host)).toEqual(['evil.example', '127.0.0.1']);
    expect(journalTrie(lues, 'inconnu')).toEqual([]);
  });
});
