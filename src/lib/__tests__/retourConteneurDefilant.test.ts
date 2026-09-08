// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  CANDIDATS_DEFILEMENT,
  conteneurDefilant,
  defileVraiment,
  restaurerQuandPret,
} from '../defilementReel';

/**
 * Le bouton Retour reposait la Bibliothèque tout en haut.
 *
 * Ce fichier rejoue la mesure faite dans Chrome sur .18 (v0.9.126) le
 * 30/08/2026 : dans l'onglet Albums, `.view-scroller` et `.library-scroller`
 * ont `scrollHeight === clientHeight` (ils NE DÉFILENT PAS) tandis que
 * `.album-grid-viewport` est à 600 sur 121363. Mémoriser la position sur les
 * deux premiers revient à lire et réécrire 0 indéfiniment.
 *
 * Les cinq suites existantes (`retourCollectionArtiste`, `retourDefilementListes`,
 * `retourHistoriqueBibliotheque`, `retourVueArtisteScroll`, `streamingRetour`)
 * n'ont rien vu de ce défaut : elles rejouent la RÈGLE sur des nombres, sans
 * jamais construire un conteneur qui défile. D'où un vrai DOM ici.
 */

/** Un conteneur dont on fixe les cotes, comme le ferait une vraie mise en page. */
function conteneur(
  parent: Element | Document,
  classe: string,
  cotes: { scrollHeight: number; clientHeight: number; scrollTop?: number },
): HTMLElement {
  const el = document.createElement('div');
  el.className = classe;
  Object.defineProperty(el, 'scrollHeight', { value: cotes.scrollHeight, configurable: true });
  Object.defineProperty(el, 'clientHeight', { value: cotes.clientHeight, configurable: true });
  // jsdom ne dispose pas d'un vrai ascenseur : on rend `scrollTop` inscriptible
  // pour que le test observe ce que le code ÉCRIT, pas ce que jsdom clampe.
  Object.defineProperty(el, 'scrollTop', { value: cotes.scrollTop ?? 0, writable: true, configurable: true });
  (parent as Element).appendChild ? (parent as Element).appendChild(el) : document.body.appendChild(el);
  return el;
}

/** La Bibliothèque telle qu'elle a été mesurée, onglet Albums, défilée à 600. */
function bibliothequeMesuree(defilement = 600) {
  document.body.innerHTML = '';
  const vue = conteneur(document.body, 'view-scroller', { scrollHeight: 745, clientHeight: 745 });
  const biblio = conteneur(vue, 'library-scroller', { scrollHeight: 607, clientHeight: 607 });
  const grille = conteneur(biblio, 'album-grid-viewport', {
    scrollHeight: 121363,
    clientHeight: 523,
    scrollTop: defilement,
  });
  return { vue, biblio, grille };
}

describe('quel conteneur défile vraiment', () => {
  it('rend la grille d’albums, et non les deux conteneurs qui ne défilent pas', () => {
    const { grille } = bibliothequeMesuree();
    expect(conteneurDefilant(CANDIDATS_DEFILEMENT)).toBe(grille);
  });

  it('contre-épreuve : les cibles d’origine mémorisaient 0 là où il y avait 600', () => {
    bibliothequeMesuree();
    // Ce que faisaient App.svelte (`.view-scroller`) et LibraryView (`.library-scroller`).
    expect(document.querySelector('.view-scroller')!.scrollTop).toBe(0);
    expect(document.querySelector('.library-scroller')!.scrollTop).toBe(0);
    // Ce que la règle retient désormais.
    expect(conteneurDefilant(CANDIDATS_DEFILEMENT)!.scrollTop).toBe(600);
  });

  it('reconnaît qu’un conteneur ne défile pas quand son contenu tient dedans', () => {
    const { vue, grille } = bibliothequeMesuree();
    expect(defileVraiment(vue)).toBe(false);
    expect(defileVraiment(grille)).toBe(true);
  });

  it('à défaut de conteneur défilant, rend le premier présent plutôt que rien', () => {
    document.body.innerHTML = '';
    const vue = conteneur(document.body, 'view-scroller', { scrollHeight: 745, clientHeight: 745 });
    expect(conteneurDefilant(CANDIDATS_DEFILEMENT)).toBe(vue);
  });

  it('suit la disposition : l’onglet Années porte son propre ascenseur', () => {
    document.body.innerHTML = '';
    const vue = conteneur(document.body, 'view-scroller', { scrollHeight: 745, clientHeight: 745 });
    const biblio = conteneur(vue, 'library-scroller', { scrollHeight: 607, clientHeight: 607 });
    const annees = conteneur(biblio, 'year-grid-viewport', {
      scrollHeight: 40000,
      clientHeight: 523,
      scrollTop: 900,
    });
    expect(conteneurDefilant(CANDIDATS_DEFILEMENT)).toBe(annees);
  });

  it('la liste d’artistes défile bien dans `.library-scroller` — pas de régression', () => {
    document.body.innerHTML = '';
    const vue = conteneur(document.body, 'view-scroller', { scrollHeight: 745, clientHeight: 745 });
    const biblio = conteneur(vue, 'library-scroller', {
      scrollHeight: 30000,
      clientHeight: 607,
      scrollTop: 4200,
    });
    // Pas de grille montée dans l'onglet Artistes : la règle retombe sur le
    // conteneur que les correctifs #1118 / #870 avaient identifié.
    expect(conteneurDefilant(CANDIDATS_DEFILEMENT)).toBe(biblio);
  });
});

describe('restaurer sans retomber en haut', () => {
  /** Un ordonnanceur manuel : on décide quand « la frame suivante » arrive. */
  function ordonnanceur() {
    const files: Array<() => void> = [];
    return {
      programmer: (cb: () => void) => { files.push(cb); },
      avancer(frames = 1) {
        for (let i = 0; i < frames; i++) {
          const cb = files.shift();
          if (!cb) return;
          cb();
        }
      },
      enAttente: () => files.length,
    };
  }

  it('attend que la liste soit assez haute avant d’écrire la position', () => {
    const horloge = ordonnanceur();
    let hauteur = 0; // la grille virtualisée se remplit en plusieurs frames
    const grille = document.createElement('div');
    Object.defineProperty(grille, 'clientHeight', { value: 523, configurable: true });
    Object.defineProperty(grille, 'scrollHeight', { get: () => hauteur, configurable: true });
    Object.defineProperty(grille, 'scrollTop', { value: 0, writable: true, configurable: true });

    restaurerQuandPret(600, () => grille, { programmer: horloge.programmer });

    horloge.avancer(3);
    expect(grille.scrollTop).toBe(0); // trop courte : écrire maintenant serait ramené à 0

    hauteur = 121363;
    horloge.avancer(1);
    expect(grille.scrollTop).toBe(600);
  });

  it('n’attend pas indéfiniment : après 30 essais elle écrit quand même', () => {
    const horloge = ordonnanceur();
    const grille = document.createElement('div');
    Object.defineProperty(grille, 'clientHeight', { value: 523, configurable: true });
    Object.defineProperty(grille, 'scrollHeight', { value: 0, configurable: true });
    Object.defineProperty(grille, 'scrollTop', { value: 0, writable: true, configurable: true });

    restaurerQuandPret(600, () => grille, { programmer: horloge.programmer });
    horloge.avancer(40);
    expect(grille.scrollTop).toBe(600);
    expect(horloge.enAttente()).toBe(0);
  });

  it('supporte un conteneur pas encore monté : elle le redemande à chaque essai', () => {
    const horloge = ordonnanceur();
    let grille: HTMLElement | null = null;

    restaurerQuandPret(600, () => grille, { programmer: horloge.programmer });
    horloge.avancer(2); // la vue est encore démontée

    grille = document.createElement('div');
    Object.defineProperty(grille, 'clientHeight', { value: 523, configurable: true });
    Object.defineProperty(grille, 'scrollHeight', { value: 121363, configurable: true });
    Object.defineProperty(grille, 'scrollTop', { value: 0, writable: true, configurable: true });

    horloge.avancer(1);
    expect(grille.scrollTop).toBe(600);
  });

  it('ne fait rien pour une cible nulle — écrire 0 écraserait une restauration en cours', () => {
    const horloge = ordonnanceur();
    let demande = 0;
    let fini = false;
    restaurerQuandPret(0, () => { demande++; return null; }, {
      programmer: horloge.programmer,
      fini: () => { fini = true; },
    });
    horloge.avancer(5);
    expect(demande).toBe(0);
    expect(fini).toBe(true);
  });
});

describe('les vues ne visent plus un conteneur nommé en dur', () => {
  const source = (chemin: string) =>
    readFileSync(resolve(__dirname, '../..', chemin), 'utf-8');

  it('App.svelte mémorise la position sur le conteneur qui défile', () => {
    const app = source('App.svelte');
    expect(app).toMatch(/conteneurDefilant/);
    // La capture et la restauration ne doivent plus nommer `.view-scroller`.
    const visesEnDur = [...app.matchAll(/querySelector\('\.view-scroller'\)/g)];
    expect(visesEnDur).toHaveLength(0);
  });

  it('LibraryView restaure la liste sur le conteneur qui défile', () => {
    const vue = source('components/LibraryView.svelte');
    expect(vue).toMatch(/conteneurDefilant/);
  });
});
