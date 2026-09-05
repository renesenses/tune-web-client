import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const lire = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf-8');
const sansCommentaires = (s: string) =>
  s.replace(/<!--[\s\S]*?-->/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

describe('Retours Bertrand du 05/09/2026', () => {
  const pod = sansCommentaires(lire('src/components/v2/PodcastsV2.svelte'));
  const str = sansCommentaires(lire('src/components/v2/StreamingV2.svelte'));

  it('Podcasts : « Sélection » disparaît hors de France', () => {
    // Elle lit `/podcasts/discover`, qui ignore le pays — mesuré sur le .18,
    // réponse identique pour `fr` et `us`. La laisser visible, c'était servir
    // du français sous un drapeau américain (issue serveur #3395).
    expect(pod).toContain("const selectionDisponible = $derived(pays === 'fr')");
    expect(pod).toContain("{#if section === 'selection' && selectionDisponible}");
    // Et l'onglet lui-même n'est plus proposé.
    expect(pod).toMatch(/\{#if selectionDisponible\}\s*\n\s*<button class:on=\{section === 'selection'\}/);
  });

  it('Podcasts : changer de pays depuis la Sélection MÈNE quelque part', () => {
    // Sinon on resterait sur un volet vide, ce qui se lit comme une panne.
    expect(pod).toContain("if (!selectionDisponible && section === 'selection') section = 'populaires'");
  });

  it('Streaming : le titre d’une vignette est cliquable', () => {
    // On ne fige pas l'ORDRE des attributs : le titre en porte un de plus
    // depuis que les étiquettes élidées annoncent leur texte complet.
    expect(str).toMatch(/<button class="ct"[^>]*onclick=\{ouvre \?\? onPlay\}>/);
    // Et la playlist a désormais un geste d'ouverture propre.
    expect(str).toContain('fichePlaylist = p');
    expect(str).toContain("kind: 'streaming'");
  });

  it('Bandcamp : un album s’OUVRE au lieu de lancer l’extrait', () => {
    expect(str).toContain("if (type === 'album' && svc === BANDCAMP && p?.url)");
    expect(str).toContain('<AlbumDetailV2 album={ficheBc} bandcamp={ficheBc.url}');
    const det = sansCommentaires(lire('src/components/v2/AlbumDetailV2.svelte'));
    expect(det).toContain('api.bandcampAlbum(bc)');
    // Chaque piste Bandcamp porte son propre flux : il n'y a pas d'album à
    // désigner au serveur.
    expect(det).toContain('if (bandcamp) {');
    expect(det).toContain('file_path: t.file_path');
  });

  it('Bandcamp : les genres ont QUITTÉ « Découvrir »', () => {
    // Les mêmes puces vivaient dans les deux volets, sur le même état : deux
    // surfaces pour un seul geste, et l'onglet Genres n'avait plus de raison
    // d'être.
    const editorial = str.slice(str.indexOf("{:else if sub === 'editorial'}"), str.indexOf("{:else if sub === 'mine'}"));
    expect(editorial).toContain('bcDecouverte');
    expect(editorial).not.toContain('bcGenres');
    expect(editorial).not.toContain('bcTag = g.slug');
    // L'onglet Genres, lui, les garde.
    const genres = str.slice(str.indexOf("{:else if sub === 'genres' && isBc}"));
    expect(genres).toContain('bcTag = g.slug');
  });

  it('Bandcamp : « Découvrir » ne demande aucun genre au serveur', () => {
    expect(str).toContain("api.bandcampDiscover(undefined, 'top', 0)");
    // `tag=` vide n'est pas la même chose que pas de `tag` : un paramètre posé
    // avec une valeur qui n'en est pas une remettrait le serveur sur l'autre
    // chemin.
    const api = sansCommentaires(lire('src/lib/api.ts'));
    expect(api).toContain('export function bandcampDiscover(tag?: string');
    expect(api).toContain("if (tag) p.set('tag', tag)");
  });

  it('les deux volets Bandcamp ne partagent plus d’état', () => {
    expect(str).toContain("if (view === 'editorial') {");
    expect(str).toContain("} else if (view === 'genres') {");
    expect(str).not.toContain("if (view === 'editorial' || view === 'genres')");
  });
});
