/**
 * Les cinq actions posées sur une pochette.
 *
 * Chantier ouvert par Bertrand le 02/09/2026, maquette de Levente. Quatre
 * coins et un centre : favori en haut à gauche, édition en haut à droite, menu
 * d'actions en bas à gauche, étiquettes en bas à droite, lecture au centre.
 *
 * Les positions viennent de la MAQUETTE et non de l'énoncé — les deux
 * divergeaient sur l'emplacement de l'édition et des étiquettes, et Bertrand a
 * tranché pour la maquette.
 *
 * ⚠️ Ces tests lisent la SOURCE. Ils empêchent des régressions précises ; ils
 * ne prouvent pas que l'écran est beau ni que les icônes tombent au bon pixel.
 * Cela se voit à l'œil, pas ici.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const lire = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
const actions = () => lire('../../components/v2/PochetteActions.svelte');
const biblio = () => lire('../../components/v2/LibraryV2.svelte');
const coeur = () => lire('../../components/HeartButton.svelte');

describe('Pochette — les cinq emplacements de la maquette', () => {
  it('chaque coin porte l’action que la maquette y met', () => {
    const src = actions();
    // Le lien position → action est le cœur du chantier : l'intervertir donne
    // un écran qui fonctionne et qui n'est pas celui qui a été dessiné.
    for (const [classe, marqueur] of [
      ['tl', 'basculerFavori'],
      ['tr', 'onEditer'],
      ['br', 'panneauOuvert = !panneauOuvert'],
    ] as const) {
      const bloc = new RegExp(`class="coin ${classe}"[\\s\\S]{0,1600}?</button>`).exec(src);
      expect(bloc, `le bouton .${classe} a disparu`).not.toBeNull();
      expect(
        bloc![0].includes(marqueur),
        `le coin .${classe} ne porte plus « ${marqueur} » : les actions ont changé de place.`,
      ).toBe(true);
    }
    expect(/class="coin bl"[\s\S]{0,400}?disabled/.test(src), 'le coin bas-gauche a disparu').toBe(true);
    expect(/class="centre"[\s\S]{0,400}?onLire/.test(src), 'la lecture n’est plus au centre').toBe(true);
  });

  it('le menu d’actions est INERTE, et se dit tel', () => {
    // Décision de Bertrand : le bouton existe, la modale reste à définir par
    // Levente. `disabled` plutôt qu'un clic sans effet — un bouton qui ne
    // répond pas se lit comme une panne.
    const src = actions();
    expect(/class="coin bl"[\s\S]{0,300}?disabled/.test(src), 'le menu n’est plus déclaré inerte').toBe(true);
    expect(
      /class="coin bl"[\s\S]{0,400}?onclick=/.test(src),
      'le menu d’actions a reçu un `onclick` : il n’est plus inerte, alors que la modale n’existe pas.',
    ).toBe(false);
  });
});

describe('Pochette — ce qui reste ATTEIGNABLE', () => {
  it('le clavier révèle les boutons', () => {
    // Sans `focus-within`, on peut tabuler jusqu'à un bouton invisible : il a
    // le focus, on ne le voit pas, et rien n'indique où l'on est.
    expect(
      actions().includes(':focus-within'),
      'la révélation au clavier a disparu : on tabulerait vers des boutons invisibles.',
    ).toBe(true);
  });

  it('sans survol possible, tout reste visible', () => {
    // Tactile : il n'y a rien à garder en réserve. C'est l'iPad qui paierait
    // le plus cher une affordance pensée à la souris — `HeartButton` avait
    // déjà eu à corriger exactement cela.
    const src = actions();
    const i = src.indexOf('@media (hover: none)');
    expect(i, 'la règle tactile a disparu').toBeGreaterThan(-1);
    const bloc = src.slice(i, i + 220);
    for (const sel of ['.coin', '.centre', '.voile']) {
      expect(bloc.includes(sel), `${sel} n’est plus rendu visible au toucher`).toBe(true);
    }
  });

  it('un favori ACTIF ne se cache pas', () => {
    // Sinon on ne peut plus lire quels albums sont en favori sans les survoler
    // un par un — la grille perd une information qu'elle portait.
    expect(
      /\.coin\.actif\s*\{[^}]*opacity:\s*1/.test(actions()),
      'le cœur actif redevient invisible au repos : les favoris ne se lisent plus d’un coup d’œil.',
    ).toBe(true);
  });
});

describe('Pochette — le HTML reste valide', () => {
  it('la vignette n’est plus un bouton', () => {
    // Cinq boutons DANS un bouton : le navigateur défait l'imbrication, et la
    // carte cesse de fonctionner — pas seulement les icônes.
    const src = biblio();
    expect(
      /<button class="card"/.test(src),
      'la carte est redevenue un <button> alors qu’elle contient des boutons : HTML invalide.',
    ).toBe(false);
    expect(src.includes('<div class="card"'), 'la carte a disparu').toBe(true);
    // Le bloc de texte reprend le rôle cliquable, sinon la carte n'ouvre plus
    // rien au clic hors pochette.
    expect(src.includes('<button class="meta"'), 'le bloc de texte n’est plus cliquable').toBe(true);
  });

  it('la pochette elle-même ouvre le détail', () => {
    const src = actions();
    expect(src.includes('class="ouvrir"'), 'le bouton plein cadre a disparu').toBe(true);
    // Il doit rester SOUS les icônes, sinon il les intercepte toutes.
    expect(
      /\.coin,\s*\n\s*\.centre\s*\{[^}]*z-index:\s*1/.test(src),
      'les icônes ne sont plus au-dessus du bouton plein cadre : il capterait tous les clics.',
    ).toBe(true);
  });

  it('chaque geste s’arrête sur son icône', () => {
    // Sans `stopPropagation`, cliquer le cœur ouvrirait AUSSI l'album.
    const src = actions();
    expect(src.includes('ev.stopPropagation()'), 'la propagation n’est plus arrêtée').toBe(true);
    expect(src.includes('ev.preventDefault()'), 'l’action par défaut n’est plus empêchée').toBe(true);
  });
});

describe('Favoris — un seul chemin', () => {
  it('le cœur historique et les icônes de pochette partagent la bascule', () => {
    // Deux implémentations du même favori, c'est la panne #1478 côté
    // streaming : un cœur plein dans la barre, vide dans la liste. Elle a été
    // corrigée en n'en gardant qu'une ; on ne la recrée pas côté local.
    for (const [quoi, src] of [
      ['HeartButton', coeur()],
      ['PochetteActions', actions()],
    ] as const) {
      expect(
        src.includes('basculerFavoriLocal'),
        `${quoi} n’appelle plus le chemin partagé : deux favoris divergeraient.`,
      ).toBe(true);
    }
    // Et plus personne n'écrit les magasins en direct depuis le cœur.
    expect(
      /favoriteAlbumIds\.update/.test(coeur()),
      'HeartButton réécrit les magasins en propre : la seconde implémentation est de retour.',
    ).toBe(false);
  });

  it('l’échec du serveur REVIENT en arrière', () => {
    // Sans cela, le magasin ment : le cœur reste plein alors que rien n'a été
    // enregistré, et l'utilisateur le découvre au rechargement.
    const src = lire('../favorisLocaux.ts');
    const i = src.indexOf('} catch (e) {');
    expect(i, 'le rattrapage a disparu').toBeGreaterThan(-1);
    expect(
      src.slice(i, i + 200).includes('bascule(avant)'),
      'l’échec ne revient plus en arrière : le magasin afficherait un favori qui n’existe pas.',
    ).toBe(true);
  });
});

/**
 * Une surcouche doit sortir de la vignette.
 *
 * Vécu le 02/09/2026 : le panneau d'étiquettes s'affichait DANS la vignette
 * d'album, rogné aux trois quarts. Une `position: fixed` se place par rapport à
 * la fenêtre — sauf si un ancêtre porte `transform`, `filter`, `will-change` ou
 * `contain`, auquel cas il devient le bloc conteneur.
 *
 * DEUX ancêtres le faisaient, et corriger l'un seul n'aurait rien donné :
 * `.pa` porte `overflow: hidden` (c'est lui qui arrondit la pochette), et
 * `.card` a reçu `content-visibility: auto` — laquelle implique
 * `contain: layout style paint`.
 *
 * Le garde tient le déplacement à la racine, pas les deux causes : n'importe
 * quel ancêtre futur pourrait recréer le problème, et personne ne ferait le
 * rapprochement.
 */
describe('Étiquettes — le panneau sort de la vignette', () => {
  const panneau = () => lire('../../components/v2/EtiquettesPanneau.svelte');

  it('le panneau est déplacé à la racine du document', () => {
    const src = panneau();
    expect(
      src.includes('use:portail'),
      'le panneau n’est plus déplacé : il se rognerait dans la vignette qui l’ouvre.',
    ).toBe(true);
    // Et il reste `fixed` : déplacé mais en flux, il pousserait la page.
    expect(/\.fond\s*\{[^}]*position:\s*fixed/.test(src), 'la surcouche n’est plus fixe').toBe(true);
  });

  it('le déplacement se défait au démontage', () => {
    // Sans cela, le panneau survivrait à l'écran qui l'a ouvert — il est
    // désormais enfant de <body>, plus de la vignette.
    const src = lire('../portail.ts');
    expect(src.includes('destroy()'), 'le nettoyage a disparu').toBe(true);
    expect(
      src.includes('node.parentNode === cible'),
      'le retrait ne vérifie plus le parent : `removeChild` lèverait sur un nœud déjà détaché.',
    ).toBe(true);
  });

  it('la vignette garde ce qui l’oblige au déplacement', () => {
    // Si ces deux-là disparaissent un jour, le portail devient inutile — mais
    // le retirer AVANT eux ramène le défaut. Le test dit lequel vient d'abord.
    expect(actions().includes('overflow: hidden'), '`.pa` ne rogne plus').toBe(true);
    expect(biblio().includes('content-visibility:auto'), 'le rendu hors écran a disparu').toBe(true);
  });
});
