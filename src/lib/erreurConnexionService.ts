/**
 * Ce que l'écran dit quand la connexion à un service échoue — #2406.
 *
 * ## Le défaut
 *
 * Qobuz est le seul service qui se connecte par identifiant et mot de passe.
 * Un mauvais mot de passe sortait, brut, sous le formulaire :
 *
 *     qobuz login: 401 {"status":"error","code":401,"message":"Invalid username\/email and password combination"}
 *
 * Le serveur recopie l'erreur du service dans le corps de sa réponse, et
 * l'écran affichait `e.message` tel quel (testeur Alex, rc8, interface en
 * anglais).
 *
 * ## La règle
 *
 * 1. Le serveur donne un CODE : `invalid_credentials` (tune-server-rust#7068).
 *    C'est la source de vérité, et la seule qui ne dépend pas d'une langue.
 * 2. Un serveur plus ancien ne le donne pas. On reconnaît alors sa forme
 *    `<service> login: 401 …` — un repli, pas la règle.
 * 3. Tout autre message qui porte du JSON brut est technique : il n'est pas
 *    montré, l'écran dit « Connexion impossible ».
 * 4. Un message en clair (« profil introuvable » de Bandcamp, #1067) reste
 *    montré : il NOMME ce qui ne va pas.
 */

export type NatureErreurConnexion = 'identifiants' | 'brut' | 'texte';

export const CODE_IDENTIFIANTS_REFUSES = 'invalid_credentials';

const NOMS: Record<string, string> = {
  tidal: 'TIDAL',
  qobuz: 'Qobuz',
  spotify: 'Spotify',
  youtube: 'YouTube',
  deezer: 'Deezer',
  bandcamp: 'Bandcamp',
  amazon: 'Amazon Music',
};

/** « qobuz » → « Qobuz » ; un service inconnu prend une capitale. */
export function nomDeService(service: string): string {
  return NOMS[service] ?? service.charAt(0).toUpperCase() + service.slice(1);
}

export function natureErreurConnexion(
  e: { code?: unknown; message?: unknown; detail?: unknown } | null | undefined,
): NatureErreurConnexion {
  if (e?.code === CODE_IDENTIFIANTS_REFUSES) return 'identifiants';
  // #2417 : le message montré est désormais traduit ou générique ; le texte
  // brut du serveur est dans `detail`. Les deux sont lus.
  const message = [e?.message, e?.detail].filter((x): x is string => typeof x === 'string').join(' ');
  // Serveur d'avant #7068 : « qobuz login: 401 {…} ».
  if (/\blogin:\s*401\b/i.test(message)) return 'identifiants';
  // Du JSON du service recopié tel quel : technique, jamais montré.
  if (/[{[]\s*"/.test(message)) return 'brut';
  return 'texte';
}
