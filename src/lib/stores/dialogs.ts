import { writable } from 'svelte/store';

/**
 * Global dialog bus, mirroring the notifications store: any component can
 * await a confirmation or a text input, and `DialogContainer` (mounted once
 * in App.svelte) renders the modal.
 *
 * Native confirm()/prompt()/alert() never open inside webviews (weblet
 * iOS/macOS, embedded apps) — the click silently does nothing, no message,
 * no console error (#166). These are their drop-in replacements:
 *
 *   if (!(await dialogs.confirm($t('radioFav.confirmClearAll')))) return;
 *   const name = await dialogs.prompt($t('queue.playlistNamePrompt'));
 *   if (name === null) return; // cancelled — same contract as window.prompt
 */

export type DialogKind = 'confirm' | 'prompt';

export interface DialogRequest {
  id: number;
  kind: DialogKind;
  message: string;
  /** Style the validate button as destructive (deletions). */
  danger: boolean;
  /** Initial input value (prompt only). */
  initial: string;
}

interface Pending extends DialogRequest {
  resolve: (value: boolean | string | null) => void;
}

function createStore() {
  // Requests queue up so two concurrent awaiters each get an answer; the
  // container only renders the head of the queue.
  const { subscribe, update } = writable<Pending[]>([]);
  let nextId = 1;

  function push(req: Omit<Pending, 'id'>): number {
    const id = nextId++;
    update((list) => [...list, { ...req, id }]);
    return id;
  }

  /** Container only: answer the request and pop it off the queue. */
  function settle(id: number, value: boolean | string | null) {
    let settled: Pending | undefined;
    update((list) => {
      settled = list.find((r) => r.id === id);
      return list.filter((r) => r.id !== id);
    });
    // Resolve outside the store update so awaiters never run mid-mutation.
    settled?.resolve(value);
  }

  return {
    subscribe,
    settle,
    /** Drop-in for window.confirm(): true = validated, false = cancelled. */
    confirm(message: string, opts: { danger?: boolean } = {}): Promise<boolean> {
      return new Promise<boolean>((resolve) => {
        push({
          kind: 'confirm',
          message,
          danger: opts.danger ?? false,
          initial: '',
          resolve: resolve as (value: boolean | string | null) => void,
        });
      });
    },
    /** Drop-in for window.prompt(): the entered string, or null if cancelled. */
    prompt(message: string, initial = ''): Promise<string | null> {
      return new Promise<string | null>((resolve) => {
        push({
          kind: 'prompt',
          message,
          danger: false,
          initial,
          resolve: resolve as (value: boolean | string | null) => void,
        });
      });
    },
  };
}

export const dialogs = createStore();
