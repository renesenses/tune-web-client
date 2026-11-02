// web#2400 / web#2450 — le moteur pur des cartes de découverte.
import { describe, expect, it } from 'vitest';
import {
  construireArbre, cheminVers, noeudDeLElement, correspondances, proches, disposer, focusSuivant, initiales,
  type ElementCarte,
} from '../carteDecouverte';

const el = (id: string, genre: string, pays: string, reseau: string | null = null, o: Partial<ElementCarte> = {}): ElementCarte => ({
  id, nom: id, genre, pays, reseau, texte: `${id} ${genre} ${pays} ${reseau ?? ''}`, ...o,
});
const ST = [
  el('FIP', 'eclectic', 'FR', 'Radio France'),
  el('FIP Jazz', 'jazz', 'FR', 'Radio France'),
  el('France Musique', 'classical', 'FR', 'Radio France'),
  el('WBGO', 'jazz', 'US', 'NPR'),
  el('KEXP', 'eclectic', 'US', 'NPR'),
  el('Radio Paradise', 'eclectic', 'US'),
  el('Jazz Radio', 'jazz', 'FR'),
];

describe('construireArbre', () => {
  it('genre → pays → éléments, les plus gros groupes d’abord', () => {
    const r = construireArbre(ST, 'arbre', 'genre');
    expect(r.enfants.map((n) => n.cle)).toEqual(['eclectic', 'jazz', 'classical']);
    const jazz = r.enfants[1];
    expect(jazz.enfants.map((n) => n.cle)).toEqual(['FR', 'US']);
    expect(jazz.enfants[0].enfants.map((n) => n.element?.id)).toEqual(['FIP Jazz', 'Jazz Radio']);
    expect(jazz.enfants[0].enfants[0].type).toBe('element');
  });

  it('l’axe pays inverse les niveaux', () => {
    const r = construireArbre(ST, 'arbre', 'pays');
    expect(r.enfants.map((n) => n.cle)).toEqual(['FR', 'US']);
    expect(r.enfants[0].enfants[0].dimension).toBe('genre');
  });

  it('🔴 le mode réseaux groupe par réseau, et range les indépendants à la fin', () => {
    const r = construireArbre(ST, 'reseaux', 'genre');
    expect(r.enfants.map((n) => [n.dimension, n.cle, n.elements.length])).toEqual([
      ['reseau', 'Radio France', 3], ['reseau', 'NPR', 2], ['sansReseau', '', 2],
    ]);
    // Les indépendants sont subdivisés par l'axe choisi.
    expect(r.enfants[2].enfants.map((n) => n.cle)).toEqual(['eclectic', 'jazz']);
  });

  it('un élément sans genre ni pays tombe dans le groupe « sans », en dernier', () => {
    const r = construireArbre([...ST, el('X', '', ''), el('Y', '', '')], 'arbre', 'genre');
    expect(r.enfants.at(-1)!.cle).toBe('');
  });

  it('les feuilles suivent le rang, puis le nom', () => {
    const r = construireArbre([el('b', 'g', 'FR', null, { rang: 2 }), el('a', 'g', 'FR'), el('c', 'g', 'FR', null, { rang: 1 })], 'arbre', 'genre');
    expect(r.enfants[0].enfants[0].enfants.map((n) => n.element!.id)).toEqual(['c', 'b', 'a']);
  });

  it('retrouve le nœud d’un élément et son chemin', () => {
    const r = construireArbre(ST, 'arbre', 'genre');
    const n = noeudDeLElement(r, 'WBGO')!;
    expect(cheminVers(n.parent!).map((x) => x.cle)).toEqual(['', 'jazz', 'US']);
  });
});

describe('proches', () => {
  it('même réseau d’abord, puis même genre ; jamais l’élément lui-même', () => {
    const fip = ST[0];
    const p = proches(fip, ST);
    expect(p.map((x) => x.element.id)).not.toContain('FIP');
    expect(p[0].raisons).toContain('reseau');
    expect(p.find((x) => x.element.id === 'KEXP')!.raisons).toEqual(['genre']);
    // Même pays SEUL ne suffit pas.
    expect(p.map((x) => x.element.id)).not.toContain('Jazz Radio');
  });

  it('une catégorie secondaire commune rapproche aussi', () => {
    const a = el('a', 'pop', 'FR', null, { categories: ['pop', 'rock'] });
    const b = el('b', 'rock', 'BE');
    expect(proches(a, [a, b]).map((x) => x.element.id)).toEqual(['b']);
  });
});

describe('recherche, disposition, clavier', () => {
  it('la recherche ignore accents et casse', () => {
    const els = [el('Musique', 'classical', 'FR', null, { texte: 'France Musique Classique' })];
    expect([...correspondances(els, 'classiqué')]).toEqual(['Musique']);
    expect(correspondances(els, '  ').size).toBe(0);
  });

  it('la disposition est déterministe, dans la scène et sans recouvrement grossier', () => {
    const a = disposer([10, 5, 1, 30], false, 800, 480);
    expect(disposer([10, 5, 1, 30], false, 800, 480)).toEqual(a);
    for (const p of a) {
      expect(p.x - p.r).toBeGreaterThanOrEqual(0);
      expect(p.x + p.r).toBeLessThanOrEqual(800);
    }
    for (let i = 0; i < a.length; i++) for (let j = i + 1; j < a.length; j++) {
      expect(Math.hypot(a[i].x - a[j].x, a[i].y - a[j].y)).toBeGreaterThan((a[i].r + a[j].r) * 0.9);
    }
    expect(disposer([], true, 800, 480)).toEqual([]);
  });

  it('les flèches bouclent, Début/Fin vont aux bouts, une autre touche ne bouge rien', () => {
    expect(focusSuivant('ArrowRight', -1, 3)).toBe(0);
    expect(focusSuivant('ArrowRight', 2, 3)).toBe(0);
    expect(focusSuivant('ArrowLeft', 0, 3)).toBe(2);
    expect(focusSuivant('End', 0, 3)).toBe(2);
    expect(focusSuivant('Home', 2, 3)).toBe(0);
    expect(focusSuivant('a', 1, 3)).toBeNull();
    expect(focusSuivant('ArrowRight', 0, 0)).toBeNull();
  });

  it('initiales', () => {
    expect(initiales('Radio Paradise: Main Mix')).toBe('RP');
    expect(initiales('FIP')).toBe('F');
  });
});
