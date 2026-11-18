/**
 * Écran « Activer l'authentification » (Réglages > Système).
 *
 * Tant que l'authentification est désactivée, tout appareil du réseau peut
 * piloter Tune. L'activer pose le mot de passe du compte administrateur ; le
 * serveur ne l'accepte que depuis la machine qui fait tourner Tune, ou avec un
 * code à usage unique qu'il écrit dans son journal.
 */
import type { CompteExistant, ReponseActivationAuth } from './api';

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
    case 'account_not_deletable':
      return 'authActivation.accountNotDeletable';
    case 'activation_attempts_exceeded':
      return 'authActivation.attemptsExceeded';
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

/** Les comptes cochés qui peuvent vraiment l'être (jamais l'administrateur). */
export function comptesASupprimer(
  comptes: CompteExistant[] | undefined,
  coches: ReadonlySet<number>,
): CompteExistant[] {
  return (comptes ?? []).filter((c) => c.deletable && c.role !== 'admin' && coches.has(c.id));
}

/** Date de création lisible (AAAA-MM-JJ), ou chaîne vide. */
export function dateDeCreation(iso: string | null | undefined): string {
  if (!iso) return '';
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(iso);
  return m ? m[1] : iso;
}

/** Le message qui suit une demande de code, selon la réponse du serveur. */
export function cleDeLaDemandeDeCode(r: { status?: string; error?: string } | null | undefined): string {
  if (r?.error === 'activation_code_too_soon') return 'authActivation.codeTooSoon';
  if (r?.error === 'auth_already_enabled') return 'authActivation.alreadyEnabled';
  if (r?.status === 'code_already_pending') return 'authActivation.codePending';
  if (r?.status) return 'authActivation.codeSent';
  return 'authActivation.error';
}
