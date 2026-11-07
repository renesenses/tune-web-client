/**
 * Contrôle parental, étape 2 (tune-server-rust#7974, application #8046) : la
 * lecture d'un profil supervisé est refusée hors de ses plages horaires ou
 * quand son budget d'écoute est épuisé.
 *
 *   403 { error: "parental_lease_refused", code: "parental_lease_refused",
 *         reason: "hors_plage" | "budget_quotidien_epuise"
 *               | "budget_hebdomadaire_epuise" | "politique_illisible",
 *         message: <phrase du serveur, dans la langue de la requête> }
 *
 * Le serveur ne donne pas d'heure de reprise : on n'en invente pas.
 */
import { get } from 'svelte/store';
import { t } from './i18n';

export const CODE_REFUS_PARENTAL = 'parental_lease_refused';

const CLES: Record<string, string> = {
  hors_plage: 'parental.refus.outsideHours',
  budget_quotidien_epuise: 'parental.refus.dailyBudget',
  budget_hebdomadaire_epuise: 'parental.refus.weeklyBudget',
  politique_illisible: 'parental.refus.unreadable',
};

/**
 * La phrase du refus dans la langue de l'interface, ou `null` si l'erreur n'est
 * pas ce refus. Une raison inconnue (serveur plus récent) donne la phrase
 * générale « Lecture non permise », jamais le code brut.
 */
export function messageRefusParental(
  code: unknown,
  corps: unknown,
  tr: (cle: string) => string = get(t) as (cle: string) => string,
): string | null {
  const c = (corps && typeof corps === 'object' ? (corps as Record<string, unknown>) : {});
  if (code !== CODE_REFUS_PARENTAL && c.code !== CODE_REFUS_PARENTAL) return null;
  const cle = typeof c.reason === 'string' ? CLES[c.reason] : undefined;
  return tr(cle ?? 'parental.refus.generic');
}
