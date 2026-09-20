// @vitest-environment jsdom
//
// #929, SECOND JET — L'ALBUM DU MILIEU EST AGRANDI, ET LA BANDE SUIT L'ÉCRAN.
//
// Bertrand, 20/09/2026, après avoir regardé le premier jet à l'écran :
//
// > « Il faudrait mettre en plus gros l'album du milieu et actif. »
//
// Puis, capture d'un **27 pouces** à l'appui : la bande n'occupait qu'un tiers
// de la hauteur, le rail A–Z restait vertical à côté d'une rangée horizontale,
// et la bascule d'affichage ne disait ni où l'on était ni qu'il existait un
// troisième cran.
//
// ## Ce qui est mesurable ici, et ce qui ne l'est pas
//
// jsdom ne met rien en page : ni la taille réelle d'une pochette, ni l'allure
// du cover-flow ne s'y jugent. Mais la DÉCISION, elle, est une fonction pure —
// `geometrieCarrousel(largeur, hauteur)` — et c'est elle qui décide de tout :
// la taille des pochettes, combien en restent en vue, de combien grandit la
// centrale. On l'éprouve donc aux deux extrêmes demandés, portable et
// 27 pouces, et les chiffres rendus sont ceux qui partent dans la PR.
//
// Le CÂBLAGE, lui, se mesure sur l'écran monté : quel élément porte la marque
// « centré » selon la position de défilement, et le fait qu'elle SUIVE.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import LibraryV2 from '../../components/v2/LibraryV2.svelte';
import { albums, libraryLoading, libraryFolderScope } from '../stores/library';
import { activeView } from '../stores/navigation';
import {
  geometrieCarrousel, indiceCentre, centrageCarrousel,
  COTE_MIN, COTE_MAX, VISIBLES_MIN, ECHELLE_MAX, HAUTEUR_TEXTE,
  type GeometrieCarrousel,
} from '../centreCarrousel';

const lire = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

/** La place que la Bibliothèque laisse à la bande, écran par écran. */
const PORTABLE = { largeur: 1180, hauteur: 470 };   // fenêtre ≈ 1280 × 800
const VINGT_SEPT = { largeur: 2460, hauteur: 1274 }; // écran ≈ 2560 × 1440

const ALBUMS = Array.from({ length: 24 }, (_, i) => ({
  id: i + 1,
  title: `Album ${String.fromCharCode(65 + (i % 26))}${i}`,
  artist_name: `Artiste ${i}`,
  year: 1990 + i,
  cover_path: null,
  source: 'local',
}));

function reponsePour() {
  return {
    ok: true, status: 200, statusText: 'OK',
    headers: new Map([['content-type', 'application/json']]),
    json: async () => [], text: async () => '[]',
  } as unknown as Response;
}

let hote: HTMLDivElement | null = null;
let monte: Record<string, any> | null = null;
const attendre = (ms = 60) => new Promise((r) => setTimeout(r, ms));

async function ecranMonte(): Promise<HTMLDivElement> {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(LibraryV2, { target: hote, props: {} });
  flushSync();
  await attendre();
  flushSync();
  return hote;
}

function bascule(el: HTMLElement): HTMLButtonElement {
  const b = el.querySelector<HTMLButtonElement>('button.viewtog[data-vue]');
  expect(b, 'la bascule d’affichage n’expose pas le mode courant').not.toBeNull();
  return b!;
}

function allerA(el: HTMLElement, mode: string) {
  for (let i = 0; i < 4; i++) {
    const b = bascule(el);
    if (b.dataset.vue === mode) return;
    b.click();
    flushSync();
  }
  throw new Error(`le mode « ${mode} » n’est pas atteignable`);
}

/**
 * Attend qu'une condition soit vraie, plutôt qu'un délai fixe.
 *
 * 🔴 UNE ATTENTE EN MILLISECONDES EST UN FAUX ROUGE QUI DORT. Ce fichier monte
 * l'écran entier de la Bibliothèque ; sous la charge d'une suite complète, le
 * même montage a pris 60 ms une fois et plus de six secondes une autre. Un
 * `setTimeout` fixe rend alors un échec qui ne dit rien du code — exactement
 * ce que `etiquetterFicheAlbum1357` a coûté ailleurs.
 */
async function attendreQue(predicat: () => boolean, limite = 4000): Promise<void> {
  const fin = Date.now() + limite;
  while (Date.now() < fin) {
    flushSync();
    if (predicat()) return;
    await new Promise((r) => setTimeout(r, 25));
  }
  flushSync();
}

/** Pose sur un nœud les dimensions que le navigateur rendrait. */
function mesurer(el: Element, d: Record<string, number>) {
  for (const [k, v] of Object.entries(d)) {
    Object.defineProperty(el, k, { value: v, configurable: true, writable: true });
  }
}

beforeEach(() => {
  try { localStorage.clear(); } catch { /* stockage indisponible */ }
  vi.stubGlobal('fetch', vi.fn(async () => reponsePour()));
  vi.stubGlobal('WebSocket', class {
    close() {} addEventListener() {} removeEventListener() {} send() {}
  } as unknown as typeof WebSocket);
  vi.stubGlobal('ResizeObserver', class {
    observe() {} unobserve() {} disconnect() {}
  } as unknown as typeof ResizeObserver);
  activeView.set('library');
  libraryFolderScope.set(null as any);
  libraryLoading.set(false);
  albums.set(ALBUMS as any);
});

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  if (hote) hote.remove();
  hote = null;
  albums.set([] as any);
  vi.unstubAllGlobals();
});

describe('#929 — la bande se déduit de la place, aux deux extrêmes', () => {
  it('🔴 sur un portable (1180 × 470) : des pochettes plus grandes que la grille, et la bande reste une bande', () => {
    const g = geometrieCarrousel(PORTABLE.largeur, PORTABLE.hauteur);
    expect(g.cote, 'la pochette du carrousel n’est pas plus grande que celle de la grille (148 px)').toBeGreaterThan(148);
    expect(g.cote).toBe(289);
    expect(g.echelle).toBe(ECHELLE_MAX);
    expect(g.visibles, 'le sentiment de bande est perdu : plus assez de pochettes en vue').toBeGreaterThanOrEqual(VISIBLES_MIN);
    expect(g.visibles).toBe(3.5);
    // UNE SEULE RANGÉE : la carte agrandie tient dans la place verticale.
    expect(g.hauteurBande).toBeLessThanOrEqual(PORTABLE.hauteur);
    expect(g.hauteurBande).toBe(452);
  });

  it('🔴 sur un 27 pouces (2460 × 1274) : la pochette grandit vraiment, sans perdre la bande', () => {
    const g = geometrieCarrousel(VINGT_SEPT.largeur, VINGT_SEPT.hauteur);
    const portable = geometrieCarrousel(PORTABLE.largeur, PORTABLE.hauteur);
    expect(
      g.cote,
      'un 27 pouces rend la même pochette qu’un portable : la taille ne suit pas la place — c’est le défaut de la capture',
    ).toBeGreaterThan(portable.cote);
    expect(g.cote).toBe(610);
    expect(g.visibles).toBe(3.5);
    expect(g.hauteurBande).toBe(863);
    // La bande occupait un TIERS de la hauteur sur la capture. Elle en prend
    // maintenant les deux tiers : c'est la plainte de Bertrand, mesurée.
    expect(
      g.hauteurBande / VINGT_SEPT.hauteur,
      'la bande laisse encore l’écran aux deux tiers vide',
    ).toBeGreaterThan(0.6);
    expect(g.hauteurBande).toBeLessThanOrEqual(VINGT_SEPT.hauteur);
  });

  it('🔴 les deux bornes tiennent, et c’est l’AGRANDISSEMENT qui cède sur une fenêtre basse', () => {
    // Écran démesuré : la pochette ne devient pas une affiche.
    const enorme = geometrieCarrousel(8000, 4000);
    expect(enorme.cote).toBeLessThanOrEqual(COTE_MAX);
    // Fenêtre très basse : la pochette garde son plancher, l'échelle recule.
    const basse = geometrieCarrousel(1180, 280);
    expect(basse.cote, 'le plancher n’a pas tenu : le carrousel devient plus petit que la grille').toBe(COTE_MIN);
    expect(basse.echelle, 'l’agrandissement n’a pas cédé : la pochette centrale sera rognée').toBeLessThan(ECHELLE_MAX);
    expect(basse.hauteurBande, 'la carte agrandie déborde de la place disponible').toBeLessThanOrEqual(280);
    // Taille inconnue (premier rendu, moteur sans mise en page) : un repli,
    // pas une bande écrasée à zéro.
    expect(geometrieCarrousel(0, 0).cote).toBeGreaterThanOrEqual(COTE_MIN);
  });

  it('🔴 la hauteur va dans la TAILLE, jamais dans un second rang', () => {
    // Deux fois plus de hauteur : la pochette grandit, le nombre de rangées
    // ne change pas — la géométrie n'en décrit qu'une, et n'a pas de champ
    // pour en décrire deux.
    const basse = geometrieCarrousel(2460, 500);
    const haute = geometrieCarrousel(2460, 1274);
    expect(haute.cote).toBeGreaterThan(basse.cote);
    expect(Object.keys(haute)).not.toContain('rangees');
  });
});

describe('#929 — quel album est au milieu', () => {
  const g = geometrieCarrousel(PORTABLE.largeur, PORTABLE.hauteur);

  it('🔴 au repos, c’est la pochette qui occupe le milieu de la fenêtre', () => {
    // Fenêtre de 1180, milieu à 590 ; les vignettes commencent à 30 et se
    // suivent tous les `pas`.
    expect(indiceCentre(0, PORTABLE.largeur, 24, g)).toBe(
      Math.round((PORTABLE.largeur / 2 - g.margeBord - g.cote / 2) / g.pas),
    );
    expect(indiceCentre(0, PORTABLE.largeur, 24, g)).toBe(1);
  });

  it('🔴 elle AVANCE d’un cran quand la bande avance d’un pas', () => {
    const avant = indiceCentre(0, PORTABLE.largeur, 24, g);
    expect(indiceCentre(g.pas, PORTABLE.largeur, 24, g)).toBe(avant + 1);
    expect(indiceCentre(g.pas * 7, PORTABLE.largeur, 24, g)).toBe(avant + 7);
  });

  it('🔴 elle est bornée aux deux bouts, et une rangée vide ne désigne personne', () => {
    expect(indiceCentre(-9999, PORTABLE.largeur, 24, g)).toBe(0);
    expect(indiceCentre(9_999_999, PORTABLE.largeur, 24, g)).toBe(23);
    expect(indiceCentre(0, PORTABLE.largeur, 0, g)).toBe(-1);
  });
});

describe('#929 — le suivi ne coûte rien, même sur 4 338 albums', () => {
  const trame = () => new Promise((r) => setTimeout(r, 40));

  function rangee(largeur: number, hauteurParent: number) {
    const parent = document.createElement('div');
    const el = document.createElement('div');
    parent.appendChild(el);
    document.body.appendChild(parent);
    mesurer(parent, { clientHeight: hauteurParent });
    mesurer(el, { clientWidth: largeur, scrollLeft: 0 });
    return { parent, el };
  }

  it('🔴 une rafale d’événements ne rend qu’UN calcul, et rien n’est annoncé si l’album central ne change pas', async () => {
    const { el, parent } = rangee(PORTABLE.largeur, PORTABLE.hauteur);
    const vus: number[] = [];
    const geos: GeometrieCarrousel[] = [];
    const h = centrageCarrousel(el, { nombre: 4338, sur: (i) => vus.push(i), surGeometrie: (g) => geos.push(g) });

    expect(vus, 'aucun album n’est mis en avant à l’ouverture').toEqual([1]);
    expect(geos.length, 'la géométrie n’est pas descendue à l’ouverture').toBe(1);

    // Dix événements, un déplacement qui ne change pas l'album central.
    mesurer(el, { scrollLeft: 12 });
    for (let i = 0; i < 10; i++) el.dispatchEvent(new Event('scroll'));
    await trame();
    expect(vus, 'un déplacement de 12 px a fait re-rendre l’écran').toEqual([1]);

    // Puis un vrai déplacement : une seule annonce, pas dix.
    const g = geometrieCarrousel(PORTABLE.largeur, PORTABLE.hauteur);
    mesurer(el, { scrollLeft: g.pas * 9 });
    for (let i = 0; i < 10; i++) el.dispatchEvent(new Event('scroll'));
    await trame();
    expect(vus, 'la rafale a rendu plus d’un calcul').toEqual([1, 10]);

    h.destroy();
    parent.remove();
  });

  it('🔴 la place verticale se lit sur LA RANGÉE, pas sur son parent — le rail couché y vit aussi', async () => {
    // Trouvé dans le navigateur, pas ici : sur un portable 1280 × 800, le
    // parent annonçait 401 px et la rangée n'en faisait que 362, parce que le
    // rail A–Z couché occupe la différence. La pochette centrale agrandie
    // réclamait alors 397 px et se faisait rogner par `overflow-y:hidden`.
    const { el, parent } = rangee(PORTABLE.largeur, 401);
    mesurer(el, { clientHeight: 362 });
    let vue: GeometrieCarrousel | null = null;
    const h = centrageCarrousel(el, { nombre: 54, sur: () => {}, surGeometrie: (g) => (vue = g) });

    expect(vue, 'aucune géométrie annoncée').not.toBeNull();
    expect(
      vue!.cote,
      'la géométrie est calculée sur la place du PARENT : la pochette centrale sera rognée',
    ).toBe(geometrieCarrousel(PORTABLE.largeur, 362).cote);
    expect(
      vue!.hauteurBande,
      'la carte agrandie ne tient pas dans la rangée : elle sera coupée en haut et en bas',
    ).toBeLessThanOrEqual(362);

    h.destroy();
    parent.remove();
  });

  it('🔴 aucune vignette n’est interrogée : le calcul ne prend que des nombres', () => {
    // La garde est dans la SIGNATURE, et c'est ce qui la rend infalsifiable :
    // une fonction qui ne reçoit ni nœud ni liste ne peut pas les parcourir.
    expect(indiceCentre.length, '`indiceCentre` a reçu autre chose que des nombres et une géométrie').toBe(4);
    expect(geometrieCarrousel.length).toBe(2);
    const t0 = performance.now();
    for (let i = 0; i < 10_000; i++) indiceCentre(i * 7, 1180, 4338, geometrieCarrousel(1180, 470));
    expect(performance.now() - t0, 'dix mille calculs devraient être instantanés').toBeLessThan(500);
  });
});

describe('#929 — sur l’écran monté, la marque « centré » suit le défilement', () => {
  async function carrouselOuvert() {
    const el = await ecranMonte();
    await attendreQue(() => !!el.querySelector('.card, .lrow'));
    allerA(el, 'carousel');
    // On attend que la bande soit PEINTE et qu'un album y soit désigné : le
    // marquage passe par une trame, et le montage peut être lent sous charge.
    await attendreQue(() => !!el.querySelector('.ccard.centre'));
    const bande = el.querySelector<HTMLElement>('.carrou');
    expect(bande, 'pas de carrousel monté').not.toBeNull();
    return { el, bande: bande! };
  }

  it('🔴 exactement UNE pochette porte la marque, et c’est celle du milieu', async () => {
    const { el, bande } = await carrouselOuvert();
    const marquees = el.querySelectorAll('.ccard.centre');
    expect(marquees.length, 'aucune pochette n’est mise en avant — ou plusieurs le sont').toBe(1);

    const cartes = [...el.querySelectorAll('.ccard')];
    const g = geometrieCarrousel(bande.clientWidth, bande.parentElement?.clientHeight ?? 0);
    const attendu = indiceCentre(bande.scrollLeft, bande.clientWidth, cartes.length, g);
    expect(
      cartes.indexOf(marquees[0]),
      'la pochette marquée n’est pas celle que la position de défilement désigne',
    ).toBe(attendu);
  });

  it('🔴 la marque SUIT quand la bande défile', async () => {
    const { el, bande } = await carrouselOuvert();
    const cartes = [...el.querySelectorAll('.ccard')];
    const avant = cartes.indexOf(el.querySelector('.ccard.centre')!);

    const g = geometrieCarrousel(bande.clientWidth, bande.parentElement?.clientHeight ?? 0);
    mesurer(bande, { scrollLeft: g.pas * 6 });
    bande.dispatchEvent(new Event('scroll'));
    await attendreQue(() => cartes.indexOf(el.querySelector('.ccard.centre')!) !== avant);

    const apres = cartes.indexOf(el.querySelector('.ccard.centre')!);
    expect(apres, 'la marque n’a pas bougé : elle ne suit pas le défilement').toBeGreaterThan(avant);
    // Et elle est allée là où la position de défilement la désigne : c'est le
    // CÂBLAGE qui est jugé ici, le calcul ayant ses propres témoins chiffrés.
    expect(
      apres,
      'la marque a bougé, mais pas sur l’album que la position désigne',
    ).toBe(indiceCentre(g.pas * 6, bande.clientWidth, cartes.length, g));
    expect(el.querySelectorAll('.ccard.centre').length, 'deux pochettes marquées à la fois').toBe(1);
  });
});

describe('#929 — agrandir sans repousser les voisines', () => {
  const src = lire('../../components/v2/LibraryV2.svelte');
  /** Le corps d'une règle CSS, et rien d'autre : une garde qui lirait tout le
   *  fichier serait satisfaite par n'importe quelle autre règle. */
  const corpsDeRegle = (selecteur: string) => {
    const i = src.indexOf(selecteur + '{');
    expect(i, `la règle \`${selecteur}\` n’existe pas`).toBeGreaterThan(-1);
    return src.slice(i, src.indexOf('}', i));
  };

  it('🔴 la mise en avant est une TRANSFORMATION : la mise en page n’en sait rien', () => {
    const regleCentre = corpsDeRegle('.ccard.centre');
    expect(
      regleCentre,
      'la pochette centrale n’est pas agrandie par une transformation',
    ).toContain('transform:scale(');
    // 🔴 Toute propriété qui occupe de la place décalerait la bande entière à
    // chaque cran, et le calage se mettrait à glisser sous les doigts.
    for (const geometrique of ['width:', 'height:', 'flex:', 'margin', 'padding', 'font-size', 'gap:']) {
      expect(
        regleCentre,
        `\`${geometrique}\` dans la règle de la pochette centrale : la bande se décale à chaque cran`,
      ).not.toContain(geometrique);
    }
  });

  it('🔴 la largeur d’une carte ne dépend QUE de la géométrie, jamais de son état', () => {
    const regle = corpsDeRegle('.ccard');
    expect(regle, 'la vignette ne prend pas sa largeur de la géométrie calculée').toContain('var(--ccw)');
    expect(regle, 'la vignette peut s’étirer ou se comprimer : la bande n’a plus de pas constant').toContain('flex:0 0');
  });

  it('🔴 `prefers-reduced-motion` éteint l’animation', () => {
    const i = src.indexOf('@media (prefers-reduced-motion: reduce)');
    expect(i, 'aucune prise en compte de `prefers-reduced-motion` : la pochette enfle à chaque cran').toBeGreaterThan(-1);
    const bloc = src.slice(i, i + 400);
    expect(bloc, 'la transition de la vignette n’est pas neutralisée').toMatch(/\.ccard\s*\{[^}]*transition:\s*none/);
  });
});

describe('#929 — le rail A–Z suit l’orientation de ce qu’il désigne', () => {
  it('🔴 en carrousel, le rail se couche SOUS la bande', async () => {
    const el = await ecranMonte();
    await attendreQue(() => !!el.querySelector('.card, .lrow'));
    allerA(el, 'carousel');
    await attendreQue(() => !!el.querySelector('.carrou'));

    const rail = el.querySelector<HTMLElement>('.rail');
    expect(rail, 'le rail A–Z a disparu du carrousel').not.toBeNull();
    expect(
      rail!.classList.contains('couche'),
      'le rail reste vertical à côté d’une rangée horizontale : ses lettres ne désignent plus rien de spatial',
    ).toBe(true);

    const corps = el.querySelector<HTMLElement>('.body');
    expect(
      corps!.classList.contains('encarrousel'),
      'le corps n’est pas réorganisé : le rail couché resterait sur le côté',
    ).toBe(true);

    // Et en grille, il se redresse.
    allerA(el, 'grid');
    expect(
      el.querySelector('.rail')!.classList.contains('couche'),
      'le rail reste couché en grille',
    ).toBe(false);
  });

  it('🔴 les règles qui le couchent existent, et le placent SOUS la bande', () => {
    const src = lire('../../components/v2/LibraryV2.svelte');
    const iRail = src.indexOf('.rail.couche{');
    expect(iRail, 'la règle `.rail.couche` n’existe pas').toBeGreaterThan(-1);
    expect(src.slice(iRail, src.indexOf('}', iRail)), 'le rail couché ne se déroule pas en ligne')
      .toContain('flex-direction:row');
    const iBody = src.indexOf('.body.encarrousel{');
    expect(iBody, 'la règle `.body.encarrousel` n’existe pas').toBeGreaterThan(-1);
    // `column-reverse` : le rail est le PREMIER enfant du corps, et il doit
    // finir SOUS la bande — pas au-dessus.
    expect(src.slice(iBody, src.indexOf('}', iBody)), 'le rail couché se retrouve au-dessus de la bande')
      .toContain('flex-direction:column-reverse');
  });
});

describe('#929 — la bascule dit où l’on est, et combien il y a de crans', () => {
  it('🔴 trois pastilles sur la vue Albums, dont une seule allumée, sur le mode courant', async () => {
    const el = await ecranMonte();
    await attendreQue(() => !!el.querySelector('.card, .lrow'));
    const points = () => [...bascule(el).querySelectorAll('.vpts i')];

    expect(points().length, 'rien n’indique qu’il existe un troisième cran').toBe(3);
    expect(points().filter((p) => p.classList.contains('on')).length).toBe(1);
    expect(points().findIndex((p) => p.classList.contains('on')), 'la pastille allumée n’est pas celle du mode courant').toBe(0);

    allerA(el, 'carousel');
    expect(points().findIndex((p) => p.classList.contains('on'))).toBe(2);
  });

  it('🔴 deux pastilles là où il n’y a que deux crans', async () => {
    const el = await ecranMonte();
    await attendreQue(() => !!el.querySelector('button.tab[data-onglet="recent"]'));
    el.querySelector<HTMLButtonElement>('button.tab[data-onglet="recent"]')!.click();
    await attendreQue(() => bascule(el).querySelectorAll('.vpts i').length === 2);
    expect(
      bascule(el).querySelectorAll('.vpts i').length,
      'la bascule annonce trois crans là où elle n’en offre que deux',
    ).toBe(2);
  });
});
