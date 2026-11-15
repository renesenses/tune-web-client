// @vitest-environment jsdom
//
// rc12 — Bertrand, 12/11/2026 : « un seul bouton Play pour Play / Shuffle /
// Lire ensuite / Ajouter à la file, sur toutes les vues concernées ».
//
// Ce banc garde :
//   1. le composant partagé `BoutonLectureV2` : le clic lit, la flèche ▾
//      déroule EXACTEMENT « Lecture aléatoire », « Lire ensuite », « Ajouter à
//      la file », dans cet ordre ; ↓ / Entrée ouvrent, Échap referme ;
//   2. CONTRE-ÉPREUVE : sans geste aléatoire fourni, l'entrée est absente (pas
//      d'entrée morte) ; sans aucun geste secondaire, pas de flèche du tout ;
//   3. les vues converties n'ont plus de bouton aléatoire À CÔTÉ du bouton
//      Lecture : le geste vit sous la flèche (lecture des sources) ;
//   4. la chaîne nouvelle dans les quinze locales.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import { get } from 'svelte/store';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { t } from '../i18n';
import BoutonLectureV2 from '../../components/v2/BoutonLectureV2.svelte';

const tr = (k: string) => get(t)(k as any);
const lire = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf-8');
let hote: HTMLDivElement | null = null;
let monte: Record<string, unknown> | null = null;

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  hote?.remove();
  hote = null;
  document.body.innerHTML = '';
});

function poser(props: Record<string, unknown>) {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(BoutonLectureV2 as any, { target: hote, props: props as any });
  flushSync();
}
const menu = () => document.body.querySelector<HTMLElement>('[role="menu"]');
const entrees = () => Array.from(menu()?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);
const touche = (cible: EventTarget, key: string) =>
  cible.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));

describe('BoutonLectureV2 — un seul bouton Play, trois choix sous la flèche', () => {
  it('clic = lire ; ▾ = Lecture aléatoire, Lire ensuite, Ajouter à la file — dans cet ordre', () => {
    const lireF = vi.fn(), alea = vi.fn(), ens = vi.fn(), fil = vi.fn();
    poser({ onLire: lireF, cle: 'common.play', aleatoire: { faire: alea }, ensuite: { faire: ens }, file: { faire: fil },
      attrsAleatoire: { 'data-aleatoire-temoin': true } });
    hote!.querySelector<HTMLButtonElement>('[data-lecture-principale]')!.click();
    expect(lireF).toHaveBeenCalledTimes(1);
    expect(menu()).toBeNull();

    const fleche = hote!.querySelector<HTMLButtonElement>('[data-lecture-options]')!;
    touche(fleche, 'ArrowDown');
    flushSync();
    const l = entrees();
    expect(l.map((e) => e.textContent?.trim())).toEqual([
      tr('v2.menu.shufflePlay'), tr('v2.album.playNext'), tr('v2.menu.addToQueue'),
    ]);
    expect(l[0].hasAttribute('data-lecture-aleatoire')).toBe(true);
    expect(l[0].hasAttribute('data-aleatoire-temoin'), 'le data-* propre à l’écran suit l’entrée').toBe(true);
    // Échap referme et rend le focus à la flèche.
    touche(window, 'Escape');
    flushSync();
    expect(menu()).toBeNull();
    expect(document.activeElement).toBe(fleche);

    fleche.click();
    flushSync();
    entrees()[0].click();
    flushSync();
    expect(alea).toHaveBeenCalledTimes(1);
    expect(ens).not.toHaveBeenCalled();
    expect(fil).not.toHaveBeenCalled();
    expect(lireF).toHaveBeenCalledTimes(1);
  });

  it('contre-épreuve : sans geste aléatoire, pas d’entrée « Lecture aléatoire »', () => {
    poser({ onLire: () => {}, cle: 'common.play', ensuite: { faire: () => {} }, file: { faire: () => {} } });
    hote!.querySelector<HTMLButtonElement>('[data-lecture-options]')!.click();
    flushSync();
    expect(entrees().map((e) => e.textContent?.trim())).toEqual([tr('v2.album.playNext'), tr('v2.menu.addToQueue')]);
  });

  it('contre-épreuve : l’aléatoire seul suffit à donner une flèche ; rien du tout, pas de flèche', () => {
    poser({ onLire: () => {}, cle: 'common.play', aleatoire: { faire: () => {} } });
    expect(hote!.querySelector('[data-lecture-options]')).not.toBeNull();
    unmount(monte!); monte = null; hote!.remove();
    poser({ onLire: () => {}, cle: 'common.play' });
    expect(hote!.querySelector('[data-lecture-options]')).toBeNull();
  });

  it('format réduit : icône seule, le libellé passe dans le nom accessible', () => {
    poser({ onLire: () => {}, cle: 'browse.playAll', compact: true, aleatoire: { faire: () => {} } });
    const b = hote!.querySelector<HTMLButtonElement>('[data-lecture-principale]')!;
    expect(b.textContent?.trim()).toBe('');
    expect(b.getAttribute('aria-label')).toBe(tr('browse.playAll'));
  });
});

describe('les vues : plus de bouton aléatoire à côté du bouton Play', () => {
  // Chaque vue convertie : elle monte `BoutonLectureV2` avec un geste
  // `aleatoire`, et n'a plus l'ancien bouton séparé.
  const VUES: [string, RegExp][] = [
    ['src/components/v2/AlbumDetailV2.svelte', /<button[^>]*data-aleatoire-album/],
    ['src/components/v2/PlaylistDetailV2.svelte', /<button[^>]*data-aleatoire-playlist/],
    ['src/components/v2/CollectionsV2.svelte', /onclick=\{\(\) => lireCollectionEntiere\(true\)\}/],
    ['src/components/v2/ArtisteServiceV2.svelte', /onclick=\{\(\) => lireDiscographieLocale\(true\)\}/],
    ['src/components/v2/PlaylistCercleV2.svelte', /class="ghost aleatoire-playlist"/],
    ['src/components/v2/FavoritesV2.svelte', /onclick=\{\(\) => lireLesPistes\(true\)\}/],
    ['src/components/v2/SearchV2.svelte', /onclick=\{\(\) => lireTousLesTitres\(true\)\}/],
    ['src/components/v2/MediaServersV2.svelte', /class="pill ghost"[^>]*onclick=\{\(\) => enchainer\(melanger/],
    ['src/components/v2-heritage/PlaylistManagerView.svelte', /class="shuffle-btn"/],
    ['src/components/v2-heritage/SmartPlaylistsView.svelte', /onclick=\{playShuffle\}/],
    ['src/components/v2-heritage/AmbianceView.svelte', /onclick=\{\(\) => playAll\(true\)\}/],
  ];
  for (const [f, ancien] of VUES) {
    it(f.split('/').pop()!, () => {
      const src = lire(f);
      expect(src).toMatch(/<BoutonLectureV2[\s\S]*?aleatoire=\{/);
      expect(src).not.toMatch(ancien);
    });
  }
});

describe('i18n', () => {
  it('« Lecture aléatoire » du menu dans les quinze locales', () => {
    const dir = resolve(process.cwd(), 'src/lib/locales');
    const fichiers = readdirSync(dir).filter((n) => /^[a-z]{2}\.ts$/.test(n));
    expect(fichiers).toHaveLength(15);
    for (const n of fichiers) expect(readFileSync(resolve(dir, n), 'utf-8'), n).toMatch(/"v2\.menu\.shufflePlay": "[^"]+"/);
  });
});
