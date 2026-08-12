import { describe, it, expect } from 'vitest';
import { get } from 'svelte/store';
import { queueTracks, queuePosition, upNextCount, upNextMs } from './queue';
import type { Track } from '../types';

const t = (duration_ms?: number): Track => ({ id: 1, title: 'x', duration_ms }) as Track;

function setQueue(tracks: Track[], position: number) {
  queueTracks.set(tracks);
  queuePosition.set(position);
}

/**
 * Suggestion de Dominique COMET (fil forum « File d'attente, le nombre de
 * pistes reste figé ») : savoir ce qu'il reste à entendre, en titres et en
 * temps, plutôt qu'un total qui ne bouge jamais.
 *
 * Le calcul vivait en double exemplaire potentiel — inline dans QueueView, et
 * à écrire pour l'écran Lecture en cours. Ces tests couvrent l'unique version.
 */
describe('résumé « à suivre »', () => {
  const queue = [t(200_000), t(180_000), t(120_000)];

  it('ne compte que les titres APRÈS celui qui joue', () => {
    setQueue(queue, 0);
    expect(get(upNextCount)).toBe(2);
    expect(get(upNextMs)).toBe(180_000 + 120_000);
  });

  it('tombe à zéro sur le dernier titre', () => {
    setQueue(queue, 2);
    expect(get(upNextCount)).toBe(0);
    expect(get(upNextMs)).toBe(0);
  });

  it('ne descend jamais sous zéro sur une position hors bornes', () => {
    // Position non initialisée ou file remplacée sous les pieds du composant.
    setQueue(queue, 9);
    expect(get(upNextCount)).toBe(0);
    setQueue(queue, -1);
    expect(get(upNextCount)).toBe(3);
  });

  it('compte une piste sans durée connue pour zéro plutôt que d’inventer', () => {
    // Radio / flux : mieux vaut un temps un peu court qu'une durée fabriquée.
    setQueue([t(60_000), t(undefined), t(30_000)], 0);
    expect(get(upNextMs)).toBe(30_000);
  });

  it('rend zéro sur une file vide', () => {
    setQueue([], 0);
    expect(get(upNextCount)).toBe(0);
    expect(get(upNextMs)).toBe(0);
  });
});
