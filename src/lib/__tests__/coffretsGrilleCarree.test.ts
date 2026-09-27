// @vitest-environment jsdom
//
// Bibliothèque › Coffrets — Bertrand, 27/09/2026, capture sur le .18 en
// 0.9.167-pre : la grille des coffrets est cassée. Chaque pochette garde sa
// taille et ses proportions natives, déborde de sa case et chevauche la
// voisine ; les « … » et les lignes « N disques » ne sont pas alignés. La
// grille des Albums, elle, est régulière.
//
// ## LA CAUSE
//
// Les menus d'objets (26/09) ont posé la carte dans un `.hote`, à côté de son
// « … » : le `<button class="carte">` n'est plus l'enfant de la grille. Or un
// bouton en `width:auto` n'est pas étiré comme un bloc, il prend la largeur de
// son contenu. `AlbumArt` en `size={0}` (`width:100%; aspect-ratio:1`) se
// rapporte à ce bouton : la largeur devient circulaire et la pochette retombe
// sur la taille native de l'image.
//
// ## LE TÉMOIN
//
// jsdom ne fait pas de mise en page : on ne peut pas y mesurer une largeur.
// On lit donc les styles CALCULÉS sur les feuilles réellement compilées par
// Svelte (portée comprise) et posées dans le document, sur une grille
// RENDUE : entre la case de la grille et la pochette, tout bouton qui n'est
// pas lui-même la case doit porter `width:100%`, et la pochette doit être
// carrée et rognée (`aspect-ratio:1`, `object-fit:cover`). Retirer
// `width:100%` de `.carte` rend le témoin rouge.
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import { readFileSync } from 'node:fs';
import { compile } from 'svelte/compiler';
import { resolve } from 'node:path';

vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

const COFFRETS = [
  { id: 1, title: 'Antologia', artist_name: 'Paco de Lucia', cover_path: '/c/1.jpg', disc_count: 2 },
  { id: 2, title: 'Anthologie Mornas & Coladeras', artist_name: 'Cesaria Evora', cover_path: '/c/2.jpg', disc_count: 2 },
  // Sans artiste : la ligne « N disques » doit rester à la même place.
  { id: 3, title: 'Delicate Sound Of Thunder CD1', artist_name: null, cover_path: '/c/3.jpg', disc_count: 2 },
];

vi.mock('../api', async (orig) => {
  const vrai = await orig<typeof import('../api')>();
  return { ...vrai, getCoffrets: vi.fn(async () => ({ count: COFFRETS.length, items: COFFRETS })) };
});

import CoffretsV2 from '../../components/v2/CoffretsV2.svelte';

const COMPOSANTS = ['src/components/v2/CoffretsV2.svelte', 'src/components/partages/AlbumArt.svelte'];

beforeAll(() => {
  for (const chemin of COMPOSANTS) {
    const src = readFileSync(resolve(process.cwd(), chemin), 'utf-8');
    const { css } = compile(src, { css: 'external', filename: chemin });
    if (!css?.code) throw new Error(`${chemin} : aucune feuille compilée`);
    const el = document.createElement('style');
    el.textContent = css.code;
    document.head.appendChild(el);
  }
});

let hote: HTMLDivElement | null = null;
let monte: Record<string, unknown> | null = null;
const respirer = () => new Promise((r) => setTimeout(r, 0));

afterEach(() => {
  if (monte) unmount(monte);
  hote?.remove();
  monte = null;
  hote = null;
});

async function poserGrille(): Promise<HTMLElement> {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(CoffretsV2, { target: hote, props: { onOuvrir: () => {}, vue: 'grid' } });
  for (let i = 0; i < 10; i++) await respirer();
  flushSync();
  const grille = hote.querySelector<HTMLElement>('.grille');
  if (!grille) throw new Error(`grille absente : ${hote.textContent}`);
  // La feuille compilée doit s'appliquer au DOM monté, sinon tout passe au
  // vert pour une mauvaise raison.
  expect(getComputedStyle(grille).display).toBe('grid');
  return grille;
}

describe('Bibliothèque › Coffrets — une grille régulière, comme les Albums', () => {
  it('entre la case de la grille et la pochette, aucun bouton ne se dimensionne sur son contenu', async () => {
    const grille = await poserGrille();
    const arts = [...grille.querySelectorAll<HTMLElement>('.album-art')];
    expect(arts.length).toBe(COFFRETS.length);
    for (const art of arts) {
      let n = art.parentElement;
      while (n && n.parentElement !== grille) {
        if (n.tagName === 'BUTTON') {
          expect(getComputedStyle(n).width, `bouton .${n.className} hors de la grille`).toBe('100%');
        }
        n = n.parentElement;
      }
      expect(n?.parentElement).toBe(grille);
      expect(getComputedStyle(n!).minWidth).toBe('0px');
    }
  });

  it('la pochette est carrée et rognée, jamais à sa taille native', async () => {
    const grille = await poserGrille();
    for (const art of grille.querySelectorAll<HTMLElement>('.album-art')) {
      const s = getComputedStyle(art);
      expect(s.width).toBe('100%');
      // jsdom normalise `aspect-ratio:1` en « 1 / 1 ».
      expect(s.getPropertyValue('aspect-ratio').replace(/\s/g, '')).toMatch(/^1(\/1)?$/);
      const img = art.querySelector('img');
      expect(img).not.toBeNull();
      expect(getComputedStyle(img!).objectFit).toBe('cover');
    }
  });

  it('titre, artiste et « N disques » occupent les mêmes places sur chaque carte', async () => {
    const grille = await poserGrille();
    const formes = [...grille.querySelectorAll('.carte')].map((c) =>
      [...c.children].map((e) => [...e.classList].find((x) => !x.startsWith('svelte-'))).join(' '),
    );
    expect(formes).toEqual(COFFRETS.map(() => 'album-art titre artiste disques'));
  });
});
