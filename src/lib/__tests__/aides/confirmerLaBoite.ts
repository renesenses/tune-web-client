import { vi } from 'vitest';
import { get } from 'svelte/store';
import { dialogs } from '../../stores/dialogs';

/**
 * web#3245 — la croix « Retirer » d'une fiche playlist demande confirmation
 * (`dialogs.confirm`). Les tests qui ne montent pas `DialogContainer` répondent
 * « oui » directement au bus : attend la demande, puis la valide.
 */
export async function confirmerLaBoite(): Promise<string> {
  await vi.waitFor(() => {
    if (get(dialogs).length === 0) throw new Error('aucune confirmation demandée');
  }, { timeout: 5_000, interval: 10 });
  const d = get(dialogs)[0];
  dialogs.settle(d.id, true);
  return d.message;
}
