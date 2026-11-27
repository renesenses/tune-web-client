/**
 * « Mes radios » vide : l'écran Radios ouvre l'annuaire — retour de Rémi sur
 * la rc13 (GO de Bertrand, rc14).
 *
 * Une installation neuve ne reçoit plus une trentaine de stations d'office
 * (`tune-server-rust`, migrations 33/90/98 sautées sur une base qui naît).
 * « Mes radios » y est donc vide, et un écran vide ne montre rien de ce que
 * Tune sait faire : l'annuaire s'ouvre à sa place, avec une phrase qui dit
 * pourquoi (`v2.radio.mineEmptyDirectory`).
 */
export type SectionRadios = 'mes' | 'annuaire' | 'carte';

/**
 * La section à montrer une fois « Mes radios » chargée. Seule « Mes radios »
 * bascule, et seulement quand le chargement a RÉUSSI sur une liste vide : une
 * erreur de chargement n'est pas une liste vide.
 */
export function sectionApresChargement(
  section: SectionRadios,
  nombreDeRadios: number,
  enErreur = false,
): SectionRadios {
  if (section !== 'mes' || enErreur) return section;
  return nombreDeRadios === 0 ? 'annuaire' : section;
}
