/**
 * « Vue album : ajouter Ajouter à la file d'attente, lire à la fin du prochain
 *  morceau. ex qobuz, ajouter les 5 CTA » (Bertrand, 06/09/2026).
 *
 * Un album Qobuz n'offrait que DEUX boutons sur cinq. Le commentaire qui les
 * masquait disait : « Aléatoire et "ajouter à la file" travaillent sur des
 * identifiants de pistes LOCALES ; un album de service n'en a pas ». La
 * prémisse était juste — l'album n'a pas d'`id` — la conclusion, non : chaque
 * PISTE porte sa paire `source` + `source_id`, et `QueueAddRequest` accepte
 * `tracks[]` (lu sur la tête de `tune-server-rust`, `routes/playback.rs`, où
 * toutes les origines convergent vers le même `insert_at`).
 *
 * « Lire ensuite » n'existait nulle part au niveau ALBUM, alors que
 * `corpsDeFile` portait déjà l'argument `position` en documentant que c'est
 * « ce qui distingue lire ensuite d'ajouter à la file ». Écrit, jamais branché.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { corpsDeFileListe } from '../pisteFile';
import type { Track } from '../types';

const lire = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf-8');
function sansCommentaires(src: string): string {
  return src
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}
const p = (o: Partial<Track>) => o as Track;

describe('corpsDeFileListe — une liste, une requête', () => {
  it('des pistes locales partent en track_ids, dans l ordre', () => {
    const c = corpsDeFileListe([p({ id: 3 }), p({ id: 7 }), p({ id: 5 })])!;
    expect(c.track_ids).toEqual([3, 7, 5]);
    expect(c).not.toHaveProperty('tracks');
  });

  it('des pistes de service partent en tracks[], avec leurs métadonnées', () => {
    const c = corpsDeFileListe([
      p({ source: 'qobuz', source_id: 'a1', title: 'Un', artist_name: 'X', duration_ms: 1000 }),
      p({ source: 'qobuz', source_id: 'a2', title: 'Deux', artist_name: 'X' }),
    ])!;
    expect(c.track_ids).toBeUndefined();
    expect(c.tracks).toHaveLength(2);
    // Sans métadonnées, la file affiche une ligne anonyme et l'orchestrateur
    // retombe sur un titre par défaut.
    expect(c.tracks![0]).toMatchObject({ source: 'qobuz', source_id: 'a1', title: 'Un', artist_name: 'X' });
    expect(c.tracks![1].source_id).toBe('a2');
  });

  it('une liste MIXTE porte les deux champs', () => {
    const c = corpsDeFileListe([p({ id: 3 }), p({ source: 'tidal', source_id: 'z' })])!;
    expect(c.track_ids).toEqual([3]);
    expect(c.tracks).toHaveLength(1);
  });

  it('le rang n est écrit que s il est demandé', () => {
    expect(corpsDeFileListe([p({ id: 1 })], 4)!.position).toBe(4);
    expect(corpsDeFileListe([p({ id: 1 })])).not.toHaveProperty('position');
    // Rang 0 est un rang : le confondre avec « pas de rang » enverrait en fin
    // de file ce qui devait passer en tête.
    expect(corpsDeFileListe([p({ id: 1 })], 0)!.position).toBe(0);
  });

  it('les pistes non désignables sont ÉCARTÉES, pas envoyées vides', () => {
    const c = corpsDeFileListe([p({ id: 3 }), p({ title: 'orpheline' })])!;
    expect(c.track_ids).toEqual([3]);
    expect(c.tracks).toBeUndefined();
  });

  it('aucune piste désignable rend null, pas une requête vide', () => {
    // Le serveur refuserait avec « track_ids, track_id, source+source_id, or
    // tracks[] required » : autant ne rien envoyer.
    expect(corpsDeFileListe([])).toBeNull();
    expect(corpsDeFileListe([p({ title: 'rien' })])).toBeNull();
  });
});

describe('les cinq actions de la fiche album', () => {
  const src = sansCommentaires(lire('src/components/v2/AlbumDetailV2.svelte'));

  it.each([
    ['v2.album.play', 'Lire'],
    ['v2.album.shuffle', 'Aléatoire'],
    ['v2.album.playNext', 'Lire ensuite'],
    ['v2.album.addQueue', 'Ajouter à la file'],
  ])('%s est présente', (cle) => { expect(src).toContain(cle); });

  it('le cœur reste la cinquième', () => {
    expect(src).toContain('class="ghost coeur"');
  });

  it("aucune n'est masquée parce que l'album vient d'un service", () => {
    // 🔴 La garde qui compte. `{#if !service}` autour des boutons de file est
    // exactement le défaut signalé.
    expect(src).not.toMatch(/\{#if !service\}/);
  });

  it('« Lire ensuite » insère au rang SUIVANT celui qui joue', () => {
    // Sans rang, la route ajoute en fin de file — ce serait le bouton d'à côté.
    expect(src).toMatch(/lireEnsuite = \(\) => enfiler\(get\(queuePosition\) \+ 1,/);
    expect(src).toMatch(/addQueue = \(\) => enfiler\(undefined,/);
  });

  it("l'album LOCAL part par son identifiant, pas par ses pistes", () => {
    // Le serveur applique alors le rattrapage de la ligne sœur ; résoudre les
    // pistes ici l'ignore, et l'album s'ajoutait VIDE (Pascal, v0.9.21).
    expect(src).toMatch(/album_id: album\.id, \.\.\.\(position != null \? \{ position \} : \{\}\)/);
  });

  it('UNE requête, jamais une boucle par piste', () => {
    // Une boucle `for (…) await addToQueue(…)` avec un rang décale chaque
    // insertion suivante : l'ordre de l'album s'inverse.
    const i = src.indexOf('async function enfiler(');
    const bloc = src.slice(i, src.indexOf('const addQueue'));
    expect(bloc.match(/addToQueue\(/g)).toHaveLength(1);
    expect(bloc).not.toMatch(/for \(/);
  });

  it('l aléatoire vaut aussi pour les services et Bandcamp', () => {
    expect(src).toMatch(/if \(service \|\| bandcamp\) \{/);
    const i = src.indexOf('if (service || bandcamp) {');
    const bloc = src.slice(i, i + 500);
    expect(bloc, 'la tête joue').toContain('playAndSync(zid, tete as any)');
    expect(bloc, 'le reste s empile en une fois').toContain('corpsDeFileListe(l.slice(1))');
  });

  it('un double clic ne double pas la file', () => {
    expect(src).toContain('disabled={fileOccupee}');
  });
});
