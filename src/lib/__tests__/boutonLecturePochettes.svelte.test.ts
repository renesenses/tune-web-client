// @vitest-environment jsdom
/**
 * rc14 — la flèche de lecture des pochettes (`PochetteActions`).
 *
 * Demande d'un utilisateur sur iPad Pro, validée par Bertrand le 22/11/2026 :
 * « la flèche de lecture est trop grande, et on ne peut pas la masquer ».
 *
 *  1. Un réglage « Afficher le bouton lecture sur les pochettes », ACTIVÉ par
 *     défaut, rangé avec les choix d'affichage et stocké comme eux (magasin
 *     `preferences`, `localStorage`) : décoché, le bouton n'est pas rendu.
 *  2. Au pointeur grossier / sans survol, le bouton devient discret : 36 px
 *     (cible minimale au doigt), dans le coin bas droit, plus au centre.
 *
 * jsdom n'évalue pas les requêtes média : le point 2 se vérifie sur la
 * feuille COMPILÉE du composant, comme `tableauDeBordMaquetteLevente`.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createRawSnippet, flushSync, mount, unmount } from 'svelte';
import { compile } from 'svelte/compiler';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { get } from 'svelte/store';
import PochetteActions from '../../components/v2/PochetteActions.svelte';
import { preferences } from '../stores/preferences';
import { REGLAGES } from '../reglagesIndex';
import { ONZE_LANGUES, dictionnaire } from './onzeDictionnaires';

const pochette = createRawSnippet(() => ({ render: () => '<img alt="" />' }));
let hote: HTMLDivElement | null = null;
let monte: Record<string, any> | null = null;

function monter() {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(PochetteActions, { target: hote, props: { children: pochette, onLire: () => {}, nom: 'Requiem' } });
  flushSync();
}

beforeEach(() => preferences.update((p) => ({ ...p, boutonLecturePochettes: true })));
afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  hote?.remove();
  hote = null;
  preferences.update((p) => ({ ...p, boutonLecturePochettes: true }));
});

describe('le réglage « Afficher le bouton lecture sur les pochettes »', () => {
  it('est ACTIVÉ par défaut', () => {
    expect(get(preferences).boutonLecturePochettes).toBe(true);
  });

  it('activé : la flèche est là, icône Lucide', () => {
    monter();
    const b = hote!.querySelector('button.centre');
    expect(b).not.toBeNull();
    expect(b!.querySelector('svg')?.getAttribute('class') ?? '').toMatch(/\blucide\b/);
  });

  it('désactivé : la flèche est ABSENTE (pas cachée, absente)', () => {
    preferences.update((p) => ({ ...p, boutonLecturePochettes: false }));
    monter();
    expect(hote!.querySelector('button.centre')).toBeNull();
    // Le reste de la pochette est intact.
    expect(hote!.querySelector('.pa')).not.toBeNull();
  });

  it('suit le réglage en direct', () => {
    monter();
    expect(hote!.querySelector('button.centre')).not.toBeNull();
    preferences.update((p) => ({ ...p, boutonLecturePochettes: false }));
    flushSync();
    expect(hote!.querySelector('button.centre')).toBeNull();
  });

  it('est rangé avec les choix d’affichage, et traduit dans les seize langues', () => {
    const r = REGLAGES.find((x: any) => x.id === 'bouton-lecture-pochettes') as any;
    expect(r?.section).toBe('displayPrefs');
    const ecran = readFileSync(resolve(process.cwd(), 'src/components/v2/SettingsV2.svelte'), 'utf-8');
    expect(ecran).toContain('data-reglage="bouton-lecture-pochettes"');
    expect(ecran).toContain('boutonLecturePochettes:');
    for (const l of ONZE_LANGUES) {
      const d = dictionnaire(l) as Record<string, string>;
      expect(d['settings.coverPlayButton'], l).toBeTruthy();
      expect(d['settings.coverPlayButtonHint'], l).toBeTruthy();
    }
  });
});

describe('au pointeur grossier, une flèche discrète dans un coin', () => {
  const chemin = 'src/components/v2/PochetteActions.svelte';
  const css = (compile(readFileSync(resolve(process.cwd(), chemin), 'utf-8'), { css: 'external', filename: chemin }).css?.code ?? '')
    .replace(/\s+/g, ' ');

  /** Le corps du DERNIER bloc `@media` qui vise le tactile. */
  function blocTactile(): string {
    const i = css.lastIndexOf('@media (hover: none), (pointer: coarse)');
    expect(i, 'aucune règle pour le pointeur grossier').toBeGreaterThan(-1);
    let profondeur = 0;
    let j = css.indexOf('{', i);
    const debut = j;
    for (; j < css.length; j++) {
      if (css[j] === '{') profondeur++;
      else if (css[j] === '}' && --profondeur === 0) break;
    }
    return css.slice(debut, j);
  }

  it('36 px, dans le coin bas droit, plus au centre', () => {
    const b = blocTactile();
    const regle = b.match(/\.centre\.svelte-[a-z0-9]+ \{([^}]*)\}/)?.[1] ?? '';
    expect(regle).toMatch(/width: 36px/);
    expect(regle).toMatch(/height: 36px/);
    expect(regle).toMatch(/right: 8px/);
    expect(regle).toMatch(/bottom: 8px/);
    expect(regle).toMatch(/top: auto/);
    expect(regle).toMatch(/margin: 0/);
  });

  it('la règle tactile vient APRÈS le palier ≤ 600 px (elle l’emporte)', () => {
    expect(css.lastIndexOf('@media (hover: none), (pointer: coarse)')).toBeGreaterThan(css.lastIndexOf('@media (max-width: 600px)'));
  });

  it('contre-épreuve : hors tactile, le disque central de 52 px reste pour la souris', () => {
    expect(css).toMatch(/\.centre\.svelte-[a-z0-9]+ \{[^}]*top: 50%;[^}]*width: 52px/);
  });
});
