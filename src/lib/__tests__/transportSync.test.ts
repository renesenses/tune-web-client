import { describe, it, expect } from 'vitest';
import { transportOf, mergeTransport } from '../transportSync';

describe('transportOf', () => {
  it('lit la répétition et l\'aléatoire d\'un instantané WebSocket', () => {
    expect(transportOf({ id: 4, repeat: 'one', shuffle: true })).toEqual({
      repeat: 'one',
      shuffle: true,
    });
  });

  it('ne retient que les trois modes que le serveur sait produire', () => {
    expect(transportOf({ repeat: 'off' }).repeat).toBe('off');
    expect(transportOf({ repeat: 'all' }).repeat).toBe('all');
    expect(transportOf({ repeat: 'One' }).repeat).toBeUndefined();
    expect(transportOf({ repeat: true }).repeat).toBeUndefined();
  });

  it('reste muet sur une charge utile REST, qui ne porte pas ces champs', () => {
    // C'est le cœur du défaut : /zones et /zones/{id} ne renvoient ni repeat
    // ni shuffle. Les lire comme « éteint » remettrait le mensonge en place.
    expect(transportOf({ id: 4, name: 'Salon', state: 'playing' })).toEqual({});
    expect(transportOf(null)).toEqual({});
    expect(transportOf(undefined)).toEqual({});
  });
});

describe('mergeTransport', () => {
  it('un instantané muet laisse en place ce que l\'on savait déjà', () => {
    const connu = { repeat: 'one' as const, shuffle: false };
    expect(mergeTransport(connu, { id: 4, state: 'playing' })).toEqual(connu);
  });

  it('un instantané qui parle fait autorité', () => {
    expect(mergeTransport({ repeat: 'one', shuffle: false }, { repeat: 'off' })).toEqual({
      repeat: 'off',
      shuffle: false,
    });
  });

  it('part de rien sans se plaindre', () => {
    expect(mergeTransport(undefined, { repeat: 'all' })).toEqual({ repeat: 'all' });
    expect(mergeTransport(undefined, {})).toEqual({});
  });

  it('un `shuffle: false` est une valeur, pas une absence', () => {
    expect(mergeTransport({ shuffle: true }, { shuffle: false })).toEqual({ shuffle: false });
  });
});
