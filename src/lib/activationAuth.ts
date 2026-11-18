/**
 * Écran « Activer l'authentification » (Réglages > Système).
 *
 * Tant que l'authentification est désactivée, tout appareil du réseau peut
 * piloter Tune. L'activer pose le mot de passe du compte administrateur ; le
 * serveur ne l'accepte que depuis la machine qui fait tourner Tune, ou avec un
 * code à usage unique qu'il écrit dans son journal.
 */
import type { ReponseActivationAuth } from './api';

/** La clé i18n du refus rendu par le serveur, ou `null` si c'est un succès. */
export function cleDuRefusActivation(r: ReponseActivationAuth | null | undefined): string | null {
  if (!r) return 'authActivation.error';
  if (r.auth_enabled === true && !r.error) return null;
  switch (r.error) {
    case 'password_too_short':
      return 'authActivation.passwordTooShort';
    case 'activation_code_required':
      return 'authActivation.codeRequired';
    case 'activation_code_invalid':
      return 'authActivation.codeInvalid';
    case 'auth_already_enabled':
      return 'authActivation.alreadyEnabled';
    default:
      return 'authActivation.error';
  }
}

/** Le formulaire peut-il partir ? */
export function activationPossible(
  motDePasse: string,
  confirmation: string,
  code: string,
  codeExige: boolean,
  longueurMin = 8,
): boolean {
  if ([...motDePasse].length < longueurMin) return false;
  if (motDePasse !== confirmation) return false;
  if (codeExige && code.trim() === '') return false;
  return true;
}
