// @vitest-environment jsdom
//
// renesenses/tune-server-rust#2971 — Jean Valjean, 0.9.127, Windows 11 /
// Firefox, forum 1625 : la barre de rayons d'un autre serveur Tune n'offre que
// « Artistes, Albums, Genres, Pistes, Radios Live », et il faut revenir à la
// racine pour atteindre Années et Playlists.
//
// ## Le correctif est déjà livré
//
// `d705a703` (PR #743) a remis les SEPT identifiants dans `RAYONS_TUNE`, dans
// l'ordre de `ROOT_CONTAINERS` (`tune-core/src/upnp_server.rs`), `years`
// (#1789) et `playlists` (#1802) compris. `mediaServerHome.test.ts` verrouille
// la constante, et il le fait bien.
//
// ## Ce que ce fichier ajoute, et pourquoi
//
// 🔴 La garde existante ne lit que la CONSTANTE : `RAYONS_TUNE.length === 7`.
// Or le défaut de ce dépôt est « écrit mais pas branché » — c'est même ce que
// ce ticket a démontré, le serveur publiant sept conteneurs pendant que l'écran
// n'en peignait cinq. Une constante juste ne prouve pas une barre peinte : si
// `MediaServersView` cessait de dérouler `RAYONS_TUNE`, ou n'affichait ses
// rayons que sous une condition devenue fausse, cette garde resterait VERTE.
//
// Ces témoins-ci MONTENT `MediaServersView`, ouvrent un serveur Tune, comptent
// les boutons RÉELLEMENT PEINTS, et vérifient qu'un clic sur « Années » demande
// bien le conteneur `years` au serveur.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import MediaServersView from '../../components/MediaServersView.svelte';
import { RAYONS_TUNE } from '../mediaServerHome';
import lFr from '../locales/fr';

const fr = lFr as unknown as Record<string, string>;

vi.setConfig({ testTimeout: 30_000 });

/** Ce que Tune annonce dans sa description UPnP (`upnp_server.rs`). */
const SERVEUR_TUNE = {
  id: 'tune-42',
  name: 'Tune du salon',
  manufacturer: 'MozAIk Labs',
  model: 'Tune',
};

/** Un serveur tiers : on ne connaît pas sa racine, donc pas de rayons. */
const SERVEUR_TIERS = {
  id: 'syno-1',
  name: 'DiskStation',
  manufacturer: 'Synology',
  model: 'DiskStation',
};

class ResizeObserverInerte {
  observe() {}
  unobserve() {}
  disconnect() {}
}

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

let hote: HTMLDivElement | null = null;
let monte: Record<string, any> | null = null;
let urls: string[] = [];

function serveur(liste: unknown[]) {
  urls = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: any) => {
      const u = String(url);
      urls.push(u);
      if (/\/network\/media-servers\/[^/]+\/browse/.test(u)) {
        return reponse({
          object_id: new URL(u, 'http://x').searchParams.get('object_id') ?? '0',
          containers: [],
          items: [],
          total_matches: 0,
          number_returned: 0,
        });
      }
      if (/\/network\/media-servers$/.test(u)) return reponse(liste);
      return reponse([]);
    }),
  );
}

async function reposer(tours = 8) {
  for (let i = 0; i < tours; i++) {
    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));
  }
  flushSync();
}

async function poser(): Promise<HTMLDivElement> {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(MediaServersView, { target: hote, props: {} as any });
  flushSync();
  await reposer();
  return hote;
}

/** Ouvre le serveur nommé, depuis la liste réellement peinte. */
async function ouvrirServeur(el: HTMLElement, nom: string) {
  const b = ([...el.querySelectorAll('button.server-item')] as HTMLButtonElement[]).find((x) =>
    (x.textContent ?? '').includes(nom),
  );
  expect(b, `aucun serveur « ${nom} » dans la liste`).toBeTruthy();
  b!.click();
  flushSync();
  await reposer();
}

/** Les libellés des rayons RÉELLEMENT peints, dans l'ordre du DOM. */
function rayonsPeints(el: HTMLElement): string[] {
  return [...el.querySelectorAll('.rayons button.rayon')].map((b) => (b.textContent ?? '').trim());
}

const conteneursDemandes = () =>
  urls
    .filter((u) => /\/browse\?/.test(u))
    .map((u) => new URL(u, 'http://x').searchParams.get('object_id'));

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', ResizeObserverInerte);
});

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  if (hote) hote.remove();
  hote = null;
  vi.unstubAllGlobals();
});

describe('la barre de rayons d’un serveur Tune', () => {
  it('🔴 elle en peint SEPT, pas cinq', async () => {
    serveur([SERVEUR_TUNE]);
    const el = await poser();
    await ouvrirServeur(el, 'Tune du salon');
    const peints = rayonsPeints(el);
    expect(peints, 'la barre ne peint pas les sept rayons de la racine').toHaveLength(7);
    // Les deux qui manquaient à Jean Valjean.
    expect(peints).toContain(fr['common.years']);
    expect(peints).toContain(fr['nav.playlists']);
  });

  it('elle suit l’ordre et les libellés de `RAYONS_TUNE`', async () => {
    serveur([SERVEUR_TUNE]);
    const el = await poser();
    await ouvrirServeur(el, 'Tune du salon');
    expect(rayonsPeints(el)).toEqual(RAYONS_TUNE.map((r) => fr[r.cle]));
  });

  it('cliquer « Années » DEMANDE le conteneur `years` au serveur', async () => {
    serveur([SERVEUR_TUNE]);
    const el = await poser();
    await ouvrirServeur(el, 'Tune du salon');
    urls.length = 0;

    const annees = ([...el.querySelectorAll('.rayons button.rayon')] as HTMLButtonElement[]).find(
      (b) => (b.textContent ?? '').trim() === fr['common.years'],
    );
    expect(annees, 'aucun rayon « Années » à cliquer').toBeTruthy();
    annees!.click();
    flushSync();
    await reposer();

    // 🔴 Le geste que Jean Valjean ne pouvait pas faire : atteindre Années
    // sans repasser par la racine.
    expect(conteneursDemandes()).toContain('years');
  });

  it('cliquer « Listes de lecture » DEMANDE le conteneur `playlists`', async () => {
    serveur([SERVEUR_TUNE]);
    const el = await poser();
    await ouvrirServeur(el, 'Tune du salon');
    urls.length = 0;

    const listes = ([...el.querySelectorAll('.rayons button.rayon')] as HTMLButtonElement[]).find(
      (b) => (b.textContent ?? '').trim() === fr['nav.playlists'],
    );
    listes!.click();
    flushSync();
    await reposer();
    expect(conteneursDemandes()).toContain('playlists');
  });
});

describe('ce que la barre ne fait PAS', () => {
  it('un serveur tiers n’en reçoit aucun — on ne connaît pas sa racine', async () => {
    serveur([SERVEUR_TIERS]);
    const el = await poser();
    await ouvrirServeur(el, 'DiskStation');
    expect(rayonsPeints(el)).toHaveLength(0);
  });
});
