// @vitest-environment jsdom
//
// « Nouvelle interface : Disparition de la recherche globale (Locale + Qobuz) »
// — renesenses/tune-server-rust#3629, Sandro, fil forum 1718 (08/09/2026).
//
// Le composant `GlobalSearchBar` existe depuis longtemps — 475 lignes, aperçu
// instantané local + services. Son SEUL montage vivait dans `App.svelte:1485`,
// et `main.ts` monte `ShellV2` OU `App`, jamais les deux : en `?v2` la loupe
// n'existait donc nulle part, et `src/lib/keyboard.ts` ne porte aucun raccourci
// de recherche pour la remplacer (vérifié : aucune occurrence de `search`, `/`
// ni `Ctrl+K`, dans AUCUNE des deux coquilles).
//
// 🔴 CES TÉMOINS APPELLENT, ILS NE LISENT PAS.
//
// `coquilleV2Branchee.test.ts`, écrit pour la même famille de défauts, cherche
// des chaînes dans le source de `ShellV2.svelte` : il resterait vert si le
// balisage était présent mais la conduite débranchée. Ici on monte la VRAIE
// coquille, on clique la VRAIE loupe, on tape, et on regarde l'URL que `fetch`
// a réellement reçue. Retirer `<GlobalSearchBar />` de la coquille, ou
// débrancher `pendingSearchQuery` dans `SearchV2`, fait rougir.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import { get } from 'svelte/store';
import ShellV2 from '../../components/v2/ShellV2.svelte';
import { activeView, pendingSearchQuery } from '../stores/navigation';
import { setSearchCriteria } from '../stores/shortcuts';

/** Ce que le serveur rend sur `/search` : de la bibliothèque ET d'un service. */
const RESULTAT_FEDERE = {
  local: {
    tracks: [{ id: 1, title: 'Leprous local', artist_name: 'Leprous' }],
    albums: [], artists: [], playlists: [],
  },
  services: {
    qobuz: {
      tracks: [{ id: null, source: 'qobuz', source_id: 'q1', title: 'Leprous Qobuz', artist_name: 'Leprous' }],
      albums: [], artists: [], playlists: [],
    },
  },
};

let urls: string[] = [];

/**
 * Les écrans de la coquille lisent une douzaine de routes au montage. On ne
 * bouchonne que ce qui compte pour ce témoin ; le reste doit simplement avoir
 * la BONNE FORME — une route de collection qui rendrait `{}` ferait exploser
 * un `.find()` quelque part et masquerait le vrai résultat.
 */
const COLLECTIONS =
  /\/(profiles|zones|playlists|devices|shortcuts|collections|tags|favorites|history|radios|podcasts|artists|albums|tracks|top-artists|recent|genres)(\?|\/|$)/;

function reponsePour(url: string) {
  const corps = url.includes('/search?q=')
    ? RESULTAT_FEDERE
    : COLLECTIONS.test(url) ? [] : {};
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

function poserLaCoquille(): HTMLDivElement {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(ShellV2, { target: hote });
  flushSync();
  return hote;
}

/** Le débounce de la loupe vaut 300 ms, celui de l'écran Recherche 240 ms. */
const attendre = (ms = 420) => new Promise((r) => setTimeout(r, ms));

function taper(champ: HTMLInputElement, texte: string) {
  champ.value = texte;
  champ.dispatchEvent(new Event('input', { bubbles: true }));
  flushSync();
}

beforeEach(() => {
  urls = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    urls.push(String(url));
    return reponsePour(String(url));
  }));
  vi.stubGlobal('WebSocket', class {
    close() {} addEventListener() {} removeEventListener() {} send() {}
  } as unknown as typeof WebSocket);
  activeView.set('home');
  pendingSearchQuery.set('');
  setSearchCriteria(null);
});

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  if (hote) hote.remove();
  hote = null;
  vi.unstubAllGlobals();
});

describe('#3629 — la coquille v2 porte la recherche globale du coin haut-droit', () => {
  it('la loupe est DANS la grappe haut-droite, pas seulement quelque part', () => {
    const el = poserLaCoquille();
    // `.av-tr` est la grappe qui porte déjà signet et avatar. C'est l'endroit
    // que Sandro désigne (« le bouton situé en haut à droite ») : une loupe
    // montée ailleurs ne répondrait pas à sa demande.
    const grappe = el.querySelector('.av-tr');
    expect(grappe, 'la grappe haut-droite a disparu de la coquille').not.toBeNull();
    expect(
      grappe!.querySelector('.search-icon-btn'),
      'la loupe n’est pas montée dans la coquille v2 — c’est le défaut #3629',
    ).not.toBeNull();
  });

  it('elle s’ouvre en champ de saisie', () => {
    const el = poserLaCoquille();
    expect(el.querySelector('.search-input')).toBeNull();
    (el.querySelector('.search-icon-btn') as HTMLButtonElement).click();
    flushSync();
    expect(el.querySelector('.search-input')).not.toBeNull();
  });

  it('elle cherche PARTOUT — la route fédérée, pas la bibliothèque seule', async () => {
    const el = poserLaCoquille();
    (el.querySelector('.search-icon-btn') as HTMLButtonElement).click();
    flushSync();
    taper(el.querySelector('.search-input') as HTMLInputElement, 'leprous');
    await attendre();

    // C'est ICI que se joue la demande de Sandro : `/search` est la recherche
    // fédérée (bibliothèque + radios + services), `/library/search` ne voit
    // que le local. Une loupe montée qui n'appellerait que la seconde aurait
    // reproduit le défaut sous un autre bouton.
    const federees = urls.filter((u) => /\/search\?q=leprous/.test(u));
    expect(federees.length, `aucun appel fédéré ; URLs vues : ${urls.join(' | ')}`)
      .toBeGreaterThan(0);
    expect(federees.some((u) => u.includes('/library/search'))).toBe(false);
  });

  it('l’aperçu montre le LOCAL et le SERVICE dans la même liste', async () => {
    const el = poserLaCoquille();
    (el.querySelector('.search-icon-btn') as HTMLButtonElement).click();
    flushSync();
    taper(el.querySelector('.search-input') as HTMLInputElement, 'leprous');
    await attendre();
    flushSync();

    const menu = el.querySelector('.search-dropdown');
    expect(menu, 'aucun aperçu rendu').not.toBeNull();
    // Les deux moitiés dans un seul menu : c'est le « unifiée » de sa phrase.
    expect(menu!.textContent).toContain('Leprous local');
    expect(menu!.textContent).toContain('Leprous Qobuz');
  });

  it('Entrée mène à l’écran Recherche AVEC la requête, et relance la recherche', async () => {
    const el = poserLaCoquille();
    (el.querySelector('.search-icon-btn') as HTMLButtonElement).click();
    flushSync();
    const champ = el.querySelector('.search-input') as HTMLInputElement;
    taper(champ, 'leprous');
    await attendre();

    champ.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    flushSync();
    expect(get(activeView)).toBe('search');

    await attendre();
    flushSync();

    // 🔴 Le point que l'issue laissait « non relu » : `SearchV2` ne consommait
    // PAS `pendingSearchQuery`. Sans le correctif, l'écran s'ouvre vide et
    // Sandro doit retaper — la barre l'aurait mené nulle part.
    const champV2 = el.querySelector('.tune-v2 input[type="search"]') as HTMLInputElement | null;
    expect(champV2, 'l’écran Recherche v2 n’est pas monté').not.toBeNull();
    expect(champV2!.value, 'la requête déposée par la loupe n’a pas été reprise').toBe('leprous');

    // Et la requête est CONSOMMÉE : sinon un retour ultérieur sur l'écran
    // rejouerait une recherche que personne n'a demandée.
    expect(get(pendingSearchQuery)).toBe('');
  });
});
