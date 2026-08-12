import { describe, it, expect } from 'vitest';
import { get } from 'svelte/store';
import { dialogs } from './dialogs';

// The store is the socle of the native-dialogs chantier (#424): every
// converted call site relies on these exact contracts, so they are pinned
// here before any conversion happens.

describe('dialogs store', () => {
  it('confirm resolves true when settled with true', async () => {
    const p = dialogs.confirm('sure?');
    const [req] = get(dialogs);
    expect(req.kind).toBe('confirm');
    expect(req.message).toBe('sure?');
    expect(req.danger).toBe(false);
    dialogs.settle(req.id, true);
    await expect(p).resolves.toBe(true);
    expect(get(dialogs)).toHaveLength(0);
  });

  it('confirm resolves false when cancelled — same contract as window.confirm', async () => {
    const p = dialogs.confirm('sure?');
    const [req] = get(dialogs);
    dialogs.settle(req.id, false);
    await expect(p).resolves.toBe(false);
  });

  it('confirm carries the danger flag through', () => {
    void dialogs.confirm('delete all?', { danger: true });
    const [req] = get(dialogs);
    expect(req.danger).toBe(true);
    dialogs.settle(req.id, false);
  });

  it('prompt resolves the entered string', async () => {
    const p = dialogs.prompt('name?', 'default');
    const [req] = get(dialogs);
    expect(req.kind).toBe('prompt');
    expect(req.initial).toBe('default');
    dialogs.settle(req.id, 'Jazz du soir');
    await expect(p).resolves.toBe('Jazz du soir');
  });

  it('prompt resolves null when cancelled — same contract as window.prompt', async () => {
    const p = dialogs.prompt('name?');
    const [req] = get(dialogs);
    dialogs.settle(req.id, null);
    await expect(p).resolves.toBeNull();
  });

  it('serializes concurrent requests: each awaiter gets its own answer', async () => {
    const p1 = dialogs.confirm('first?');
    const p2 = dialogs.confirm('second?');
    const list = get(dialogs);
    expect(list).toHaveLength(2);
    // Settle head first (the container only ever shows the head).
    dialogs.settle(list[0].id, true);
    dialogs.settle(list[1].id, false);
    await expect(p1).resolves.toBe(true);
    await expect(p2).resolves.toBe(false);
    expect(get(dialogs)).toHaveLength(0);
  });

  it('settling an unknown id is a no-op and leaves the queue intact', async () => {
    const p = dialogs.confirm('still there?');
    const [req] = get(dialogs);
    dialogs.settle(999999, true);
    expect(get(dialogs)).toHaveLength(1);
    dialogs.settle(req.id, true);
    await expect(p).resolves.toBe(true);
  });
});
