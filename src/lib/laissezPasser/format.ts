/**
 * Formats de l'écoute à distance par laissez-passer (rc8, tune-server-rust#6603).
 *
 * Trois messages sont signés par la clé de l'appareil, chacun dans son propre
 * domaine : une signature faite pour l'un ne vaut rien pour les autres.
 *
 * - inscription de l'appareil sur le SITE (site-mozaiklabs#322,
 *   `PassFormat::deviceRegistration`) :
 *       tune-remote/appareil/v1\n<défi>\n<clé publique base64url>
 * - demande de laissez-passer sur le SITE (`PassFormat::passRequest`) :
 *       tune-remote/laissez-passer/v1\n<server_id>\n<device_id>\n<horodatage>\n<nonce>
 * - ouverture ou renouvellement de session sur le RELAIS
 *   (`tune-laissez-passer/vecteurs/README.md`) :
 *       tune-remote/session/v1\n<server_id>\n<défi>
 *
 * Les clés et signatures circulent en base64url SANS remplissage. Une clé
 * Ed25519 fait 32 octets ; une clé P-256 est le point SEC1 non compressé de
 * 65 octets (`exportKey('raw')`) ; une signature fait 64 octets (`r ‖ s` pour
 * ECDSA, ce que rend `crypto.subtle.sign`).
 */

export const DOMAINE_APPAREIL = 'tune-remote/appareil/v1';
export const DOMAINE_LAISSEZ_PASSER = 'tune-remote/laissez-passer/v1';
export const DOMAINE_SESSION = 'tune-remote/session/v1';

export type AlgCle = 'Ed25519' | 'P-256';

export function messageInscription(defi: string, clePublique: string): string {
  return `${DOMAINE_APPAREIL}\n${defi}\n${clePublique}`;
}

export function messageDemande(serverId: string, deviceId: string, horodatage: number, nonce: string): string {
  return `${DOMAINE_LAISSEZ_PASSER}\n${serverId}\n${deviceId}\n${horodatage}\n${nonce}`;
}

export function messageSession(serverId: string, defi: string): string {
  return `${DOMAINE_SESSION}\n${serverId}\n${defi}`;
}

export function versBase64Url(octets: ArrayBuffer | Uint8Array): string {
  const o = octets instanceof Uint8Array ? octets : new Uint8Array(octets);
  let binaire = '';
  for (let i = 0; i < o.length; i++) binaire += String.fromCharCode(o[i]);
  return btoa(binaire).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Décodage STRICT : `null` sur tout caractère hors de l'alphabet base64url. */
export function depuisBase64Url(texte: string): Uint8Array<ArrayBuffer> | null {
  if (!/^[A-Za-z0-9_-]*$/.test(texte) || texte.length % 4 === 1) return null;
  const b64 = texte.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (texte.length % 4)) % 4);
  try {
    const binaire = atob(b64);
    const o = new Uint8Array(binaire.length);
    for (let i = 0; i < binaire.length; i++) o[i] = binaire.charCodeAt(i);
    return o;
  } catch {
    return null;
  }
}

/** Octets aléatoires en base64url — nonces, vérificateur PKCE, `state`. */
export function aleatoire(octets = 32): string {
  const o = new Uint8Array(octets);
  crypto.getRandomValues(o);
  return versBase64Url(o);
}

/**
 * Charge d'un laissez-passer, lue SANS vérifier la signature.
 *
 * L'app n'a pas à la vérifier : c'est le relais qui le fait, avec la clé du
 * site. On n'en lit que ce qui sert à planifier (`exp`) et à éviter une
 * erreur grossière (`sid` d'un autre serveur).
 */
export function chargeDuLaissezPasser(jws: string): { sid?: string; exp?: number; iat?: number; jti?: string } | null {
  const parties = jws.split('.');
  if (parties.length !== 3) return null;
  const octets = depuisBase64Url(parties[1]);
  if (!octets) return null;
  try {
    return JSON.parse(new TextDecoder().decode(octets));
  } catch {
    return null;
  }
}
