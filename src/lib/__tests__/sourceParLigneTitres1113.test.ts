// @vitest-environment jsdom
//
// renesenses/tune-web-client#1113 — FabienM, fil forum 1829 (17/09/2026),
// v0.9.152, point 5 sur onze :
//
//   « Menu Recherche: il manque les vignettes des titres trouvés et leur
//     source (Bibliothèque, Qobuz, Bandcamp, Tidal, Youtube) »
//
// Ce témoin ne tient que LA SOURCE. La vignette est arrivée le 17/09 par
// `pochetteEnTableau` (#3823, puis la Recherche), et `recherchePochettePistes`
// la garde déjà.
//
// Sa capture (`0icfZSu…png`) montre la rangée de périmètre
// « OÙ : Bibliothèque 10 · Qobuz 205 · Bandcamp 53 · Youtube 1 » au-dessus
// d'UNE seule liste de titres : quatre provenances mêlées dans le même
// tableau, et pas une ligne qui dise laquelle. `fusionnerParType` estampille
// pourtant `source` sur chaque piste — la Recherche ne s'en servait que pour
// fabriquer la CLÉ de la boucle `{#each}`.
//
// ══════════════════════════════════════════════════════════════════════════
// 🔴 CE TÉMOIN MONTE L'ÉCRAN ET REGARDE SES LIGNES.
//
// Pas une garde de texte : chercher `ServiceBadge` dans `SearchV2.svelte`
// resterait vert si `ListePistesV2` cessait d'en faire quoi que ce soit —
// « écrit mais pas branché », la famille de défauts que ce client passe son
// temps à corriger.
//
// 🔴 ET IL EXIGE LE BADGE HORS DE LA VIGNETTE.
//
// `AlbumArt` pose déjà une pastille de service en incrustation sur la
// pochette, et la pochette du tableau vit dans `.tvig`, une boîte de 36 px en
// `overflow:hidden`. Une pastille `BANDCAMP` compacte y est plus large que son
// support : elle est tronquée. Surtout, cette incrustation ÉCARTE `local`
// (arbitrage repris de renesenses/tune-server-rust#3900) — donc, sur une liste
// qui mêle la bibliothèque et trois services, la ligne de bibliothèque ne dit
// rien du tout.
//
// D'où l'assertion : la pastille doit être un enfant DIRECT de la cellule du
// titre. Un badge posé dans la vignette ne satisfait pas ce témoin, et c'est
// voulu.
// ══════════════════════════════════════════════════════════════════════════
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import SearchV2 from '../../components/v2/SearchV2.svelte';
import ListePistesV2 from '../../components/v2/ListePistesV2.svelte';
import { setSearchCriteria } from '../stores/shortcuts';
import { preferences } from '../stores/preferences';
import { modeEnTableau } from '../colonnesPistes';
import { fusionnerParType } from '../rechercheClassement';

vi.setConfig({ testTimeout: 30_000 });

/** La requête de sa capture. */
const REQUETE = 'Wish You Were Here';

/** Les quatre provenances de sa rangée « OÙ », et le texte que chacune peint.
 *  `ServiceBadge` est une table fixe : c'est elle qui nomme, pas ce fichier. */
const ATTENDU: Record<string, string> = {
  local: 'LOCAL',
  qobuz: 'QOBUZ',
  bandcamp: 'BANDCAMP',
  youtube: 'YT',
};

const pisteLocale = {
  id: 501,
  title: 'Wish You Were Here',
  artist_name: 'Pink Floyd',
  album_title: 'Wish You Were Here',
  album_id: 60,
  cover_path: '/covers/wywh.jpg',
  duration: 335,
  year: 1975,
};

/** Une piste de service : pas d'`id` de bibliothèque, un `source_id` texte. */
const pisteDeService = (svc: string, n: number) => ({
  id: null,
  source_id: `${svc}-${n}`,
  title: 'Wish You Were Here',
  artist_name: 'Pink Floyd',
  album_title: 'Wish You Were Here',
  cover_path: null,
  duration: 334,
  year: 1975,
});

const vide = { artists: [], albums: [], tracks: [], playlists: [] };
const LOCAL = { ...vide, tracks: [pisteLocale] };
const SERVICES = {
  qobuz: { ...vide, tracks: [pisteDeService('qobuz', 1)] },
  bandcamp: { ...vide, tracks: [pisteDeService('bandcamp', 1)] },
  youtube: { ...vide, tracks: [pisteDeService('youtube', 1)] },
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
let monte: Record<string, unknown> | null = null;

const respirer = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', ResizeObserverInerte);
  localStorage.clear();
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: any) => {
      const u = String(url);
      if (/\/library\/search/.test(u)) return reponse(LOCAL);
      if (/\/search\?/.test(u)) return reponse({ local: LOCAL, services: SERVICES, radios: [] });
      if (/\/playlists/.test(u)) return reponse([]);
      return reponse([]);
    }),
  );
  vi.stubGlobal('WebSocket', class {
    close() {}
    addEventListener() {}
    removeEventListener() {}
    send() {}
  } as unknown as typeof WebSocket);
  // Le niveau décide du rendu : seul le TABLEAU est en cause ici, et c'est ce
  // que voit FabienM (colonnes « # · TITRE · ARTISTE · DURÉE · ANNÉE · GE… »).
  preferences.update((p) => ({ ...p, settingsLevel: 'expert' }));
});

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  if (hote) hote.remove();
  hote = null;
  setSearchCriteria(null);
  vi.unstubAllGlobals();
});

async function chercher(): Promise<HTMLDivElement> {
  setSearchCriteria({ q: REQUETE });
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(SearchV2, { target: hote, props: {} as any });
  flushSync();
  // L'anti-rebond de la recherche vaut 240 ms ; on le laisse passer.
  await new Promise((r) => setTimeout(r, 320));
  for (let i = 0; i < 10; i++) await respirer();
  flushSync();
  return hote;
}

/** Les lignes du tableau des TITRES. La section « Ambiance » n'existe pas ici
 *  (aucune recherche acoustique lancée) et les albums sont vides : le seul
 *  `.tbl` de l'écran est celui des titres. */
const lignes = (el: HTMLElement) => [...el.querySelectorAll('.tbl .trow')];

/** La pastille de provenance de CETTE ligne — enfant direct de la cellule du
 *  titre, donc hors de la vignette. */
function pastilleDeLigne(ligne: Element): Element | null {
  const titre = ligne.querySelector('.titre');
  if (!titre) return null;
  return [...titre.children].find((c) => c.classList.contains('service-badge')) ?? null;
}

describe('#1113 — chaque ligne de la section Titres dit sa source', () => {
  it('le niveau mesuré rend bien le TABLEAU — sinon le témoin ne mesure rien', () => {
    expect(modeEnTableau('expert')).toBe(true);
  });

  it('la fusion estampille bien les quatre provenances — la donnée est là', () => {
    // La contre-épreuve amont : si `fusionnerParType` cessait d'estampiller,
    // l'écran n'aurait rien à afficher et le reste du fichier accuserait le
    // mauvais coupable.
    const g = fusionnerParType(LOCAL as any, SERVICES as any);
    expect(g.pistes.map((p) => p.source)).toEqual(['local', 'qobuz', 'bandcamp', 'youtube']);
  });

  it('🔴 les quatre lignes sont bien rendues, sources mêlées', async () => {
    const el = await chercher();
    expect(
      lignes(el).length,
      'la section Titres ne rend pas les quatre pistes : le témoin ne mesurerait rien',
    ).toBe(4);
  });

  it('🔴 Bibliothèque, Qobuz, Bandcamp et Youtube : chaque ligne porte SA pastille', async () => {
    const el = await chercher();
    const rendu = lignes(el).map((l) => (pastilleDeLigne(l)?.textContent ?? '').trim());
    expect(
      rendu,
      'une liste qui mêle quatre provenances et ne dit pas laquelle, ligne par ligne — #1113',
    ).toEqual([ATTENDU.local, ATTENDU.qobuz, ATTENDU.bandcamp, ATTENDU.youtube]);
  });

  it('🔴 la ligne de BIBLIOTHÈQUE le dit aussi — elle n’est pas l’exception', async () => {
    // L'incrustation de `AlbumArt` écarte `local` (#3900 côté serveur) : sur
    // une liste d'une seule source c'est du bruit en moins, ici c'est la ligne
    // muette au milieu de trois qui parlent. Cette assertion est isolée pour
    // que son échec se lise seul.
    const el = await chercher();
    const premiere = lignes(el)[0];
    expect(premiere, 'aucune ligne rendue').toBeTruthy();
    expect(
      (pastilleDeLigne(premiere)?.textContent ?? '').trim(),
      'la piste de la bibliothèque ne dit pas d’où elle vient',
    ).toBe(ATTENDU.local);
  });

  it('la pastille est DANS la cellule du titre, pas dans une colonne de plus', async () => {
    // La règle de `ListePistesV2`, écrite trois fois dans le fichier :
    // l'en-tête et les lignes sont deux grilles séparées qui partagent un seul
    // `grid-template-columns`. Une cellule de plus dans les lignes seules fait
    // dériver TOUS les en-têtes vers la droite (Bertrand, 07/09/2026).
    const el = await chercher();
    const enTete = el.querySelectorAll('.tbl .thead .th').length;
    const premiere = lignes(el)[0];
    expect(premiere, 'le tableau ne rend aucune ligne').toBeTruthy();
    expect(
      premiere.children.length,
      'les lignes portent plus de cellules que l’en-tête n’a de colonnes',
    ).toBe(enTete);
  });
});

describe('#1113 — la pastille reste OPT-IN dans le tableau partagé', () => {
  // Le MÊME tableau sert la Bibliothèque (onglet Titres), les playlists et
  // l'Historique — une seule source par écran. Y poser une pastille sur chaque
  // ligne serait du bruit : « la recherche se juge sur la qualité du résultat,
  // pas sur le volume ». Seule la Recherche mêle les provenances.
  const PISTE = {
    id: 501, title: 'Wish You Were Here', artist_name: 'Pink Floyd',
    album_id: 60, cover_path: '/covers/wywh.jpg', source: 'qobuz',
  } as any;

  function poser(props: Record<string, unknown>): HTMLDivElement {
    hote = document.createElement('div');
    document.body.appendChild(hote);
    monte = mount(ListePistesV2, { target: hote, props: { pistes: [PISTE], onLire: () => {}, ...props } });
    flushSync();
    return hote;
  }

  it('sans qu’on la demande, aucune pastille de provenance sur la ligne', () => {
    const el = poser({});
    const ligne = el.querySelector('.tbl .trow');
    expect(ligne, 'le tableau ne rend pas de ligne').not.toBeNull();
    expect(
      pastilleDeLigne(ligne!),
      'le tableau partagé annonce une provenance sans qu’on la lui ait demandée',
    ).toBeNull();
  });

  it('… et elle apparaît dès qu’on la demande', () => {
    const el = poser({ sourceEnTableau: true });
    const ligne = el.querySelector('.tbl .trow');
    expect((pastilleDeLigne(ligne!)?.textContent ?? '').trim()).toBe(ATTENDU.qobuz);
  });

  it('une piste SANS source ne ment pas en « LOCAL »', () => {
    // La règle tenue par `badgeUpnp.test.ts` : un repli `?? 'local'` peint
    // « LOCAL » sur une piste distante dont la source n'est pas encore lue.
    // Mieux vaut aucune pastille qu'une pastille fausse.
    const el = poser({ pistes: [{ ...PISTE, source: undefined }], sourceEnTableau: true });
    const ligne = el.querySelector('.tbl .trow');
    expect(pastilleDeLigne(ligne!), 'une provenance inconnue a été peinte quand même').toBeNull();
  });
});
