// @vitest-environment jsdom
/**
 * Le catalogue d'actions des pochettes — arbitrage de Bertrand du 26/09/2026.
 *
 * `PochetteActions` habille VINGT-TROIS emplacements répartis sur treize
 * écrans. Cinq écrans lui passaient un `menu`, huit n'en passaient aucun — et
 * sur ces huit, le bouton restait présent et GRISÉ, libellé « Autres actions —
 * bientôt », en contradiction avec la règle que Bertrand avait posée dans ce
 * même fichier : « ce qui ne s'applique pas est ABSENT, pas grisé ».
 *
 * ## Pourquoi ces gardes APPELLENT au lieu de lire
 *
 * Les gardes de `pochetteActions.test.ts` lisent la SOURCE du composant. Elles
 * ont leur utilité — la position des cinq icônes est un fait de maquette — mais
 * elles ne peuvent rien dire du CONTENU d'un menu : un texte présent ne prouve
 * pas qu'il s'exécute. `lib/menuPiste` a payé cette leçon le 07/09/2026, sa
 * première garde restant verte quand on préfixait la ligne d'un `if (false)`.
 *
 * Ici, donc :
 *  - le catalogue est APPELÉ, une fois par type d'objet, et l'on regarde ce
 *    qu'il rend ;
 *  - le bouton est cherché dans le DOM d'un composant MONTÉ, pas dans son
 *    balisage ;
 *  - le portage à la racine est vérifié sur le nœud réel, avec une géométrie
 *    simulée, pas sur la présence de `use:portail`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRawSnippet, flushSync, mount, unmount } from 'svelte';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  entreesPochette,
  type CapacitesPochette,
  type GestesPochette,
  type TypePochette,
} from '../actionsPochette';
import { styleMenuAncre } from '../ancrageMenu';
import type { ObjetMenu } from '../gestesObjet';
import PochetteActions from '../../components/v2/PochetteActions.svelte';

/** Traduire par l'IDENTITÉ : le libellé rendu est alors la clé, et les
 *  assertions parlent de gestes, pas de français. */
const cle = (k: string) => k;

/** Les neuf types, pour qu'aucun n'échappe aux gardes par omission. */
const TOUS_LES_TYPES: TypePochette[] = [
  'album',
  'artiste',
  'playlist',
  'playlistIntelligente',
  'collection',
  'collectionIntelligente',
  'label',
  'radio',
  'podcast',
];

/** Tous les gestes du catalogue. */
const GESTES = [
  'lire', 'lireAleatoire', 'ensuite', 'enfiler', 'ouvrir', 'allerArtiste', 'basculerFavori',
  'etiqueter', 'credits', 'modifier', 'reidentifier', 'localiser', 'concerts', 'renommer',
  'dupliquer', 'exporter', 'partager', 'transferer', 'modifierRegles', 'retirerDeCollection',
  'supprimer',
] as const;

/**
 * Une surface qui saurait TOUT faire, et qui compte ce qu'on lui demande.
 *
 * C'est ce témoin qui fait la différence avec une garde de texte : il ne dit pas
 * qu'une entrée est écrite, il dit que la fonction de l'entrée appelle bien le
 * geste de la surface, et lequel.
 */
function surfaceComplete() {
  const appels: string[] = [];
  const g: GestesPochette = {};
  for (const n of GESTES) (g as any)[n] = () => appels.push(n);
  g.ajouterACollection = async () => [{ cle: 'c:1', libelle: 'Jazz', faire: () => appels.push('collection:Jazz') }];
  g.deplacerVersRayon = async () => [{ cle: 'r:1', libelle: 'Rock', faire: () => appels.push('rayon:Rock') }];
  return { g, appels };
}

/** Tout ce qu'un objet LOCAL peut permettre à la fois. */
const TOUT = (type: TypePochette): CapacitesPochette => ({
  type,
  idBibliotheque: type === 'label' ? null : 7,
  // Un label se lit par sa VALEUR (`capacitesObjet` le pose).
  jouable: true,
  favori: type === 'label' ? undefined : false,
  etiquetable: type !== 'label',
  artisteConnu: true,
  greffonConcerts: true,
  greffonConvertisseur: true,
  dansCollectionManuelle: true,
});

const LIRE = ['common.play', 'library.shuffle', 'v2.pa.next', 'queue.addToQueue'];

describe('Le catalogue, appelé pour CHAQUE type d’objet', () => {
  /**
   * La table de référence — c'est la LISTE que Bertrand juge (26/09/2026 :
   * « Il doit y avoir un menu contextuel pour : artistes, playlists,
   * collections, labels », puis les albums). Un remaniement qui l'élargit ou
   * la rétrécit doit passer par ici.
   */
  const ATTENDU: Record<TypePochette, string[]> = {
    album: [
      ...LIRE, 'common.open', 'library.goToArtist', 'v2.cover.favorite', 'v2.cover.tags',
      'v2.album.addToCollection', 'credits.see', 'v2.cover.edit', 'library.reidentify',
      'v2.album.locate', 'v2.col.removeAlbum',
    ],
    artiste: [...LIRE, 'common.open', 'v2.cover.favorite', 'v2.cover.tags', 'nav.concerts'],
    playlist: [
      ...LIRE, 'common.open', 'v2.cover.favorite', 'v2.cover.tags', 'v2.pl.rename',
      'menuObjet.duplicate', 'v2.pl.export', 'menuObjet.transfer', 'v2.pl.share', 'common.delete',
    ],
    playlistIntelligente: [...LIRE, 'common.open', 'v2.cover.favorite', 'v2.cover.tags', 'menuObjet.editRules', 'common.delete'],
    collection: [...LIRE, 'common.open', 'v2.cover.favorite', 'v2.cover.tags', 'v2.pl.rename', 'v2.rayons.move', 'common.delete'],
    collectionIntelligente: [
      ...LIRE, 'common.open', 'v2.cover.favorite', 'v2.cover.tags', 'menuObjet.editRules', 'v2.rayons.move', 'common.delete',
    ],
    // Un LABEL est une valeur, pas une ligne de table : il se lit et s'ouvre.
    label: [...LIRE, 'common.open'],
    // 🔴 RIEN pour la radio et le podcast : leurs gestes sont des boutons à
    // part (lecture au centre, abonnement), comme avant.
    radio: [],
    podcast: [],
  };

  for (const type of TOUS_LES_TYPES) {
    it(`${type} : le catalogue rend exactement ce qu'il doit rendre`, () => {
      const { g } = surfaceComplete();
      const rendu = entreesPochette(TOUT(type), g, cle);
      expect(rendu.map((e) => e.cle)).toEqual(ATTENDU[type]);
    });
  }

  it('chaque entrée rendue APPELLE bien le geste de la surface', async () => {
    // Le cœur de la garde : on exécute ce que le catalogue a rendu. Une entrée
    // dont le `faire` serait câblé au mauvais geste — ou à rien — se voit ici,
    // et nulle part dans un balisage.
    const { g, appels } = surfaceComplete();
    for (const e of entreesPochette(TOUT('playlistIntelligente'), g, cle)) e.faire();
    expect(appels).toEqual([
      'lire', 'lireAleatoire', 'ensuite', 'enfiler', 'ouvrir', 'basculerFavori', 'etiqueter',
      'modifierRegles', 'supprimer',
    ]);
    // Un SOUS-MENU ne fait rien lui-même : il rend ses lignes, et c'est la
    // ligne choisie qui agit.
    const autre = surfaceComplete();
    const ajout = entreesPochette(TOUT('album'), autre.g, cle).find((e) => e.cle === 'v2.album.addToCollection')!;
    ajout.faire();
    expect(autre.appels).toEqual([]);
    const lignes = await ajout.sous!();
    lignes[0].faire!();
    expect(autre.appels).toEqual(['collection:Jazz']);
  });

  it('ce qui ne revient pas est teinté DANGER, et le reste ne l’est pas', () => {
    const { g } = surfaceComplete();
    const teinte = (type: TypePochette) =>
      entreesPochette(TOUT(type), g, cle)
        .filter((e) => e.danger)
        .map((e) => e.cle);
    // Partager pose un jeton PUBLIC ; retirer et supprimer ne reviennent pas.
    expect(teinte('album')).toEqual(['v2.col.removeAlbum']);
    expect(teinte('playlist')).toEqual(['v2.pl.share', 'common.delete']);
    expect(teinte('collection')).toEqual(['common.delete']);
    expect(teinte('artiste')).toEqual([]);
    expect(teinte('label')).toEqual([]);
  });

  it('le libellé sort de `traduire`, et l’état du favori choisit la clé', () => {
    const { g } = surfaceComplete();
    const rendu = entreesPochette(TOUT('album'), g, (k) => `[${k}]`);
    expect(rendu.find((e) => e.cle === 'queue.addToQueue')!.libelle).toBe('[queue.addToQueue]');
    const enFavori = entreesPochette({ ...TOUT('album'), favori: true }, g, cle).map((e) => e.cle);
    expect(enFavori).toContain('v2.cover.unfavorite');
    expect(enFavori).not.toContain('v2.cover.favorite');
  });
});

describe('Capacités et gestes : deux questions différentes', () => {
  it('une CAPACITÉ sans geste ne rend rien', () => {
    // Une surface qui ne sait pas tenir un geste ne le fournit pas, et l'entrée
    // disparaît — au lieu d'ouvrir sur rien (« pire qu'une entrée absente »,
    // garde #2574).
    for (const type of TOUS_LES_TYPES) {
      expect(entreesPochette(TOUT(type), {}, cle), type).toEqual([]);
    }
  });

  it('un GESTE sans capacité ne rend rien', () => {
    const { g } = surfaceComplete();
    const cles = (c: CapacitesPochette) => entreesPochette(c, g, cle).map((e) => e.cle);
    // Partager un ALBUM : la route de partage prend une playlist.
    expect(cles({ type: 'album', idBibliotheque: 7 })).not.toContain('v2.pl.share');
    // Retirer d'une collection SANS être dans une collection ouverte.
    expect(cles({ type: 'album', idBibliotheque: 7 })).not.toContain('v2.col.removeAlbum');
    // Supprimer un ALBUM ou un ARTISTE : ils viennent d'un scan.
    expect(cles(TOUT('album'))).not.toContain('common.delete');
    expect(cles(TOUT('artiste'))).not.toContain('common.delete');
    // Renommer une INTELLIGENTE : son nom vit dans l'éditeur de ses règles.
    expect(cles(TOUT('collectionIntelligente'))).not.toContain('v2.pl.rename');
    expect(cles(TOUT('playlistIntelligente'))).not.toContain('v2.pl.rename');
    // Un favori sans capacité (un label) n'a pas d'entrée.
    expect(cles({ type: 'label', jouable: true })).not.toContain('v2.cover.favorite');
  });

  it('un objet de SERVICE garde la lecture, l’ouverture, le favori et les étiquettes — rien de ce qui prend un `i64`', () => {
    const { g } = surfaceComplete();
    const deService = (type: TypePochette, en_plus: Partial<CapacitesPochette> = {}) =>
      entreesPochette(
        { type, idBibliotheque: null, service: 'qobuz', favori: false, etiquetable: true, artisteConnu: true, dansCollectionManuelle: true, ...en_plus },
        g,
        cle,
      ).map((e) => e.cle);
    expect(deService('album')).toEqual([...LIRE, 'common.open', 'library.goToArtist', 'v2.cover.favorite', 'v2.cover.tags']);
    // Crédits d'un album de service : seulement si son service en rend (Qobuz, #4993).
    expect(deService('album', { creditsDeService: true })).toContain('credits.see');
    expect(deService('playlist', { greffonConvertisseur: true })).toEqual([...LIRE, 'common.open', 'v2.cover.favorite', 'v2.cover.tags']);
    expect(deService('artiste')).toEqual([...LIRE, 'common.open', 'v2.cover.favorite', 'v2.cover.tags']);
  });

  it('un objet SANS désignation (dépôt distant) ne garde que « Ouvrir »', () => {
    const { g } = surfaceComplete();
    expect(entreesPochette({ type: 'album' }, g, cle).map((e) => e.cle)).toEqual(['common.open']);
  });

  it('greffon absent : ni « Concerts » ni « Transférer »', () => {
    const { g } = surfaceComplete();
    const sans = (type: TypePochette) =>
      entreesPochette({ ...TOUT(type), greffonConcerts: false, greffonConvertisseur: false }, g, cle).map((e) => e.cle);
    expect(sans('artiste')).not.toContain('nav.concerts');
    expect(sans('playlist')).not.toContain('menuObjet.transfer');
  });

  it('une collection INTELLIGENTE ne laisse pas retirer un album à la main', () => {
    // Son contenu est une règle. `CollectionsV2` pose donc
    // `dansCollectionManuelle` à faux quand la collection ouverte est smart.
    const { g } = surfaceComplete();
    const rendu = entreesPochette({ ...TOUT('album'), dansCollectionManuelle: false }, g, cle);
    expect(rendu.map((e) => e.cle)).not.toContain('v2.col.removeAlbum');
  });
});

describe('Un même geste, depuis deux écrans', () => {
  it('même clé, même libellé, même rang — quel que soit l’ordre des gestes fournis', () => {
    // Le catalogue décide l'ordre, pas l'écran.
    const a = { lireAleatoire: () => {}, supprimer: () => {} };
    const b = {
      supprimer: () => {},
      partager: () => {}, // ne s'applique pas à une intelligente
      dupliquer: () => {}, // ne s'applique pas non plus
      lireAleatoire: () => {},
    };
    const cap: CapacitesPochette = { type: 'playlistIntelligente', idBibliotheque: 4 };
    const gauche = entreesPochette(cap, a, (k) => `T:${k}`);
    const droite = entreesPochette(cap, b, (k) => `T:${k}`);
    expect(gauche.map((e) => [e.cle, e.libelle, e.danger])).toEqual(
      droite.map((e) => [e.cle, e.libelle, e.danger]),
    );
    expect(gauche.map((e) => e.cle)).toEqual(['library.shuffle', 'common.delete']);
  });

  it('les écrans ne composent plus de menu : ils passent un OBJET', () => {
    /**
     * ⚠️ GARDE DE TEXTE, et elle le dit. Ce qu'elle tient : plus aucun écran
     * n'appelle `entreesPochette` lui-même (c'était ainsi que les divergences
     * naissaient), et plus aucun ne passe `menu=` à `PochetteActions`. La preuve
     * fonctionnelle de la parité — le même objet monté sur deux surfaces rend
     * les mêmes entrées — vit dans `menusObjets.svelte.test.ts`.
     */
    const lire = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf-8');
    for (const p of [
      'src/components/v2/LibraryV2.svelte',
      'src/components/v2/PlaylistsV2.svelte',
      'src/components/v2-heritage/SmartPlaylistsView.svelte',
      'src/components/v2/CollectionsV2.svelte',
      'src/components/v2/FavoritesV2.svelte',
      'src/components/v2/SearchV2.svelte',
      'src/components/v2/EtiquettesV2.svelte',
      'src/components/v2/DiscographieCommune.svelte',
      'src/components/v2/PageWidgets.svelte',
      'src/components/v2/StreamingV2.svelte',
      'src/components/v2/ArtistesV2.svelte',
    ]) {
      const src = lire(p);
      expect(src.includes('entreesPochette('), `${p} compose encore son menu`).toBe(false);
      expect(/\smenu=\{/.test(src), `${p} passe encore un tableau à la pochette`).toBe(false);
      expect(src.includes('objet={'), `${p} ne passe aucun objet`).toBe(true);
    }
  });
});

// ── Le composant, monté ────────────────────────────────────────────────────

/** Une pochette quelconque : le composant est une ENVELOPPE, son contenu ne
 *  compte pas ici. */
const pochette = createRawSnippet(() => ({ render: () => '<i data-pochette></i>' }));

/** La géométrie simulée : le bouton bas-gauche d'une vignette à mi-écran. */
const BOITE = { top: 500, bottom: 528, left: 272, right: 300, width: 28, height: 28, x: 272, y: 500 };
const LARGEUR = 1366;
const HAUTEUR = 768;

let hote: HTMLDivElement | null = null;
let monte: Record<string, unknown> | null = null;
let rectAvant: typeof Element.prototype.getBoundingClientRect;
let largeurAvant = 0;
let hauteurAvant = 0;

beforeEach(() => {
  largeurAvant = window.innerWidth;
  hauteurAvant = window.innerHeight;
  Object.defineProperty(window, 'innerWidth', { value: LARGEUR, configurable: true, writable: true });
  Object.defineProperty(window, 'innerHeight', { value: HAUTEUR, configurable: true, writable: true });
  // jsdom ne met rien en page : sans cette boîte, toutes les coordonnées sont
  // nulles et le style attendu deviendrait celui qu'un code en dur produirait
  // aussi. Une boîte NON triviale ne peut venir que du vrai calcul.
  rectAvant = Element.prototype.getBoundingClientRect;
  Element.prototype.getBoundingClientRect = function () {
    return { ...BOITE, toJSON: () => BOITE } as DOMRect;
  };
  hote = document.createElement('div');
  document.body.appendChild(hote);
});

afterEach(() => {
  if (monte) { try { unmount(monte); } catch { /* déjà démonté */ } monte = null; }
  hote?.remove();
  hote = null;
  Element.prototype.getBoundingClientRect = rectAvant;
  Object.defineProperty(window, 'innerWidth', { value: largeurAvant, configurable: true, writable: true });
  Object.defineProperty(window, 'innerHeight', { value: hauteurAvant, configurable: true, writable: true });
  document.querySelectorAll('.fond').forEach((n) => n.remove());
  vi.restoreAllMocks();
});

/**
 * Monte la pochette d'un OBJET. Un label a cinq entrées (Lire, Aléatoire, Lire
 * ensuite, Ajouter à la file, Ouvrir) ; un album de la bibliothèque, treize.
 */
const LABEL: ObjetMenu = { type: 'label', nom: 'ECM' };
const ALBUM: ObjetMenu = { type: 'album', id: 7, nom: 'Requiem', artisteId: 3, artisteNom: 'Mozart' };
function monter(objet: ObjetMenu | null, gestesMenu: GestesPochette = {}) {
  // Un témoin qui monte DEUX fois dans le même cas laisserait deux pochettes
  // dans l'hôte, et `querySelector` répondrait sur la première : l'assertion
  // porterait alors sur le composant précédent, pas sur celui qu'on croit.
  if (monte) { try { unmount(monte); } catch { /* déjà démonté */ } monte = null; }
  document.querySelectorAll('.fond').forEach((n) => n.remove());
  monte = mount(PochetteActions, { target: hote!, props: { children: pochette, objet, gestesMenu, nom: 'Requiem' } });
  flushSync();
}
const bouton = () => hote!.querySelector('button.coin.bl') as HTMLButtonElement | null;
const panneau = () => document.querySelector('[role="menu"]') as HTMLElement | null;
/** Le navigateur réécrit l'attribut `style` avec des espaces ; on compare le
 *  fond, pas la ponctuation. */
const sansBlancs = (s: string | null) => (s ?? '').replace(/\s+/g, '');

describe('Le bouton est ABSENT, pas grisé', () => {
  it('aucune entrée : aucun bouton, et aucun bouton grisé nulle part', () => {
    // C'était l'état de HUIT écrans sur treize pendant 24 jours : le bouton
    // était là, `disabled`, avec « Autres actions — bientôt ». Un bouton grisé
    // promet une action à venir ; un bouton absent ne promet rien. Une radio,
    // et une pochette sans objet, n'ont aucune entrée.
    monter({ type: 'radio', id: 3, nom: 'FIP' });
    expect(bouton(), 'une radio a retrouvé un menu d’objet').toBeNull();
    monter(null);
    expect(bouton(), 'le bouton du menu est de retour alors que le catalogue ne rend rien').toBeNull();
    expect(
      hote!.querySelector('button[disabled]'),
      'un bouton grisé est réapparu sur la pochette : la règle de Bertrand redevient sans exception.',
    ).toBeNull();
    expect(panneau(), 'un menu vide s’est ouvert tout seul').toBeNull();
  });

  it('la clé « bientôt » n’existe plus dans AUCUNE des onze langues', () => {
    // La promesse n'était pas seulement un état grisé, c'était une phrase :
    // « Autres actions — bientôt ». La laisser traduite, c'est inviter à la
    // remettre.
    const LANGUES = ['de', 'en', 'es', 'fr', 'hu', 'it', 'ja', 'ko', 'ro', 'sv', 'zh'];
    for (const l of LANGUES) {
      const src = readFileSync(resolve(process.cwd(), `src/lib/locales/${l}.ts`), 'utf-8');
      expect(src.includes('v2.cover.moreSoon'), `${l} promet encore « bientôt »`).toBe(false);
    }
  });

  it('une entrée : un bouton, VIVANT, qui s’annonce comme un menu', () => {
    monter(LABEL);
    const b = bouton();
    expect(b, 'le bouton du menu a disparu alors que le catalogue rend une entrée').not.toBeNull();
    expect(b!.disabled, 'le bouton est grisé alors qu’il a une action').toBe(false);
    expect(b!.getAttribute('aria-haspopup')).toBe('menu');
    expect(b!.getAttribute('aria-expanded')).toBe('false');
  });

  it('un clic ouvre, un second referme, et le choix APPELLE le geste', () => {
    const vu: string[] = [];
    // Les gestes de la SURFACE remplacent le chemin des gestes communs : on les
    // compte ici, sans toucher au réseau.
    monter({ type: 'playlistIntelligente', id: 4, nom: 'Jamais jouées' }, {
      enfiler: () => vu.push('file'),
      supprimer: () => vu.push('suppr'),
    });
    bouton()!.click();
    flushSync();
    expect(panneau(), 'le menu ne s’ouvre plus').not.toBeNull();
    expect(bouton()!.getAttribute('aria-expanded')).toBe('true');
    const items = [...panneau()!.querySelectorAll('button[role="menuitem"]')] as HTMLButtonElement[];
    const cles = items.map((b) => b.dataset.cle);
    expect(cles).toContain('queue.addToQueue');
    expect(cles[cles.length - 1]).toBe('common.delete');
    // `danger` teinte la dernière, et seulement elle.
    expect(items.filter((b) => b.classList.contains('danger')).map((b) => b.dataset.cle)).toEqual(['common.delete']);
    items[items.length - 1].click();
    flushSync();
    expect(vu, 'le choix n’appelle plus le geste').toEqual(['suppr']);
    expect(panneau(), 'le menu reste ouvert après un choix').toBeNull();
    expect(bouton()!.getAttribute('aria-expanded'), 'le coin se croit encore ouvert').toBe('false');
  });
});

describe('Le menu est PORTÉ à la racine du document', () => {
  /**
   * Pourquoi : `.pa` porte `overflow: hidden` (il arrondit la pochette), la
   * carte de la Bibliothèque porte `content-visibility: auto` — qui implique
   * `contain: layout style paint`, donc capture même le `position: fixed` — et
   * la grille défile. C'est ce qui avait rogné le panneau d'étiquettes aux trois
   * quarts le 02/09/2026. Dans une grille de 800 albums, ce n'est pas un risque.
   */
  /** Ouvre le menu d'un label (cinq entrées) ou d'un album (treize). */
  const ouvrir = (o: ObjetMenu = LABEL) => {
    monter(o);
    bouton()!.click();
    flushSync();
    return panneau()!;
  };
  const nbEntrees = (m: HTMLElement) => m.querySelectorAll('button[role="menuitem"]').length;

  it('le panneau n’est PAS dans la pochette : il est enfant de <body>', () => {
    const m = ouvrir();
    expect(m.closest('.pa'), 'le menu est reparti dans la pochette : il s’y ferait rogner').toBeNull();
    expect(hote!.contains(m), 'le menu est resté dans le sous-arbre de l’écran').toBe(false);
    // Le fond qui le porte est un enfant direct du document, comme celui de
    // `MenuPisteV2`.
    expect(m.closest('.fond')!.parentElement).toBe(document.body);
  });

  it('il est placé aux coordonnées ÉCRAN du bouton, par `lib/ancrageMenu`', () => {
    const m = ouvrir();
    expect(nbEntrees(m)).toBe(5);
    // La valeur attendue vient du module partagé, pas d'un calcul recopié ici :
    // c'est ce qui interdit une seconde implémentation (le reproche déjà fait au
    // CONTENU des menus, #1848, et réglé de la même façon par `lib/menuPiste`).
    // `sansBlancs` : le navigateur RÉÉCRIT l'attribut `style` en y remettant
    // des espaces après les deux-points. Comparer les chaînes brutes ferait
    // rougir un témoin juste, ce qui est le meilleur moyen de le faire
    // désactiver.
    expect(sansBlancs(m.getAttribute('style'))).toBe(
      sansBlancs(styleMenuAncre(BOITE, 5, { innerWidth: LARGEUR, innerHeight: HAUTEUR })),
    );
    // Et la boîte simulée n'est pas triviale : le panneau descend SOUS le
    // bouton, aligné à droite sur lui, borné par le bas de la fenêtre.
    expect(sansBlancs(m.getAttribute('style'))).toContain('top:532px;');
    expect(sansBlancs(m.getAttribute('style'))).toContain('left:92px;');
    expect(sansBlancs(m.getAttribute('style'))).toContain('max-height:228px;');
  });

  it('une liste TROP HAUTE remonte au-dessus du bouton', () => {
    // Sans cela, sur la dernière rangée d'une grille, le menu naîtrait hors de
    // l'écran. C'est `styleMenuAncre` qui le sait ; ce cas prouve que le
    // composant lui passe le vrai NOMBRE d'entrées et pas une constante.
    const m = ouvrir(ALBUM);
    expect(nbEntrees(m)).toBeGreaterThanOrEqual(7);
    expect(sansBlancs(m.getAttribute('style'))).toContain('bottom:272px;');
    expect(sansBlancs(m.getAttribute('style'))).not.toContain('top:');
    expect(sansBlancs(m.getAttribute('style'))).toContain('max-height:488px;');
  });

  it('il se referme dès que la page bouge sous lui', () => {
    // Ancré à des coordonnées FIGÉES, il suivrait le bouton de très loin.
    ouvrir();
    document.querySelector('.fond')!.dispatchEvent(new WheelEvent('wheel', { bubbles: true }));
    flushSync();
    expect(panneau(), 'le menu reste posé pendant que la grille défile').toBeNull();

    ouvrir();
    window.dispatchEvent(new Event('resize'));
    flushSync();
    expect(panneau(), 'le menu reste posé après un redimensionnement').toBeNull();
  });

  it('Échap et un clic ailleurs le referment', () => {
    ouvrir();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    flushSync();
    expect(panneau(), 'Échap ne referme plus').toBeNull();

    ouvrir();
    (document.querySelector('.fond') as HTMLElement).click();
    flushSync();
    expect(panneau(), 'un clic ailleurs ne referme plus').toBeNull();
  });

  it('le nœud porté est RETIRÉ au démontage', () => {
    // Enfant de <body>, il survivrait à l'écran qui l'a ouvert.
    ouvrir();
    expect(document.querySelector('.fond')).not.toBeNull();
    unmount(monte!);
    monte = null;
    flushSync();
    expect(document.querySelector('.fond'), 'le menu a survécu à sa pochette').toBeNull();
  });
});
