// @vitest-environment jsdom
//
// LE BOUTON PRÉCÉDENT DU NAVIGATEUR DANS LA COQUILLE V2 — #828, #867, #864.
//
//   • #828 / #867 — FabienM, fils forum 1739 et 1749 : « Bouton RETOUR du
//     navigateur ne fonctionne pas dans la V1 alors que ça fonctionne dans
//     l'interface actuelle. […] ça me renvoie au site précédent, JE SORS
//     TOTALEMENT DE TUNE. » Quatre autres testeurs, le même geste.
//   • #864 — Jean Valjean, fil 1671 : « Bibliothèque → Artistes → choix de
//     l'artiste → album(s) → retour → haut de la page. »
//
// 🔴 CE QUE CE TÉMOIN NE DOIT PAS SE CONTENTER DE PROUVER.
//
// Vérifier qu'on PEUT écrire dans l'historique ne prouve rien : `pushState`
// marche depuis toujours, il n'était simplement APPELÉ par personne dans cette
// coquille. Un témoin qui appellerait lui-même le module serait vert contre un
// `ShellV2` qui ne le monte pas — exactement le défaut qu'on corrige.
//
// On monte donc la VRAIE coquille, on fait agir la navigation (changer de vue,
// cliquer un artiste, cliquer Retour, appuyer sur Précédent), et on regarde
// ensuite ce que le navigateur a dans sa pile. Le `pushState` n'est jamais
// appelé par le test.
//
// ⚠️ jsdom EST ici un vrai navigateur pour ce qui nous occupe : mesuré avant
// d'écrire, `history.pushState` / `history.back()` / l'événement `popstate`
// et `scrollTop` s'y comportent comme dans Chrome. Ce qu'il n'a pas, c'est la
// MISE EN PAGE : `scrollHeight` et `clientHeight` y valent zéro. On les lui
// donne (voir `donnerUneMiseEnPage`), sinon `restoreDetailScroll` attendrait
// ses trente trames pour rien.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import { get } from 'svelte/store';
import ShellV2 from '../../components/v2/ShellV2.svelte';
import ArtistesV2 from '../../components/v2/ArtistesV2.svelte';
import { activeView, pendingLibraryAlbum, vueDeRetour } from '../stores/navigation';
import { brancherHistoriqueCoquille, detailOuvert } from '../historiqueCoquille';

/** Les artistes que la grille affichera. Deux suffisent, il en faut un à ouvrir. */
const ARTISTES = [
  { id: 7, name: 'Leprous', album_count: 1 },
  { id: 8, name: 'Magma', album_count: 1 },
];

const COLLECTIONS =
  /\/(profiles|zones|playlists|devices|shortcuts|collections|tags|favorites|history|radios|podcasts|artists|albums|tracks|top-artists|recent|genres)(\?|\/|$)/;

function corpsPour(url: string) {
  // L'ORDRE compte : `/library/artists/7/albums` matcherait aussi COLLECTIONS.
  if (/\/library\/artists\/\d+\/albums/.test(url)) return [];
  if (/\/library\/artists(\?|$)/.test(url)) return ARTISTES;
  if (/\/library\/albums\/\d+(\?|$)/.test(url)) return {};
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

function poser(composant: any, props: Record<string, unknown> = {}): HTMLDivElement {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(composant, { target: hote, props });
  flushSync();
  return hote;
}

const attendre = (ms = 60) => new Promise((r) => setTimeout(r, ms));

/**
 * jsdom ne met pas en page : `scrollHeight` et `clientHeight` y valent zéro, et
 * `restoreDetailScroll` — qui refuse de reposer une position que le contenu ne
 * peut pas tenir — épuiserait ses trente trames avant de la poser quand même.
 * On donne donc au document une hauteur, comme un navigateur le ferait.
 *
 * ⚠️ Sur `Element.prototype`, pas sur un nœud : `{#if ouvert}` DÉTRUIT la
 * grille et la reconstruit au retour. Un nœud instrumenté ne serait plus là au
 * moment qui compte, et le témoin mesurerait un élément neuf, toujours à zéro.
 */
function donnerUneMiseEnPage(): () => void {
  const avant = {
    scrollHeight: Object.getOwnPropertyDescriptor(Element.prototype, 'scrollHeight'),
    clientHeight: Object.getOwnPropertyDescriptor(Element.prototype, 'clientHeight'),
  };
  Object.defineProperty(Element.prototype, 'scrollHeight', {
    configurable: true, get: () => 12000,
  });
  Object.defineProperty(Element.prototype, 'clientHeight', {
    configurable: true, get: () => 600,
  });
  return () => {
    if (avant.scrollHeight) Object.defineProperty(Element.prototype, 'scrollHeight', avant.scrollHeight);
    if (avant.clientHeight) Object.defineProperty(Element.prototype, 'clientHeight', avant.clientHeight);
  };
}

let rendreLaMiseEnPage: (() => void) | null = null;

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => reponsePour(String(url))));
  vi.stubGlobal('WebSocket', class {
    close() {} addEventListener() {} removeEventListener() {} send() {}
  } as unknown as typeof WebSocket);
  activeView.set('home');
  pendingLibraryAlbum.set(null);
  vueDeRetour.set(null);
  detailOuvert.set(null);
  // Chaque cas repart d'une pile propre : les entrées d'un cas précédent
  // feraient reculer le suivant sur un écran qu'il n'a jamais ouvert.
  history.replaceState(null, '', '/');
});

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  if (hote) hote.remove();
  hote = null;
  if (rendreLaMiseEnPage) rendreLaMiseEnPage();
  rendreLaMiseEnPage = null;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('#828 / #867 — la coquille v2 ÉCRIT dans l’historique du navigateur', () => {
  it('la coquille ancre l’entrée courante à son montage, sans en empiler une', () => {
    // Empiler ici ferait qu'un PREMIER Précédent ne bougerait pas de l'écran :
    // l'utilisateur croirait le bouton mort, ce qui est le signalement même.
    const avant = history.length;
    poser(ShellV2);
    expect(history.state, 'la coquille n’ancre aucune entrée à son montage').toMatchObject({
      tune: 'v2', vue: 'home', detail: null,
    });
    expect(history.length, 'le montage a EMPILÉ une entrée au lieu de l’ancrer').toBe(avant);
  });

  it('🔴 changer de vue empile une entrée — c’est le défaut #828/#867', () => {
    poser(ShellV2);
    const avant = history.length;

    // LA NAVIGATION AGIT. Le témoin n'appelle pas `pushState` : c'est la
    // coquille qui doit le faire, ou ne rien faire du tout comme avant.
    activeView.set('queue');
    flushSync();

    expect(
      history.length,
      'changer de vue n’empile AUCUNE entrée : le Précédent du navigateur quitte Tune',
    ).toBe(avant + 1);
    expect(history.state).toMatchObject({ tune: 'v2', vue: 'queue', detail: null });
    expect(location.hash).toBe('#queue');
  });

  it('🔴 le Précédent du navigateur RELIT l’entrée et repose la vue quittée', async () => {
    poser(ShellV2);
    activeView.set('queue');
    flushSync();
    activeView.set('settings');
    flushSync();
    expect(get(activeView)).toBe('settings');

    // Le vrai geste : la traversée de session du navigateur, pas un appel au
    // module.
    history.back();
    await attendre();
    flushSync();

    expect(
      get(activeView),
      'le retour ne repose pas la vue quittée — l’entrée n’est pas relue',
    ).toBe('queue');
    expect(location.hash).toBe('#queue');
  });

  it('reculer ne fabrique pas d’entrée : deux retours rendent la vue de départ', async () => {
    // Sans le drapeau de restauration, `activeView.set` depuis le `popstate`
    // rappellerait l'abonnement et empilerait une entrée neuve : la pile
    // avancerait d'un cran à chaque retour et le Précédent tournerait en rond.
    poser(ShellV2);
    activeView.set('queue');
    flushSync();
    activeView.set('settings');
    flushSync();
    const hauteur = history.length;

    history.back();
    await attendre();
    flushSync();
    expect(history.length, 'le retour a EMPILÉ une entrée').toBe(hauteur);

    history.back();
    await attendre();
    flushSync();
    expect(get(activeView), 'deux retours ne ramènent pas à la vue de départ').toBe('home');
  });

  it('🔴 l’entrée ne contient AUCUN proxy Svelte : elle survit au clonage', () => {
    // `history.state` est cloné par l'algorithme structuré. Un `$state` de
    // Svelte 5 est un `Proxy` : selon ce qu'il enveloppe, le clonage lève —
    // ou passe, et l'on range une coquille vide qu'on ne découvre qu'au retour.
    poser(ShellV2);
    activeView.set('library');
    flushSync();
    const etat = history.state;
    // D'ABORD : il faut qu'il y ait quelque chose. Sans cette marche, un
    // historique VIDE ferait échouer la boucle par une erreur de type, et un
    // témoin qui s'écroule ne dit pas ce qui manque.
    expect(etat, 'aucun état n’est rangé dans l’entrée : rien n’a été écrit').not.toBeNull();
    expect(() => structuredClone(etat), 'l’état rangé n’est pas clonable').not.toThrow();
    for (const [champ, valeur] of Object.entries(etat)) {
      expect(
        ['string', 'boolean', 'number'].includes(typeof valeur) || valeur === null,
        `le champ « ${champ} » de l’entrée n’est pas une valeur simple`,
      ).toBe(true);
    }
  });

  it('démonter la coquille débranche l’écrivain', () => {
    poser(ShellV2);
    activeView.set('queue');
    flushSync();
    unmount(monte!);
    monte = null;
    flushSync();
    const hauteur = history.length;
    activeView.set('settings');
    flushSync();
    expect(
      history.length,
      'un écrivain survit au démontage — une coquille remontée en aurait deux',
    ).toBe(hauteur);
  });
});

describe('#864 — le retour repose OÙ L’ON ÉTAIT, pas en haut de la liste', () => {
  /** Position de la grille d'artistes avant d'ouvrir une fiche. */
  const POSITION = 4000;

  function grille(el: HTMLElement) {
    return el.querySelector<HTMLElement>('.grille.artistes');
  }

  it('la grille d’artistes s’affiche — sans quoi le reste ne mesure rien', async () => {
    const el = poser(ArtistesV2, { q: '' });
    await attendre();
    flushSync();
    expect(grille(el), 'pas de grille d’artistes : le témoin ne mesure plus rien').not.toBeNull();
    expect(el.querySelectorAll('.grille.artistes .carte').length).toBe(ARTISTES.length);
  });

  it('🔴 le bouton « Retour » de la fiche restitue la position de la liste', async () => {
    rendreLaMiseEnPage = donnerUneMiseEnPage();
    const el = poser(ArtistesV2, { q: '' });
    await attendre();
    flushSync();

    grille(el)!.scrollTop = POSITION;
    expect(grille(el)!.scrollTop).toBe(POSITION);

    // LA NAVIGATION AGIT : on clique une carte de la grille.
    el.querySelectorAll<HTMLButtonElement>('.grille.artistes .carte button.meta')[0].click();
    flushSync();
    await attendre();
    flushSync();
    const retour = el.querySelector<HTMLButtonElement>('header.fiche button.retour');
    expect(retour, 'la fiche artiste ne s’est pas ouverte').not.toBeNull();
    expect(grille(el), 'la grille est encore là : le calque ne l’a pas remplacée').toBeNull();

    retour!.click();
    flushSync();
    await attendre();
    flushSync();

    expect(grille(el), 'la grille n’est pas revenue').not.toBeNull();
    expect(
      grille(el)!.scrollTop,
      'le retour repose EN HAUT de la liste des artistes — c’est le défaut #864',
    ).toBe(POSITION);
  });

  it('🔴 le Précédent du navigateur referme la fiche ET restitue la position', async () => {
    rendreLaMiseEnPage = donnerUneMiseEnPage();
    const debrancher = brancherHistoriqueCoquille();
    try {
      const el = poser(ArtistesV2, { q: '' });
      await attendre();
      flushSync();
      grille(el)!.scrollTop = POSITION;

      el.querySelectorAll<HTMLButtonElement>('.grille.artistes .carte button.meta')[0].click();
      flushSync();
      await attendre();
      flushSync();
      expect(el.querySelector('header.fiche'), 'la fiche ne s’est pas ouverte').not.toBeNull();
      expect(history.state, 'ouvrir une fiche n’écrit rien dans l’historique').toMatchObject({
        detail: `artiste:${ARTISTES[0].id}`,
      });

      history.back();
      await attendre();
      flushSync();
      await attendre();
      flushSync();

      expect(
        el.querySelector('header.fiche'),
        'le Précédent du navigateur laisse la fiche ouverte',
      ).toBeNull();
      expect(
        grille(el)!.scrollTop,
        'le Précédent du navigateur repose en haut de la liste',
      ).toBe(POSITION);
    } finally {
      debrancher();
    }
  });
});
