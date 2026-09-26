// @vitest-environment jsdom
//
// LA GRILLE DU GESTIONNAIRE PASSE SUR LA SURCOUCHE COMMUNE — Bertrand,
// 26/09/2026, deux arbitrages.
//
//   1. le coin bas gauche de la pochette, qui COCHAIT la playlist, passe au
//      MENU D'ACTIONS, comme les vingt-trois autres emplacements du client ;
//   2. la case de sélection SORT de la pochette et se pose sur la ligne du
//      NOM, visible en permanence.
//
// Les deux se tiennent, et c'est le SECOND qui commande : les boutons de
// `PochetteActions` ne se montrent qu'au SURVOL (seul le cœur actif reste
// visible). Une case de sélection à l'intérieur n'aurait donc existé qu'au
// survol — inacceptable pour un geste de sélection, qu'on doit voir sans
// chercher, et impossible sur tactile.
//
// Cela REVIENT sur la consigne du 21/09 (« le bouton de sélection doit être au
// coin bas gauche de la POCHETTE »), assumé et daté dans le composant.
//
// ## 🔴 CE BANC MONTE L'ÉCRAN, IL NE LIT PAS SON SOURCE
//
// `fusionPlaylistsSansMode.test.ts` garde ce même écran en lisant son texte,
// et c'est son angle mort connu : une garde de texte est satisfaite par une
// classe posée n'importe où — dans une branche morte, sous une media query, ou
// hors de toute boîte positionnée. Elle est DÉJÀ passée au vert alors que les
// quatre coins avaient glissé après `.pl-texte` (« bouton de sélection ok mais
// les autres néant », Bertrand).
//
// Ici on MONTE `PlaylistManagerView` avec trois cartes — une locale, une
// Qobuz, une TIDAL —, on POSE les feuilles compilées dans le document, et on
// lit :
//
//   · où la case de sélection est dans l'ARBRE réellement peint ;
//   · son `opacity` CALCULÉ, sans aucun survol ;
//   · les coordonnées CALCULÉES du bouton de menu ;
//   · les entrées que le menu peint vraiment, comparées à ce que le CATALOGUE
//     (`lib/actionsPochette` via `lib/gestesObjet`) rend pour le même objet ;
//   · qu'une carte d'un AUTRE service reste cochable (le verrou de service est
//     tombé le 21/09 et ne doit pas se refermer à la faveur d'une migration) ;
//   · qu'aucun bouton n'est imbriqué dans un bouton (#1006).
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import { compile } from 'svelte/compiler';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { get } from 'svelte/store';
import PlaylistManagerView from '../../components/v2-heritage/PlaylistManagerView.svelte';
import { t as tr, locale } from '../i18n';
import { entreesObjet, objetPlaylist } from '../gestesObjet';
import {
  playlists,
  playlistsLoaded,
  pendingPlaylistId,
  streamingPlaylistsCache,
  streamingPlaylistsLoaded,
} from '../stores/playlists';
import { currentProfileId } from '../stores/profile';

// Monter un écran de plus de quatre mille lignes compile beaucoup, et ce banc
// compile en plus ses feuilles : 5 s donneraient un rouge de CHARGE, pas de
// code.
vi.setConfig({ testTimeout: 60_000 });

const LOCALE = { id: 42, name: 'Nocturnes', track_count: 3 };
const QOBUZ = {
  source_id: 'q-777',
  name: 'Matin Qobuz',
  track_count: 12,
  duration_ms: 1000,
  cover_path: null,
  source: 'qobuz',
};
const TIDAL = {
  source_id: 't-888',
  name: 'Soir TIDAL',
  track_count: 7,
  duration_ms: 2000,
  cover_path: null,
  source: 'tidal',
};

function corpsPour(url: string): unknown {
  if (url.includes('/playlist-manager/services')) {
    return {
      qobuz: { authenticated: true, supports_write: true, supports_delete: true },
      tidal: { authenticated: true, supports_write: true, supports_delete: false },
    };
  }
  if (url.includes('/streaming/services')) {
    return { qobuz: { authenticated: true }, tidal: { authenticated: true } };
  }
  if (url.includes('/streaming/qobuz/playlists')) return [QOBUZ];
  if (url.includes('/streaming/tidal/playlists')) return [TIDAL];
  if (/\/playlists(\?|$)/.test(url)) return [LOCALE];
  return [];
}

/**
 * LES FEUILLES, COMPILÉES PAR SVELTE PUIS POSÉES DANS LE DOCUMENT.
 *
 * Sans elles, `getComputedStyle` ne répondrait que sur les valeurs par défaut —
 * et `opacity: 1` par défaut ferait passer au vert un banc qui ne garde RIEN.
 * D'où le témoin croisé, plus bas : on vérifie que la feuille s'applique
 * vraiment (la case mesure 20 px) ET que les coins de la surcouche, eux, sont à
 * `opacity: 0` sans survol. Si les feuilles n'étaient pas là, ce second point
 * serait faux et le banc rougirait.
 *
 * UNE SEULE fois par fichier (#1354) : `compile()` sur cet écran coûte cher, et
 * les feuilles ne dépendent d'aucun cas.
 */
const COMPOSANTS = [
  'src/components/v2-heritage/PlaylistManagerView.svelte',
  'src/components/v2/PochetteActions.svelte',
];
interface Feuille {
  chemin: string;
  portee: string;
  el: HTMLStyleElement;
}
let feuilles: Feuille[] = [];

function compilerFeuilles(): Feuille[] {
  return COMPOSANTS.map((chemin) => {
    const src = readFileSync(resolve(process.cwd(), chemin), 'utf-8');
    const { css } = compile(src, { css: 'external', filename: chemin });
    if (!css?.code) throw new Error(`${chemin} : aucune feuille compilée`);
    const portee = css.code.match(/\.(svelte-[a-z0-9]+)/)?.[1];
    if (!portee) throw new Error(`${chemin} : aucune classe de portée`);
    const el = document.createElement('style');
    el.textContent = css.code;
    document.head.appendChild(el);
    return { chemin, portee, el };
  });
}

/**
 * La feuille compilée ici et le composant monté par Vite doivent porter LA MÊME
 * classe de portée, sinon aucune règle ne s'applique et tout passe au vert pour
 * une mauvaise raison.
 */
function verifierPortee(chemin: string): void {
  const f = feuilles.find((x) => x.chemin === chemin)!;
  const n = document.querySelectorAll(`.${f.portee}`).length;
  if (!n) throw new Error(`${chemin} : la portée ${f.portee} n'est sur aucun élément monté`);
}

class ResizeObserverInerte {
  observe() {}
  unobserve() {}
  disconnect() {}
}

let hote: HTMLDivElement | null = null;
let monte: Record<string, unknown> | null = null;

const respirer = () => new Promise((r) => setTimeout(r, 0));
async function souffler(n = 4) {
  for (let i = 0; i < n; i++) {
    await respirer();
    flushSync();
  }
}

async function monterLaGrille(): Promise<HTMLDivElement> {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(PlaylistManagerView, { target: hote, props: { onAddToPlaylist: () => {} } });
  flushSync();
  await souffler(8);
  const grille = hote.querySelector('.pl-grille');
  expect(grille, 'la grille de playlists n’est pas peinte').not.toBeNull();
  return hote;
}

/** Les cartes, dans l'ordre peint : locale d'abord, puis les services. */
const cartes = (el: HTMLElement) => [...el.querySelectorAll<HTMLElement>('.pl-grille > .pl-carte')];

/** La carte dont le nom est exactement `nom`. */
function carte(el: HTMLElement, nom: string): HTMLElement {
  const trouvee = cartes(el).find((c) => c.querySelector('.pl-nom')?.textContent?.trim() === nom);
  expect(trouvee, `aucune carte nommée « ${nom} »`).toBeDefined();
  return trouvee!;
}

/** La case de sélection d'une carte. */
const caseDe = (c: HTMLElement) => c.querySelector<HTMLButtonElement>('.pl-case');
/** L'enveloppe de la surcouche commune — la « vignette » au sens des coins. */
const surcoucheDe = (c: HTMLElement) => c.querySelector<HTMLElement>('.pl-vignette .pa');
/** Le bouton du coin bas gauche de la surcouche : le menu d'actions. */
const menuDe = (c: HTMLElement) => c.querySelector<HTMLButtonElement>('.pl-vignette .pa button.coin.bl');

beforeAll(() => {
  feuilles = compilerFeuilles();
});
afterAll(() => {
  for (const f of feuilles) f.el.remove();
  feuilles = [];
});

beforeEach(() => {
  localStorage.clear();
  locale.set('fr');
  vi.stubGlobal('ResizeObserver', ResizeObserverInerte);
  vi.stubGlobal('WebSocket', class {
    close() {}
    addEventListener() {}
    removeEventListener() {}
    send() {}
  } as unknown as typeof WebSocket);
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      const corps = corpsPour(String(url));
      return {
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: new Map([['content-type', 'application/json']]),
        json: async () => corps,
        text: async () => JSON.stringify(corps),
      } as unknown as Response;
    }),
  );
});

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  if (hote) hote.remove();
  hote = null;
  // Les menus de `MenuObjetV2` sont PORTÉS à la racine du document : démonter
  // l'hôte ne les emporte pas.
  for (const n of [...document.querySelectorAll('.fond')]) n.remove();
  pendingPlaylistId.set(null);
  currentProfileId.set(null);
  playlists.set([]);
  playlistsLoaded.set(false);
  streamingPlaylistsCache.set({});
  streamingPlaylistsLoaded.set(false);
  vi.unstubAllGlobals();
});

describe('Gestionnaire de playlists — la grille sur la surcouche commune', () => {
  it('🔴 la grille rend TROIS cartes mixtes, et chacune passe par `PochetteActions`', async () => {
    const el = await monterLaGrille();
    expect(cartes(el).length, 'la grille ne peint pas les trois cartes').toBe(3);
    for (const nom of [LOCALE.name, QOBUZ.name, TIDAL.name]) {
      const c = carte(el, nom);
      expect(surcoucheDe(c), `« ${nom} » n’est pas habillée par la surcouche commune`).not.toBeNull();
      // Et les coins propres à cet écran ont disparu de l'arbre peint.
      for (const morte of ['.pl-coin', '.pl-coin-hg', '.pl-coin-hd', '.pl-coin-bd', '.pl-lire']) {
        expect(c.querySelector(morte), `${morte} survit sur « ${nom} »`).toBeNull();
      }
    }
  });

  it('🔴 LA CASE DE SÉLECTION EST HORS DE LA VIGNETTE, sur la ligne du nom', async () => {
    const el = await monterLaGrille();
    for (const nom of [LOCALE.name, QOBUZ.name, TIDAL.name]) {
      const c = carte(el, nom);
      const boite = caseDe(c);
      expect(boite, `« ${nom} » n’a pas de case de sélection`).not.toBeNull();
      // 1. Hors de l'enveloppe de la surcouche : c'est CELA qui l'affranchit du
      //    survol, puisque la révélation est portée par `.pa:hover`.
      expect(
        surcoucheDe(c)!.contains(boite!),
        `la case de « ${nom} » est retournée DANS la pochette : elle redevient invisible hors survol`,
      ).toBe(false);
      // 2. Sur la ligne du NOM, et avant lui.
      const ligne = boite!.closest('.pl-ligne');
      expect(ligne, `la case de « ${nom} » n’est pas sur une ligne de nom`).not.toBeNull();
      const dansLeTexte = boite!.closest('.pl-texte');
      expect(dansLeTexte, `la case de « ${nom} » n’est pas dans le bloc de texte`).not.toBeNull();
      const suivant = ligne!.querySelector('.pl-nom');
      expect(suivant?.textContent?.trim()).toBe(nom);
      expect(
        boite!.compareDocumentPosition(suivant!) & Node.DOCUMENT_POSITION_FOLLOWING,
        'la case ne précède pas le nom',
      ).toBeTruthy();
    }
  });

  it('🔴 la case est VISIBLE sans aucun survol — et les coins de la pochette, non', async () => {
    const el = await monterLaGrille();
    verifierPortee('src/components/v2-heritage/PlaylistManagerView.svelte');
    verifierPortee('src/components/v2/PochetteActions.svelte');
    const c = carte(el, QOBUZ.name);
    const boite = caseDe(c)!;
    const calcul = getComputedStyle(boite);
    /*
      TÉMOIN CROISÉ — sans lui ce cas passerait au vert à vide.

      `opacity` vaut « 1 » par défaut : un banc sans feuille de style dirait
      « visible » de n'importe quel élément. On vérifie donc d'abord que la
      feuille de l'écran s'applique RÉELLEMENT à la case (ses 20 px), puis que
      la feuille de la surcouche s'applique aussi et qu'elle cache ses coins.
      Si les feuilles manquaient, la seconde assertion serait fausse.
    */
    expect(calcul.width, 'la feuille de l’écran ne s’applique pas à la case').toBe('20px');
    const coin = menuDe(c)!;
    expect(coin, 'aucun bouton de menu dans le coin bas gauche').not.toBeNull();
    expect(
      getComputedStyle(coin).opacity,
      'les coins de la surcouche ne sont plus cachés hors survol : le témoin croisé ne garde plus rien',
    ).toBe('0');
    // ET LA CASE, ELLE, EST LÀ.
    expect(calcul.opacity, 'la case de sélection est cachée hors survol').toBe('1');
    expect(calcul.visibility).not.toBe('hidden');
    expect(calcul.display).not.toBe('none');
  });

  it('🔴 LE MENU D’ACTIONS OCCUPE LE COIN BAS GAUCHE de la pochette', async () => {
    const el = await monterLaGrille();
    verifierPortee('src/components/v2/PochetteActions.svelte');
    const coin = menuDe(carte(el, LOCALE.name))!;
    expect(coin).not.toBeNull();
    const pose = getComputedStyle(coin);
    expect(pose.position).toBe('absolute');
    expect(pose.bottom, 'le menu n’est pas en BAS').toBe('8px');
    expect(pose.left, 'le menu n’est pas à GAUCHE').toBe('8px');
    expect(coin.getAttribute('aria-haspopup')).toBe('menu');
    expect(coin.getAttribute('aria-expanded')).toBe('false');
  });

  it('🔴 le menu rend CE QUE LE CATALOGUE DIT pour une playlist, sans rien inventer', async () => {
    const el = await monterLaGrille();
    const coin = menuDe(carte(el, LOCALE.name))!;
    coin.click();
    await souffler(4);
    const peintes = [...document.querySelectorAll<HTMLElement>('[role="menu"] [role="menuitem"]')]
      .map((b) => b.dataset.cle)
      .filter((v): v is string => !!v);
    expect(peintes.length, 'le menu n’a peint aucune entrée').toBeGreaterThan(0);
    /*
      LA RÉFÉRENCE EST LE CATALOGUE, PAS UNE LISTE ÉCRITE ICI.

      On rappelle `entreesObjet` pour le MÊME objet et les MÊMES gestes que
      l'écran fournit — `ouvrir` (le calque de l'écran), `transferer` (son
      chemin propre) et `etiqueter`, que `MenuObjetV2` fournit lui-même dès
      qu'une cible d'étiquettes existe. Une entrée nouvelle ajoutée à la main
      dans l'écran ferait rougir ce cas, et une entrée retirée du catalogue le
      suit sans retouche.
    */
    const attendues = entreesObjet(objetPlaylist(LOCALE), get(tr) as (c: string) => string, {
      gestes: { ouvrir: () => {}, transferer: () => {}, etiqueter: () => {} },
    }).map((e) => e.cle);
    expect(peintes).toEqual(attendues);
    // Les deux que Bertrand a nommées, ancrées en clair : le menu d'une
    // playlist de bibliothèque les porte.
    expect(peintes, '« Lire en aléatoire » absent du menu').toContain('library.shuffle');
    expect(peintes, '« Supprimer » absent du menu').toContain('common.delete');
  });

  it('🔴 PIÈGE 2 — une carte d’un AUTRE service reste cochable', async () => {
    /*
      « Quand je vais merger des playlists de Tidal et Qobuz, quand vais-je
      choisir la cible ? » (Bertrand, 21/09) — jamais, puisqu'il ne pouvait pas
      mélanger : cocher une carte TIDAL rendait inertes toutes les cartes Qobuz.
      Le verrou est tombé. Une migration peut le refermer sans qu'on le voie, et
      la garde de texte de `fusionPlaylistsSansMode` ne sait que dire qu'un NOM
      de variable a disparu. Ici on COCHE les deux et on regarde l'écran.
    */
    const el = await monterLaGrille();
    const q = caseDe(carte(el, QOBUZ.name))!;
    q.click();
    await souffler(3);
    expect(q.getAttribute('aria-pressed'), 'la carte Qobuz ne se coche pas').toBe('true');

    const t = caseDe(carte(el, TIDAL.name))!;
    expect(t.hasAttribute('disabled'), 'la carte TIDAL est désactivée par la sélection Qobuz').toBe(false);
    t.click();
    await souffler(3);
    expect(
      caseDe(carte(el, TIDAL.name))!.getAttribute('aria-pressed'),
      'la carte TIDAL refuse de se cocher alors qu’une Qobuz l’est : le verrou de service est revenu',
    ).toBe('true');
    // La Qobuz est TOUJOURS cochée : on a bien DEUX services dans la sélection.
    expect(caseDe(carte(el, QOBUZ.name))!.getAttribute('aria-pressed')).toBe('true');
    // Et la locale aussi, dans la même grille.
    const l = caseDe(carte(el, LOCALE.name))!;
    l.click();
    await souffler(3);
    expect(caseDe(carte(el, LOCALE.name))!.getAttribute('aria-pressed')).toBe('true');
    // La barre apparue porte le sélecteur de cible — la réponse à la question.
    expect(el.querySelector('.merge-cible'), 'pas de sélecteur de cible dans la barre').not.toBeNull();
    // Aucune carte n'est rendue inerte.
    expect(el.querySelectorAll('.pl-case[disabled]').length).toBe(0);
  });

  it('🔴 PIÈGE 1 — aucun MODE : les cases sont là avant tout clic, la barre après', async () => {
    const el = await monterLaGrille();
    // Les trois cases sont peintes d'emblée : rien à découvrir.
    expect(el.querySelectorAll('.pl-case').length).toBe(3);
    // Et la barre de fusion n'est pas là tant que rien n'est coché.
    expect(el.querySelector('.merge-bar'), 'la barre s’affiche sans sélection').toBeNull();
    caseDe(carte(el, LOCALE.name))!.click();
    await souffler(3);
    expect(el.querySelector('.merge-bar'), 'la barre ne s’affiche pas dès UNE sélection').not.toBeNull();
    // La grille n'a pas basculé d'état : les mêmes cartes, les mêmes cases.
    expect(cartes(el).length).toBe(3);
    expect(el.querySelectorAll('.pl-case').length).toBe(3);
  });

  it('🔴 PIÈGE 3 — aucun bouton imbriqué dans un bouton', async () => {
    const el = await monterLaGrille();
    const imbriques = [...el.querySelectorAll('.pl-grille button button')];
    expect(
      imbriques.map((b) => b.className),
      'un bouton dans un bouton : les navigateurs défont ce balisage (#1006)',
    ).toEqual([]);
    // Et la pochette elle-même n'est plus un bouton : c'est la surcouche qui
    // pose le bouton plein cadre.
    for (const c of cartes(el)) {
      const pochette = c.querySelector('.pl-pochette')!;
      expect(pochette.tagName, '.pl-pochette est redevenue un <button> dans la surcouche').not.toBe('BUTTON');
    }
  });

  it('le cœur est là sur les trois cartes, locale comme de service', async () => {
    // Bertrand, 21/09/2026 : « je veux les 5 sur chaque cover de playlist ».
    // Le cœur d'une playlist de SERVICE ne vit pas dans `favorites` : la
    // surcouche le prend par `favoriExterne`. Une carte sans cœur signerait un
    // `favoriExterneService` qui rend `null`.
    const el = await monterLaGrille();
    const FR = get(tr) as (c: string) => string;
    for (const nom of [LOCALE.name, QOBUZ.name, TIDAL.name]) {
      const c = carte(el, nom);
      const coeur = c.querySelector(`.pa button.coin.tl[aria-label="${FR('v2.cover.favorite')}"]`);
      expect(coeur, `« ${nom} » n’a pas de cœur sur sa pochette`).not.toBeNull();
    }
  });
});
