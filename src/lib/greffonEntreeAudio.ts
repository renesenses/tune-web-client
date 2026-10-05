/**
 * Le greffon « Entrée audio » — renesenses/tune-server-rust#5296.
 *
 * Les entrées audio USB et les entrées virtuelles (Loopback, BlackHole) de la
 * rubrique Sources sont publiées par ce greffon. Il est au catalogue depuis
 * #5795, mais OPT-IN : tant qu'il n'est pas installé, cocher « Entrée audio »
 * ou « Entrée virtuelle » dans Réglages › Affichage n'affiche que des cases
 * grisées. Les Réglages proposent donc de l'installer, par la route
 * d'installation existante (`POST /plugins/entree-audio/install`), et
 * rappellent qu'il faut redémarrer le serveur.
 *
 * Module sans état : l'écran lit `GET /plugins` et passe la liste.
 */
import type { TypesBarre } from './typesSourcesBarre';

export const ID_GREFFON_ENTREE_AUDIO = 'entree-audio';

/**
 * - `inconnu` : pas (encore) de réponse — on ne propose rien ;
 * - `absent` : le serveur liste ses greffons sans celui-ci (serveur ancien,
 *   ou compilé sans) — l'installer ne peut pas marcher, on ne propose rien ;
 * - `a_installer` : proposé, pas installé ;
 * - `a_redemarrer` : installé, pas encore chargé — il faut redémarrer ;
 * - `actif` : chargé (ou en erreur de démarrage : l'écran Extensions s'en
 *   occupe, ce n'est pas un greffon MANQUANT).
 */
export type EtatGreffonEntreeAudio = 'inconnu' | 'absent' | 'a_installer' | 'a_redemarrer' | 'actif';

/** Ce qu'il faut d'une fiche de `GET /plugins` pour décider. */
export interface FicheGreffon {
  name?: unknown;
  installed?: unknown;
  enabled?: unknown;
  loaded?: unknown;
  status?: unknown;
}

/** L'état du greffon d'après la liste de `GET /plugins`. */
export function etatGreffonEntreeAudio(liste: readonly FicheGreffon[] | null | undefined): EtatGreffonEntreeAudio {
  if (!Array.isArray(liste)) return 'inconnu';
  const fiche = liste.find((p) => p && p.name === ID_GREFFON_ENTREE_AUDIO);
  if (!fiche) return 'absent';
  if (fiche.installed !== true) return 'a_installer';
  if (fiche.status === 'error') return 'actif';
  if (fiche.enabled === false || fiche.loaded === false) return 'a_redemarrer';
  return 'actif';
}

/** Les Réglages en parlent-ils ? Seulement si une des deux cases que ce
 *  greffon alimente est cochée, et qu'il manque (ou attend un redémarrage). */
export function propositionEntreeAudioVisible(
  types: Pick<TypesBarre, 'entree' | 'virtuelle'>,
  etat: EtatGreffonEntreeAudio,
): boolean {
  return (types.entree || types.virtuelle) && (etat === 'a_installer' || etat === 'a_redemarrer');
}

/**
 * Les noms TRADUITS des greffons SDK dont l'identifiant ne se lit pas sur la
 * carte de Réglages › Extensions. Les autres gardent le `display_name` du
 * serveur, à défaut leur identifiant.
 */
export const NOMS_GREFFONS_SDK: Record<string, string> = {
  concerts: 'concerts.greffonNom',
  [ID_GREFFON_ENTREE_AUDIO]: 'v2.plug.entreeAudioNom',
};
