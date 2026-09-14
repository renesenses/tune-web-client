// @vitest-environment jsdom
//
// renesenses/tune-web-client#1021 — « Session expirée : l'application devient
// muette — l'écran de connexion est inatteignable dans les deux interfaces ».
//
// LA CHAÎNE DU DÉFAUT, mesurée sur `origin/main` le 14/09/2026 :
//
//   appel HTTP → 401
//     → `api.ts` appelle `clearToken()`      (8 sites : l. 175, 194, 213, 227, 377, 493…)
//        → `auth.ts` efface le jeton et pose `window.location.hash = '#login'`
//           → PERSONNE ne lit ce hash.
//
// `App.svelte` n'écoute le `hashchange` que pour `#tv` (`isTvHash`, l. 707) ;
// `ShellV2` ne lit pas le hash du tout — la v2 navigue par `pushState`. Rien ne
// pose donc jamais `activeView` à `'login'`, et `LoginView` — 352 lignes — était
// un écran inatteignable DANS LES DEUX COQUILLES.
//
// 🔴 CE TÉMOIN MONTE ET DÉCLENCHE, IL NE LIT PAS UNE SOURCE.
//
// La raison est écrite dans `coquilleV2Branchee.test.ts` : une garde qui cherche
// une chaîne dans un fichier « attrape l'oubli pur — un composant jamais importé
// — et rien de plus ; un montage présent mais débranché la laisserait verte ».
// Or c'est exactement la maladie ici : `LoginView` EST importé par `App.svelte`
// (l. 1698), il n'est simplement jamais atteint. Une garde de texte aurait été
// verte depuis toujours.
//
// ⚠️ LA COQUILLE COMPTE, et il y en a DEUX. `main.ts` monte `ShellV2` OU
// `App.svelte`, jamais les deux. L'issue dit « dans les deux interfaces » : le
// témoin monte donc les deux, l'une après l'autre, et déclenche un vrai 401 à
// travers `api.ts` dans chacune.
//
// CONTRE-ÉPREUVE DU DÉFAUT (faite avant d'écrire une ligne de correctif, sur
// `origin/main` intact) : les deux montages ci-dessous échouaient — aucun
// `.login-view` dans le document après le 401. C'est l'application muette de
// l'issue, constatée.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { mount, unmount, flushSync } from 'svelte';
import ShellV2 from '../../components/v2/ShellV2.svelte';
import App from '../../App.svelte';
import * as api from '../api';
import { setToken } from '../auth';
import { activeView } from '../stores/navigation';

const lire = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

/** Une zone valide : sans elle les deux coquilles se peignent sur `{}`. */
const ZONE = { id: 1, name: 'Salon', state: 'stopped', current_track: null, position_ms: 0 };
/** Un profil valide : sans lui la coquille en CRÉE un et rend un avatar vide. */
const PROFIL = { id: 1, name: 'Default', avatar_color: '#6366f1' };

/**
 * Les deux coquilles lisent une douzaine de routes au montage. On ne bouchonne
 * que ce qui compte ; le reste doit simplement avoir la BONNE FORME — une route
 * de collection qui rendrait `{}` ferait exploser un `.find()` ailleurs et
 * masquerait le vrai résultat.
 */
const COLLECTIONS =
  /\/(profiles|zones|playlists|devices|shortcuts|collections|tags|favorites|history|radios|podcasts|artists|albums|tracks|top-artists|recent|genres)(\?|\/|$)/;

function corpsPour(url: string) {
  if (/\/zones(\?|$)/.test(url)) return [ZONE];
  if (/\/profiles(\?|$)/.test(url)) return [PROFIL];
  if (url.includes('/queue')) return { tracks: [], position: 0 };
  return COLLECTIONS.test(url) ? [] : {};
}

/** `true` : le serveur a cessé de reconnaître le jeton. C'est tout le sujet. */
let jetonRefuse = false;

function reponsePour(url: string) {
  if (jetonRefuse) {
    return {
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
      headers: new Map([['content-type', 'application/json']]),
      json: async () => ({ detail: 'token expired' }),
      text: async () => '{"detail":"token expired"}',
    } as unknown as Response;
  }
  const corps = corpsPour(url);
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    headers: new Map([['content-type', 'application/json']]),
    json: async () => corps,
    text: async () => JSON.stringify(corps),
  } as unknown as Response;
}

let hote: HTMLDivElement | null = null;
let monte: Record<string, any> | null = null;

const respirer = (ms = 60) => new Promise((r) => setTimeout(r, ms));

async function monter(coquille: any): Promise<void> {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(coquille, { target: hote, props: {} as any });
  flushSync();
  // La coquille applique sa vue de démarrage : on redemande la nôtre après.
  activeView.set('home');
  flushSync();
  await respirer();
  flushSync();
}

/** L'écran de connexion, tel qu'il se voit à l'écran — pas dans une source. */
const ecranDeConnexion = () => document.querySelector('.login-view');

/**
 * Le geste de l'issue : « reproductible en effaçant `tune_jwt_token` du
 * localStorage et en déclenchant n'importe quel appel ». `apiFetch` est l'un
 * des huit chemins qui appellent `clearToken()` sur 401 (api.ts:175).
 */
async function expirerLaSessionSurUnAppel(): Promise<void> {
  jetonRefuse = true;
  await api.apiFetch('/zones').catch(() => {});
  flushSync();
  await respirer();
  flushSync();
}

beforeEach(() => {
  jetonRefuse = false;
  /*
   * 🔴 `setToken()` ET NON `localStorage.setItem()`.
   *
   * Le drapeau de session vit dans un magasin de MODULE : il survit à la fin
   * d'un test. Le premier `it` le laissait levé, et le suivant trouvait déjà
   * l'écran de connexion à l'écran — sa pré-condition tombait, et un correctif
   * cassé aurait pu passer pour un défaut de témoin.
   *
   * On repart donc du seul geste qui remet une session en marche dans
   * l'application, celui-là même que la reconnexion emprunte. Sur `main`
   * intact, `setToken()` ne fait que poser le jeton : la contre-épreuve du
   * défaut reste valable, ce témoin n'importe rien qui n'existe pas encore.
   */
  setToken('jeton-temoin');
  vi.stubGlobal('fetch', vi.fn(async (url: string) => reponsePour(String(url))));
  vi.stubGlobal(
    'WebSocket',
    class {
      close() {}
      addEventListener() {}
      removeEventListener() {}
      send() {}
    } as unknown as typeof WebSocket,
  );
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as any,
  );
  activeView.set('home');
});

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  if (hote) hote.remove();
  hote = null;
  localStorage.removeItem('tune_jwt_token');
  vi.unstubAllGlobals();
});

describe('#1021 — un 401 amène l’écran de connexion, dans les DEUX coquilles', () => {
  it('coquille ACTUELLE (App.svelte)', async () => {
    await monter(App);
    // Pré-condition : sans elle, un témoin vert ne prouverait rien — l'écran
    // pourrait être là depuis le montage.
    expect(
      ecranDeConnexion(),
      'l’écran de connexion est affiché AVANT le 401 : le témoin ne mesurerait rien.',
    ).toBeNull();

    await expirerLaSessionSurUnAppel();

    expect(
      ecranDeConnexion(),
      'après un 401, aucun écran de connexion dans la coquille actuelle — ' +
        'c’est l’application MUETTE de #1021 : le jeton est effacé, et rien ne le redemande.',
    ).not.toBeNull();
  });

  it('coquille V2 (ShellV2)', async () => {
    await monter(ShellV2);
    expect(
      ecranDeConnexion(),
      'l’écran de connexion est affiché AVANT le 401 : le témoin ne mesurerait rien.',
    ).toBeNull();

    await expirerLaSessionSurUnAppel();

    expect(
      ecranDeConnexion(),
      'après un 401, aucun écran de connexion dans la coquille v2 — ' +
        'la v2 navigue par pushState et ne lit AUCUN hash : `#login` y est lettre morte.',
    ).not.toBeNull();
  });

  it('l’écran courant survit dessous : le calque ne REMPLACE pas l’interface', async () => {
    // Question 1 de l'issue, tranchée : par-dessus, pas à la place. Remplacer
    // l'interface jetterait le contexte — file d'attente, recherche en cours.
    await monter(ShellV2);
    const coquilleAvant = document.querySelector('.v2-shell');
    expect(coquilleAvant, 'la coquille v2 ne s’est pas montée : le reste ne mesure rien.').not.toBeNull();

    await expirerLaSessionSurUnAppel();

    expect(
      document.querySelector('.v2-shell'),
      'la coquille v2 a disparu sous le calque : le contexte de l’utilisateur est perdu.',
    ).not.toBeNull();
    expect(ecranDeConnexion(), 'le calque de connexion manque.').not.toBeNull();
  });

  it('une reconnexion réussie retire le calque', async () => {
    // `setToken()` est le seul point de passage d'une session qui reprend :
    // c'est lui qui rabaisse le drapeau, et non l'écran de connexion — sinon
    // le retour du SSO, qui ne passe pas par cet écran, laisserait le calque.
    await monter(ShellV2);
    await expirerLaSessionSurUnAppel();
    expect(ecranDeConnexion()).not.toBeNull();

    const { setToken } = await import('../auth');
    jetonRefuse = false;
    setToken('jeton-neuf');
    flushSync();
    await respirer();
    flushSync();

    expect(
      ecranDeConnexion(),
      'le calque reste après une reconnexion réussie : l’utilisateur est enfermé dessus.',
    ).toBeNull();
  });
});

describe('#1021 — le câblage, compté sur les APPELS et non sur les noms', () => {
  /**
   * 🔴 UNE GARDE DE TEXTE SE SATISFAIT DE SA PROPRE DÉFINITION.
   *
   * `src.includes('signalerSessionExpiree(')` est VRAI dans le fichier qui
   * déclare `export function signalerSessionExpiree()`. Ce faux vert a été
   * mesuré trois fois. On compte donc les occurrences HORS ligne de définition,
   * et on affiche le compte dans le message d'échec.
   */
  function appels(src: string, nom: string): number {
    const estDefinition = (l: string) =>
      new RegExp(`\\b(?:function|const|let|var|class)\\s+${nom}\\b`).test(l) ||
      new RegExp(`export\\s+\\{[^}]*\\b${nom}\\b`).test(l);
    return src
      .split('\n')
      .filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*'))
      .filter((l) => !estDefinition(l))
      .reduce((n, l) => n + (l.match(new RegExp(`\\b${nom}\\s*\\(`, 'g'))?.length ?? 0), 0);
  }

  it('`clearToken()` lève le drapeau, et `setToken()` le rabaisse', () => {
    const src = lire('../auth.ts');
    const leve = appels(src, 'signalerSessionExpiree');
    const rabaisse = appels(src, 'reprendreLaSession');
    expect(
      leve,
      `auth.ts n’APPELLE pas signalerSessionExpiree() (${leve} appel(s) hors définition) : ` +
        'le 401 effacerait le jeton sans que personne ne l’apprenne.',
    ).toBeGreaterThanOrEqual(1);
    expect(
      rabaisse,
      `auth.ts n’APPELLE pas reprendreLaSession() (${rabaisse} appel(s) hors définition) : ` +
        'le calque survivrait à la reconnexion.',
    ).toBeGreaterThanOrEqual(1);
  });

  it('les DEUX coquilles montent le calque', () => {
    for (const [nom, rel] of [
      ['App.svelte', '../../App.svelte'],
      ['ShellV2.svelte', '../../components/v2/ShellV2.svelte'],
    ] as const) {
      const src = lire(rel);
      // Le MONTAGE, pas l'import : `<SessionExpireeOverlay ... />`. Un import
      // sans balise est précisément le « écrit mais pas branché » que la v2 a
      // déjà produit huit fois.
      const montages = (src.match(/<SessionExpireeOverlay\b/g) ?? []).length;
      expect(
        montages,
        `${nom} ne MONTE pas <SessionExpireeOverlay /> (${montages} balise(s)) : ` +
          'un import seul ne rend rien à l’écran.',
      ).toBeGreaterThanOrEqual(1);
    }
  });

  it('le hash mort a disparu d’auth.ts', () => {
    // `window.location.hash = '#login'` était le mécanisme qui n'avait aucun
    // lecteur. Le laisser en place, c'est garder une seconde navigation
    // concurrente dans une coquille qui navigue par pushState.
    //
    // 🔴 LES COMMENTAIRES SONT ÉCARTÉS, et ce n'est pas un détail : le
    // correctif EXPLIQUE en commentaire ce qu'il a retiré, en citant la ligne
    // mot pour mot. Une garde naïve sur le fichier entier était donc ROUGE sur
    // le code corrigé — mesuré ici même. Un rouge qui vise sa propre
    // explication ne mesure rien.
    const code = lire('../auth.ts')
      .split('\n')
      .filter((l) => {
        const s = l.trim();
        return !s.startsWith('//') && !s.startsWith('*') && !s.startsWith('/*');
      });
    const poses = code.filter((l) => /location\.hash\s*=\s*['"]#login['"]/.test(l));
    expect(
      poses.length,
      `auth.ts pose encore \`#login\` (${poses.length} ligne(s) de code, commentaires exclus) : ` +
        'personne ne lit ce hash, et il salit l’URL de la v2.',
    ).toBe(0);
  });
});
