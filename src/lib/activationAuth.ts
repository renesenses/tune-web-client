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
    case 'password_too_long':
      return 'authActivation.passwordTooLong';
    case 'first_setup_closed':
      return 'authActivation.firstSetupClosed';
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
  longueurMax = 256,
): boolean {
  const longueur = [...motDePasse].length;
  if (longueur < longueurMin || longueur > longueurMax) return false;
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

/**
 * rc14 — le bouton « Désactiver l'authentification » est-il offert ?
 *
 * Seulement quand l'authentification est active, et pour une session
 * ADMINISTRATRICE (`GET /auth/me`) ou depuis la machine qui fait tourner Tune
 * (`from_this_machine`). Le serveur reste juge : il exige de toute façon un
 * jeton administrateur (`POST /auth/config`, `ensure_admin_if_auth_enabled`).
 */
export function desactivationOfferte(
  etat: { auth_enabled?: boolean; from_this_machine?: boolean } | null | undefined,
  role: unknown,
): boolean {
  if (!etat || etat.auth_enabled !== true) return false;
  return role === 'admin' || etat.from_this_machine === true;
}

/** La clé i18n du refus de désactivation, ou `null` si c'est fait. */
export function cleDuRefusDesactivation(
  r: { auth_enabled?: boolean; error?: string } | null | undefined,
): string | null {
  if (r && r.auth_enabled === false && !r.error) return null;
  if (r?.error) return 'authActivation.disableAdminRequired';
  return 'authActivation.disableError';
}

/** Un morceau de texte, ordinaire ou à montrer comme une commande. */
export interface SegmentTexte {
  texte: string;
  code: boolean;
}

/**
 * rc14 (recette du 24/11, point 7) — « où lire le code » donne des commandes
 * exactes (`journalctl -u <service> | grep TUNE-ACTIVATION-CODE`…). La
 * traduction les entoure d'accents graves ; l'écran les montre en `<code>`,
 * sans les accents. Un accent grave orphelin reste du texte.
 */
export function segmentsAvecCode(s: string): SegmentTexte[] {
  const morceaux = s.split('`');
  if (morceaux.length % 2 === 0) return [{ texte: s, code: false }];
  const segments: SegmentTexte[] = [];
  morceaux.forEach((texte, i) => {
    if (texte !== '') segments.push({ texte, code: i % 2 === 1 });
  });
  return segments;
}

/**
 * rc14 — l'étape « Accès administrateur » de l'assistant de première
 * configuration : que montrer ?
 *
 *  - `active` : l'authentification est déjà active (autre appareil, assistant
 *    repassé) ; rien à créer ;
 *  - `creer` : le mot de passe se crée ici, sans code (première configuration
 *    depuis le réseau local, ou la machine de Tune). L'étape ne se passe pas :
 *    l'authentification est obligatoire ;
 *  - `code` : il faut le code du journal du serveur ; l'étape peut être
 *    remise à plus tard (Réglages > Système > Authentification) ;
 *  - `indisponible` : serveur ancien ou injoignable ; on n'y retient personne.
 */
export type EtapeAdministrateur = 'active' | 'creer' | 'code' | 'indisponible';

export function etapeAdministrateur(
  etat: { auth_enabled?: boolean; code_required?: boolean } | null | undefined,
): EtapeAdministrateur {
  if (!etat || typeof etat.auth_enabled !== 'boolean') return 'indisponible';
  if (etat.auth_enabled) return 'active';
  return etat.code_required === false ? 'creer' : 'code';
}

/** Minutes restantes de la fenêtre de première configuration (arrondi haut). */
export function minutesRestantes(secondes: number | null | undefined): number {
  if (typeof secondes !== 'number' || !(secondes > 0)) return 0;
  return Math.ceil(secondes / 60);
}
