// @vitest-environment jsdom
//
// jsdom : sans `window`, `onMount` ne se déclenche pas et l'écran ne lirait
// jamais `/ext/concerts/*` — un test vert qui n'aurait rien exécuté.
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import { get } from 'svelte/store';
import ConcertsView from '../../components/v2-heritage/ConcertsView.svelte';
import PluginsV2 from '../../components/v2/PluginsV2.svelte';
import { preparerLocale } from '../i18n';
import { activeView } from '../stores/navigation';
import { v2SettingsTarget } from '../stores/v2SettingsNav';
import { concertsPlugin, concertsUtilisable } from '../stores/concerts';
import { notifications } from '../stores/notifications';
import { nomFonctionnalite } from '../nomFonctionnaliteLicence';
import { t } from '../i18n';
import { readFileSync } from 'node:fs';
import fr from '../locales/fr';

/**
 * Écran « Concerts » pleinement utilisable — renesenses/tune-server-rust#2363.
 *
 * Contrat du greffon natif `concerts` (lot serveur `batch/concerts-greffon-20260925`) :
 *
 *   GET  /api/v1/ext/concerts/upcoming  → { concerts, scope, radius_km, city, country, code? }
 *   GET  /api/v1/ext/concerts/location  → { scope, city, postal_code, country, radius_km, located }
 *   POST /api/v1/ext/concerts/location  { city, postal_code, country, scope, radius_km }
 *   Compte gratuit, TOUTES les routes → refus `ModuleRefusal`
 *     { error: 'module_required', code: 'module_not_owned' | 'module_account_not_linked', … }
 *
 * Ce qui est gardé : le greffon non installé (message + gestionnaire), le
 * refus Premium traduit SANS liste (décision du 25/09/2026 : pas de version
 * réduite), le compte non relié distingué du non-possédé, la saisie de la
 * commune et le POST exact, le périmètre, la liste groupée par artiste, le
 * serveur trop ancien (404 sur `/location`) qui garde l'écran lisible, et la
 * tuile Extensions qui ramène l'entrée de la barre latérale.
 */

const CONCERTS = [
  { artist_name: 'Radiohead', event_date: '2026-11-02', venue: 'Accor Arena', city: 'Paris', country: 'FR', event_url: 'https://t.example/rh' },
  { artist_name: 'Air', event_date: '2026-10-20', venue: 'Le Zénith', city: 'Nantes', country: 'FR', event_url: null },
  { artist_name: 'Radiohead', event_date: '2026-11-04', venue: 'Halle Tony Garnier', city: 'Lyon', country: 'FR' },
];

type Appel = { url: string; method: string; body: unknown };
let appels: Appel[] = [];
let greffon: Record<string, unknown>[] = [];
let refus: { status: number; corps: unknown } | null = null;
let localisation: { status: number; corps: unknown } = { status: 200, corps: {} };
/** Le périmètre que le « serveur » a enregistré : `upcoming` le renvoie. */
let perimetreServeur = 'radius';
/** La commune que `upcoming` renvoie ('' = rien d'enregistré). */
let villeServeur = 'Nantes';
/** Échec imposé au seul `POST /location`, ou à la seule lecture `upcoming`. */
let echecPost: { status: number; corps: unknown } | null = null;
let echecUpcoming: { status: number; corps: unknown } | null = null;
/** Ce que le nuage retient à la place de la demande (commune introuvable). */
let retenuPost: Record<string, unknown> | null = null;

function reponse(status: number, corps: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: String(status),
    headers: new Headers({ 'content-type': 'application/json' }),
    json: async () => corps,
    text: async () => (corps === '' ? '' : JSON.stringify(corps)),
  } as unknown as Response;
}

beforeAll(async () => { await preparerLocale('fr'); });

beforeEach(() => {
  vi.useFakeTimers();
  appels = [];
  refus = null;
  perimetreServeur = 'radius';
  villeServeur = 'Nantes';
  echecPost = null;
  echecUpcoming = null;
  retenuPost = null;
  for (const n of get(notifications)) notifications.dismiss(n.id);
  localisation = {
    status: 200,
    corps: { scope: 'radius', city: 'Nantes', postal_code: '44000', country: 'FR', radius_km: 50, located: true },
  };
  greffon = [{ name: 'concerts', type: 'sdk', installed: true, enabled: true, premium: true, compatible: true, description: 'x', version: '1' }];
  concertsPlugin.set({ name: 'concerts', installed: true, enabled: true });
  activeView.set('concerts');
  v2SettingsTarget.set(null);
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const u = String(url);
      const method = (init?.method ?? 'GET').toUpperCase();
      appels.push({ url: u, method, body: init?.body ? JSON.parse(String(init.body)) : undefined });
      if (u.includes('/ext/concerts/')) {
        if (refus) return reponse(refus.status, refus.corps);
        if (u.includes('/ext/concerts/upcoming')) {
          if (echecUpcoming) return reponse(echecUpcoming.status, echecUpcoming.corps);
          return reponse(200, { concerts: CONCERTS, scope: perimetreServeur, radius_km: 50, city: villeServeur, country: 'FR' });
        }
        if (u.includes('/ext/concerts/location')) {
          if (method === 'POST') {
            if (localisation.status !== 200) return reponse(localisation.status, localisation.corps);
            if (echecPost) return reponse(echecPost.status, echecPost.corps);
            const b = JSON.parse(String(init?.body));
            const rendu = { scope: b.scope, city: b.city, country: b.country, radius_km: b.radius_km, located: true, ...(retenuPost ?? {}) };
            perimetreServeur = rendu.scope;
            return reponse(200, rendu);
          }
          return reponse(localisation.status, localisation.corps);
        }
      }
      if (/\/plugins\/concerts\/install$/.test(u)) {
        greffon = [{ ...greffon[0], installed: true, enabled: true }];
        return reponse(200, { success: true, message: 'ok', restart_required: false });
      }
      if (u.includes('/marketplace')) return reponse(200, { plugins: [] });
      if (u.endsWith('/plugins')) return reponse(200, greffon);
      if (u.includes('/plugins/docs')) return reponse(200, {});
      return reponse(200, {});
    }),
  );
  vi.stubGlobal('WebSocket', class {
    close() {}
    addEventListener() {}
    removeEventListener() {}
    send() {}
  } as unknown as typeof WebSocket);
});

let hote: HTMLDivElement | null = null;
let monte: Record<string, unknown> | null = null;

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  hote?.remove();
  hote = null;
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

async function laisserFaire() {
  for (let i = 0; i < 8; i++) {
    await vi.advanceTimersByTimeAsync(0);
    flushSync();
  }
}

async function poser(Vue: typeof ConcertsView | typeof PluginsV2): Promise<HTMLDivElement> {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(Vue as any, { target: hote });
  flushSync();
  await laisserFaire();
  return hote;
}

const appelsConcerts = () => appels.filter((a) => a.url.includes('/ext/concerts/'));
const texte = (el: HTMLElement) => (el.textContent ?? '').replace(/\s+/g, ' ');
const bouton = (el: HTMLElement, libelle: string) =>
  [...el.querySelectorAll('button')].find((b) => (b.textContent ?? '').trim() === libelle) as HTMLButtonElement | undefined;

describe('Concerts — greffon non installé', () => {
  it('explique le geste, mène au gestionnaire, et ne tire sur aucune route', async () => {
    concertsPlugin.set({ name: 'concerts', installed: false, enabled: false });
    const el = await poser(ConcertsView);
    expect(texte(el)).toContain(fr['concerts.greffonAInstaller']);
    expect(appelsConcerts()).toHaveLength(0);
    bouton(el, fr['concerts.ouvrirGestionnaire'])!.click();
    expect(get(activeView)).toBe('plugins');
  });
});

describe('Concerts — compte gratuit : refus clair, aucune liste', () => {
  it('module non possédé (402) : phrase traduite, lien vers l’offre, pas de liste ni de crans', async () => {
    refus = {
      status: 402,
      corps: { error: 'module_required', code: 'module_not_owned', module: 'concerts', action: 'purchase_module', message: 'the concerts module is a paid add-on', upgrade_url: 'https://mozaiklabs.fr/pricing' },
    };
    const el = await poser(ConcertsView);
    expect(texte(el)).toContain(fr['concerts.premiumRequis']);
    expect(texte(el)).not.toContain('paid add-on');
    const lien = el.querySelector('a.cc-principal') as HTMLAnchorElement;
    expect(lien.href).toContain('mozaiklabs.fr/pricing');
    expect(el.querySelector('.cc-liste')).toBeNull();
    expect(bouton(el, fr['concerts.dansMonPays'])).toBeUndefined();
    expect(texte(el)).not.toContain('Radiohead');
    // Un refus vaut pour tout le greffon : on ne le récolte pas deux fois.
    expect(appelsConcerts().map((a) => a.url)).toHaveLength(1);
  });

  it('même refus servi en 403 : reconnu par son corps, pas par son statut', async () => {
    refus = { status: 403, corps: { error: 'module_required', code: 'module_not_owned', module: 'concerts' } };
    const el = await poser(ConcertsView);
    expect(texte(el)).toContain(fr['concerts.premiumRequis']);
    expect(texte(el)).not.toContain(fr['concerts.indisponible']);
    expect(el.querySelector('.cc-liste')).toBeNull();
  });

  it('compte non relié : dit de relier le compte, pas d’acheter, et y mène', async () => {
    refus = { status: 402, corps: { error: 'module_required', code: 'module_account_not_linked', module: 'concerts', action: 'link_account' } };
    const el = await poser(ConcertsView);
    expect(texte(el)).toContain(fr['concerts.compteNonRelie']);
    expect(el.querySelector('a.cc-principal')).toBeNull();
    bouton(el, fr['concerts.relierCompte'])!.click();
    expect(get(activeView)).toBe('settings');
    expect(get(v2SettingsTarget)).toEqual({ tab: 'system', section: 'cloud' });
  });
});

describe('Concerts — compte Premium', () => {
  it('pré-remplit la commune enregistrée et liste les concerts groupés par artiste', async () => {
    const el = await poser(ConcertsView);
    const [communeInput, cpInput] = [...el.querySelectorAll('.cc-commune input')] as HTMLInputElement[];
    expect(communeInput.value).toBe('Nantes');
    expect(cpInput.value).toBe('44000');
    const artistes = [...el.querySelectorAll('.cc-liste > li > h3')].map((h) => h.textContent);
    expect(artistes).toEqual(['Air', 'Radiohead']);
    expect(el.querySelectorAll('.cc-dates li')).toHaveLength(3);
    expect(texte(el)).toContain('Accor Arena');
    expect(appelsConcerts().filter((a) => a.method === 'POST')).toHaveLength(0);
  });

  it('saisie de la commune : POST exact, puis relecture de la liste', async () => {
    const el = await poser(ConcertsView);
    const [communeInput, cpInput] = [...el.querySelectorAll('.cc-commune input')] as HTMLInputElement[];
    communeInput.value = '  Rezé ';
    communeInput.dispatchEvent(new Event('input', { bubbles: true }));
    cpInput.value = '44400';
    cpInput.dispatchEvent(new Event('input', { bubbles: true }));
    const select = el.querySelector('.cc-commune select') as HTMLSelectElement;
    select.value = '200';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    flushSync();
    const avant = appelsConcerts().length;
    bouton(el, fr['concerts.appliquer'])!.click();
    await laisserFaire();
    const posts = appelsConcerts().filter((a) => a.method === 'POST');
    expect(posts).toHaveLength(1);
    expect(posts[0].url).toMatch(/\/api\/v1\/ext\/concerts\/location$/);
    expect(posts[0].body).toEqual({ city: 'Rezé', postal_code: '44400', country: 'FR', scope: 'radius', radius_km: 200 });
    // La liste est relue après l'enregistrement.
    expect(appelsConcerts().slice(avant).some((a) => a.url.includes('/upcoming'))).toBe(true);
  });

  it('changer de périmètre enregistre le cran choisi, et le rayon disparaît', async () => {
    const el = await poser(ConcertsView);
    bouton(el, fr['concerts.dansMonPays'])!.click();
    await laisserFaire();
    const posts = appelsConcerts().filter((a) => a.method === 'POST');
    expect(posts).toHaveLength(1);
    expect(posts[0].body).toMatchObject({ scope: 'country', country: 'FR', city: 'Nantes' });
    expect(el.querySelector('.cc-commune')).toBeNull();
  });
});

describe('Concerts — serveur trop ancien (404 sur /location)', () => {
  it('dit de mettre à jour, garde la liste, et ne propose aucun réglage voué au 404', async () => {
    localisation = { status: 404, corps: '' };
    const el = await poser(ConcertsView);
    expect(texte(el)).toContain(fr['concerts.serveurTropAncien']);
    expect(el.querySelectorAll('.cc-liste > li')).toHaveLength(2);
    expect(bouton(el, fr['concerts.dansMonPays'])).toBeUndefined();
    expect(el.querySelector('.cc-commune')).toBeNull();
    expect(texte(el)).not.toContain(fr['concerts.indisponible']);
  });
});

describe('Concerts — tuile Extensions', () => {
  it('nom et description traduits, badge Premium, installation qui ramène l’entrée latérale', async () => {
    greffon = [{ name: 'concerts', display_name: 'concerts', type: 'sdk', installed: false, enabled: false, premium: true, compatible: true, description: 'Upcoming concerts', version: '0.1.0' }];
    concertsPlugin.set('absent');
    const el = await poser(PluginsV2);
    // Onglet « Catalogue » : un greffon non installé n'est pas dans « Installés ».
    (el.querySelectorAll('nav.tabs button')[1] as HTMLButtonElement).click();
    flushSync();
    const tuile = [...el.querySelectorAll('article.pl')].find((a) => a.querySelector('h2')?.textContent === fr['concerts.greffonNom']);
    expect(tuile, 'tuile Concerts absente').toBeTruthy();
    expect(texte(tuile as HTMLElement)).toContain(fr['concerts.greffonDescription']);
    expect(tuile!.querySelector('.prem')?.textContent).toBe(fr['v2.plug.premium']);
    // La liste lue a déjà rafraîchi la barre latérale : l'entrée apparaît.
    expect(get(concertsUtilisable)).toBe(true);

    (tuile!.querySelector('button.go') as HTMLButtonElement).click();
    await laisserFaire();
    expect(appels.some((a) => a.method === 'POST' && /\/plugins\/concerts\/install$/.test(a.url))).toBe(true);
    const etat = get(concertsPlugin);
    expect(etat !== null && etat !== 'absent' && etat.enabled).toBe(true);

    const ouvrir = el.querySelector('button.ouvrir-concerts') as HTMLButtonElement | null;
    expect(ouvrir).not.toBeNull();
    ouvrir!.click();
    expect(get(activeView)).toBe('concerts');
  });

  it('un refus Premium à l’installation se dit en phrase, jamais en code', async () => {
    greffon = [{ name: 'concerts', type: 'sdk', installed: false, enabled: false, premium: true, compatible: true, description: 'x', version: '1' }];
    const el = await poser(PluginsV2);
    (el.querySelectorAll('nav.tabs button')[1] as HTMLButtonElement).click();
    flushSync();
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      const u = String(url);
      if (/\/install$/.test(u)) return reponse(402, { error: 'module_required', code: 'module_not_owned' });
      if (u.includes('/marketplace')) return reponse(200, { plugins: [] });
      if (u.endsWith('/plugins')) return reponse(200, greffon);
      void init;
      return reponse(200, {});
    }));
    (el.querySelector('article.pl button.go') as HTMLButtonElement).click();
    await laisserFaire();
    const bandeau = el.querySelector('div.err');
    expect(bandeau?.textContent).toContain(fr['premium.required']);
    expect(bandeau?.textContent).not.toContain('premium_required');
  });
});

const toasts = () => get(notifications).map((n) => n.message);

describe('Concerts — contrat réel du lot serveur (srv#5102)', () => {
  it('rien d’enregistré (`concerts.no_location`) : « partout », commune vide, aucun avertissement', async () => {
    localisation = {
      status: 200,
      corps: { scope: 'world', city: '', postal_code: null, country: '', radius_km: 100, code: 'concerts.no_location' },
    };
    const el = await poser(ConcertsView);
    expect(bouton(el, fr['concerts.partout'])!.classList.contains('actif')).toBe(true);
    expect(el.querySelector('.cc-commune')).toBeNull();
    expect(el.querySelector('.cc-introuvable')).toBeNull();
    expect(el.querySelectorAll('.cc-liste > li')).toHaveLength(2);
  });

  it('🔴 « Autour de moi » avec une commune vide : ouvre la saisie sans rien enregistrer', async () => {
    perimetreServeur = 'world';
    villeServeur = '';
    localisation = {
      status: 200,
      corps: { scope: 'world', city: '', postal_code: null, country: '', radius_km: 100, code: 'concerts.no_location' },
    };
    const el = await poser(ConcertsView);
    expect(el.querySelector('.cc-commune')).toBeNull();
    bouton(el, fr['concerts.autourDeMoi'])!.click();
    await laisserFaire();
    // Les champs sont là : c'est le seul endroit où saisir la commune.
    const [communeInput, cpInput] = [...el.querySelectorAll('.cc-commune input')] as HTMLInputElement[];
    expect(communeInput).toBeDefined();
    expect(cpInput).toBeDefined();
    expect(el.querySelector('.cc-commune select')).not.toBeNull();
    expect(bouton(el, fr['concerts.autourDeMoi'])!.classList.contains('actif')).toBe(true);
    // Rien d'enregistré, aucune erreur « commune requise » au simple clic.
    expect(appelsConcerts().filter((a) => a.method === 'POST')).toHaveLength(0);
    expect(get(notifications).map((n) => n.message)).not.toContain(fr['concerts.communeRequise']);

    // « Appliquer » sans commune : l'erreur, et toujours aucun POST.
    bouton(el, fr['concerts.appliquer'])!.click();
    await laisserFaire();
    expect(get(notifications).map((n) => n.message)).toContain(fr['concerts.communeRequise']);
    expect(appelsConcerts().filter((a) => a.method === 'POST')).toHaveLength(0);

    // Commune saisie puis « Appliquer » : le POST part avec le rayon.
    communeInput.value = 'Rezé';
    communeInput.dispatchEvent(new Event('input', { bubbles: true }));
    flushSync();
    bouton(el, fr['concerts.appliquer'])!.click();
    await laisserFaire();
    const posts = appelsConcerts().filter((a) => a.method === 'POST');
    expect(posts).toHaveLength(1);
    expect(posts[0].body).toMatchObject({ city: 'Rezé', scope: 'radius' });
  });

  it('🔴 `located: false` : le nuage retombe sur le pays, et l’avertissement RESTE visible', async () => {
    retenuPost = { scope: 'country', located: false };
    const el = await poser(ConcertsView);
    bouton(el, fr['concerts.appliquer'])!.click();
    await laisserFaire();
    expect(bouton(el, fr['concerts.dansMonPays'])!.classList.contains('actif')).toBe(true);
    expect(el.querySelector('.cc-introuvable')?.textContent).toBe(fr['concerts.communeIntrouvable']);
  });

  it('422 `concerts.invalid_location` sur la commune : phrase traduite, jamais le code', async () => {
    echecPost = { status: 422, corps: { code: 'concerts.invalid_location', field: 'city' } };
    const el = await poser(ConcertsView);
    bouton(el, fr['concerts.appliquer'])!.click();
    await laisserFaire();
    expect(toasts()).toContain(fr['concerts.communeInvalide']);
    expect(toasts().join(' ')).not.toContain('invalid_location');
  });

  it('422 sur un autre champ : phrase générique de localisation refusée', async () => {
    echecPost = { status: 422, corps: { code: 'concerts.invalid_location', field: 'radius_km' } };
    const el = await poser(ConcertsView);
    bouton(el, fr['concerts.appliquer'])!.click();
    await laisserFaire();
    expect(toasts()).toContain(fr['concerts.localisationInvalide']);
  });

  it('409 `concerts.no_instance_id`, 429 et 502 : chacun sa phrase, sans « Server error »', async () => {
    const cas: [number, string, string][] = [
      [409, 'concerts.no_instance_id', 'concerts.pasDInstance'],
      [429, 'concerts.rate_limited', 'concerts.tropDeDemandes'],
      [502, 'concerts.unavailable', 'concerts.indisponible'],
    ];
    for (const [status, code, cle] of cas) {
      for (const n of get(notifications)) notifications.dismiss(n.id);
      echecPost = { status, corps: { code } };
      const el = await poser(ConcertsView);
      bouton(el, fr['concerts.appliquer'])!.click();
      await laisserFaire();
      expect(toasts(), `${status}`).toEqual([fr[cle as keyof typeof fr]]);
      unmount(monte!); monte = null; hote?.remove();
    }
  });

  it('429 sur la lecture : « trop de demandes », pas « service indisponible »', async () => {
    echecUpcoming = { status: 429, corps: { concerts: [], code: 'concerts.rate_limited', retry_after: 60 } };
    const el = await poser(ConcertsView);
    expect(texte(el)).toContain(fr['concerts.tropDeDemandes']);
    expect(texte(el)).not.toContain(fr['concerts.indisponible']);
  });

  it('le refus porte `feature: concerts` en 402 : toujours reconnu', async () => {
    refus = {
      status: 402,
      corps: { error: 'module_required', code: 'module_not_owned', module: 'concerts', feature: 'concerts', action: 'purchase_module', upgrade_url: 'https://mozaiklabs.fr/pricing' },
    };
    const el = await poser(ConcertsView);
    expect(texte(el)).toContain(fr['concerts.premiumRequis']);
    expect(el.querySelector('.cc-liste')).toBeNull();
  });
});

describe('Concerts — tuile de la grille des modules Premium (`Feature::Concerts`)', () => {
  const LANGUES = ['de', 'en', 'es', 'fr', 'hu', 'it', 'ja', 'ko', 'ro', 'sv', 'zh'];

  it('le code `concerts` a son nom dans les ONZE langues', () => {
    const manquantes = LANGUES.filter(
      (l) => !readFileSync(`src/lib/locales/${l}.ts`, 'utf8').includes('"licenseFeature.concerts"'),
    );
    expect(manquantes).toEqual([]);
  });

  it('la grille affiche le nom traduit, pas le code ni le nom anglais du serveur', () => {
    expect(nomFonctionnalite('concerts', 'Concerts', get(t) as (c: string) => string)).toBe(fr['licenseFeature.concerts']);
  });
});
