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
import PochetteActions from '../../components/v2/PochetteActions.svelte';

/** Traduire par l'IDENTITÉ : le libellé rendu est alors la clé, et les
 *  assertions parlent de gestes, pas de français. */
const cle = (k: string) => k;

/** Les huit types, pour qu'aucun n'échappe aux gardes par omission. */
const TOUS_LES_TYPES: TypePochette[] = [
  'album',
  'artiste',
  'playlist',
  'playlistIntelligente',
  'collection',
  'collectionIntelligente',
  'radio',
  'podcast',
];

/**
 * Une surface qui saurait TOUT faire, et qui compte ce qu'on lui demande.
 *
 * C'est ce témoin qui fait la différence avec une garde de texte : il ne dit pas
 * qu'une entrée est écrite, il dit que la fonction de l'entrée appelle bien le
 * geste de la surface, et lequel.
 */
function surfaceComplete() {
  const appels: string[] = [];
  const g: GestesPochette = {
    lireAleatoire: () => appels.push('lireAleatoire'),
    enfiler: () => appels.push('enfiler'),
    ciblesCollection: () => [
      { libelle: 'Ajouter à Jazz', faire: () => appels.push('collection:Jazz') },
      { libelle: 'Déjà dans Rock', faire: () => appels.push('collection:Rock') },
    ],
    partager: () => appels.push('partager'),
    retirerDeCollection: () => appels.push('retirerDeCollection'),
    supprimer: () => appels.push('supprimer'),
  };
  return { g, appels };
}

/** Tout ce qu'un objet peut permettre à la fois : identifiant local ET montré
 *  dans une collection manuelle ouverte. */
const TOUT = (type: TypePochette): CapacitesPochette => ({
  type,
  idBibliotheque: 7,
  dansCollectionManuelle: true,
});

describe('Le catalogue, appelé pour CHAQUE type d’objet', () => {
  /**
   * La table de référence. Elle est explicite exprès : c'est la LISTE que
   * Bertrand juge, et un remaniement qui l'élargit ou la rétrécit doit passer
   * par ici.
   *
   * Aucune entrée n'y est un geste nouveau : chacune existait déjà sur une
   * surface, nommée dans `lib/actionsPochette`.
   */
  const ATTENDU: Record<TypePochette, string[]> = {
    // L'album reçoit la file, les cibles de collection (une entrée par
    // collection manuelle), et le retrait quand il est dans l'une d'elles.
    //
    // 🔴 PAS « Lire en aléatoire » : un album est un disque, son ordre est celui
    // de l'œuvre, et l'application ne l'a jamais proposé en aléatoire. PAS
    // « Supprimer » non plus : il vient d'un scan, aucune route ne le supprime.
    album: ['queue.addToQueue', 'v2.col.addTo', 'v2.col.addTo', 'v2.col.removeAlbum'],
    // 🔴 RIEN pour l'artiste : son bouton disparaît. Lecture et édition sont
    // déjà deux boutons de la pochette, et l'application ne sait rien faire
    // d'autre à un artiste.
    artiste: [],
    // 🔴 `common.delete` est LÀ pour une playlist : `api.deletePlaylist` existe
    // et sa fiche l'offre. Aucune VIGNETTE ne fournit le geste aujourd'hui, donc
    // l'entrée n'apparaît nulle part dans l'application — la capacité est
    // déclarée, la surface se taît. C'est la distinction du catalogue, et le cas
    // « une CAPACITÉ sans geste ne rend rien » plus bas le prouve.
    playlist: ['library.shuffle', 'v2.pl.share', 'common.delete'],
    playlistIntelligente: ['library.shuffle', 'common.delete'],
    collection: ['library.shuffle', 'common.delete'],
    collectionIntelligente: ['library.shuffle', 'common.delete'],
    // 🔴 RIEN pour la radio : sa suppression vit dans sa modale d'édition, que
    // le crayon de la pochette ouvre déjà.
    radio: [],
    // 🔴 RIEN pour le podcast : l'abonnement est un bouton à part, par choix
    // documenté dans `PodcastsV2`.
    podcast: [],
  };

  for (const type of TOUS_LES_TYPES) {
    it(`${type} : le catalogue rend exactement ce qu'il doit rendre`, () => {
      const { g } = surfaceComplete();
      const rendu = entreesPochette(TOUT(type), g, cle);
      expect(rendu.map((e) => e.cle)).toEqual(ATTENDU[type]);
    });
  }

  it('chaque entrée rendue APPELLE bien le geste de la surface', () => {
    // Le cœur de la garde : on exécute ce que le catalogue a rendu. Une entrée
    // dont le `faire` serait câblé au mauvais geste — ou à rien — se voit ici,
    // et nulle part dans un balisage.
    const { g, appels } = surfaceComplete();
    for (const e of entreesPochette(TOUT('album'), g, cle)) e.faire();
    expect(appels).toEqual(['enfiler', 'collection:Jazz', 'collection:Rock', 'retirerDeCollection']);

    const autre = surfaceComplete();
    for (const e of entreesPochette(TOUT('playlistIntelligente'), autre.g, cle)) e.faire();
    expect(autre.appels).toEqual(['lireAleatoire', 'supprimer']);
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
    // Mettre en file et lire en aléatoire ne détruisent rien.
    for (const e of entreesPochette(TOUT('album'), g, cle)) {
      if (e.cle === 'queue.addToQueue') expect(e.danger).toBeUndefined();
    }
  });

  it('le libellé sort de `traduire`, sauf celui que la collection compose', () => {
    // Les gestes fixes portent une CLÉ i18n : c'est elle qui garantit qu'un même
    // geste se lit pareil dans les onze langues. Les cibles de collection
    // portent le nom de la collection, déjà composé par `albumVersCollection` —
    // le recomposer ici aurait été la seconde copie que ce module évite.
    const { g } = surfaceComplete();
    const rendu = entreesPochette(TOUT('album'), g, (k) => `[${k}]`);
    expect(rendu.find((e) => e.cle === 'queue.addToQueue')!.libelle).toBe('[queue.addToQueue]');
    expect(rendu.filter((e) => e.cle === 'v2.col.addTo').map((e) => e.libelle)).toEqual([
      'Ajouter à Jazz',
      'Déjà dans Rock',
    ]);
  });
});

describe('Capacités et gestes : deux questions différentes', () => {
  it('une CAPACITÉ sans geste ne rend rien', () => {
    // Une surface qui ne sait pas tenir un geste ne le fournit pas, et l'entrée
    // disparaît — au lieu d'ouvrir sur rien (« pire qu'une entrée absente »,
    // garde #2574). C'est le cas réel de « Supprimer » sur une playlist locale :
    // `api.deletePlaylist` existe, aucune vignette ne porte le geste.
    for (const type of TOUS_LES_TYPES) {
      expect(entreesPochette(TOUT(type), {}, cle), type).toEqual([]);
    }
  });

  it('un GESTE sans capacité ne rend rien', () => {
    const { g } = surfaceComplete();
    // Partager un ALBUM : la route de partage prend une playlist.
    expect(entreesPochette({ type: 'album', idBibliotheque: 7 }, g, cle).map((e) => e.cle)).not.toContain(
      'v2.pl.share',
    );
    // Enfiler une PLAYLIST par `{ album_id }` : la route ne la connaît pas.
    expect(
      entreesPochette({ type: 'playlist', idBibliotheque: 7 }, g, cle).map((e) => e.cle),
    ).not.toContain('queue.addToQueue');
    // Retirer d'une collection SANS être dans une collection ouverte.
    expect(
      entreesPochette({ type: 'album', idBibliotheque: 7 }, g, cle).map((e) => e.cle),
    ).not.toContain('v2.col.removeAlbum');
    // Supprimer un ALBUM : il vient d'un scan, aucune route ne le supprime.
    expect(entreesPochette(TOUT('album'), g, cle).map((e) => e.cle)).not.toContain('common.delete');
  });

  it('un objet de SERVICE ou de dépôt distant n’a AUCUNE entrée', () => {
    // Pas d'identifiant de bibliothèque, pas de route : toutes ces entrées
    // prennent un `i64`. C'est aussi ce qui fait disparaître le bouton sur les
    // vignettes de `StreamingV2` et sur un album Qobuz de `SearchV2`.
    const { g } = surfaceComplete();
    for (const type of TOUS_LES_TYPES) {
      expect(
        entreesPochette({ type, idBibliotheque: null, dansCollectionManuelle: true }, g, cle),
        type,
      ).toEqual([]);
      expect(entreesPochette({ type, dansCollectionManuelle: true }, g, cle), type).toEqual([]);
    }
  });

  it('une collection INTELLIGENTE ne laisse pas retirer un album à la main', () => {
    // Son contenu est une règle. `CollectionsV2` pose donc
    // `dansCollectionManuelle: false` quand la collection ouverte est smart.
    const { g } = surfaceComplete();
    const rendu = entreesPochette(
      { type: 'album', idBibliotheque: 7, dansCollectionManuelle: false },
      g,
      cle,
    );
    expect(rendu.map((e) => e.cle)).not.toContain('v2.col.removeAlbum');
  });
});

/**
 * La raison d'être du catalogue, et la garde qui la tient.
 *
 * Mesuré sur `main` le 26/09/2026 : une playlist INTELLIGENTE offrait
 * « Lire en aléatoire » puis « Supprimer » dans `PlaylistsV2`, et
 * « Supprimer » SEUL dans `SmartPlaylistsView`. Le même objet, deux chemins,
 * pas les mêmes gestes — le reproche de Dominique Comet sur le menu de piste
 * (`renesenses/tune-server-rust#1848`), rejoué sur les pochettes.
 */
describe('Un même geste, depuis deux écrans', () => {
  it('même clé, même libellé, même rang — quel que soit l’ordre des gestes fournis', () => {
    // Deux surfaces qui fournissent les mêmes gestes, dans un ordre différent,
    // et l'une avec des gestes de plus qui ne s'appliquent pas à ce type. Le
    // catalogue doit rendre la MÊME liste : c'est lui qui décide l'ordre, pas
    // l'écran.
    const a = { lireAleatoire: () => {}, supprimer: () => {} };
    const b = {
      supprimer: () => {},
      partager: () => {}, // ne s'applique pas à une intelligente
      enfiler: () => {}, // ne s'applique pas non plus
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

  it('et il FAIT la même chose : l’entrée appelle le geste de SA surface', () => {
    // Le libellé partagé ne suffirait pas : deux écrans pourraient afficher
    // « Lire en aléatoire » et lancer autre chose. On exécute donc les deux.
    const vu: string[] = [];
    const cap: CapacitesPochette = { type: 'playlistIntelligente', idBibliotheque: 4 };
    const depuisPlaylistsV2 = entreesPochette(cap, { lireAleatoire: () => vu.push('PlaylistsV2') }, cle);
    const depuisHeritage = entreesPochette(cap, { lireAleatoire: () => vu.push('SmartPlaylistsView') }, cle);
    expect(depuisPlaylistsV2[0].cle).toBe('library.shuffle');
    expect(depuisHeritage[0].cle).toBe('library.shuffle');
    depuisPlaylistsV2[0].faire();
    depuisHeritage[0].faire();
    expect(vu).toEqual(['PlaylistsV2', 'SmartPlaylistsView']);
  });

  it('les deux écrans de playlists intelligentes FOURNISSENT l’aléatoire', () => {
    /**
     * ⚠️ LA SEULE GARDE DE TEXTE DE CE FICHIER, et la plus faible — elle le dit.
     *
     * Ce que le catalogue garantit, les cas ci-dessus le prouvent en l'appelant :
     * à capacités égales et gestes égaux, les deux écrans obtiennent la même
     * liste. Ce qu'il ne peut pas garantir, c'est qu'un écran FOURNISSE le
     * geste — c'est justement la moitié « surface » de la distinction, et c'est
     * la moitié où la divergence vivait.
     *
     * Le vérifier vraiment demanderait de monter les deux écrans avec leurs
     * appels serveur simulés. Faute de quoi on lit qu'ils passent bien
     * `lireAleatoire` au catalogue. Un `if (false)` autour de la ligne laisserait
     * cette assertion verte : elle ne tient donc que l'OUBLI, pas la panne.
     */
    const lire = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf-8');
    for (const p of [
      'src/components/v2/PlaylistsV2.svelte',
      'src/components/v2-heritage/SmartPlaylistsView.svelte',
    ]) {
      const src = lire(p);
      const i = src.indexOf("type: 'playlistIntelligente'");
      expect(i, `${p} n’appelle plus le catalogue pour une playlist intelligente`).toBeGreaterThan(-1);
      expect(
        src.slice(i, i + 400).includes('lireAleatoire:'),
        `${p} ne fournit plus « Lire en aléatoire » : la divergence du 26/09/2026 est de retour.`,
      ).toBe(true);
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

function monter(menu: { cle: string; libelle: string; danger?: boolean; faire: () => void }[]) {
  // Un témoin qui monte DEUX fois dans le même cas laisserait deux pochettes
  // dans l'hôte, et `querySelector` répondrait sur la première : l'assertion
  // porterait alors sur le composant précédent, pas sur celui qu'on croit.
  if (monte) { try { unmount(monte); } catch { /* déjà démonté */ } monte = null; }
  document.querySelectorAll('.fond').forEach((n) => n.remove());
  monte = mount(PochetteActions, { target: hote!, props: { children: pochette, menu, nom: 'Requiem' } });
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
    // promet une action à venir ; un bouton absent ne promet rien.
    monter([]);
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
    monter([{ cle: 'queue.addToQueue', libelle: 'Ajouter à la file', faire: () => {} }]);
    const b = bouton();
    expect(b, 'le bouton du menu a disparu alors que le catalogue rend une entrée').not.toBeNull();
    expect(b!.disabled, 'le bouton est grisé alors qu’il a une action').toBe(false);
    expect(b!.getAttribute('aria-haspopup')).toBe('menu');
    expect(b!.getAttribute('aria-expanded')).toBe('false');
  });

  it('un clic ouvre, un second referme, et le choix APPELLE le geste', () => {
    const vu: string[] = [];
    monter([
      { cle: 'queue.addToQueue', libelle: 'Ajouter à la file', faire: () => vu.push('file') },
      { cle: 'common.delete', libelle: 'Supprimer', danger: true, faire: () => vu.push('suppr') },
    ]);
    bouton()!.click();
    flushSync();
    expect(panneau(), 'le menu ne s’ouvre plus').not.toBeNull();
    expect(bouton()!.getAttribute('aria-expanded')).toBe('true');
    const items = [...panneau()!.querySelectorAll('button[role="menuitem"]')] as HTMLButtonElement[];
    expect(items.map((b) => b.textContent?.trim())).toEqual(['Ajouter à la file', 'Supprimer']);
    // `danger` teinte la seconde, et seulement elle.
    expect(items.map((b) => b.classList.contains('danger'))).toEqual([false, true]);
    items[1].click();
    flushSync();
    expect(vu, 'le choix n’appelle plus le geste').toEqual(['suppr']);
    expect(panneau(), 'le menu reste ouvert après un choix').toBeNull();
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
  const ouvrir = (n: number) => {
    monter(
      Array.from({ length: n }, (_, i) => ({
        cle: `geste${i}`,
        libelle: `Geste ${i}`,
        faire: () => {},
      })),
    );
    bouton()!.click();
    flushSync();
    return panneau()!;
  };

  it('le panneau n’est PAS dans la pochette : il est enfant de <body>', () => {
    const m = ouvrir(2);
    expect(m.closest('.pa'), 'le menu est reparti dans la pochette : il s’y ferait rogner').toBeNull();
    expect(hote!.contains(m), 'le menu est resté dans le sous-arbre de l’écran').toBe(false);
    // Le fond qui le porte est un enfant direct du document, comme celui de
    // `MenuPisteV2`.
    expect(m.closest('.fond')!.parentElement).toBe(document.body);
  });

  it('il est placé aux coordonnées ÉCRAN du bouton, par `lib/ancrageMenu`', () => {
    const m = ouvrir(2);
    // La valeur attendue vient du module partagé, pas d'un calcul recopié ici :
    // c'est ce qui interdit une seconde implémentation (le reproche déjà fait au
    // CONTENU des menus, #1848, et réglé de la même façon par `lib/menuPiste`).
    // `sansBlancs` : le navigateur RÉÉCRIT l'attribut `style` en y remettant
    // des espaces après les deux-points. Comparer les chaînes brutes ferait
    // rougir un témoin juste, ce qui est le meilleur moyen de le faire
    // désactiver.
    expect(sansBlancs(m.getAttribute('style'))).toBe(
      sansBlancs(styleMenuAncre(BOITE, 2, { innerWidth: LARGEUR, innerHeight: HAUTEUR })),
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
    const m = ouvrir(20);
    expect(sansBlancs(m.getAttribute('style'))).toContain('bottom:272px;');
    expect(sansBlancs(m.getAttribute('style'))).not.toContain('top:');
    expect(sansBlancs(m.getAttribute('style'))).toContain('max-height:488px;');
  });

  it('il se referme dès que la page bouge sous lui', () => {
    // Ancré à des coordonnées FIGÉES, il suivrait le bouton de très loin.
    ouvrir(2);
    document.querySelector('.fond')!.dispatchEvent(new WheelEvent('wheel', { bubbles: true }));
    flushSync();
    expect(panneau(), 'le menu reste posé pendant que la grille défile').toBeNull();

    ouvrir(2);
    window.dispatchEvent(new Event('resize'));
    flushSync();
    expect(panneau(), 'le menu reste posé après un redimensionnement').toBeNull();
  });

  it('Échap et un clic ailleurs le referment', () => {
    ouvrir(2);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    flushSync();
    expect(panneau(), 'Échap ne referme plus').toBeNull();

    ouvrir(2);
    (document.querySelector('.fond') as HTMLElement).click();
    flushSync();
    expect(panneau(), 'un clic ailleurs ne referme plus').toBeNull();
  });

  it('le nœud porté est RETIRÉ au démontage', () => {
    // Enfant de <body>, il survivrait à l'écran qui l'a ouvert.
    ouvrir(2);
    expect(document.querySelector('.fond')).not.toBeNull();
    unmount(monte!);
    monte = null;
    flushSync();
    expect(document.querySelector('.fond'), 'le menu a survécu à sa pochette').toBeNull();
  });
});
