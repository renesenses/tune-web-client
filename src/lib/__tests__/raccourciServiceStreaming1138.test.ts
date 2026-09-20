// @vitest-environment jsdom
//
// renesenses/tune-web-client#1138 — schmitt (Alain), fil forum 1671,
// réponse 6208, 12/09/2026 :
//
//   « Beaucoup cherché mais pas trouvé la possibilité de mettre en raccourci
//     " Qobuz " dans la colonne de gauche sans passer par streaming. »
//
// Deux défauts dans un seul ticket, et ce fichier les éprouve tous les deux
// PAR LE COMPORTEMENT — jamais en lisant une ligne de source, jamais en
// regardant si un magasin a été écrit.
//
// ## 1. Le raccourci ne retient pas le service
//
// `captureCurrentView()` fige `state.streamingService = get(activeStreamingService)`
// (`stores/shortcuts.ts`). Aucun écran de la coquille v2 n'écrit ce magasin :
// `StreamingV2` garde son onglet dans un `$state` local et le choisit au
// montage par `ongletInitial(services, bandcampLive)` — le PREMIER de la
// rangée. Deux conséquences visibles :
//
//   - la restitution ramène sur le premier service, pas sur celui d'où le
//     raccourci a été posé ;
//   - deux raccourcis posés depuis deux services ont EXACTEMENT le même état
//     capturé (`{streamingService: null}`), donc la même clé de dédoublonnage
//     (`shortcutKey`) : le second n'est jamais créé.
//
// Le second point est le symptôme d'Alain, mot pour mot : il ne peut pas
// obtenir une entrée « Qobuz » à lui dans la colonne de gauche.
//
// ## 2. Aucune entrée par service dans la barre latérale v2
//
// L'ancienne barre (`components/Sidebar.svelte`, section « Sources ») donne un
// bouton NOMMÉ à chaque service connecté. La barre v2 n'a que l'entrée
// générique « Streaming ».
//
// ## 🔴 Ce que ce témoin refuse de faire
//
// Poser `activeStreamingService` à la main, comme le font les gardes
// existantes de la v1. Tout ce qui suit part d'un CLIC sur l'écran réel, et se
// juge sur l'onglet ALLUMÉ dans le DOM après restitution.
//
// 🔴 Et il éprouve un service qui n'est PAS le premier de la rangée. Qobuz est
// en tête de la préférence (#998, `RANG_SOURCE`) : un raccourci Qobuz retombe
// sur Qobuz « par accident » même cassé. C'est Tidal qui tranche.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import { get } from 'svelte/store';

import { activeView } from '../stores/navigation';
import { activeStreamingService, streamingServices } from '../stores/streaming';
import {
  addShortcut,
  navigateToShortcut,
  shortcuts,
  type Shortcut,
} from '../stores/shortcuts';
import StreamingV2 from '../../components/v2/StreamingV2.svelte';
import Sidebar from '../../components/v2/Sidebar.svelte';

/** Monter `StreamingV2` compile un composant de plus de mille lignes. */
vi.setConfig({ testTimeout: 60_000 });

/** Le cas d'Alain, complété d'un second service : Qobuz ET Tidal connectés. */
const SERVICES = {
  qobuz: { enabled: true, authenticated: true, username: 'Alain' },
  tidal: { enabled: true, authenticated: true, username: null },
  deezer: { enabled: true, authenticated: false, username: null },
} as any;

function reponse(corps: unknown) {
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    headers: new Map([['content-type', 'application/json']]),
    json: async () => corps,
    text: async () => JSON.stringify(corps),
  } as unknown as Response;
}

class ObservateurInerte {
  observe() {}
  unobserve() {}
  disconnect() {}
}

/**
 * Le serveur : deux services connectés, pas d'extension Bandcamp, et une
 * configuration qui accepte tout (les raccourcis se persistent par
 * `PATCH /config`).
 */
function serveur() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: any) => {
      const u = String(url);
      if (/\/ext\/bandcamp\/tags/.test(u)) throw new Error('extension non chargée');
      if (/\/streaming\/services/.test(u)) return reponse(SERVICES);
      if (/\/config/.test(u)) return reponse({});
      return reponse([]);
    }),
  );
}

let hote: HTMLDivElement | null = null;
let monte: Record<string, any> | null = null;

async function laisserTourner(n = 40) {
  for (let i = 0; i < n; i++) {
    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));
    flushSync();
  }
}

function demonter() {
  if (monte) {
    try {
      unmount(monte);
    } catch {
      /* le démontage n'est pas le sujet */
    }
    monte = null;
  }
  hote!.innerHTML = '';
}

/** Les onglets de services rendus, dans l'ordre du DOM. */
function ongletsRendus(): string[] {
  return Array.from(hote!.querySelectorAll('nav.svcs > button')).map((b) =>
    (b.textContent ?? '').replace(/\s+/g, ' ').trim(),
  );
}

/** L'onglet ALLUMÉ — la seule chose qui dise quel service est réellement ouvert. */
function ongletAllume(): string | null {
  const b = hote!.querySelector('nav.svcs > button.on');
  return b ? (b.textContent ?? '').replace(/\s+/g, ' ').trim() : null;
}

/**
 * 🔴 L'ÉCRAN EST IMPORTÉ À LA COLLECTE, PAS DANS LE CAS — #1326 / #1333.
 *
 * Un `await import('….svelte')` posé DANS un cas fait payer la compilation du
 * composant par vite au chronomètre de ce cas. Sous charge (huit portes
 * simultanées sur Shrek), le chronomètre saute : vitest déclare le cas expiré,
 * `afterEach` retire l'hôte, le cas suivant s'ouvre — puis la continuation
 * abandonnée reprend et exécute son `mount(…, { target: hote! })`. `hote`
 * est une variable de MODULE : elle désigne alors l'hôte du cas SUIVANT. Deux
 * écrans dans la même boîte, et un faux rouge qui accuse le code de terrain.
 *
 * L'import statique déplace la compilation vers la COLLECTE, hors de tout
 * chronomètre, et rend `mount` SYNCHRONE ici : plus aucune continuation ne peut
 * se poser dans l'hôte du cas suivant. `StreamingV2.svelte` n'a pas de
 * `<script module>` : l'importer avant les `vi.stubGlobal(…)` ne déclenche rien.
 * Gardé par `composantsALaCollecte1333.test.ts`.
 */
async function monterEcran() {
  monte = mount(StreamingV2 as any, { target: hote! });
  for (let i = 0; i < 60; i++) {
    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));
    flushSync();
    if (ongletsRendus().length) break;
  }
  await laisserTourner(10);
}

function cliquerOnglet(motif: RegExp) {
  const b = Array.from(hote!.querySelectorAll('nav.svcs > button')).find((x) =>
    motif.test(x.textContent ?? ''),
  ) as HTMLButtonElement | undefined;
  expect(b, `aucun onglet ${motif} dans [${ongletsRendus().join(' | ')}]`).toBeDefined();
  b!.click();
  flushSync();
}

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', ObservateurInerte as any);
  if (!('IntersectionObserver' in globalThis)) {
    vi.stubGlobal('IntersectionObserver', ObservateurInerte as any);
  }
  serveur();
  hote = document.createElement('div');
  document.body.appendChild(hote);
  shortcuts.set([]);
  activeStreamingService.set(null);
  streamingServices.set({});
  activeView.set('streaming');
});

afterEach(() => {
  demonter();
  hote?.remove();
  hote = null;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('#1138 — un raccourci posé depuis un service ROUVRE ce service', () => {
  it('🔴 Tidal : le raccourci rouvre Tidal, pas le premier onglet de la rangée', async () => {
    await monterEcran();
    expect(ongletsRendus().length, 'la rangée de services est vide').toBeGreaterThan(1);

    // L'utilisateur ouvre Tidal, puis pose le signet de l'en-tête.
    cliquerOnglet(/tidal/i);
    await laisserTourner(10);
    expect(ongletAllume(), 'le clic n’a pas ouvert Tidal').toMatch(/tidal/i);

    const sc = (await addShortcut('Tidal', '⭐')) as Shortcut;
    expect(sc, 'aucun raccourci créé').toBeTruthy();

    // Il s'en va, puis revient par le raccourci.
    demonter();
    activeView.set('home');
    navigateToShortcut(sc);
    await laisserTourner(5);
    expect(get(activeView)).toBe('streaming');
    await monterEcran();

    expect(
      ongletAllume(),
      `le raccourci « ${sc.name} » rouvre [${ongletAllume()}] ; rangée : [${ongletsRendus().join(' | ')}]`,
    ).toMatch(/tidal/i);
  });

  it('🔴 Alain : un raccourci Qobuz et un raccourci Tidal sont DEUX raccourcis', async () => {
    // « mettre en raccourci " Qobuz " dans la colonne de gauche ». Tant que la
    // capture rend le même état pour tous les services, le second raccourci
    // s'écrase sur le premier par dédoublonnage (`shortcutKey`) : l'entrée
    // demandée reste inatteignable dès qu'un autre service est branché.
    await monterEcran();
    cliquerOnglet(/qobuz/i);
    await laisserTourner(10);
    const qobuz = (await addShortcut('Qobuz', '⭐')) as Shortcut;

    cliquerOnglet(/tidal/i);
    await laisserTourner(10);
    const tidal = (await addShortcut('Tidal', '⭐')) as Shortcut;

    const noms = get(shortcuts).map((s) => s.name);
    expect(noms, `raccourcis réellement enregistrés : [${noms.join(' | ')}]`).toEqual([
      'Qobuz',
      'Tidal',
    ]);
    expect(qobuz.id, 'les deux raccourcis sont le MÊME objet').not.toBe(tidal.id);

    // Et celui d'Alain rouvre bien Qobuz.
    demonter();
    activeView.set('home');
    navigateToShortcut(qobuz);
    await laisserTourner(5);
    await monterEcran();
    expect(ongletAllume()).toMatch(/qobuz/i);
  });

  it('TÉMOIN — sans raccourci, l’écran s’ouvre toujours sur le premier de la rangée', async () => {
    // Sans ce témoin, « ouvrir toujours le dernier service visité » passerait
    // les deux tests ci-dessus tout en changeant le comportement par défaut.
    await monterEcran();
    expect(ongletAllume()).toMatch(/qobuz/i);
  });
});

describe('#1138 — la colonne de gauche porte une entrée par service connecté', () => {
  /** Les libellés des entrées de navigation de la barre v2. */
  function entrees(): string[] {
    return Array.from(hote!.querySelectorAll('button.nav')).map((b) =>
      (b.textContent ?? '').replace(/\s+/g, ' ').trim(),
    );
  }

  // Même motif, même parade : `Sidebar` est importé en tête de fichier.
  async function monterBarre() {
    monte = mount(Sidebar as any, { target: hote! });
    await laisserTourner(40);
  }

  it('🔴 « Qobuz » est une entrée de la barre, sans passer par Streaming', async () => {
    await monterBarre();
    const rendues = entrees();
    expect(
      rendues.some((l) => /^qobuz$/i.test(l)),
      `entrées rendues : [${rendues.join(' | ')}]`,
    ).toBe(true);
  });

  it('TÉMOIN — un service NON connecté n’y est pas', async () => {
    await monterBarre();
    const rendues = entrees();
    expect(rendues.some((l) => /deezer/i.test(l)), `[${rendues.join(' | ')}]`).toBe(false);
  });

  it('🔴 cliquer « TIDAL » ouvre l’écran Streaming SUR Tidal', async () => {
    await monterBarre();
    const b = Array.from(hote!.querySelectorAll('button.nav')).find((x) =>
      /^tidal$/i.test((x.textContent ?? '').trim()),
    ) as HTMLButtonElement | undefined;
    expect(b, `aucune entrée TIDAL dans [${entrees().join(' | ')}]`).toBeDefined();
    b!.click();
    await laisserTourner(10);
    expect(get(activeView)).toBe('streaming');

    demonter();
    await monterEcran();
    expect(
      ongletAllume(),
      `rangée : [${ongletsRendus().join(' | ')}]`,
    ).toMatch(/tidal/i);
  });
});
