// @vitest-environment jsdom
//
// « ARTISTES LES PLUS ÉCOUTÉS » : LA VIGNETTE N'OUVRAIT RIEN — #1341.
//
// FabienM, fil forum 1859 (20/09/2026), v0.9.158, point 2 :
//
//   « Menu recherche: section "Artistes les plus écoutés": les artistes ne
//     sont pas cliquables, il faut quand on clique sur une vignette d'un
//     artiste renvoyer vers la page de l'artiste »
//
// Deux défauts sous le même clic, et le second n'était pas dans le ticket :
//
//  1. la vignette n'avait AUCUN gestionnaire, et le bouton du nom ne faisait
//     que pré-remplir la requête (`q = a.nom`) ;
//  2. 🔴 l'identifiant que la rangée employait venait d'un rapprochement par
//     NOM contre les 5 000 premiers artistes de la bibliothèque — alors que
//     la route de l'historique le DONNE. Mesuré sur le .18 le 20/09/2026 :
//
//       GET /api/v1/library/history/top-artists?limit=8
//       [{"artist_id":882,"artist_name":"Morcheeba","id":882,
//         "name":"Morcheeba","plays":144}, …]
//
//     Un artiste que le nom ne retrouve pas (casse, accents, « & » contre
//     « and », ou simplement au-delà des 5 000) restait à `id: null` : même
//     rendue cliquable, sa vignette n'aurait eu aucune cible.
//
// ⚠️ CE QUE CE TÉMOIN GARDE. L'écran est MONTÉ, `fetch` bouchonné, et la
// garde CLIQUE puis regarde où la coquille est envoyée (`pendingLibraryArtist`
// + `activeView`). Elle ne lit aucun texte de composant : une entrée préfixée
// d'un `if (false)` la ferait rougir.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import { get } from 'svelte/store';
import SearchV2 from '../../components/v2/SearchV2.svelte';
import { activeView, pendingLibraryArtist, vueDeRetour } from '../stores/navigation';
import { setSearchCriteria } from '../stores/shortcuts';

vi.setConfig({ testTimeout: 30_000 });

/** Les têtes d'affiche, dans la forme MESURÉE de la route. */
const TETES = [
  { artist_id: 882, artist_name: 'Morcheeba', id: 882, name: 'Morcheeba', plays: 144 },
  // 🔴 Le cas de la capture : trois portraits manquent, et leur nom ne se
  // retrouve pas dans la bibliothèque. Le serveur, lui, donne l'identifiant.
  { artist_id: 7001, artist_name: 'Bloc Party', id: 7001, name: 'Bloc Party', plays: 12 },
  // Un artiste dont le serveur ne sait plus l'identifiant : rien à ouvrir.
  { artist_name: 'Infiniti', name: 'Infiniti', plays: 3 },
];

/** La bibliothèque ne connaît que Morcheeba — et c'est elle qui porte le portrait. */
const ARTISTES = [{ id: 882, name: 'Morcheeba', image_path: '/covers/morcheeba.jpg' }];

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
let monte: Record<string, unknown> | null = null;

const respirer = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', ResizeObserverInerte);
  localStorage.clear();
  activeView.set('search');
  pendingLibraryArtist.set(null);
  vueDeRetour.set(null as never);
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: any) => {
      const u = String(url);
      if (/\/library\/history\/top-artists/.test(u)) return reponse(TETES);
      if (/\/library\/albums\/recent/.test(u)) return reponse([]);
      if (/\/library\/artists\?/.test(u)) return reponse(ARTISTES);
      return reponse([]);
    }),
  );
  vi.stubGlobal('WebSocket', class {
    close() {}
    addEventListener() {}
    removeEventListener() {}
    send() {}
  } as unknown as typeof WebSocket);
});

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  if (hote) hote.remove();
  hote = null;
  setSearchCriteria(null);
  activeView.set('search');
  pendingLibraryArtist.set(null);
  vi.unstubAllGlobals();
});

/** L'écran de DÉCOUVERTE : la barre vide, donc les têtes d'affiche. */
async function decouvrir(): Promise<HTMLDivElement> {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(SearchV2, { target: hote, props: {} as any });
  for (let i = 0; i < 12; i++) await respirer();
  flushSync();
  return hote;
}

/** Les tuiles de la rangée « Artistes les plus écoutés », dans l'ordre. */
function tuiles(el: HTMLElement): HTMLElement[] {
  return Array.from(el.querySelectorAll<HTMLElement>('.artile')).filter(
    (t) => !!t.querySelector('.an'),
  );
}

const nomsAffiches = (el: HTMLElement) =>
  tuiles(el).map((t) => t.querySelector('.an')?.textContent);

describe('#1341 — la vignette d’une tête d’affiche ouvre sa fiche', () => {
  it('la rangée est bien celle de la capture', async () => {
    const el = await decouvrir();
    expect(nomsAffiches(el)).toEqual(['Morcheeba', 'Bloc Party', 'Infiniti']);
  });

  it('🔴 la VIGNETTE est un bouton — c’est elle que FabienM clique', async () => {
    const el = await decouvrir();
    const vignettes = tuiles(el).map((t) => t.querySelector('button.acv'));
    expect(
      vignettes.filter(Boolean),
      'la vignette n’a aucun gestionnaire : le clic ne fait rien, exactement le signalement',
    ).toHaveLength(3);
  });

  it('cliquer la vignette ouvre la FICHE, pas la recherche sur son nom', async () => {
    const el = await decouvrir();
    tuiles(el)[0].querySelector<HTMLButtonElement>('button.acv')!.click();
    flushSync();
    expect(get(pendingLibraryArtist), 'aucune fiche visée').toBe(882);
    expect(get(activeView)).toBe('library');
    // #3824 — la fiche doit savoir refermer VERS la recherche.
    expect(get(vueDeRetour)).toBe('search');
  });

  it('🔴 un artiste ABSENT de la bibliothèque par son nom s’ouvre quand même — l’identifiant vient du serveur', async () => {
    // « Bloc Party » n'est pas dans `/library/artists` : le rapprochement par
    // nom rendait `id: null`, et la vignette n'avait rien à ouvrir.
    const el = await decouvrir();
    tuiles(el)[1].querySelector<HTMLButtonElement>('button.acv')!.click();
    flushSync();
    expect(get(pendingLibraryArtist)).toBe(7001);
    expect(get(activeView)).toBe('library');
  });

  it('le NOM ouvre la fiche lui aussi, au lieu de relancer la recherche', async () => {
    const el = await decouvrir();
    tuiles(el)[0].querySelector<HTMLButtonElement>('button.meta')!.click();
    flushSync();
    expect(get(pendingLibraryArtist)).toBe(882);
    expect(get(activeView)).toBe('library');
  });

  it('SANS identifiant, on ne route pas : le geste d’avant, et la Bibliothèque intacte', async () => {
    // Mieux vaut la recherche sur le nom que la GRILLE des artistes, qui n'est
    // pas là où l'auditeur allait.
    const el = await decouvrir();
    tuiles(el)[2].querySelector<HTMLButtonElement>('button.acv')!.click();
    flushSync();
    expect(get(pendingLibraryArtist), 'une fiche a été visée sans identifiant').toBe(null);
    expect(get(activeView), 'la coquille est partie sur la grille de la Bibliothèque').toBe('search');
    const barre = hote!.querySelector<HTMLInputElement>('input[type="search"], input');
    expect(barre?.value, 'le repli — la recherche sur le nom — n’a pas eu lieu').toBe('Infiniti');
  });
});
