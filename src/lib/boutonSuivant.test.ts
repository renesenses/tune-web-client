import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { suivantDesactive } from './boutonSuivant';

/**
 * Contre-épreuve de la garde du bouton « Piste suivante »
 * (renesenses/tune-server-rust#2337).
 *
 * La règle de référence n'est pas une opinion d'interface : c'est
 * `PositionPoller::next_position_manual` (`tune-core/src/poller.rs`), la SEULE
 * décision « y a-t-il une suite ? » du serveur. Le bouton doit être désactivé
 * exactement quand cette fonction rendrait `None`. Chaque cas ci-dessous cite
 * la branche serveur qu'il reproduit.
 */

const base = {
  playState: 'playing' as const,
  aUnePiste: true,
  ytActive: false,
  upNextCount: 0,
  repeat: 'off' as const,
  shuffle: false,
};

describe('suivantDesactive — file séquentielle (aléatoire éteint)', () => {
  it('désactive sur la dernière piste, répétition éteinte', () => {
    // poller.rs : RepeatMode::Off, position + 1 >= queue_length → None.
    // Le cas signalé par FabienM (fil 1535) : un seul titre en file.
    expect(suivantDesactive({ ...base, upNextCount: 0 })).toBe(true);
  });

  it('laisse actif tant qu\'il reste un titre après', () => {
    expect(suivantDesactive({ ...base, upNextCount: 1 })).toBe(false);
  });

  it('laisse actif en répétition « all » même sans suite immédiate', () => {
    // poller.rs : RepeatMode::All → (position + 1) % queue_length, jamais None.
    expect(suivantDesactive({ ...base, upNextCount: 0, repeat: 'all' })).toBe(false);
  });

  it('laisse actif en répétition « one » sur la dernière piste', () => {
    // Piège principal du ticket : un saut MANUEL ignore repeat-one et le traite
    // comme repeat-all (#1110), donc il reboucle au lieu de s'arrêter —
    // `next_position_manual_repeat_one_wraps_at_end` le prouve côté serveur.
    expect(suivantDesactive({ ...base, upNextCount: 0, repeat: 'one' })).toBe(false);
  });
});

describe('suivantDesactive — aléatoire actif', () => {
  it('désactive à la fin RÉELLE du tirage, même loin de la fin brute', () => {
    // La file visible ne suffit pas : il reste trois positions brutes, mais le
    // serveur sait que la permutation est épuisée.
    expect(
      suivantDesactive({
        ...base,
        upNextCount: 3,
        shuffle: true,
        canSkipNext: false,
      }),
    ).toBe(true);
  });

  it('reste actif sur la dernière position BRUTE si le tirage a une suite', () => {
    expect(
      suivantDesactive({
        ...base,
        upNextCount: 0,
        shuffle: true,
        canSkipNext: true,
      }),
    ).toBe(false);
  });

  it('NE désactive PAS sur la dernière piste de l\'ordre BRUT', () => {
    // Le défaut corrigé ici. Sous aléatoire, le serveur ne suit pas l'ordre
    // brut de la file mais `shuffle_order` : la suite dépend de
    // `shuffle_index + 1 < shuffle_order.len()`, pas de la position brute.
    // `upNextCount` compte pourtant en ordre brut. La piste rangée en dernier
    // dans la file tombe au milieu du tirage une fois sur deux : le bouton
    // s'éteignait alors qu'il restait des titres à jouer.
    //
    // Le client ne reçoit ni `shuffle_order` ni `shuffle_index` (`zones.rs`
    // n'expose que `shuffle` et `repeat`) : il ne peut pas trancher, donc il
    // ne coupe pas un bouton qui marche.
    expect(suivantDesactive({ ...base, upNextCount: 0, shuffle: true })).toBe(false);
  });

  it('reste actif au milieu du tirage', () => {
    expect(suivantDesactive({ ...base, upNextCount: 3, shuffle: true })).toBe(false);
  });
});

describe('suivantDesactive — contrat serveur prioritaire', () => {
  it('ne laisse pas playState réactiver un bouton sans suite', () => {
    expect(
      suivantDesactive({
        ...base,
        playState: 'playing',
        upNextCount: 12,
        shuffle: true,
        canSkipNext: false,
      }),
    ).toBe(true);
  });

  it('conserve le repli historique quand le serveur ne porte pas le champ', () => {
    expect(suivantDesactive({ ...base, upNextCount: 0 })).toBe(true);
    expect(suivantDesactive({ ...base, upNextCount: 2 })).toBe(false);
  });
});

describe('le contrat autoritaire est branché sur les deux surfaces', () => {
  for (const composant of ['TransportBar.svelte', 'MiniPlayer.svelte']) {
    it(`${composant} transmet can_skip_next à la règle partagée`, () => {
      const source = readFileSync(resolve(__dirname, `../components/${composant}`), 'utf8');
      expect(source).toMatch(/canSkipNext:\s*zone\?\.can_skip_next/);
    });
  }
});

describe('suivantDesactive — cas hors file', () => {
  it('désactive à l\'arrêt, sans piste et sans YouTube', () => {
    expect(
      suivantDesactive({ ...base, playState: 'stopped', aUnePiste: false, upNextCount: 2 }),
    ).toBe(true);
  });

  it('laisse actif quand une vidéo YouTube pilote sa propre suite', () => {
    // L'iframe gère son enchaînement : la file de zone ne la décrit pas.
    expect(suivantDesactive({ ...base, upNextCount: 0, ytActive: true })).toBe(false);
  });

  it('laisse actif à l\'arrêt si une piste est chargée et qu\'il reste une suite', () => {
    expect(
      suivantDesactive({ ...base, playState: 'stopped', aUnePiste: true, upNextCount: 2 }),
    ).toBe(false);
  });
});
