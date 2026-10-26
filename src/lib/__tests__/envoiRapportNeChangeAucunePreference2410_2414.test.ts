// @vitest-environment jsdom
//
// #2410 / #2414 — Alex (rc8) : après l'envoi d'un rapport de bogue ou d'un
// ticket de support, l'accueil revient à la mise en page par défaut (tous les
// widgets, leur emplacement, leur ordre) ET les crêtes / VU-mètres de la barre
// de lecture, qu'il éteint toujours en premier, se rallument. Ce n'est pas un
// seul réglage : c'est l'ensemble des préférences.
//
// Ce témoin joue la séquence de bout en bout contre un faux serveur qui garde
// TOUT ce que Tune range — préférences du profil (`/profiles/1/settings`, qui
// REMPLACE l'objet) ET préférences d'interface (`/system/config`) — et un
// navigateur dont le stockage local porte les mêmes réglages. Pendant l'envoi,
// le serveur est « occupé » (il compose les diagnostics) : les relectures
// échouent, les évènements qui déclenchent une relecture (retour sur l'onglet,
// retour du réseau) tombent, et deux écritures de préférences passent. À la
// fin, RIEN n'a changé : ni côté serveur, ni dans le navigateur, ni en
// mémoire, ni sur l'accueil remonté.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';

vi.setConfig({ testTimeout: 60_000 });

/** Les réglages d'interface d'Alex : tout ce qui n'est PAS le défaut. */
const INTERFACE_ALEX = {
  peakMeterStyle: 'off',
  barreVuMetres: false,
  visualiseurBarre: false,
  v2Theme: 'clear-grey',
  language: 'fr',
  settingsLevel: 'expert',
  startupView: 'library',
  tooltipsEnabled: false,
};
/** Les préférences du profil 1 : l'accueil réarrangé, deux widgets retirés. */
const PROFIL_ALEX = {
  accueil_temoin: ['mes-playlists', 'temoin'],
  home_l1_migre: true,
  home_stats: ['lectures'],
  ecouter_plus_tard: 7,
};

let profil: Record<string, unknown>;
let config: Record<string, unknown>;
let occupe = false;
let ecritures: string[] = [];

function rep(status: number, corps: unknown, headers: Record<string, string> = {}): Response {
  const texte = typeof corps === 'string' ? corps : JSON.stringify(corps);
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    headers: new Headers({ 'Content-Type': 'application/json', ...headers }),
    text: async () => texte,
    json: async () => JSON.parse(texte),
  } as unknown as Response;
}

function poserLeServeur() {
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const methode = (init?.method ?? 'GET').toUpperCase();
    const lecture = methode === 'GET';
    if (occupe && lecture && /\/(profiles\/1\/settings|system\/config)/.test(url)) {
      throw new TypeError('Failed to fetch');
    }
    if (/\/profiles\/1\/settings/.test(url)) {
      if (!lecture) { ecritures.push(`POST ${url}`); profil = JSON.parse(String(init!.body)); }
      return rep(200, profil);
    }
    if (/\/system\/config/.test(url)) {
      if (!lecture) {
        ecritures.push(`${methode} ${url}`);
        config = { ...config, ...JSON.parse(String(init!.body)) };
      }
      return rep(200, config);
    }
    if (/bug-report\/markdown/.test(url)) {
      await new Promise((r) => setTimeout(r, 30));
      return rep(200, '# diagnostics', { 'Content-Type': 'text/markdown' });
    }
    if (/bug-report\/submit/.test(url)) {
      await new Promise((r) => setTimeout(r, 30));
      return rep(200, { status: 'ok', url: 'https://forum.example/t', slug: 'x', images: 0 });
    }
    if (/support\/tickets/.test(url)) return rep(200, { id: 1 });
    if (/system\/profile/.test(url)) return rep(200, { os: 'linux' });
    return rep(200, []);
  }));
}

const souffler = (ms = 40) => new Promise((r) => setTimeout(r, ms));

let hote: HTMLDivElement | null = null;
let monte: Record<string, any> | null = null;
// `vi.resetModules()` donne à chaque cas ses propres modules : Svelte aussi doit
// venir du MÊME registre que les composants, sinon `onMount` s'exécute hors d'un
// composant (`effect_orphan`).
let svelte: typeof import('svelte');

beforeEach(() => {
  vi.resetModules();
  profil = JSON.parse(JSON.stringify(PROFIL_ALEX));
  config = { ui_preferences: JSON.stringify(INTERFACE_ALEX) };
  occupe = false;
  ecritures = [];
  localStorage.clear();
  localStorage.setItem('tune-preferences', JSON.stringify(INTERFACE_ALEX));
  poserLeServeur();
});

afterEach(() => {
  if (monte) { try { svelte.unmount(monte); } catch { /* sans objet */ } }
  monte = null;
  hote?.remove();
  hote = null;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const bande = (id: string) => ({
  id, cleTitre: 'v2.home.wStats', forme: 'bande' as const,
  charger: async () => [{ id: `${id}-1`, titre: `contenu de ${id}`, sousTitre: '' }],
});

async function monterLAccueil() {
  svelte = await import('svelte');
  const { default: PageWidgets } = await import('../../components/v2/PageWidgets.svelte');
  const { currentProfileId } = await import('../stores/profile');
  currentProfileId.set(1);
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = svelte.mount(PageWidgets, {
    target: hote,
    props: {
      catalogue: [bande('temoin'), bande('genres'), bande('mes-playlists')],
      dispositionDefaut: ['temoin', 'genres', 'mes-playlists'],
      cle: 'accueil_temoin',
    },
  });
  svelte.flushSync();
  await souffler(120);
  svelte.flushSync();
  return hote;
}

const ordre = (h: HTMLElement) =>
  ['contenu de mes-playlists', 'contenu de temoin', 'contenu de genres']
    .map((m) => ({ m, i: (h.textContent ?? '').indexOf(m) }))
    .filter((x) => x.i >= 0)
    .sort((a, b) => a.i - b.i)
    .map((x) => x.m);

describe('aucune préférence ne change après l’envoi d’un rapport ou d’un ticket', () => {
  for (const envoi of ['rapport de bogue', 'ticket de support'] as const) {
    it(`🔴 ${envoi} : serveur occupé, relectures en panne, écritures concurrentes`, async () => {
      const api = await import('../api');
      const { preferences, syncPreferencesFromServer } = await import('../stores/preferences');

      // L'état de départ : le navigateur et le serveur disent la même chose.
      await syncPreferencesFromServer();
      const avantMemoire = JSON.parse(JSON.stringify(get(preferences)));
      for (const [cle, valeur] of Object.entries(INTERFACE_ALEX)) {
        expect((avantMemoire as Record<string, unknown>)[cle], `prémisse : ${cle}`).toEqual(valeur);
      }
      const accueil = await monterLAccueil();
      const ordreAvant = ordre(accueil);
      expect(ordreAvant, 'prémisse : l’accueil réarrangé s’affiche').toEqual([
        'contenu de mes-playlists', 'contenu de temoin',
      ]);
      const profilAvant = JSON.parse(JSON.stringify(profil));
      const configAvant = JSON.parse(JSON.stringify(config));
      const stockageAvant = localStorage.getItem('tune-preferences');
      ecritures = [];

      // L'ENVOI. Le serveur compose les diagnostics : il est occupé.
      occupe = true;
      const evenements = (async () => {
        await souffler(5);
        document.dispatchEvent(new Event('visibilitychange'));
        window.dispatchEvent(new Event('online'));
        window.dispatchEvent(new Event('focus'));
      })();
      const ecrituresConcurrentes = Promise.all([
        api.setProfilePreferences(1, { ecouter_plus_tard: 9 }).then(() => 'ecrit', () => 'refuse'),
        api.setProfilePreferences(1, { theme: 'x' }).then(() => 'ecrit', () => 'refuse'),
      ]);
      if (envoi === 'rapport de bogue') {
        await api.submitBugReport('Le bouton ne répond pas');
      } else {
        const form = new FormData();
        form.append('subject', 'Un souci');
        form.append('body', 'Détails');
        try { form.append('logs', await api.getBugReportMarkdown()); } catch { /* sans journaux */ }
        try { form.append('system', JSON.stringify(await api.getSystemProfile())); } catch { /* sans fiche */ }
        await api.createSupportTicketMultipart(form);
      }
      await evenements;
      expect(await ecrituresConcurrentes, 'une lecture ratée a laissé passer une écriture').toEqual(['refuse', 'refuse']);
      occupe = false;
      await souffler(80);

      // RIEN n'a changé.
      expect(profil, 'préférences du profil (accueil, chiffres, écouter plus tard…)').toEqual(profilAvant);
      expect(config, 'préférences d’interface côté serveur (crêtes, thème, langue…)').toEqual(configAvant);
      expect(localStorage.getItem('tune-preferences'), 'préférences d’interface du navigateur').toBe(stockageAvant);
      expect(JSON.parse(JSON.stringify(get(preferences))), 'préférences d’interface en mémoire').toEqual(avantMemoire);
      expect(
        ecritures.filter((e) => /settings|config/.test(e)),
        'une écriture de préférences est partie sans geste de l’utilisateur',
      ).toEqual([]);

      // Et l'accueil remonté montre la même liste dans le même ordre.
      await new Promise<void>((r) => { svelte.unmount(monte!); monte = null; hote!.remove(); r(); });
      const apres = await monterLAccueil();
      expect(ordre(apres), 'la liste ou l’ordre des widgets a changé').toEqual(ordreAvant);
    });
  }
});
