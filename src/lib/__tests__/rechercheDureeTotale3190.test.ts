// @vitest-environment jsdom
//
// renesenses/tune-server-rust#3190 — jfpaquet, forum 1644 (02/09/2026) :
//
//   « ALSO when searching, it would be useful (1) if Tune put on top of the
//     screen, in addition of "pistes" the total duration like Spotify does »
//
// ## Ce que le serveur rend déjà
//
// AUCUNE durée. `routes/search.rs` publie `totals` (artistes, albums, pistes,
// `tracks_via_metadata`), `totals_capped`, `has_more`, `limit` et `offset` —
// rien de temporel. En revanche chaque piste rendue porte son `duration_ms`
// (`Track::to_json()`), et la somme se fait côté client. Aucun changement
// serveur n'est requis, et ce ticket n'en demande pas.
//
// ## Le piège que le ticket nomme lui-même
//
// La liste des pistes est une PAGE, plafonnée à `SEARCH_PAGE_LIMIT` (50).
// Écrire « 3 h 12 » sous un compteur qui dit déjà « 50 sur 2451 » publierait un
// second chiffre faux, avec l'autorité d'une durée. Le ticket cite le
// précédent : #2040, où le « à suivre » de la file excluait la piste en cours
// et annonçait un total faux.
//
// D'où la règle tenue ici : la durée porte sur ce qui est AFFICHÉ, et elle le
// DIT tant que tout n'est pas affiché.
//
// 🔴 CES TÉMOINS MONTENT `SearchView`, TAPENT dans le champ, et lisent le texte
// RÉELLEMENT RENDU à côté du compteur.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import SearchView from '../../components/SearchView.svelte';
import { formatDuration } from '../utils';
import lFr from '../locales/fr';

const fr = lFr as unknown as Record<string, string>;

/**
 * Monter `SearchView` compile un composant de 2 000 lignes et tout son graphe.
 * Le premier cas d'un fichier dépasse régulièrement les 5 s par défaut quand la
 * machine porte plusieurs travailleurs en parallèle — un ROUGE de charge, pas
 * un ROUGE de code. Le délai est desserré pour ce fichier seulement.
 */
vi.setConfig({ testTimeout: 30_000 });

const PAGE = 50;
/** Six minutes par piste : de quoi dépasser l'heure sur une page. */
const DUREE = 360_000;

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

const piste = (i: number) => ({
  id: 30_000 + i,
  title: `Autumn Leaves ${i}`,
  artist_name: `Artiste ${i}`,
  album_title: `Album ${i}`,
  album_id: 20_000 + i,
  duration_ms: DUREE,
});

/** Une réponse de recherche locale, avec `total` correspondances au total. */
function page(total: number) {
  const rendues = Math.min(PAGE, total);
  return {
    local: {
      artists: [],
      albums: [],
      tracks: Array.from({ length: rendues }, (_, k) => piste(k)),
      totals: { artists: 0, albums: 0, tracks: total, tracks_via_metadata: 0 },
      totals_capped: { artists: false, albums: false, tracks: false },
      has_more: { artists: false, albums: false, tracks: rendues < total },
      limit: PAGE,
      offset: 0,
    },
    services: {},
    radios: [],
  };
}

let hote: HTMLDivElement | null = null;
let monte: Record<string, any> | null = null;

function serveur(total: number) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: any) => {
      const u = String(url);
      if (/\/search\?/.test(u)) return reponse(page(total));
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

/** L'entête de la section Pistes, telle qu'elle est rendue. */
function entetePistes(el: HTMLElement): HTMLElement | null {
  return (
    ([...el.querySelectorAll('.section-title')] as HTMLElement[]).find((h) =>
      (h.textContent ?? '').trim().startsWith('Pistes'),
    ) ?? null
  );
}

/** Le texte de durée rendu à côté du compteur, ou `null` s'il n'y en a pas. */
function dureeAffichee(el: HTMLElement): string | null {
  return entetePistes(el)?.querySelector('.section-duration')?.textContent?.trim() ?? null;
}

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', ResizeObserverInerte);
  localStorage.clear();
});

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  if (hote) hote.remove();
  hote = null;
  vi.unstubAllGlobals();
});

describe('la durée demandée est affichée à côté du compteur', () => {
  it('elle apparaît, et vaut la somme des pistes RENDUES', async () => {
    serveur(PAGE);
    const el = await chercher('autumn leaves');
    expect(dureeAffichee(el), 'aucune durée à côté du compteur').toBeTruthy();
    expect(dureeAffichee(el)).toBe(formatDuration(PAGE * DUREE));
    // 50 × 6 min = 5 h — la forme « 5h 0min » du client.
    expect(dureeAffichee(el)).toBe('5h 0min');
  });

  it('elle s’écrit NUE quand tous les résultats sont affichés', async () => {
    serveur(12);
    const el = await chercher('autumn leaves');
    expect(dureeAffichee(el)).toBe(formatDuration(12 * DUREE));
    // Rien qui laisse croire à une troncature : il n'y en a pas.
    expect(dureeAffichee(el)).not.toContain('affichées');
  });
});

describe('🔴 le piège : ne pas publier un second chiffre faux', () => {
  it('quand la liste est une page, la durée DIT qu’elle ne couvre que l’affiché', async () => {
    serveur(2451);
    const el = await chercher('autumn leaves');
    const attendu = fr['search.durationShown'].replace('{d}', formatDuration(PAGE * DUREE));
    expect(dureeAffichee(el)).toBe(attendu);
    // Et le compteur, lui, annonce toujours le vrai total (#3189).
    expect(entetePistes(el)!.querySelector('.count')!.textContent!.trim()).toBe(
      fr['search.shownOf'].replace('{shown}', String(PAGE)).replace('{total}', '2451'),
    );
  });

  it('une durée nue ne peut pas se glisser sous un compteur tronqué', async () => {
    serveur(2451);
    const el = await chercher('autumn leaves');
    expect(dureeAffichee(el), 'la durée nue mentirait sur le périmètre').not.toBe(
      formatDuration(PAGE * DUREE),
    );
  });
});

describe('rien à afficher, rien d’affiché', () => {
  it('aucune durée quand la recherche ne rend aucune piste', async () => {
    serveur(0);
    const el = await chercher('zzzzzz');
    expect(entetePistes(el)).toBeNull();
    expect(dureeAffichee(el)).toBeNull();
  });
});
