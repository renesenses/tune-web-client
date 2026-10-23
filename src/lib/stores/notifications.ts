import { writable } from 'svelte/store';

/**
 * Lightweight global notification bus. Any component can push a toast, and
 * `App.svelte` subscribes to render it. Replaces the previous App-local
 * `showError` by making it reachable from anywhere.
 */

export type NotificationLevel = 'error' | 'info' | 'success';

export interface Notification {
  id: number;
  level: NotificationLevel;
  message: string;
  /** Auto-dismiss after this many ms (default 5000). 0 = persistent. */
  duration: number;
  /** Bouton d'action optionnel — « Jouer cette version », etc. */
  action?: { label: string; run: () => void };
  /**
   * tune-web-client#2296 — second bouton, celui qui DÉCLINE (« Non »). Une
   * notification qui en porte un est une QUESTION : elle reste affichée
   * jusqu'à la réponse (`duration` 0), et ce bouton la retire.
   */
  refus?: { label: string; run?: () => void };
}

function createStore() {
  const { subscribe, update } = writable<Notification[]>([]);
  let nextId = 1;

  function push(
    message: string,
    level: NotificationLevel = 'error',
    duration = 5000,
    action?: Notification['action'],
    refus?: Notification['refus'],
  ) {
    const id = nextId++;
    update((list) => [...list, { id, level, message, duration, action, refus }]);
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
    success: (msg: string, duration = 4000) => push(msg, 'success', duration),
    info: (msg: string, duration = 3000) => push(msg, 'info', duration),
    /** Toast avec bouton d'action — reste plus longtemps qu'une info. */
    withAction: (msg: string, label: string, run: () => void, duration = 10000) =>
      push(msg, 'info', duration, { label, run }),
    /**
     * tune-web-client#2296 — une question Oui / Non : elle ne disparaît pas
     * d'elle-même (le lecteur CD peut être dans une autre pièce que l'écran),
     * seulement à la réponse ou par `dismiss`.
     */
    question: (msg: string, oui: string, run: () => void, non: string, siNon?: () => void) =>
      push(msg, 'info', 0, { label: oui, run }, { label: non, run: siNon }),
    dismiss,
  };
}

export const notifications = createStore();
