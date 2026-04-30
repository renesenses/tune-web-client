import { notifications } from './stores/notifications';

export interface AsyncOpOptions<T> {
  /** Phrase shown while running (notification reste visible jusqu'à la fin). */
  pending: string;
  /** Async work. */
  run: () => Promise<T>;
  /**
   * Construit le message de succès. Reçoit le résultat brut.
   * Si tu retournes `null`, aucune notification success n'est émise
   * (utile quand l'appelant gère son propre feedback).
   */
  success?: (result: T) => string | null;
  /** Préfixe du message d'erreur. Défaut "Erreur". */
  errorPrefix?: string;
  /** Toggle un flag externe pendant l'opération. */
  setRunning?: (running: boolean) => void;
}

/**
 * Wrap une opération async avec :
 *   - flag de course on/off,
 *   - notification info "en cours" (sticky jusqu'à dismiss),
 *   - notification success/error en sortie,
 *   - return du résultat ou rethrow.
 *
 * Remplace la dizaine de blocs try/catch identiques dans MetadataView.
 */
export async function runAsyncOp<T>(opts: AsyncOpOptions<T>): Promise<T | undefined> {
  opts.setRunning?.(true);
  const tid = notifications.info(opts.pending, 0);
  try {
    const result = await opts.run();
    notifications.dismiss(tid);
    if (opts.success) {
      const msg = opts.success(result);
      if (msg !== null) notifications.success(msg);
    }
    return result;
  } catch (e: any) {
    notifications.dismiss(tid);
    notifications.error(`${opts.errorPrefix ?? 'Erreur'} : ${e?.message || e}`);
    return undefined;
  } finally {
    opts.setRunning?.(false);
  }
}
