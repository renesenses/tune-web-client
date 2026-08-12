import { describe, it, expect } from 'vitest';
import { needsSourceReload } from './browserAudio';

/**
 * « No sound » (Alex, 0.9.68 Linux) : pause, retour au navigateur, Lecture,
 * silence. Pendant la pause le navigateur lâche la connexion HTTP ; la session
 * de flux serveur est à consommateur unique, donc irrécupérable en cours de
 * route. `audio.play()` sur un élément dans cet état ne rend ni son ni erreur.
 *
 * Ce prédicat décide s'il faut redemander la source au serveur. Il doit être
 * franc dans les deux sens : rater un élément mort laisse le silence, mais
 * recharger un élément sain ferait repartir le morceau du début à chaque pause.
 */
describe('needsSourceReload', () => {
  it('recharge quand il n’y a aucune source', () => {
    expect(needsSourceReload({ src: '', readyState: 0 })).toBe(true);
    expect(needsSourceReload({ readyState: 4 })).toBe(true);
  });

  it('recharge quand l’élément porte une erreur média', () => {
    expect(
      needsSourceReload({ src: '/stream/a.flac', error: { code: 2 }, readyState: 4 })
    ).toBe(true);
  });

  it('recharge quand il ne reste plus une seule donnée (HAVE_NOTHING)', () => {
    expect(needsSourceReload({ src: '/stream/a.flac', readyState: 0 })).toBe(true);
  });

  it('ne recharge PAS une pause courte qui a gardé son tampon', () => {
    // Le cas le plus important à ne pas casser : recharger ici ferait
    // repartir le morceau du début à chaque pause.
    expect(needsSourceReload({ src: '/stream/a.flac', readyState: 4 })).toBe(false);
    expect(needsSourceReload({ src: '/stream/a.flac', readyState: 1 })).toBe(false);
  });

  it('traite un readyState absent comme HAVE_NOTHING', () => {
    expect(needsSourceReload({ src: '/stream/a.flac' })).toBe(true);
  });
});
