/**
 * Réglage « Balises du classique » (tune-server-rust#8325, demande ESL63P).
 *
 * Pour chaque rôle — chef, ensemble, œuvre, mouvement — la liste des balises
 * que le serveur lit au scan, et le sort de BAND. La validation est la MÊME
 * que celle du serveur (`tune_core::metadata::balises_classique`) : un nom
 * refusé ici le serait là-bas, et l'utilisateur l'apprend à la saisie, pas
 * à l'enregistrement.
 */

export type RoleClassique = 'conductor' | 'ensemble' | 'work' | 'movement';
export const ROLES_CLASSIQUES: readonly RoleClassique[] = ['conductor', 'ensemble', 'work', 'movement'];

/** `classical` : comportement historique (défaut) ; `if_different` : BAND n'est
 *  l'ensemble que s'il diffère des artistes ; `ignored` : jamais lu. */
export type ModeBand = 'classical' | 'if_different' | 'ignored';
export const MODES_BAND: readonly ModeBand[] = ['classical', 'if_different', 'ignored'];

export interface BalisesClassique {
  conductor: string[];
  ensemble: string[];
  work: string[];
  movement: string[];
  band: ModeBand;
}

/** Les valeurs par défaut du serveur — le comportement d'avant le réglage.
 *  Le serveur renvoie les siennes (`defaults`) : celles-ci ne servent qu'en
 *  repli. */
export const DEFAUTS_CLASSIQUE: BalisesClassique = {
  conductor: ['CONDUCTOR'],
  ensemble: ['ENSEMBLE', 'ORCHESTRA', 'CHOIR'],
  work: ['WORK'],
  movement: ['MOVEMENTNAME'],
  band: 'classical',
};

export const MAX_BALISES_PAR_ROLE = 16;
export const MAX_LONGUEUR_NOM = 64;

/** Le nom d'une clé sans préfixe de conteneur : `TXXX:CHORUS` → `CHORUS`,
 *  `----:com.apple.iTunes:CHORUS` → `CHORUS` (comme `nom_de_cle` côté serveur). */
export function nomDeCle(nom: string): string {
  let nu = nom;
  if (nu.startsWith('TXXX:')) nu = nu.slice(5);
  else if (nu.startsWith('----:')) nu = nu.slice(5).split(':').at(-1) ?? nu;
  return nu.trim().toUpperCase();
}

export type RefusBalise = 'empty' | 'tooLong' | 'chars' | 'band' | 'duplicate' | 'tooMany';

/** Un nom saisi, mis en capitales, ou la raison de son refus. */
export function normaliserBalise(
  saisie: string,
  deja: readonly string[],
): { nom: string } | { refus: RefusBalise } {
  const nom = saisie.trim().toUpperCase();
  if (!nom || !nomDeCle(nom)) return { refus: 'empty' };
  if ([...nom].length > MAX_LONGUEUR_NOM) return { refus: 'tooLong' };
  if (!/^[A-Z0-9 _\-:.]+$/.test(nom)) return { refus: 'chars' };
  if (nomDeCle(nom) === 'BAND') return { refus: 'band' };
  if (deja.some((d) => nomDeCle(d) === nomDeCle(nom))) return { refus: 'duplicate' };
  if (deja.length >= MAX_BALISES_PAR_ROLE) return { refus: 'tooMany' };
  return { nom };
}

/** Deux réglages identiques (ordre des balises compris). */
export function memesBalises(a: BalisesClassique, b: BalisesClassique): boolean {
  return a.band === b.band && ROLES_CLASSIQUES.every((r) => a[r].length === b[r].length && a[r].every((n, i) => n === b[r][i]));
}

/** Copie profonde, pour éditer sans toucher à la référence. */
export function copieBalises(r: BalisesClassique): BalisesClassique {
  return { conductor: [...r.conductor], ensemble: [...r.ensemble], work: [...r.work], movement: [...r.movement], band: r.band };
}
