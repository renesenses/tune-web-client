/**
 * web#2095 (FabienM, fil forum 2236, point 3, 1.0.0-rc4) — « Menu Bandcamp :
 * mon profil ne remonte rien alors que mon profil public est bien connecté.
 * S'il faut activer le plugin il faut le mentionner dans les settings. »
 *
 * La LIAISON du compte (le pseudo) marche sans le greffon, mais la collection,
 * la liste d'envies et les tags passent par ses routes `/ext/bandcamp/*`, qui
 * répondent 404 tant que le greffon dort (`default_enabled = false`). Les
 * Réglages › Bandcamp doivent donc le DIRE, et proposer le même geste que
 * Réglages › Extensions (`installPlugin` puis `enablePlugin`).
 *
 * Module sans état : l'écran lit `GET /plugins` et passe la liste.
 */
export const ID_GREFFON_BANDCAMP = 'bandcamp';

/**
 * - `inconnu` : pas (encore) de réponse — on ne dit rien ;
 * - `absent` : le serveur ne liste pas ce greffon (compilé sans) — l'activer
 *   ne peut pas marcher, on ne propose rien ;
 * - `a_installer` : présent, jamais installé (opt-in) ;
 * - `a_activer` : installé mais désactivé ;
 * - `a_redemarrer` : activé, pas encore chargé — redémarrer le serveur ;
 * - `actif` : chargé.
 */
export type EtatGreffonBandcamp = 'inconnu' | 'absent' | 'a_installer' | 'a_activer' | 'a_redemarrer' | 'actif';

export interface FicheGreffonBandcamp {
  name?: unknown;
  installed?: unknown;
  enabled?: unknown;
  loaded?: unknown;
  status?: unknown;
  restart_required?: unknown;
}

export function etatGreffonBandcamp(liste: readonly FicheGreffonBandcamp[] | null | undefined): EtatGreffonBandcamp {
  if (!Array.isArray(liste)) return 'inconnu';
  const fiche = liste.find((p) => p && p.name === ID_GREFFON_BANDCAMP);
  if (!fiche) return 'absent';
  if (fiche.status === 'loaded' || fiche.loaded === true) return 'actif';
  if (fiche.installed !== true) return 'a_installer';
  if (fiche.enabled === false) return 'a_activer';
  if (fiche.restart_required === true || fiche.loaded === false) return 'a_redemarrer';
  return 'actif';
}

/** Les Réglages en parlent-ils ? Seulement si le greffon manque ou attend. */
export function greffonBandcampAProposer(etat: EtatGreffonBandcamp): boolean {
  return etat === 'a_installer' || etat === 'a_activer' || etat === 'a_redemarrer';
}

/**
 * Une adresse e-mail à la place du pseudo — le journal du fil 2236 montre
 * `bandcamp_liaison_profil_introuvable` sur un premier essai avec l'adresse,
 * puis la liaison réussie avec le pseudo. Le pseudo est celui de l'adresse de
 * la page (`bandcamp.com/<pseudo>`) : il ne contient jamais « @ ».
 */
export function ressembleAUnEmail(saisie: string | null | undefined): boolean {
  return (saisie ?? '').includes('@');
}
