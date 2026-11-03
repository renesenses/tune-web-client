// @vitest-environment jsdom
//
// tune-server-rust#7096 — « Les vignettes rectangulaires restent rognées
// malgré l'annonce de correctif » (FabienM, fil 2379, rc8 ; alec_eiffel, fil
// 2528, rc8.1). Le correctif web#2353 ne s'appliquait pas dès qu'une tuile
// passait des initiales de repli (`fallbackInitials`), prises pour la marque
// d'une photo d'artiste. La tuile de Streaming (Éditorial Qobuz, playlists du
// genre, recherche) en passe : l'illustration y restait recadrée. Le
// Gestionnaire de playlists n'en passe pas : c'est le seul endroit où Fabien
// la voyait entière (réponse 9294).
//
// Le composant est MONTÉ ; l'évènement `load` de son `<img>` est déclenché
// avec le format que le navigateur aurait lu.
//
// ⛔ Ce témoin n'établit pas le rendu dans un navigateur réel : jsdom n'a pas
// de mise en page. Il établit la décision du composant.
import { afterEach, describe, expect, it } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import AlbumArt from '../../components/partages/AlbumArt.svelte';

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

const source = (chemin: string) =>
  readFileSync(resolve(__dirname, '../../components', chemin), 'utf-8');

describe('#7096 — illustration rectangulaire dans une tuile qui a des initiales de repli', () => {
  it('la tuile de Streaming (initiale du titre) montre l\'illustration Qobuz entière', () => {
    poser({
      coverPath: 'https://static.qobuz.com/images/playlists/rectangle.jpg',
      size: 0,
      vignette: true,
      source: 'qobuz',
      fallbackInitials: 'H',
    });
    const img = charger(1200, 600);
    expect(img.classList.contains('entiere')).toBe(true);
  });

  it('une photo d\'artiste déclarée (`recadrer`) garde le recadrage', () => {
    poser({ coverPath: 'https://example.org/artiste.jpg', size: 0, fallbackInitials: 'JT', recadrer: true });
    const img = charger(1600, 900);
    expect(img.classList.contains('entiere')).toBe(false);
  });

  it('une pochette carrée avec initiales garde le recadrage', () => {
    poser({ coverPath: 'https://static.qobuz.com/images/covers/carre.jpg', size: 0, fallbackInitials: 'M' });
    const img = charger(600, 600);
    expect(img.classList.contains('entiere')).toBe(false);
  });

  it('la tuile de Streaming ne se déclare pas photo ; ses portraits d\'artistes, si', () => {
    const streaming = source('v2/StreamingV2.svelte');
    const tuile = streaming.slice(streaming.indexOf('{#snippet tile('));
    const pochetteDeTuile = tuile.slice(tuile.indexOf('<AlbumArt'), tuile.indexOf('/>', tuile.indexOf('<AlbumArt')));
    expect(pochetteDeTuile).toContain('fallbackInitials');
    expect(pochetteDeTuile).not.toMatch(/\brecadrer\b/);
    expect(streaming).toMatch(/<AlbumArt coverPath=\{ar\.image_path \?\? ar\.picture \?\? null\}[^>]*\brecadrer\b/);
  });

  it('les portraits d\'artistes non ronds se déclarent photo', () => {
    expect(source('v2/ArtistesV2.svelte')).toMatch(/<AlbumArt coverPath=\{a\.image_path\}[^>]*\brecadrer\b/);
    expect(source('v2/EnTeteArtiste.svelte')).toMatch(/<AlbumArt coverPath=\{imagePath\}[^>]*\brecadrer\b/);
    expect(source('v2/FavoritesV2.svelte')).toMatch(/<AlbumArt coverPath=\{a\.image_path \?\? null\}[^>]*\brecadrer\b/);
    expect(source('v2/EtiquettesV2.svelte')).toMatch(/<AlbumArt coverPath=\{ar\.image_path \?\? null\}[^>]*\brecadrer\b/);
    const recherche = source('v2/SearchV2.svelte');
    expect(recherche.match(/<AlbumArt coverPath=\{(?:a|ar)\.image_path[^>]*\brecadrer\b/g)?.length).toBe(3);
  });
});
