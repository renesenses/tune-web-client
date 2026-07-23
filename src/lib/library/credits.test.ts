import { describe, it, expect } from 'vitest';
import { groupCreditsByRole, uniqueInstruments } from './credits';
import type { TrackCredit } from '../types';

function credit(partial: Partial<TrackCredit>): TrackCredit {
  return {
    id: null,
    track_id: 1,
    artist_id: null,
    artist_name: 'X',
    role: '',
    instrument: null,
    position: 0,
    ...partial,
  };
}

describe('groupCreditsByRole', () => {
  it('groups by role and preserves order within a role', () => {
    const credits = [
      credit({ artist_name: 'Miles', role: 'performer' }),
      credit({ artist_name: 'Bill', role: 'composer' }),
      credit({ artist_name: 'Paul', role: 'performer' }),
    ];
    const grouped = groupCreditsByRole(credits);
    expect(Object.keys(grouped).sort()).toEqual(['composer', 'performer']);
    expect(grouped.performer.map(c => c.artist_name)).toEqual(['Miles', 'Paul']);
    expect(grouped.composer.map(c => c.artist_name)).toEqual(['Bill']);
  });

  it('defaults a missing/empty role to "performer"', () => {
    const grouped = groupCreditsByRole([credit({ role: '' })]);
    expect(Object.keys(grouped)).toEqual(['performer']);
    expect(grouped.performer).toHaveLength(1);
  });

  it('returns an empty object for no credits', () => {
    expect(groupCreditsByRole([])).toEqual({});
  });
});

describe('uniqueInstruments', () => {
  it('returns distinct instruments sorted alphabetically', () => {
    const credits = [
      credit({ instrument: 'Trumpet' }),
      credit({ instrument: 'Bass' }),
      credit({ instrument: 'Trumpet' }),
    ];
    expect(uniqueInstruments(credits)).toEqual(['Bass', 'Trumpet']);
  });

  it('ignores credits without an instrument', () => {
    const credits = [credit({ instrument: null }), credit({ instrument: 'Drums' })];
    expect(uniqueInstruments(credits)).toEqual(['Drums']);
  });

  it('returns an empty array when no instruments are present', () => {
    expect(uniqueInstruments([credit({}), credit({})])).toEqual([]);
  });
});
