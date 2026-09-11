// @vitest-environment jsdom
//
// Deux signalements de la v0.9.145, une seule maladie : la NOUVELLE COQUILLE
// perd sa pile de retour.
//
//   • renesenses/tune-server-rust#3843 — Lulu (JLuc), fil forum 1752 :
//     « Lorsqu'on se trouve sur un album plein écran, le retour sur
//     "Bibliothèque" ne fonctionne pas, il est nécessaire de repasser par un
//     autre dossier. »
//
//   • renesenses/tune-server-rust#3824 — FabienM, fil forum 1749 :
//     « Menu recherche : si je clique sur un artiste cela me renvoie à la
//     bibliothèque de l'artiste et si je clique sur le bouton Retour ça me
//     renvoie à l'accueil de la bibliothèque alors que le comportement attendu
//     devrait être un retour vers la page de recherche »
//
// 🔴 CES TÉMOINS CLIQUENT, ILS NE LISENT PAS.
//
// C'est la forme imposée par `rechercheGlobaleV2_3629.test.ts` et la raison en
// est écrite dans `coquilleV2Branchee.test.ts` : une garde qui cherche une
// chaîne dans un source « attrape l'oubli pur — un composant jamais importé —
// et rien de plus ; un montage présent mais débranché la laisserait verte ».
// Or les deux défauts corrigés ici SONT des montages présents mais débranchés.
// On monte donc la vraie coquille `ShellV2`, on clique les vrais boutons, et on
// regarde ce qui reste à l'écran.
//
// ⚠️ LA COQUILLE COMPTE. `main.ts` monte `ShellV2` OU `App.svelte`, jamais les
// deux. L'ancienne barre appelle `requestListReset()` depuis toujours
// (`components/Sidebar.svelte:443`) et l'ancien écran d'historique porte sa
// vignette : les deux défauts n'existent QUE dans la coquille v2, et c'est elle
// que ces témoins montent.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import { get } from 'svelte/store';
import ShellV2 from '../../components/v2/ShellV2.svelte';
import { activeView, pendingLibraryAlbum, vueDeRetour } from '../stores/navigation';

/** L'album que « Aller à l'album » ouvre en calque par-dessus la grille. */
const ALBUM_TEMOIN = {
  id: 1,
  title: 'Album temoin',
  artist_name: 'Artiste temoin',
  cover_path: null,
  year: 2020,
};

/** L'artiste LOCAL que la Recherche propose, et dont la fiche doit s'ouvrir. */
const ARTISTE_TEMOIN = { id: 7, name: 'Leprous', album_count: 1 };

/**
 * L'écran Recherche interroge DEUX routes, et elles n'ont pas la même forme :
 *   • `/library/search` rend un `SearchResult` À PLAT — c'est de là que vient
 *     `local`, et donc la rangée « Artistes » qu'on va cliquer ;
 *   • `/search` (fédérée) rend `{ local, services }`, dont l'écran ne retient
 *     QUE `services` (`fed = r.services ?? {}`).
 * Les confondre rend une page de résultats vide, et le témoin passerait son
 * temps à mesurer un écran sans artiste.
 */
const RESULTAT_LOCAL = { tracks: [], albums: [], artists: [ARTISTE_TEMOIN], playlists: [] };
const RESULTAT_FEDERE = { local: RESULTAT_LOCAL, services: {} };

/**
 * Les écrans de la coquille lisent une douzaine de routes au montage. On ne
 * bouchonne que ce qui compte ; le reste doit simplement avoir la BONNE FORME —
 * une route de collection qui rendrait `{}` ferait exploser un `.find()`
 * quelque part et masquerait le vrai résultat.
 */
const COLLECTIONS =
  /\/(profiles|zones|playlists|devices|shortcuts|collections|tags|favorites|history|radios|podcasts|artists|albums|tracks|top-artists|recent|genres)(\?|\/|$)/;

function corpsPour(url: string) {
  // L'ORDRE compte : `/library/albums/1` matcherait aussi COLLECTIONS.
  if (/\/library\/albums\/\d+(\?|$)/.test(url)) return ALBUM_TEMOIN;
  if (/\/library\/artists\/\d+\/albums/.test(url)) return [];
  if (/\/library\/artists(\?|$)/.test(url)) return [ARTISTE_TEMOIN];
  if (url.includes('/library/search/acoustic')) return {};
  if (url.includes('/library/search?q=')) return RESULTAT_LOCAL;
  if (url.includes('/search?q=')) return RESULTAT_FEDERE;
  return COLLECTIONS.test(url) ? [] : {};
}

function reponsePour(url: string) {
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

function poserLaCoquille(): HTMLDivElement {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(ShellV2, { target: hote });
  flushSync();
  return hote;
}

/** Le débounce de l'écran Recherche vaut 240 ms. */
const attendre = (ms = 60) => new Promise((r) => setTimeout(r, ms));

function taper(champ: HTMLInputElement, texte: string) {
  champ.value = texte;
  champ.dispatchEvent(new Event('input', { bubbles: true }));
  flushSync();
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => reponsePour(String(url))));
  vi.stubGlobal('WebSocket', class {
    close() {} addEventListener() {} removeEventListener() {} send() {}
  } as unknown as typeof WebSocket);
  activeView.set('home');
  pendingLibraryAlbum.set(null);
  vueDeRetour.set(null);
});

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  if (hote) hote.remove();
  hote = null;
  vi.unstubAllGlobals();
});

describe('#3843 — « Bibliothèque » dans la barre referme la fiche album', () => {
  it('la fiche album est bien un CALQUE par-dessus la grille', async () => {
    // Le témoin perdrait son objet si la fiche ne s'ouvrait pas : on vérifie
    // d'abord que l'on sait la faire apparaître, sinon l'assertion suivante
    // serait verte contre un écran vide.
    const el = poserLaCoquille();
    activeView.set('library');
    flushSync();
    pendingLibraryAlbum.set(ALBUM_TEMOIN.id);
    flushSync();
    await attendre();
    flushSync();
    expect(
      el.querySelector('.v2-detail'),
      'la fiche album ne s’ouvre pas — le témoin ne mesure plus rien',
    ).not.toBeNull();
  });

  it('🔴 cliquer « Bibliothèque » alors qu’on y est DÉJÀ referme la fiche', async () => {
    const el = poserLaCoquille();
    activeView.set('library');
    flushSync();
    pendingLibraryAlbum.set(ALBUM_TEMOIN.id);
    flushSync();
    await attendre();
    flushSync();
    expect(el.querySelector('.v2-detail')).not.toBeNull();

    // Le bouton ACTIF de la barre est celui de la vue courante — ici
    // « Bibliothèque ». On le désigne par son état plutôt que par son libellé :
    // le libellé est traduit, et ce témoin ne doit pas dépendre de la locale.
    const barre = el.querySelector<HTMLButtonElement>('button.nav.active');
    expect(barre, 'aucune entrée active dans la barre latérale v2').not.toBeNull();
    barre!.click();
    flushSync();

    // C'est TOUT le défaut de Lulu : `activeView` ne change pas (on est déjà
    // sur `library`), donc la coquille ne remonte rien, donc le `$state` local
    // qui tient le calque survivait. « Il est nécessaire de repasser par un
    // autre dossier » — c'est-à-dire de forcer un démontage.
    expect(
      el.querySelector('.v2-detail'),
      'la fiche album survit au clic sur « Bibliothèque » — c’est le défaut #3843',
    ).toBeNull();
  });
});

describe('#3824 — le Retour de la fiche artiste rend la main à la Recherche', () => {
  it('cliquer un artiste de la Recherche ouvre sa fiche dans la Bibliothèque', async () => {
    // Même précaution qu'au-dessus : sans cette marche, l'assertion du retour
    // serait verte contre un bouton qui n'existe pas.
    const el = poserLaCoquille();
    activeView.set('search');
    flushSync();
    const champ = el.querySelector<HTMLInputElement>('.champ-large input[type="search"]');
    expect(champ, 'le champ de l’écran Recherche a disparu').not.toBeNull();
    taper(champ!, 'Leprous');
    await attendre(420);
    flushSync();

    const tuile = el.querySelector<HTMLButtonElement>('.basartistes .artile button.meta');
    expect(tuile, 'la Recherche ne propose aucun artiste — le témoin ne mesure rien').not.toBeNull();
    tuile!.click();
    flushSync();
    expect(get(activeView)).toBe('library');
    await attendre(120);
    flushSync();
    expect(
      el.querySelector('header.fiche button.retour'),
      'la fiche artiste ne s’est pas ouverte',
    ).not.toBeNull();
  });

  it('🔴 le bouton « Retour » ramène à la RECHERCHE, pas à la grille', async () => {
    const el = poserLaCoquille();
    activeView.set('search');
    flushSync();
    const champ = el.querySelector<HTMLInputElement>('.champ-large input[type="search"]');
    taper(champ!, 'Leprous');
    await attendre(420);
    flushSync();
    el.querySelector<HTMLButtonElement>('.basartistes .artile button.meta')!.click();
    flushSync();
    await attendre(120);
    flushSync();

    const retour = el.querySelector<HTMLButtonElement>('header.fiche button.retour');
    expect(retour, 'pas de bouton Retour sur la fiche artiste').not.toBeNull();
    retour!.click();
    flushSync();

    // Le défaut de FabienM : le bouton faisait `ouvert = null`, ce qui découvre
    // la grille des artistes — « l'accueil de la bibliothèque ». La vue restait
    // `library`.
    expect(
      get(activeView),
      'le Retour laisse sur la Bibliothèque au lieu de rendre la main à la Recherche — défaut #3824',
    ).toBe('search');
  });

  it('le dépôt de retour est CONSOMMÉ : un second Retour ne téléporte plus', async () => {
    // Sans cela, une fiche ouverte plus tard depuis la grille repartirait vers
    // un écran que l'utilisateur a quitté depuis longtemps.
    const el = poserLaCoquille();
    activeView.set('search');
    flushSync();
    const champ = el.querySelector<HTMLInputElement>('.champ-large input[type="search"]');
    taper(champ!, 'Leprous');
    await attendre(420);
    flushSync();
    el.querySelector<HTMLButtonElement>('.basartistes .artile button.meta')!.click();
    flushSync();
    await attendre(120);
    flushSync();
    el.querySelector<HTMLButtonElement>('header.fiche button.retour')!.click();
    flushSync();
    expect(get(vueDeRetour), 'le dépôt de retour n’a pas été vidé après usage').toBeNull();
  });
});
