// @vitest-environment jsdom
//
// web#2353 — « Les vignettes des playlists Qobuz sont rognées » (Fabien, fil
// 2379, 1.0.0-rc7). La pochette d'une playlist éditoriale est l'illustration
// rectangulaire `image_rectangle` ; la boîte carrée d'`AlbumArt` la recadrait
// au centre (`object-fit: cover`), et le titre écrit à droite disparaissait.
//
// Le composant est MONTÉ ; l'évènement `load` de son `<img>` est déclenché
// avec le format que le navigateur aurait lu. On regarde la classe posée sur
// l'image, celle qui porte `object-fit: contain`.
//
// ⛔ Ce témoin n'établit pas le rendu dans un navigateur réel : jsdom n'a pas
// de mise en page. Il établit la décision du composant.
import { afterEach, describe, expect, it } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import AlbumArt from '../../components/partages/AlbumArt.svelte';
import { illustrationRectangulaire } from '../pochetteEntiere';

let hote: HTMLDivElement | null = null;
let monte: Record<string, unknown> | null = null;

function poser(props: Record<string, unknown>) {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(AlbumArt, { target: hote, props: props as never });
  flushSync();
  return hote;
}

function charger(largeur: number, hauteur: number) {
  const img = hote!.querySelector('img')!;
  Object.defineProperty(img, 'naturalWidth', { value: largeur, configurable: true });
  Object.defineProperty(img, 'naturalHeight', { value: hauteur, configurable: true });
  img.dispatchEvent(new Event('load'));
  flushSync();
  return img;
}

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  hote?.remove();
  hote = null;
});

describe('web#2353 — illustration rectangulaire dans la vignette carrée', () => {
  it('l\'illustration rectangulaire d\'une playlist éditoriale est contenue, pas rognée', () => {
    poser({ coverPath: 'https://static.qobuz.com/images/playlists/rectangle.jpg', size: 0 });
    const img = charger(1200, 600);
    expect(img.classList.contains('entiere')).toBe(true);
  });

  it('une pochette d\'album carrée garde le recadrage', () => {
    poser({ coverPath: 'https://static.qobuz.com/images/covers/carre_600.jpg', size: 0 });
    const img = charger(600, 600);
    expect(img.classList.contains('entiere')).toBe(false);
  });

  it('une pochette presque carrée (scan 1425 × 1400) garde le recadrage', () => {
    poser({ coverPath: 'abcdef0123456789', size: 0 });
    const img = charger(1425, 1400);
    expect(img.classList.contains('entiere')).toBe(false);
  });

  it('un avatar rond (photo d\'artiste) garde le recadrage', () => {
    poser({ coverPath: 'https://example.org/artiste.jpg', size: 0, round: true });
    const img = charger(1600, 900);
    expect(img.classList.contains('entiere')).toBe(false);
  });

  it('la classe porte bien object-fit: contain', () => {
    const source = readFileSync(resolve(__dirname, '../../components/partages/AlbumArt.svelte'), 'utf-8');
    expect(source).toMatch(/img\.entiere\s*\{\s*object-fit:\s*contain;/);
  });

  it('règle de format : seuil 1,2 dans les deux sens', () => {
    expect(illustrationRectangulaire(1200, 600)).toBe(true);
    expect(illustrationRectangulaire(600, 1200)).toBe(true);
    expect(illustrationRectangulaire(600, 600)).toBe(false);
    expect(illustrationRectangulaire(0, 0)).toBe(false);
  });
});
