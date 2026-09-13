/**
 * À QUI appartient la photo de la bulle — et quand on peut en poser une.
 *
 * ## 🔴 `renesenses/tune-web-client#893`
 *
 * Deux testeurs ont demandé à se donner une photo, à un jour d'intervalle
 * (fils 1681 et 1676). La réponse livrée l'attache à un compte
 * mozaiklabs.fr : elle n'est montrée que si elle appartient au compte ouvert,
 * elle disparaît à la déconnexion, et un autre compte ne l'hérite pas. Tout
 * cela est juste, et reste.
 *
 * 🔴 Mais sur un serveur SANS nuage configuré, personne ne peut jamais ouvrir
 * de compte — donc personne ne peut jamais se donner de photo. C'est la
 * situation exacte des deux demandeurs, et le refus leur disait « connectez-
 * vous d'abord » en les renvoyant vers un écran de connexion qui n'existe pas
 * chez eux.
 *
 * ## Ce que le serveur dit déjà, et que la bulle ne lisait pas
 *
 * Mesuré le 12/09/2026 sur la .18 en v0.9.147 :
 *
 *   GET /cloud/sso/status
 *     → { configured: true, connected: true, user: { email, display_name, … } }
 *
 * `configured` sépare « pas de compte OUVERT » de « pas de compte POSSIBLE ».
 * `AvatarMenu` le lisait déjà dans `ssoConfigured` — pour décider d'offrir ou
 * non « Se connecter » — mais la photo ne le consultait pas.
 *
 * ## La règle
 *
 * Sans nuage configuré, la photo est LOCALE : elle n'appartient à personne, et
 * c'est déjà vrai de tout le reste sur un tel serveur — les préférences y sont
 * rangées par installation. Avec un nuage, rien ne change : la photo suit le
 * compte, exactement comme aujourd'hui.
 */

/** Ce que `GET /cloud/sso/status` apprend à la bulle. */
export interface EtatCompte {
  /** Le serveur a un nuage configuré : un compte est POSSIBLE. */
  configured: boolean;
  /** Un compte est ouvert MAINTENANT. */
  connected: boolean;
  /** L'identité du compte ouvert — courriel, ou nom d'affichage à défaut. */
  identite: string;
}

/** Ce que les préférences retiennent de la photo choisie. */
export interface PhotoRangee {
  /** L'image elle-même, en donnée URL. Vide = aucune. */
  image: string;
  /** Le compte à qui elle appartient. Vide = elle n'appartient à personne. */
  compte: string;
}

/**
 * À qui la photo doit être ATTACHÉE quand on en pose une.
 *
 * Sans nuage, `''` : elle n'appartient à personne et survit donc à tout. Avec
 * un nuage, l'identité du compte ouvert.
 */
export function proprietairePourNouvellePhoto(etat: EtatCompte): string {
  return etat.configured ? etat.identite : '';
}

/**
 * Peut-on poser une photo maintenant ?
 *
 * `'oui'` — sans nuage, ou avec un compte ouvert.
 * `'connexion'` — un nuage existe et personne n'est connecté : le refus est
 * juste, et « Se connecter » est dans le même panneau.
 */
export function peutChoisirPhoto(etat: EtatCompte): 'oui' | 'connexion' {
  if (!etat.configured) return 'oui';
  return etat.connected && etat.identite ? 'oui' : 'connexion';
}

/**
 * La photo à AFFICHER, ou `''`.
 *
 * Sans nuage : celle qui n'appartient à personne. Une photo marquée d'un
 * compte sur un serveur devenu sans nuage n'est PAS montrée — le nuage a pu
 * être retiré entre-temps, et l'afficher rendrait à l'écran l'image d'un
 * compte que plus personne ne peut ouvrir.
 *
 * Avec un nuage : uniquement celle du compte ouvert. C'est la règle livrée, et
 * elle ne bouge pas.
 */
export function photoAAfficher(etat: EtatCompte, rangee: PhotoRangee): string {
  if (!rangee.image) return '';
  if (!etat.configured) return rangee.compte ? '' : rangee.image;
  if (!etat.connected || !etat.identite) return '';
  return rangee.compte === etat.identite ? rangee.image : '';
}
