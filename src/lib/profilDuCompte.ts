/**
 * Compte Mozaiklabs et profil d'écoute : deux choses, une ressemblance — #2420.
 *
 * Alex (rc8) voit en haut du menu son COMPTE (nom, e-mail, photo), puis une
 * section « Profils » avec un profil du même nom et une simple pastille « A » :
 * « Are the profiles not one of the same? ». Le modèle ne change pas :
 *
 * - le COMPTE Mozaiklabs identifie la personne auprès du service en ligne ;
 * - le PROFIL d'écoute, sur ce serveur, range l'historique, les favoris et les
 *   préférences — partagés par le foyer, plusieurs profils possibles.
 *
 * Le lien est un NOM, pas un identifiant : le serveur rend le profil comme
 * `{ name: "<identifiant de connexion>", display_name: "<prénom>" }`
 * (mesuré sur le .18, 03/09/2026) et le compte comme `{ display_name, email }`.
 * Un profil est « celui du compte connecté » quand son identifiant ou son nom
 * affiché est l'e-mail ou le nom du compte, sans tenir compte de la casse.
 * Aucun lien plus fort n'existe dans le code : on n'en invente pas.
 */

export interface CompteConnecte {
  connected: boolean;
  name: string;
  email: string;
}

const norm = (s: string | null | undefined) => (s ?? '').trim().toLowerCase();

export function estProfilDuCompte(
  profil: { name: string; display_name?: string | null },
  compte: CompteConnecte,
): boolean {
  if (!compte.connected) return false;
  const cibles = [norm(compte.email), norm(compte.name)].filter(Boolean);
  if (!cibles.length) return false;
  return [norm(profil.name), norm(profil.display_name)].filter(Boolean).some((n) => cibles.includes(n));
}

/**
 * Comment montrer la section des profils.
 *
 * - `liste` : plusieurs profils à choisir ;
 * - `unique` : UN SEUL profil proposé (on est sur « Default » et un profil
 *   personnel existe) — ce n'est pas un choix mais une sortie : un seul geste ;
 * - `aucune` : rien à proposer.
 */
export function formeDeLaSection(nbVisibles: number, uniqueEstCourant: boolean): 'liste' | 'unique' | 'aucune' {
  if (nbVisibles > 1) return 'liste';
  if (nbVisibles === 1 && !uniqueEstCourant) return 'unique';
  return 'aucune';
}
