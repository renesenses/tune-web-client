// @vitest-environment jsdom
//
// renesenses/tune-server-rust#3191 — jfpaquet, forum 1644 (02/09/2026) :
//
//   « ALSO when searching, it would be useful […] (2) if I could create a
//     playlist whith the search results »
//
// Son cas d'usage est explicite : il cherche « Autumn Leaves » dans une
// collection de jazz et veut FIGER cette sélection.
//
// ## Ce que le serveur rendait déjà
//
// Les deux briques, et rien à écrire : `POST /playlists` (`api.createPlaylist`)
// et `POST /playlists/{id}/tracks` (`api.addPlaylistTracks`). Il manquait le
// geste qui les relie depuis l'écran de recherche, où les deux seules actions
// de masse — « Lire les pistes » et « Aléatoire » — enfilent dans la file, qui
// ne garde rien.
//
// ## 🔴 Le piège, et pourquoi il est PIRE ici qu'à l'affichage
//
// La liste est une page plafonnée à 50. Une liste de lecture tronquée en
// silence PERSISTE et sera prise pour exhaustive des mois plus tard, là où une
// liste tronquée à l'écran se corrige en refaisant la recherche. Le message de
// succès doit donc dire combien de pistes ont été RÉELLEMENT enregistrées.
//
// 🔴 CES TÉMOINS MONTENT `SearchView`, CLIQUENT le bouton, répondent au
// dialogue et lisent les REQUÊTES RÉELLEMENT ÉMISES ainsi que le message
// réellement poussé.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';
import { mount, unmount, flushSync } from 'svelte';
import SearchView from '../../components/SearchView.svelte';
import { dialogs } from '../stores/dialogs';
import { notifications } from '../stores/notifications';
import lFr from '../locales/fr';

const fr = lFr as unknown as Record<string, string>;

/**
 * Monter `SearchView` compile un composant de 2 000 lignes et tout son graphe.
 * Les 5 s par défaut produisent un ROUGE de charge, pas un rouge de code.
 */
vi.setConfig({ testTimeout: 30_000 });

const PAGE = 50;

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

/** Une piste de la bibliothèque : identifiant numérique, pas de service. */
const pisteLocale = (i: number) => ({
  id: 30_000 + i,
  title: `Autumn Leaves ${i}`,
  artist_name: `Artiste ${i}`,
  album_title: `Album ${i}`,
  album_id: 20_000 + i,
  duration_ms: 240_000,
});

/** Une piste de service : aucun identifiant de bibliothèque. */
const pisteQobuz = (i: number) => ({
  id: null,
  title: `Autumn Leaves (Qobuz) ${i}`,
  artist_name: 'Divers',
  album_title: 'Catalogue',
  source_id: `q-${i}`,
  duration_ms: 240_000,
});

function page(total: number, avecService = false) {
  const rendues = Math.min(PAGE, total);
  return {
    local: {
      artists: [],
      albums: [],
      tracks: Array.from({ length: rendues }, (_, k) => pisteLocale(k)),
      totals: { artists: 0, albums: 0, tracks: total, tracks_via_metadata: 0 },
      totals_capped: { artists: false, albums: false, tracks: false },
      has_more: { artists: false, albums: false, tracks: rendues < total },
      limit: PAGE,
      offset: 0,
    },
    services: avecService
      ? { qobuz: { artists: [], albums: [], tracks: [pisteQobuz(1), pisteQobuz(2)] } }
      : {},
    radios: [],
  };
}

let hote: HTMLDivElement | null = null;
let monte: Record<string, any> | null = null;
/** Chaque appel : méthode, URL, corps envoyé. */
let appels: { url: string; methode: string; corps: any }[] = [];

function serveur(opts: { total: number; avecService?: boolean; playlistCasse?: boolean }) {
  appels = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: any, init?: any) => {
      const u = String(url);
      const methode = (init?.method ?? 'GET').toUpperCase();
      let corps: any = null;
      try {
        corps = init?.body ? JSON.parse(init.body) : null;
      } catch {
        corps = init?.body ?? null;
      }
      appels.push({ url: u, methode, corps });
      if (/\/search\?/.test(u)) return reponse(page(opts.total, opts.avecService));
      if (/\/playlists\/\d+\/tracks$/.test(u)) return reponse({ id: 77, name: 'x' });
      if (/\/playlists$/.test(u) && methode === 'POST') {
        if (opts.playlistCasse) throw new Error('500');
        return reponse({ id: 77, name: corps?.name ?? '', track_count: 0 });
      }
      if (/\/playlists/.test(u)) return reponse([]);
      // L'effet des blocs « à découvrir » LIT ce qu'il ÉCRIT : une réponse vide
      // le relance indéfiniment.
      return reponse([{ id: 1, name: 'Découverte', title: 'Découverte' }]);
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

async function chercher(q: string): Promise<HTMLDivElement> {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(SearchView, { target: hote, props: {} as any });
  flushSync();
  const champ = hote.querySelector('input[type="text"]') as HTMLInputElement;
  champ.value = q;
  champ.dispatchEvent(new Event('input', { bubbles: true }));
  flushSync();
  // L'anti-rebond du champ vaut 300 ms.
  await new Promise((r) => setTimeout(r, 360));
  await reposer();
  return hote;
}

/** Le bouton de création, par son libellé traduit. */
function bouton(el: HTMLElement): HTMLButtonElement | null {
  return (
    ([...el.querySelectorAll('button.action-pill')] as HTMLButtonElement[]).find((b) =>
      (b.textContent ?? '').includes(fr['search.createPlaylist']),
    ) ?? null
  );
}

/**
 * Répond au dialogue posé par l'écran. `DialogContainer` n'est pas monté ici :
 * c'est le bus qu'on sert, exactement comme le ferait le conteneur.
 */
async function repondreAuDialogue(reponseTexte: string | null) {
  await reposer(2);
  const file = get(dialogs);
  expect(file.length, 'aucun dialogue posé').toBeGreaterThan(0);
  expect(file[0].kind).toBe('prompt');
  dialogs.settle(file[0].id, reponseTexte);
  await reposer();
}

const messages = () => get(notifications).map((n) => n.message);

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', ResizeObserverInerte);
  localStorage.clear();
  for (const n of get(notifications)) notifications.dismiss(n.id);
});

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  if (hote) hote.remove();
  hote = null;
  for (const d of get(dialogs)) dialogs.settle(d.id, null);
  vi.unstubAllGlobals();
});

describe('le geste manquant : figer les résultats en liste de lecture', () => {
  it('le bouton existe dans la section Pistes', async () => {
    serveur({ total: 12 });
    const el = await chercher('autumn leaves');
    expect(bouton(el), 'aucun bouton « Créer une liste de lecture »').toBeTruthy();
  });

  it('il crée la liste, PUIS y range les pistes affichées', async () => {
    serveur({ total: 12 });
    const el = await chercher('autumn leaves');
    appels.length = 0;
    bouton(el)!.click();
    await repondreAuDialogue('Jazz — Autumn Leaves');

    const creation = appels.find((a) => a.methode === 'POST' && /\/playlists$/.test(a.url));
    expect(creation, 'aucune création de liste').toBeTruthy();
    expect(creation!.corps.name).toBe('Jazz — Autumn Leaves');

    const ajout = appels.find((a) => a.methode === 'POST' && /\/playlists\/77\/tracks$/.test(a.url));
    expect(ajout, 'les pistes n’ont pas été rangées dans la liste').toBeTruthy();
    expect(ajout!.corps.track_ids).toHaveLength(12);
    expect(ajout!.corps.track_ids[0]).toBe(30_000);
  });

  it('un dialogue annulé n’écrit RIEN', async () => {
    serveur({ total: 12 });
    const el = await chercher('autumn leaves');
    appels.length = 0;
    bouton(el)!.click();
    await repondreAuDialogue(null);
    expect(appels.filter((a) => a.methode === 'POST')).toHaveLength(0);
  });
});

describe('🔴 une liste tronquée en silence PERSISTE — elle doit se dire', () => {
  it('le message annonce le nombre enregistré ET le nombre de correspondances', async () => {
    serveur({ total: 2451 });
    const el = await chercher('autumn leaves');
    bouton(el)!.click();
    await repondreAuDialogue('Autumn Leaves');
    const attendu = fr['search.playlistCreatedPartial']
      .replace('{name}', 'Autumn Leaves')
      .replace('{n}', String(PAGE))
      .replace('{total}', '2451');
    expect(messages()).toContain(attendu);
  });

  it('quand tout est affiché, le message ne parle QUE du nombre enregistré', async () => {
    serveur({ total: 12 });
    const el = await chercher('autumn leaves');
    bouton(el)!.click();
    await repondreAuDialogue('Autumn Leaves');
    const attendu = fr['search.playlistCreated']
      .replace('{name}', 'Autumn Leaves')
      .replace('{n}', '12');
    expect(messages()).toContain(attendu);
  });
});

describe('ce que la liste NE contient PAS', () => {
  it('les pistes de service, sans identifiant local, ne sont pas enregistrées', async () => {
    serveur({ total: 12, avecService: true });
    const el = await chercher('autumn leaves');
    appels.length = 0;
    bouton(el)!.click();
    await repondreAuDialogue('Autumn Leaves');
    const ajout = appels.find((a) => a.methode === 'POST' && /\/playlists\/77\/tracks$/.test(a.url));
    // Douze locales ; les deux Qobuz sont bien à l'écran, pas dans la liste.
    expect(ajout!.corps.track_ids).toHaveLength(12);
    expect(ajout!.corps.track_ids.some((id: number) => id == null)).toBe(false);
  });
});

describe('un échec est DIT', () => {
  it('la création qui échoue ne laisse pas croire à un enregistrement', async () => {
    serveur({ total: 12, playlistCasse: true });
    const el = await chercher('autumn leaves');
    bouton(el)!.click();
    await repondreAuDialogue('Autumn Leaves');
    expect(messages()).toContain(fr['search.playlistError']);
    expect(messages().some((m) => m.includes('créée'))).toBe(false);
  });
});
