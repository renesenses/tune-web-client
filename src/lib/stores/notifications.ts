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
  /**
   * #2417 — le détail technique (texte brut du serveur, statut, code),
   * montré seulement dans un « Détails » replié, jamais comme message.
   */
  detail?: string;
  /**
   * Auto-dismiss after this many ms. 0 = persistent. Défaut : 0 pour une
   * erreur (elle reste jusqu'à sa fermeture), 4000 / 3000 pour succès / info.
   */
  duration: number;
  /** Nombre d'occurrences identiques regroupées (« ×2 »). Absent = 1. */
  count?: number;
  /** Bouton d'action optionnel — « Jouer cette version », etc. */
  action?: { label: string; run: () => void };
  /**
   * tune-web-client#2296 — second bouton, celui qui DÉCLINE (« Non »). Une
   * notification qui en porte un est une QUESTION : elle reste affichée
   * jusqu'à la réponse (`duration` 0), et ce bouton la retire.
   */
  refus?: { label: string; run?: () => void };
}

/** Au-delà, les erreurs les plus anciennes se replient (voir le conteneur). */
export const MAX_ERREURS_VISIBLES = 5;

function createStore() {
  const { subscribe, update } = writable<Notification[]>([]);
  let nextId = 1;
  /** Minuteries d'effacement, avec le temps restant pour pouvoir les suspendre. */
  const minuteries = new Map<number, { timer: ReturnType<typeof setTimeout> | null; restant: number; debut: number }>();

  function armer(id: number, ms: number) {
    const m = minuteries.get(id) ?? { timer: null, restant: ms, debut: 0 };
    if (m.timer) clearTimeout(m.timer);
    m.restant = ms;
    m.debut = Date.now();
    m.timer = setTimeout(() => dismiss(id), ms);
    minuteries.set(id, m);
  }

  function push(
    message: string,
    level: NotificationLevel = 'error',
    duration = level === 'error' ? 0 : 5000,
    action?: Notification['action'],
    refus?: Notification['refus'],
    detail?: string,
  ) {
    const d = detail?.trim() && detail.trim() !== message.trim() ? detail.trim() : undefined;
    // Erreurs identiques coup sur coup : une seule, avec un compteur.
    if (level === 'error' && !action && !refus) {
      let existant: number | null = null;
      update((list) =>
        list.map((n) => {
          if (existant === null && n.level === 'error' && !n.action && !n.refus && n.message === message && n.detail === d) {
            existant = n.id;
            return { ...n, count: (n.count ?? 1) + 1, duration };
          }
          return n;
        }),
      );
      if (existant !== null) {
        const dejaPause = minuteries.get(existant)?.timer === null && minuteries.has(existant);
        if (duration > 0) {
          armer(existant, duration);
          if (dejaPause) pause(existant);
        } else {
          dismissMinuterie(existant);
        }
        return existant;
      }
    }
    const id = nextId++;
    update((list) => [...list, { id, level, message, duration, action, refus, ...(d ? { detail: d } : {}) }]);
    if (duration > 0) armer(id, duration);
    return id;
  }

  function dismissMinuterie(id: number) {
    const m = minuteries.get(id);
    if (m?.timer) clearTimeout(m.timer);
    minuteries.delete(id);
  }

  function dismiss(id: number) {
    dismissMinuterie(id);
    update((list) => list.filter((n) => n.id !== id));
  }

  /** Suspend l'effacement automatique (survol, focus). Sans effet si persistante. */
  function pause(id: number) {
    const m = minuteries.get(id);
    if (!m || !m.timer) return;
    clearTimeout(m.timer);
    m.timer = null;
    m.restant = Math.max(0, m.restant - (Date.now() - m.debut));
  }

  /** Reprend l'effacement avec le temps qui restait. */
  function resume(id: number) {
    const m = minuteries.get(id);
    if (!m || m.timer) return;
    armer(id, Math.max(m.restant, 1000));
  }

  return {
    subscribe,
    /** Une erreur reste affichée jusqu'à sa fermeture, sauf durée explicite. */
    error: (msg: string, duration = 0, detail?: string) =>
      push(msg, 'error', duration, undefined, undefined, detail),
    success: (msg: string, duration = 4000) => push(msg, 'success', duration),
    info: (msg: string, duration = 3000, detail?: string) =>
      push(msg, 'info', duration, undefined, undefined, detail),
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
    pause,
    resume,
  };
}

export const notifications = createStore();
