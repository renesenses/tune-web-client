/**
 * Ce que chaque service de streaming demande pour se connecter — #1067.
 *
 * Le fait, Patatorz (fil 1615, « Activation Bandcamp impossible ») : la moitié
 * serveur est livrée depuis la v0.9.143, mais Réglages ▸ Services ne propose
 * aucun champ pour Bandcamp. Le bouton « Se connecter » y postait un corps
 * VIDE, et c'est précisément ce que le greffon interprète comme un sondage :
 *
 * ```rust
 * // plugins/tune-bandcamp/src/service.rs
 * let Some(pseudo) = credentials.get("username").and_then(|v| v.as_str()) else {
 *     return Ok(self.auth_status().await);   // ← aucun appel sortant
 * };
 * ```
 *
 * Le serveur rendait donc l'état courant — non authentifié, sans
 * `verification_url` — et l'écran concluait « aucun lien d'authentification ».
 * Rien n'était cassé : personne n'avait jamais demandé le pseudo.
 *
 * 🔴 Bandcamp n'est PAS un troisième Qobuz. Il veut un pseudo et RIEN
 * D'AUTRE : la page de profil est publique, le greffon la lit, aucun mot de
 * passe n'entre en jeu. `usesPassword()` ne connaissait que deux mondes —
 * « identifiant + mot de passe » (Qobuz) et « code d'appareil » (les autres) —
 * et Bandcamp ne tient dans ni l'un ni l'autre. D'où une forme nommée plutôt
 * qu'un booléen : le prochain service qui n'entre pas dans la case n'aura pas
 * à inverser un `if`.
 */

/** Ce que le formulaire doit demander avant d'appeler `authenticate`. */
export type FormeIdentifiants =
  /** Rien : flot par code d'appareil (Tidal, Deezer…). */
  | 'aucune'
  /** Un pseudo seul, sans mot de passe — Bandcamp. */
  | 'pseudo'
  /** Identifiant et mot de passe — Qobuz. */
  | 'pseudo_motdepasse';

export function formeDesIdentifiants(nom: string): FormeIdentifiants {
  const n = (nom ?? '').toLowerCase();
  if (n === 'qobuz') return 'pseudo_motdepasse';
  if (n === 'bandcamp') return 'pseudo';
  return 'aucune';
}

/** Identifiants saisis dans l'écran, tels que `SettingsV2` les tient. */
export interface Saisie {
  user?: string;
  pass?: string;
}

/**
 * Le corps de `POST /streaming/{service}/authenticate`, ou `undefined` quand le
 * service n'en attend aucun.
 *
 * 🔴 Pour Bandcamp on envoie `username` SEUL. Y glisser un `password: ''`
 * serait sans effet côté serveur mais mensonger côté écran — et le premier
 * lecteur du code en conclurait qu'un mot de passe existe.
 */
export function corpsDAuthentification(
  nom: string,
  c: Saisie | null | undefined,
): { username: string; password: string } | { username: string } | undefined {
  switch (formeDesIdentifiants(nom)) {
    case 'pseudo_motdepasse':
      return { username: c?.user ?? '', password: c?.pass ?? '' };
    case 'pseudo':
      return { username: (c?.user ?? '').trim() };
    default:
      return undefined;
  }
}

/** Le bouton « Se connecter » peut-il être armé ? */
export function identifiantsComplets(nom: string, c: Saisie | null | undefined): boolean {
  switch (formeDesIdentifiants(nom)) {
    case 'pseudo_motdepasse':
      return !!c?.user && !!c?.pass;
    case 'pseudo':
      return !!(c?.user ?? '').trim();
    default:
      return true;
  }
}
