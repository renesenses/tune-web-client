import { writable } from 'svelte/store';

/**
 * Lightweight global notification bus. Any component can push a toast, and
 * `App.svelte` subscribes to render it. Replaces the previous App-local
 * `showError` by making it reachable from anywhere.
 */

export type NotificationLevel = 'error' | 'info';

export interface Notification {
  id: number;
  level: NotificationLevel;
  message: string;
  /** Auto-dismiss after this many ms (default 5000). 0 = persistent. */
  duration: number;
}

function createStore() {
  const { subscribe, update } = writable<Notification[]>([]);
  let nextId = 1;

  function push(message: string, level: NotificationLevel = 'error', duration = 5000) {
    const id = nextId++;
    update((list) => [...list, { id, level, message, duration }]);
    if (duration > 0) {
      setTimeout(() => {
        update((list) => list.filter((n) => n.id !== id));
      }, duration);
    }
    return id;
  }

  function dismiss(id: number) {
    update((list) => list.filter((n) => n.id !== id));
  }

  return {
    subscribe,
    error: (msg: string, duration = 5000) => push(msg, 'error', duration),
    info: (msg: string, duration = 3000) => push(msg, 'info', duration),
    dismiss,
  };
}

export const notifications = createStore();
