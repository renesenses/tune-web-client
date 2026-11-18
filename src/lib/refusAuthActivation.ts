/**
 * Refus « depuis cette machine seulement » (`403 auth_required`, motif
 * `not_local` ou `port80_relay`) : relier ou délier un compte, poser ou
 * retirer une licence, la télémétrie, le support, les envois à la
 * communauté… quand l'authentification est coupée et que l'appel vient d'un
 * autre appareil — ou d'un compte non administrateur.
 *
 * L'issue, depuis cet appareil, est d'activer l'authentification : le refus
 * part donc avec un bouton qui ouvre Réglages ▸ Système ▸ Authentification.
 */
export type MotifRefus = 'not_local' | 'port80_relay';

/** Le motif du refus, ou `null` pour toute autre erreur. */
export function motifRefusAuth(e: unknown): MotifRefus | null {
  if (!e || typeof e !== 'object') return null;
  const err = e as { status?: unknown; corps?: unknown };
  if (err.status !== 403 || !err.corps || typeof err.corps !== 'object') return null;
  const corps = err.corps as { error?: unknown; reason?: unknown };
  if (corps.error !== 'auth_required') return null;
  return corps.reason === 'not_local' || corps.reason === 'port80_relay' ? corps.reason : null;
}

const CLES: Record<MotifRefus, string> = {
  not_local: 'machineAction.notLocal',
  port80_relay: 'machineAction.port80Relay',
};

/**
 * La phrase à afficher : la phrase traduite quand l'interface la connaît,
 * sinon le texte du serveur (qui dit déjà quoi faire, en anglais).
 */
export function phraseRefusAuth(motif: MotifRefus, texteServeur: string, tr: (cle: string) => string): string {
  const cle = CLES[motif];
  const traduit = tr(cle);
  if (typeof traduit === 'string' && traduit.trim() !== '' && traduit !== cle) return traduit;
  return texteServeur;
}

/** Où mène le bouton : la section d'activation de l'authentification. */
export const CIBLE_ACTIVATION_AUTH = { tab: 'system', section: 'authActivation' } as const;
