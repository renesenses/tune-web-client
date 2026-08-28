import { describe, expect, it } from 'vitest';
import { transportDeLEvenement } from '../transportSync';

/**
 * L'aléatoire changé PAR QUELQU'UN D'AUTRE doit se voir ici (#2092).
 *
 * Le serveur annonce chaque bascule en direct : `set_shuffle()` émet un
 * `PlaybackEvent { event: "shuffle", data: { enabled } }`
 * (`tune-core/src/playback/mod.rs:720`), que `routes/ws.rs:181` préfixe en
 * `playback.shuffle` et complète avec `zone_id`. Idem pour la répétition
 * (`playback.repeat`, `{ mode }`).
 *
 * Le client ne les lisait pas. Une seconde télécommande — l'application
 * mobile, une autre fenêtre, Siri, le widget — pouvait donc allumer
 * l'aléatoire sans que l'écran ouvert en face bouge d'un pixel, et il le
 * restait jusqu'au prochain rechargement.
 *
 * ⚠️ La forme n'est PAS celle d'une zone : l'événement dit `enabled` /
 * `mode`, la charge utile de zone dit `shuffle` / `repeat`. C'est cette
 * traduction qui est testée ici — la brancher à l'envers rendrait un
 * `transportOf()` vide et le correctif ne ferait rien du tout, en silence.
 */
describe('transportDeLEvenement', () => {
  it('traduit playback.shuffle en `shuffle`', () => {
    expect(transportDeLEvenement('playback.shuffle', { enabled: true, zone_id: 4 })).toEqual({
      zoneId: 4,
      transport: { shuffle: true },
    });
  });

  it('porte aussi bien l’extinction que l’allumage', () => {
    expect(transportDeLEvenement('playback.shuffle', { enabled: false, zone_id: 4 })).toEqual({
      zoneId: 4,
      transport: { shuffle: false },
    });
  });

  it('traduit playback.repeat en `repeat`', () => {
    expect(transportDeLEvenement('playback.repeat', { mode: 'all', zone_id: 1 })).toEqual({
      zoneId: 1,
      transport: { repeat: 'all' },
    });
  });

  it('ignore les autres événements de lecture', () => {
    expect(transportDeLEvenement('playback.started', { zone_id: 1 })).toBeNull();
    expect(transportDeLEvenement('zone.updated', { zone_id: 1 })).toBeNull();
  });

  it('exige un zone_id numérique — sans lui on ne sait pas qui recaler', () => {
    expect(transportDeLEvenement('playback.shuffle', { enabled: true })).toBeNull();
    expect(transportDeLEvenement('playback.shuffle', { enabled: true, zone_id: '4' })).toBeNull();
  });

  it('refuse une valeur du mauvais type plutôt que d’inventer un état', () => {
    // Un `enabled` absent ne veut pas dire « éteint » : écrire `false` ici
    // remettrait très exactement le mensonge de #2092 en place.
    expect(transportDeLEvenement('playback.shuffle', { zone_id: 4 })).toBeNull();
    expect(transportDeLEvenement('playback.repeat', { mode: 'parfois', zone_id: 4 })).toBeNull();
  });

  it('survit à une charge utile absente', () => {
    expect(transportDeLEvenement('playback.shuffle', null)).toBeNull();
    expect(transportDeLEvenement('playback.shuffle', undefined)).toBeNull();
  });
});
