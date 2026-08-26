import { describe, expect, it } from 'vitest';
import { fullVolumeConfirmationRequired } from './audiophileSafety';

describe('confirmation avant un volume à 100 % (#2445)', () => {
  it('protège l’activation de PURE quand le verrou est armé', () => {
    expect(
      fullVolumeConfirmationRequired('audiophile', {
        audiophileEnabled: false,
        volumeLockEnabled: true,
      }),
    ).toBe(true);
  });

  it('laisse immédiates les opérations qui ne peuvent pas monter le volume', () => {
    expect(
      fullVolumeConfirmationRequired('audiophile', {
        audiophileEnabled: false,
        volumeLockEnabled: false,
      }),
    ).toBe(false);
    expect(
      fullVolumeConfirmationRequired('audiophile', {
        audiophileEnabled: true,
        volumeLockEnabled: true,
      }),
    ).toBe(false);
    expect(
      fullVolumeConfirmationRequired('volume-lock', {
        audiophileEnabled: true,
        volumeLockEnabled: true,
      }),
    ).toBe(false);
  });

  it('protège tout armement du verrou global, même avant PURE', () => {
    expect(
      fullVolumeConfirmationRequired('volume-lock', {
        audiophileEnabled: false,
        volumeLockEnabled: false,
      }),
    ).toBe(true);
  });
});
