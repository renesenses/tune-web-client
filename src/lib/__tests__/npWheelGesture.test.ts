import { describe, it, expect } from 'vitest';
import { isMiddlePressWheel, NP_MIDDLE_PRESS_GUARD_MS } from '../npWheelGesture';

// MouseEvent.buttons bit field: 1 = left, 2 = right, 4 = middle.
const NONE = 0;
const LEFT = 1;
const RIGHT = 2;
const MIDDLE = 4;

describe('isMiddlePressWheel', () => {
  it('lets a plain scroll through', () => {
    expect(isMiddlePressWheel(NONE, Infinity)).toBe(false);
  });

  it('ignores the rotation emitted while the wheel is held down', () => {
    expect(isMiddlePressWheel(MIDDLE, Infinity)).toBe(true);
  });

  it('ignores the rotation that lands just after the wheel is released', () => {
    // buttons is already back to 0 by then — this is the case the `buttons`
    // check alone misses, and the one that kept #1261 open.
    expect(isMiddlePressWheel(NONE, 0)).toBe(true);
    expect(isMiddlePressWheel(NONE, NP_MIDDLE_PRESS_GUARD_MS - 1)).toBe(true);
  });

  it('lets a deliberate scroll through once the window has elapsed', () => {
    expect(isMiddlePressWheel(NONE, NP_MIDDLE_PRESS_GUARD_MS)).toBe(false);
    expect(isMiddlePressWheel(NONE, 5_000)).toBe(false);
  });

  it('still catches the middle button when another button is held too', () => {
    expect(isMiddlePressWheel(MIDDLE | LEFT, Infinity)).toBe(true);
  });

  it('does not mistake left or right drags for a wheel press', () => {
    expect(isMiddlePressWheel(LEFT, Infinity)).toBe(false);
    expect(isMiddlePressWheel(RIGHT, Infinity)).toBe(false);
    expect(isMiddlePressWheel(LEFT | RIGHT, Infinity)).toBe(false);
  });
});
