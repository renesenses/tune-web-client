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
