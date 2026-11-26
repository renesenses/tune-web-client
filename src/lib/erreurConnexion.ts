/**
 * Le message d'un refus de `POST /auth/login` ou `POST /auth/register`.
 *
 * tune-server-rust répond `{"error": "…"}` (`tune-server/src/auth.rs`), alors
 * que l'écran ne lisait que `detail` ou `message` : il n'affichait donc que
 * « Erreur 401 ». On lit les trois champs.
 *
 * Pour la connexion, un 401 veut dire « identifiant ou mot de passe
 * incorrect » (`invalid credentials`) : on le dit dans la langue de
 * l'interface plutôt que de recopier l'anglais du serveur.
 */
export function messageErreurConnexion(
  status: number,
  corps: unknown,
  tr: (cle: string) => string,
  connexion = true,
): string {
  if (connexion && status === 401) return tr('login.invalidCredentials');
  const c = (corps && typeof corps === 'object' ? corps : {}) as Record<string, unknown>;
  for (const champ of ['error', 'detail', 'message']) {
    const v = c[champ];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return tr('login.errorStatus').replace('{status}', String(status));
}

/**
 * rc14 — le message d'un refus de `POST /auth/admin/reinitialiser`
 * (mot de passe administrateur oublié).
 *
 * Le serveur répond `{"error": "<code>", "remaining_attempts"?: n}` :
 *  - 403 `reset_not_local` / `not_available_remotely` : l'appel ne vient pas
 *    de la machine du serveur (autre adresse, mandataire, relais distant) ;
 *  - 403 `reset_code_invalid` (+ `remaining_attempts`) : mauvais code ;
 *  - 429 `reset_attempts_exceeded` : 5e essai, le code est détruit ;
 *  - 410 `reset_code_expired` : code absent ou expiré ;
 *  - 400 `password_too_short` : mot de passe trop court.
 *
 * On lit le CODE d'abord (le statut seul est ambigu : 403 recouvre deux cas),
 * puis le statut en repli. Un code inconnu retombe sur le message générique.
 * Rien de ce qui est tapé (code, mot de passe) n'entre ici ni n'est journalisé.
 */
export function messageErreurReinitialisation(
  status: number,
  corps: unknown,
  tr: (cle: string) => string,
): string {
  const c = (corps && typeof corps === 'object' ? corps : {}) as Record<string, unknown>;
  const code = typeof c.error === 'string' ? c.error : '';
  if (code === 'reset_not_local' || code === 'not_available_remotely') return tr('login.resetNotLocal');
  if (code === 'reset_code_invalid') {
    const n = Number(c.remaining_attempts);
    const restants = Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;
    return tr('login.resetCodeInvalid').replace('{remaining}', String(restants));
  }
  if (code === 'reset_attempts_exceeded' || status === 429) return tr('login.resetAttemptsExceeded');
  if (code === 'reset_code_expired' || status === 410) return tr('login.resetCodeExpired');
  if (code === 'password_too_short') return tr('login.resetPasswordTooShort');
  return messageErreurConnexion(status, corps, tr, false);
}
